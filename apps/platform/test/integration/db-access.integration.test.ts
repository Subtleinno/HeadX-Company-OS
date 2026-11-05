import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAccess, AccessBlockedError } from '../../src/db-access/apply';
import { buildPlan } from '../../src/db-access/plan';
import { resolveTargets, roleNameFor } from '../../src/db-access/naming';
import { verifyAccess } from '../../src/db-access/verify';
import { selectTargets } from '../../src/db-access/cli';
import { createDisposableCluster, type DisposableCluster } from './disposable-pg';

/**
 * app 專用資料庫帳號與隔離（issue #88）。
 *
 * 角色是 **cluster 級** 物件，所以這一整個檔案跑在一個用完即棄的 Postgres 容器
 * （`co-test-pg-<隨機>`）上，不碰專案本身那個 cluster。
 *
 * 驗的是「真實權限」，不是「SQL 有冇寫出來」：每一條都真的用 runtime 帳號開一條
 * 連線去試，包括失敗的嘗試（DELETE、DDL、跨 app、SET ROLE、繞過函數）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const APPS_DIR = resolve(here, '../fixtures/db-access/apps');

let cluster: DisposableCluster;
let admin: Pool;
let database: string;
let targets: ReturnType<typeof resolveTargets>;
let passwords: Map<string, string>;

const PASSWORD_A = randomUUID().replace(/-/g, '');
const PASSWORD_B = randomUUID().replace(/-/g, '');

async function sqlStateOf(pool: Pool, sql: string): Promise<string> {
  try {
    await pool.query(sql);
  } catch (error) {
    return (error as { code?: string }).code ?? `無 SQLSTATE：${String(error)}`;
  }

  throw new Error(`預期這條查詢會失敗，但它成功了：${sql}`);
}

/** 用 runtime 帳號開一條連線；`searchPath` 由呼叫者明確給。 */
function runtimePool(role: string, password: string, searchPath: string): Pool {
  return new Pool({
    host: cluster.host,
    port: cluster.port,
    user: role,
    password,
    database,
    max: 1,
    options: `-c search_path=${searchPath}`,
  });
}

beforeAll(async () => {
  cluster = await createDisposableCluster();
  database = 'co_access_test';

  admin = new Pool({ ...cluster, database: 'postgres', max: 2 });
  await admin.query(`create database "${database}"`);
  await admin.end();

  admin = new Pool({ ...cluster, database, max: 2 });

  // platform 的東西（public）：一張表、一個函數，而且刻意對 PUBLIC 開放 select。
  await admin.query(`
    create table public.platform_secret (id integer primary key, token text not null);
    insert into public.platform_secret (id, token) values (1, '只可以管理員讀');
    create function public.leaky() returns text language sql security definer
      as $$ select token from public.platform_secret limit 1 $$;
    grant select on public.platform_secret to public;
  `);

  // 兩個 app 的 schema 與既有物件（模擬 migration 已經跑過一部分）。
  await admin.query(`
    create schema app_a;
    create table app_a.orders (
      id serial primary key,
      note text not null
    );
    insert into app_a.orders (note) values ('第一張單');
    create schema app_b;
    create table app_b.notes (id integer primary key, body text not null);
    insert into app_b.notes (id, body) values (1, '乙的資料');
  `);

  targets = resolveTargets(['app_a', 'app_b']);
  passwords = new Map([
    [roleNameFor('app_a'), PASSWORD_A],
    [roleNameFor('app_b'), PASSWORD_B],
  ]);
});

afterAll(async () => {
  await admin?.end().catch(() => undefined);
  await cluster?.stop();
});

