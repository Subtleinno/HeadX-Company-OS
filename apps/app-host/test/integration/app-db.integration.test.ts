import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildHost } from '../../src/host';
import { createTempEnv, type TempEnv } from './temp-db';

/**
 * app-host 的資料庫隔離（issue #77 驗收 4）。
 *
 * 用真的 Postgres，但臨時資料庫（co_test_<隨機>）與臨時帳號（co_app_<隨機>），
 * 測完 DROP。兩件事要分開證：
 *   1. `search_path` 只有 app 自己的 schema —— 未限定名稱摸不到 public 的表。
 *   2. 就算明確寫 `public.secret`，該帳號的 ACL 也讀不到 —— 這才是真正的隔離，
 *      `search_path` 只是名稱解析（#75 已寫明它不是權限隔離）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const APPS_DIR = resolve(here, '../fixtures/apps');

let env: TempEnv;
let server: FastifyInstance;
let pool: Pool;

/** 取查詢失敗的 SQLSTATE；查詢竟然成功就當測試失敗。 */
async function sqlStateOf(runner: Pool, sql: string): Promise<string> {
  try {
    await runner.query(sql);
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code ?? `無 SQLSTATE：${String(error)}`;
  }

  throw new Error(`預期這條查詢會失敗，但它成功了：${sql}`);
}

beforeAll(async () => {
  env = await createTempEnv();

  await env.pool.query(`
    create schema sales;
    create table sales.orders (id integer primary key, note text not null);
    insert into sales.orders (id, note) values (1, '第一張單');
    create table public.secret (token text not null);
    insert into public.secret (token) values ('只可以管理員讀');
    grant usage on schema sales to "${env.role}";
    grant select on sales.orders to "${env.role}";
    grant connect on database "${env.database}" to "${env.role}";
  `);

  const built = await buildHost({
    config: { appIds: ['sales'], appsDir: APPS_DIR, port: 8080 },
    env: {
      PGHOST: env.config.host,
      PGPORT: String(env.config.port),
      PGDATABASE: env.config.database,
      APP_DB_SALES_USER: env.role,
      APP_DB_SALES_PASSWORD: env.password,
    },
  });

  server = built.server;
  pool = built.pools[0] as Pool;

  expect(built.apps.map((item) => item.manifest.id)).toEqual(['sales']);
  expect(built.pools).toHaveLength(1);
});

afterAll(async () => {
  await server.close();
  await env.drop();
});

describe('app 的資料庫連線', () => {
  it('用 app 自己的帳號，search_path 只有自己的 schema', async () => {
    const result = await pool.query<{ current_user: string; search_path: string }>(
      'select current_user as current_user, current_setting($1) as search_path',
      ['search_path'],
    );

    expect(result.rows[0]?.current_user).toBe(env.role);
    // 刻意不含 public 或 "$user"：只有 sales。
    expect(result.rows[0]?.search_path).toBe('sales');
  });

  it('自己的表讀得到，未限定名稱摸不到 public 的表', async () => {
    const own = await pool.query<{ note: string }>('select note from orders');
    expect(own.rows).toEqual([{ note: '第一張單' }]);

    // search_path 沒有 public，所以 public.secret 這個名字根本解析不到。
    expect(await sqlStateOf(pool, 'select * from secret')).toBe('42P01');
  });

  it('明確寫 public.secret 也讀不到：ACL 擋住，不是 search_path 擋住', async () => {
    expect(await sqlStateOf(pool, 'select * from public.secret')).toBe('42501');

    // 表真的存在、管理員真的讀得到 —— 所以上面那個 42501 是權限，不是打錯表名。
    const admin = await env.pool.query<{ token: string }>('select token from public.secret');
    expect(admin.rows).toEqual([{ token: '只可以管理員讀' }]);
  });

  it('app 的 route 用同一條連線回答（ctx.db 真的接上了）', async () => {
    const response = await server.inject({ method: 'GET', url: '/sales/whoami' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ current_user: env.role, search_path: 'sales' });
  });

  it('環境只給了共用 PG* 帳號時，app 仍然拒絕啟動（沒有回退）', async () => {
    await expect(
      buildHost({
        config: { appIds: ['sales'], appsDir: APPS_DIR, port: 8080 },
        env: {
          PGHOST: env.config.host,
          PGPORT: String(env.config.port),
          PGDATABASE: env.config.database,
          PGUSER: env.role,
          PGPASSWORD: env.password,
        },
      }),
    ).rejects.toThrow(
      'apps/sales 需要資料庫，但沒有設定 APP_DB_SALES_USER 與 APP_DB_SALES_PASSWORD（不會回退用共用帳號）',
    );
  });

  it('帳號有管理員屬性（CREATEROLE）：拒絕啟動，並講出是哪一個屬性', async () => {
    const elevated = `co_elev_${env.database.slice(-8)}`;

    await env.pool.query(
      `create role "${elevated}" login createrole password '${env.password.replace(/'/g, "''")}'`,
    );
    await env.pool.query(`grant usage on schema sales to "${elevated}"`);

    try {
      await expect(
        buildHost({
          config: { appIds: ['sales'], appsDir: APPS_DIR, port: 8080 },
          env: {
            PGHOST: env.config.host,
            PGPORT: String(env.config.port),
            PGDATABASE: env.config.database,
            APP_DB_SALES_USER: elevated,
            APP_DB_SALES_PASSWORD: env.password,
          },
        }),
      ).rejects.toThrow(/唔係最小權限的 runtime 帳號（CREATEROLE）/);
    } finally {
      await env.pool.query(`revoke usage on schema sales from "${elevated}"`);
      await env.pool.query(`drop role if exists "${elevated}"`);
    }
  });
});