describe('plan：唯讀，講清楚會做甚麼', () => {
  it('列出建立 role、default ACL、授權與 public 收斂，而且唔會改任何東西', async () => {
    const client = await admin.connect();
    let plan;

    try {
      plan = await buildPlan({ client, targets, migrationRole: 'postgres' });
    } finally {
      client.release();
    }

    const steps = plan.apps.flatMap((app) => app.steps.map((step) => step.kind));

    expect(steps).toContain('create-role');
    expect(steps).toContain('default-acl');
    expect(steps).toContain('grant-tables');
    expect(steps).toContain('grant-sequences');
    expect(plan.publicSteps.map((step) => step.kind)).toContain('revoke-public-tables');
    expect(plan.publicSteps.map((step) => step.kind)).toContain('revoke-public-function');
    expect(plan.publicFindings.join('\n')).toContain('platform_secret');

    // 唯讀：role 一個都未建。
    const roles = await admin.query<{ count: number }>(
      `select count(*)::int as count from pg_roles where rolname like 'co_app_%'`,
    );
    expect(roles.rows[0]?.count).toBe(0);
  });

  it('只接受 manifest 入面的 app', () => {
    expect(() => selectTargets(APPS_DIR, ['app_a', 'nope'])).toThrow(/冇這幾個 app：nope/);
    expect(selectTargets(APPS_DIR, ['app_a']).map((item) => item.role)).toEqual(['co_app_app_a']);
  });
});

describe('apply：建帳號、授權、收斂 PUBLIC', () => {
  it('套用成功，第二步（重跑）是冪等的', async () => {
    const first = await applyAccess({ pool: admin, targets, migrationRole: 'postgres', passwords });

    expect(first.database).toBe(database);
    expect(first.executed.length).toBeGreaterThan(0);

    const second = await applyAccess({ pool: admin, targets, migrationRole: 'postgres', passwords });

    expect(second.executed).toEqual([]);
  });

  it('role 有 LOGIN，而且冇 SUPERUSER／CREATEDB／CREATEROLE／REPLICATION／BYPASSRLS', async () => {
    const rows = await admin.query<{
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(
      `select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
         from pg_roles where rolname = any($1::text[])`,
      [targets.map((target) => target.role)],
    );

    expect(rows.rowCount).toBe(2);

    for (const row of rows.rows) {
      expect(row).toEqual({
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
      });
    }
  });

  it('runtime 唔擁有 schema 或任何表', async () => {
    const rows = await admin.query<{ count: number }>(
      `select count(*)::int as count
         from pg_class c join pg_roles r on r.oid = c.relowner
        where r.rolname like 'co_app_%'`,
    );

    expect(rows.rows[0]?.count).toBe(0);
  });
});

describe('隔離：用真帳號試每一條邊界', () => {
  let a: Pool;

  beforeAll(() => {
    a = runtimePool(roleNameFor('app_a'), PASSWORD_A, 'app_a');
  });

  afterAll(async () => {
    await a.end();
  });

  it('自己的表 SELECT／INSERT／UPDATE 成功，sequence 可用', async () => {
    const own = await a.query<{ note: string }>('select note from orders');
    expect(own.rows).toEqual([{ note: '第一張單' }]);

    const inserted = await a.query<{ id: number }>(
      "insert into orders (note) values ('第二張單') returning id",
    );
    expect(inserted.rows[0]?.id).toBe(2);

    await a.query("update orders set note = '改過' where id = 2");
  });

  it('DELETE、TRUNCATE、DDL 一律失敗', async () => {
    expect(await sqlStateOf(a, 'delete from orders where id = 2')).toBe('42501');
    expect(await sqlStateOf(a, 'truncate orders')).toBe('42501');
    expect(await sqlStateOf(a, 'create table app_a.hack (id int)')).toBe('42501');
    expect(await sqlStateOf(a, 'drop table orders')).toBe('42501');
  });

  it('跨 app 與 platform 的表都讀寫不到（schema-qualified）', async () => {
    expect(await sqlStateOf(a, 'select * from app_b.notes')).toBe('42501');
    expect(await sqlStateOf(a, 'select * from public.platform_secret')).toBe('42501');
  });

  it('改 search_path 之後仍然失敗：擋住的是 ACL，不是名稱解析', async () => {
    // SET search_path 本身任何人都做得到 —— 這正是「search_path 不是安全邊界」的意思。
    await a.query('set search_path = public, app_b');

    expect(await sqlStateOf(a, 'select * from platform_secret')).toBe('42501');
    // app_b 的 schema 冇 USAGE，所以名連解析都解析唔到（42P01）—— 一樣係入唔到。
    expect(await sqlStateOf(a, 'select * from notes')).toBe('42P01');

    await a.query('set search_path = app_a');
  });

  it('SET ROLE 與被 PUBLIC 開放的 SECURITY DEFINER 函數都過唔到', async () => {
    expect(await sqlStateOf(a, 'set role postgres')).toBe('42501');
    expect(await sqlStateOf(a, 'select public.leaky()')).toBe('42501');
  });

  it('PUBLIC 收斂之後，新建帳號亦唔會自動讀到 platform 表', async () => {
    const freshRole = `co_app_probe_${randomUUID().replace(/-/g, '').slice(0, 8)}`;

    await admin.query(`create role "${freshRole}" login password '${randomUUID().replace(/-/g, '')}'`);

    try {
      const effective = await admin.query<{ can: boolean }>(
        'select has_table_privilege($1, $2, $3) as can',
        [freshRole, 'public.platform_secret', 'SELECT'],
      );

      expect(effective.rows[0]?.can).toBe(false);
    } finally {
      await admin.query(`drop role if exists "${freshRole}"`);
    }
  });
});

describe('default ACL：之後的 migration 建表仍然入得', () => {
  it('在 apply 之後新開的表與 sequence，runtime 即刻可以用', async () => {
    await admin.query(`
      create table app_a.invoices (
        id bigserial primary key,
        amount integer not null
      );
    `);

    const a = runtimePool(roleNameFor('app_a'), PASSWORD_A, 'app_a');

    try {
      await a.query('insert into invoices (amount) values (100)');
      const rows = await a.query<{ amount: number }>('select amount from invoices');
      expect(rows.rows).toEqual([{ amount: 100 }]);

      expect(await sqlStateOf(a, 'delete from invoices')).toBe('42501');
    } finally {
      await a.end();
    }
  });
});

describe('verify：講得出邊一樣唔對', () => {
  it('套用之後 OK', async () => {
    const client = await admin.connect();

    try {
      const result = await verifyAccess(client, targets, 'postgres');
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    } finally {
      client.release();
    }
  });

  it('有人加了 DELETE 之後，verify 會指出係邊個 app', async () => {
    await admin.query('grant delete on app_a.orders to co_app_app_a');

    const client = await admin.connect();

    try {
      const result = await verifyAccess(client, targets, 'postgres');
      expect(result.ok).toBe(false);
      expect(result.failures.some((item) => item.scope === 'app_a')).toBe(true);
    } finally {
      client.release();
      await admin.query('revoke delete on app_a.orders from co_app_app_a');
    }
  });

  it('有人重新開放 PUBLIC 之後，verify 會指出 public', async () => {
    await admin.query('grant select on public.platform_secret to public');

    const client = await admin.connect();

    try {
      const result = await verifyAccess(client, targets, 'postgres');
      expect(result.failures.some((item) => item.scope === 'public')).toBe(true);
    } finally {
      client.release();
      await admin.query('revoke select on public.platform_secret from public');
    }
  });
});

describe('拒絕與回滾', () => {
  it('既有 role 屬性唔對：阻擋，唔會降權、唔會改密碼', async () => {
    const name = 'co_app_rogue';

    await admin.query(`create role "${name}" login createrole password 'unchanged-password'`);

    try {
      const rogueTargets = resolveTargets(['app_a']).map((target) => ({
        ...target,
        role: name,
      }));

      await expect(
        applyAccess({
          pool: admin,
          targets: rogueTargets,
          migrationRole: 'postgres',
          passwords: new Map([[name, PASSWORD_A]]),
        }),
      ).rejects.toThrow(AccessBlockedError);

      const rows = await admin.query<{ rolcreaterole: boolean }>(
        'select rolcreaterole from pg_roles where rolname = $1',
        [name],
      );

      expect(rows.rows[0]?.rolcreaterole).toBe(true);

      // 密碼冇被改：仍然可以用原本那一個登入。
      const probe = new Pool({
        host: cluster.host,
        port: cluster.port,
        user: name,
        password: 'unchanged-password',
        database,
        max: 1,
      });
      await expect(probe.query('select 1')).resolves.toBeDefined();
      await probe.end();
    } finally {
      await admin.query(`drop role if exists "${name}"`);
    }
  });

  it('schema 由 runtime 擁有：阻擋', async () => {
    const owner = 'co_app_owns';

    await admin.query(`create role "${owner}" login password '${PASSWORD_A}'`);
    await admin.query(`create schema owned_by_runtime authorization "${owner}"`);

    try {
      const ownedTargets = resolveTargets(['app_a']).map((target) => ({
        ...target,
        role: owner,
        schema: 'owned_by_runtime',
      }));

      await expect(
        applyAccess({
          pool: admin,
          targets: ownedTargets,
          migrationRole: 'postgres',
          passwords: new Map([[owner, PASSWORD_A]]),
        }),
      ).rejects.toThrow(/擁有 schema owned_by_runtime/);
    } finally {
      await admin.query('drop schema if exists owned_by_runtime cascade');
      await admin.query(`drop role if exists "${owner}"`);
    }
  });

  it('執行途中失敗：整筆回滾，唔會留下半套帳號', async () => {
    const failing = 'co_app_rollback';

    // 用 event trigger 令 GRANT 失敗：這是真的執行中途失敗，不是事先檢查。
    await admin.query(`
      create or replace function public.block_grants() returns event_trigger language plpgsql as $$
      begin
        if current_query() ilike 'grant %' then
          raise exception '測試：呢個 cluster 唔准 GRANT';
        end if;
      end;
      $$;
      create event trigger block_grants on ddl_command_start execute function public.block_grants();
    `);

    try {
      const rollbackTargets = resolveTargets(['app_a']).map((target) => ({
        ...target,
        role: failing,
      }));

      await expect(
        applyAccess({
          pool: admin,
          targets: rollbackTargets,
          migrationRole: 'postgres',
          passwords: new Map([[failing, PASSWORD_A]]),
        }),
      ).rejects.toThrow(/唔准 GRANT/);

      const rows = await admin.query('select 1 from pg_roles where rolname = $1', [failing]);
      expect(rows.rowCount).toBe(0);

      // default ACL 亦冇為這個角色留低（其他 app 的 default ACL 仍然在）。
      const defaults = await admin.query<{ count: number }>(
        `select count(*)::int as count
           from pg_default_acl d
           join pg_namespace n on n.oid = d.defaclnamespace
           cross join lateral aclexplode(d.defaclacl) a
          where n.nspname = 'app_a' and pg_get_userbyid(a.grantee) = $1`,
        [failing],
      );
      expect(defaults.rows[0]?.count).toBe(0);
    } finally {
      await admin.query('drop event trigger if exists block_grants');
      await admin.query('drop function if exists public.block_grants()');
    }
  });
});

describe('並發', () => {
  it('兩個 apply 同時跑：只有一次真的做，冇重複建 role 的錯誤', async () => {
    const concurrent = 'co_app_concurrent';
    const concurrentTargets = resolveTargets(['app_a']).map((target) => ({
      ...target,
      role: concurrent,
    }));
    const secrets = new Map([[concurrent, PASSWORD_A]]);

    try {
      const results = await Promise.all([
        applyAccess({ pool: admin, targets: concurrentTargets, migrationRole: 'postgres', passwords: secrets }),
        applyAccess({ pool: admin, targets: concurrentTargets, migrationRole: 'postgres', passwords: secrets }),
      ]);

      // 一個做完，另一個見到冇事要做；兩個都成功。
      expect(results.map((result) => result.executed.length > 0).sort()).toEqual([false, true]);

      const rows = await admin.query('select 1 from pg_roles where rolname = $1', [concurrent]);
      expect(rows.rowCount).toBe(1);
    } finally {
      // 整個 cluster 之後會消失，所以不必逐個 role 收；強行 drop 反而會撞
      // 「role 仍然擁有 default ACL」這個依賴。
    }
  });
});
