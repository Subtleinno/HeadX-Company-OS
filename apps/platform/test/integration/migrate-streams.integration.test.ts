import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADVISORY_LOCK_KEY,
  applyMigrations,
  applyStreams,
  checksum,
  migrate,
  readStreams,
} from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 多串支援的整合測試（#75）。需要 db 在跑；每個個案用臨時資料庫 co_test_<隨機>，測完刪除。
 * 正式資料庫由頭到尾不插任何列、不套任何 migration。
 */

const FIXTURES = resolve(process.cwd(), 'apps/platform/test/fixtures/migrations');
const FLAT_DIR = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;

const dirs: string[] = [];

async function tree(spec: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), 'company-os-streams-'));
  dirs.push(dir);

  for (const [relative, content] of Object.entries(spec)) {
    const target = resolve(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }

  return dir;
}

async function withTempDb(run: (db: TempDatabase) => Promise<void>): Promise<void> {
  const db = await createTempDatabase();
  try {
    await run(db);
  } finally {
    await db.drop();
  }
}

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

/** 等一個條件成立；只用於「觀察」另一個程序做到某一步，不是用它當同步機制碰運氣。 */
async function waitFor(
  what: string,
  probe: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await probe()) {
      return;
    }
    await new Promise((done) => setTimeout(done, 20));
  }

  throw new Error(`等不到：${what}`);
}

async function ledgerNames(db: TempDatabase): Promise<string[]> {
  const rows = await db.pool.query<{ name: string }>(
    'select name from public.schema_migrations order by name',
  );
  return rows.rows.map((row) => row.name);
}

async function readFlat(): Promise<{ name: string; sql: string }[]> {
  const names = ['0001_audit_log.sql', '0002_users_sessions.sql', '0003_stored_file.sql'];
  const files: { name: string; sql: string }[] = [];

  for (const name of names) {
    files.push({ name, sql: await readFile(resolve(FLAT_DIR, name), 'utf8') });
  }

  return files;
}

describe('套用假 schema 串', () => {
  it('未限定名稱建立的表落在該 schema，不在 public；ledger 只有一張，位於 public', async () => {
    await withTempDb(async (db) => {
      const applied = await migrate({ pool: db.pool, dir: FIXTURES, log: silent });

      expect(applied).toEqual([
        '0001_base.sql',
        '0002_extra.sql',
        'app_alpha/0001_alpha_one.sql',
        'app_alpha/0002_alpha_two.sql',
        'app_beta/0001_beta_one.sql',
      ]);

      const where = await db.pool.query<{ table_schema: string; table_name: string }>(
        `select table_schema, table_name
           from information_schema.tables
          where table_name in ('fixture_base', 'fixture_extra', 'fixture_alpha', 'fixture_alpha_two', 'fixture_beta')
          order by table_name`,
      );

      expect(where.rows).toEqual([
        { table_schema: 'app_alpha', table_name: 'fixture_alpha' },
        { table_schema: 'app_alpha', table_name: 'fixture_alpha_two' },
        { table_schema: 'public', table_name: 'fixture_base' },
        { table_schema: 'app_beta', table_name: 'fixture_beta' },
        { table_schema: 'public', table_name: 'fixture_extra' },
      ]);

      // ledger 只有一張，而且沒有在 app schema 偷建第二張。
      const ledgers = await db.pool.query<{ schema: string }>(
        `select n.nspname as schema
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where c.relname = 'schema_migrations'
          order by n.nspname`,
      );
      expect(ledgers.rows).toEqual([{ schema: 'public' }]);
    });
  });

  it('第二次執行沒有任何變動，applied_at 不變', async () => {
    await withTempDb(async (db) => {
      await migrate({ pool: db.pool, dir: FIXTURES, log: silent });
      const before = await db.pool.query(
        'select name, applied_at from public.schema_migrations order by name',
      );

      const applied = await migrate({ pool: db.pool, dir: FIXTURES, log: silent });
      expect(applied).toEqual([]);

      const after = await db.pool.query(
        'select name, applied_at from public.schema_migrations order by name',
      );
      expect(after.rows).toEqual(before.rows);
    });
  });

  it('次序：平目錄先，再按 schema 名稱字母序', async () => {
    await withTempDb(async (db) => {
      const logs: string[] = [];
      await migrate({ pool: db.pool, dir: FIXTURES, log: (message) => logs.push(message) });

      expect(logs).toEqual([
        '已套用 0001_base.sql',
        '已套用 0002_extra.sql',
        '已套用 app_alpha/0001_alpha_one.sql',
        '已套用 app_alpha/0002_alpha_two.sql',
        '已套用 app_beta/0001_beta_one.sql',
      ]);
    });
  });
});

describe('名稱解析：未限定名稱只找到當前串的 schema', () => {
  it('public 與 app schema 有同名表時，未限定名稱讀到的是 app 表', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        '0001_public_same.sql':
          'create table same_name (id integer);\ninsert into same_name values (111);\n',
        'app_probe/0001_probe.sql': [
          'create table same_name (id integer);',
          'insert into same_name values (333);',
          'create table probe_hit as select id from same_name;',
          '',
        ].join('\n'),
      });

      await migrate({ pool: db.pool, dir, log: silent });

      const hit = await db.pool.query<{ id: number }>('select id from app_probe.probe_hit');
      expect(hit.rows).toEqual([{ id: 333 }]);

      const pub = await db.pool.query<{ id: number }>('select id from public.same_name');
      expect(pub.rows).toEqual([{ id: 111 }]);
    });
  });

  it('只存在於 public 的表，用未限定名稱讀會 42P01，該檔案整份回滾，ledger 不新增', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        '0001_public_only.sql':
          'create table only_in_public (id integer);\ninsert into only_in_public values (222);\n',
        'app_probe/0001_read_public.sql':
          'create table probe_spill as select id from only_in_public;\n',
      });

      const failure = migrate({ pool: db.pool, dir, log: silent });
      await expect(failure).rejects.toThrow(/app_probe/);
      await expect(failure).rejects.toThrow(/0001_read_public\.sql/);
      await expect(failure).rejects.toThrow(/42P01/);

      // 這一串只有一個檔案，而它同時是新建 schema 的操作 → schema 一齊回滾。
      const schemas = await db.pool.query<{ nspname: string }>(
        "select nspname from pg_namespace where nspname = 'app_probe'",
      );
      expect(schemas.rows).toEqual([]);

      // 平目錄那個檔已提交，ledger 只有它。
      expect(await ledgerNames(db)).toEqual(['0001_public_only.sql']);
    });
  });

  it('同一條管理連線用完整限定名稱仍然讀得到 public 的表 —— search_path 不是 ACL', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        '0001_public_only.sql':
          'create table only_in_public (id integer);\ninsert into only_in_public values (222);\n',
        'app_probe/0001_ok.sql': 'create table probe_table (id integer);\n',
      });

      await migrate({ pool: db.pool, dir, log: silent });

      const client = await db.pool.connect();

      try {
        // 把連線的 search_path 擺成串內的狀態（等同 SET LOCAL 之後）：
        // 未限定名稱找不到 public 的表，但同一條連線加了 public. 就讀得到。
        // 這正是「search_path 只控制解析，不是權限」。
        await client.query('set search_path to app_probe');

        await expect(client.query('select id from only_in_public')).rejects.toThrow(
          /42P01|does not exist/,
        );

        const qualified = await client.query<{ id: number }>('select id from public.only_in_public');
        expect(qualified.rows).toEqual([{ id: 222 }]);
      } finally {
        await client.query('reset search_path');
        client.release();
      }
    });
  });
});

describe('交易與串失敗', () => {
  it('串內某個檔中途失敗：該檔物件與 ledger 一齊回滾，先前提交的保留，後續不執行', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        'app_tx/0001_ok.sql': 'create table tx_one (id integer);\n',
        'app_tx/0002_broken.sql': 'create table tx_two (id integer);\nthis is not valid sql;\n',
        'app_tx/0003_never.sql': 'create table tx_never (id integer);\n',
      });

      const failure = migrate({ pool: db.pool, dir, log: silent });
      await expect(failure).rejects.toThrow(/串 "app_tx"/);
      await expect(failure).rejects.toThrow(/0002_broken\.sql/);

      expect(await ledgerNames(db)).toEqual(['app_tx/0001_ok.sql']);

      const tables = await db.pool.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'app_tx' order by table_name`,
      );
      expect(tables.rows).toEqual([{ table_name: 'tx_one' }]);
    });
  });

  it('修正 fixture 之後可以續跑，不重複先前紀錄', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        'app_tx/0001_ok.sql': 'create table tx_one (id integer);\n',
        'app_tx/0002_broken.sql': 'create table tx_two (id integer);\nthis is not valid sql;\n',
        'app_tx/0003_never.sql': 'create table tx_never (id integer);\n',
      });

      await expect(migrate({ pool: db.pool, dir, log: silent })).rejects.toThrow(
        /0002_broken\.sql/,
      );

      await writeFile(
        resolve(dir, 'app_tx/0002_broken.sql'),
        'create table tx_two (id integer);\n',
        'utf8',
      );

      const applied = await migrate({ pool: db.pool, dir, log: silent });
      expect(applied).toEqual(['app_tx/0002_broken.sql', 'app_tx/0003_never.sql']);

      expect(await ledgerNames(db)).toEqual([
        'app_tx/0001_ok.sql',
        'app_tx/0002_broken.sql',
        'app_tx/0003_never.sql',
      ]);
    });
  });

  it('新建 schema 屬於失敗的交易時，schema 也一齊回滾', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        'app_fresh/0001_broken.sql': 'create table y (id integer);\nthis is not valid sql;\n',
      });

      await expect(migrate({ pool: db.pool, dir, log: silent })).rejects.toThrow(/app_fresh/);

      const schemas = await db.pool.query<{ nspname: string }>(
        "select nspname from pg_namespace where nspname = 'app_fresh'",
      );
      expect(schemas.rows).toEqual([]);
    });
  });

  it('交易之後 search_path 不殘留 app 值', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({ 'app_probe/0001_one.sql': 'create table probe_table (id integer);\n' });
      const client = await db.pool.connect();

      try {
        const before = await client.query<{ sp: string }>("select current_setting('search_path') as sp");

        await applyStreams({ client, streams: await readStreams(dir), log: silent });

        const after = await client.query<{ sp: string }>("select current_setting('search_path') as sp");
        expect(after.rows[0]?.sp).toBe(before.rows[0]?.sp);
      } finally {
        client.release();
      }
    });
  });
});

describe('ledger 一致性：先驗證全部，再套用', () => {
  it('串內已套用的檔案被改：拒絕，訊息指出串與檔名', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({ 'app_alpha/0001_one.sql': 'create table one (id integer);\n' });
      await migrate({ pool: db.pool, dir, log: silent });

      await writeFile(
        resolve(dir, 'app_alpha/0001_one.sql'),
        'create table one (id integer);\n-- 有人改了已套用的檔案\n',
        'utf8',
      );

      const failure = migrate({ pool: db.pool, dir, log: silent });
      await expect(failure).rejects.toThrow(/串 "app_alpha"/);
      await expect(failure).rejects.toThrow(/內容被修改/);
      await expect(failure).rejects.toThrow(/app_alpha\/0001_one\.sql/);
    });
  });

  it('串內已套用的檔案不見了：拒絕，訊息指出串與檔名', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        'app_alpha/0001_one.sql': 'create table one (id integer);\n',
        'app_alpha/0002_two.sql': 'create table two (id integer);\n',
      });
      await migrate({ pool: db.pool, dir, log: silent });

      await rm(resolve(dir, 'app_alpha/0002_two.sql'));

      const failure = migrate({ pool: db.pool, dir, log: silent });
      await expect(failure).rejects.toThrow(/串 "app_alpha"/);
      await expect(failure).rejects.toThrow(/找不到檔案/);
      await expect(failure).rejects.toThrow(/0002_two\.sql/);
    });
  });

  /**
   * 插隊檢查甚麼時候會真的觸發：正常情況下不會 —— 檔案編號本身必須由 0001 連續，
   * 所以「已套用 0001、0002」之後不可能出現編號 1 或 2 的新檔（會先撞到重複或編號不連續）。
   * 真正會遇到的是 ledger 被舊版本或人手留下一個不連續的紀錄，例如只記了 0002。
   * 那時出現 0001 就必須被攔住，不可靜默套用；這裡直接把 ledger 造成那種狀態。
   */
  it('ledger 只記了 0002 時出現 0001：當成插隊拒絕，訊息指出串與檔名', async () => {
    await withTempDb(async (db) => {
      const sneaky = 'create table sneaky (id integer);\n';
      const two = 'create table two (id integer);\n';
      const dir = await tree({
        'app_alpha/0001_sneaky.sql': sneaky,
        'app_alpha/0002_two.sql': two,
      });

      // 人手（或舊版本）留下的 ledger：只有 0002。
      await db.pool.query(
        `create table schema_migrations (
           name text primary key,
           checksum text not null,
           applied_at timestamptz not null default now()
         )`,
      );
      await db.pool.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
        'app_alpha/0002_two.sql',
        checksum(two),
      ]);

      const failure = migrate({ pool: db.pool, dir, log: silent });
      await expect(failure).rejects.toThrow(/串 "app_alpha"/);
      await expect(failure).rejects.toThrow(/0001_sneaky\.sql/);
      await expect(failure).rejects.toThrow(/比已套用的更早/);

      // 攔住之後一個檔都沒有套用。
      expect(await ledgerNames(db)).toEqual(['app_alpha/0002_two.sql']);
      const schemas = await db.pool.query<{ nspname: string }>(
        "select nspname from pg_namespace where nspname = 'app_alpha'",
      );
      expect(schemas.rows).toEqual([]);
    });
  });

  it('整個串的資料夾不見了但 ledger 有紀錄：拒絕，並說出是哪一串', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        'app_alpha/0001_one.sql': 'create table one (id integer);\n',
        'app_beta/0001_two.sql': 'create table two (id integer);\n',
      });
      await migrate({ pool: db.pool, dir, log: silent });

      await rm(resolve(dir, 'app_beta'), { recursive: true, force: true });

      const failure = migrate({ pool: db.pool, dir, log: silent });
      await expect(failure).rejects.toThrow(/app_beta/);
      await expect(failure).rejects.toThrow(/串不見了/);
    });
  });

  it('有不合法的檔案時，不會先套用其他新 migration', async () => {
    await withTempDb(async (db) => {
      const dir = await tree({
        '0001_base.sql': 'create table base_table (id integer);\n',
        'app_alpha/0001_one.sql': 'create table one (id integer);\n',
        'app_alpha/notes.txt': '唔應該擺喺呢度\n',
      });

      await expect(migrate({ pool: db.pool, dir, log: silent })).rejects.toThrow(/notes\.txt/);

      // 一個檔案都沒有套用：連平目錄那個合法的都沒有動， ledger 也沒有被建出來。
      const ledger = await db.pool.query("select to_regclass('public.schema_migrations') as reg");
      expect(ledger.rows).toEqual([{ reg: null }]);

      const base = await db.pool.query("select to_regclass('public.base_table') as reg");
      expect(base.rows).toEqual([{ reg: null }]);
    });
  });
});

describe('並發：兩個 runner 同時對同一個臨時庫', () => {
  it('用可控同步點證明互斥，所有串各檔只套用一次', async () => {
    await withTempDb(async (db) => {
      const blockKey = 4_206_902;
      const dir = await tree({
        '0001_base.sql': 'create table base_table (id integer);\n',
        'app_sync/0001_block.sql': [
          `select pg_advisory_lock(${blockKey});`,
          `select pg_advisory_unlock(${blockKey});`,
          'create table sync_marker (id integer);',
          '',
        ].join('\n'),
      });

      const probe = await db.pool.connect();
      let runnerA: Promise<string[]> | undefined;
      let runnerB: Promise<string[]> | undefined;

      try {
        // 1. 第三者先拿著 blockKey，令 runner A 停在該檔的 SQL 中間。
        await probe.query(`select pg_advisory_lock(${blockKey})`);

        // 2. runner A 開始，會卡在 blockKey。
        runnerA = migrate({ pool: db.pool, dir, log: silent });

        await waitFor('runner A 卡在 blockKey', async () => {
          const waiting = await probe.query<{ n: number }>(
            `select count(*)::int as n from pg_locks
              where locktype = 'advisory' and not granted and objid = $1::oid`,
            [blockKey],
          );
          return (waiting.rows[0]?.n ?? 0) > 0;
        });

        // 3. runner B 開始，應該卡在全局鎖。這裡不是 sleep 猜的，是看到它真的在等。
        runnerB = migrate({ pool: db.pool, dir, log: silent });

        await waitFor('runner B 卡在全局鎖', async () => {
          const waiting = await probe.query<{ n: number }>(
            `select count(*)::int as n from pg_locks
              where locktype = 'advisory' and not granted and objid = $1::oid`,
            [ADVISORY_LOCK_KEY],
          );
          return (waiting.rows[0]?.n ?? 0) > 0;
        });

        // 4. 放開 blockKey：A 完成並解鎖，B 才拿得到鎖。
        await probe.query(`select pg_advisory_unlock(${blockKey})`);
      } finally {
        // 失敗路徑也要放鎖，否則 session 級的鎖會留在 pool 的連線上。
        await probe.query(`select pg_advisory_unlock(${blockKey})`).catch(() => undefined);
        probe.release();
      }

      const results = await Promise.all([runnerA, runnerB]);
      const applied = results.flat();

      // 每個檔案只套用一次，兩邊加起來剛好是全部。
      expect(applied.sort()).toEqual(['0001_base.sql', 'app_sync/0001_block.sql']);
      expect(await ledgerNames(db)).toEqual(['0001_base.sql', 'app_sync/0001_block.sql']);

      const markers = await db.pool.query<{ n: number }>(
        'select count(*)::int as n from app_sync.sync_marker',
      );
      expect(markers.rows[0]?.n).toBe(0);
    });
  });
});

describe('舊資料庫升級', () => {
  it('舊執行器套用 0001 至 0003 之後，新執行器只補新的 migration，ledger 與測試資料不變', async () => {
    await withTempDb(async (db) => {
      // 1. 舊行為：單一平目錄串、ledger 用未限定名稱建在 public。
      const legacyClient = await db.pool.connect();
      let legacy: string[];

      try {
        legacy = await applyMigrations({
          client: legacyClient,
          migrations: await readFlat(),
          log: silent,
        });
      } finally {
        legacyClient.release();
      }

      expect(legacy).toEqual([
        '0001_audit_log.sql',
        '0002_users_sessions.sql',
        '0003_stored_file.sql',
      ]);

      // 舊庫的資料也放一點，證明升級不會動到它。
      await db.pool.query(
        `insert into audit_log (actor_type, actor_id, action, target, detail)
         values ('system', 'upgrade-test', 'upgrade.marker', 'x', '{"n":1}'::jsonb)`,
      );

      const before = await db.pool.query(
        'select name, checksum, applied_at from public.schema_migrations order by name',
      );
      const beforeRows = before.rows;

      expect(beforeRows.map((row) => (row as { name: string }).name)).toEqual([
        '0001_audit_log.sql',
        '0002_users_sessions.sql',
        '0003_stored_file.sql',
      ]);

      // ledger 仍在 public，沒有多一張。
      const where = await db.pool.query<{ schema: string }>(
        `select table_schema as schema from information_schema.tables where table_name = 'schema_migrations'`,
      );
      expect(where.rows).toEqual([{ schema: 'public' }]);

      // 2. 新執行器接手：只補舊庫沒有的（#80 的 0004、#81 的 0005、#83 的 0006、
      //    #84 的 0007、#85 的 0008、#87 的 0009），舊紀錄逐字不變。
      const logs: string[] = [];
      const applied = await migrate({
        pool: db.pool,
        dir: FLAT_DIR,
        log: (message) => logs.push(message),
      });

      expect(applied).toEqual([
        '0004_company_settings.sql',
        '0005_org_units.sql',
        '0006_app_grants.sql',
        '0007_identities.sql',
        '0008_jobs.sql',
        '0009_session_entry.sql',
        '0010_needs.sql',
        '0011_brands_sites.sql',
        '0012_user_brand_focus.sql',
        '0013_brand_pages.sql',
        '0014_brand_policy.sql',
      '0015_brand_editor.sql',

      '0016_brand_policy_v2.sql',

      '0017_brand_document.sql',
      ]);

      const after = await db.pool.query<{ name: string; checksum: string; applied_at: Date }>(
        'select name, checksum, applied_at from public.schema_migrations order by name',
      );
      expect(after.rows.slice(0, beforeRows.length)).toEqual(beforeRows);
      expect(after.rows.map((row) => row.name)).toEqual([
        '0001_audit_log.sql',
        '0002_users_sessions.sql',
        '0003_stored_file.sql',
        '0004_company_settings.sql',
        '0005_org_units.sql',
        '0006_app_grants.sql',
        '0007_identities.sql',
        '0008_jobs.sql',
        '0009_session_entry.sql',
        '0010_needs.sql',
        '0011_brands_sites.sql',
        '0012_user_brand_focus.sql',
        '0013_brand_pages.sql',
        '0014_brand_policy.sql',
      '0015_brand_editor.sql',

      '0016_brand_policy_v2.sql',

      '0017_brand_document.sql',
      ]);

      // 再跑一次才真的沒有待套用的，並且明講。
      expect(
        await migrate({ pool: db.pool, dir: FLAT_DIR, log: (message) => logs.push(message) }),
      ).toEqual([]);
      expect(logs).toContain('沒有待套用的 migration');

      // 3. 再加一條新串：舊紀錄原封不動，新串照樣套用。
      //    平目錄要放齊全部已套用的檔案（不只是 0001 至 0003）——執行器會把
      //    「ledger 有、資料夾沒有」當成有人刪了 migration 而拒絕啟動。
      const dir = await tree({});
      const flatFiles = (await readdir(FLAT_DIR)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name));

      for (const name of flatFiles) {
        await writeFile(resolve(dir, name), await readFile(resolve(FLAT_DIR, name), 'utf8'), 'utf8');
      }
      await mkdir(resolve(dir, 'app_alpha'), { recursive: true });
      await writeFile(
        resolve(dir, 'app_alpha/0001_alpha_one.sql'),
        await readFile(resolve(FIXTURES, 'app_alpha/0001_alpha_one.sql'), 'utf8'),
        'utf8',
      );

      const second = await migrate({ pool: db.pool, dir, log: silent });
      expect(second).toEqual(['app_alpha/0001_alpha_one.sql']);

      const final = await db.pool.query<{ name: string }>(
        'select name, checksum, applied_at from public.schema_migrations order by name',
      );

      // 舊的每一筆逐字不變（包含 applied_at），新串排在後面。
      // 用 `after.rows.length` 而唔寫死筆數：加 migration 唔應該要改呢一行。
      expect(final.rows.slice(0, after.rows.length)).toEqual(after.rows);
      expect(final.rows.map((row) => row.name)).toEqual([
        '0001_audit_log.sql',
        '0002_users_sessions.sql',
        '0003_stored_file.sql',
        '0004_company_settings.sql',
        '0005_org_units.sql',
        '0006_app_grants.sql',
        '0007_identities.sql',
        '0008_jobs.sql',
        '0009_session_entry.sql',
        '0010_needs.sql',
        '0011_brands_sites.sql',
        '0012_user_brand_focus.sql',
        '0013_brand_pages.sql',
        '0014_brand_policy.sql',
      '0015_brand_editor.sql',

      '0016_brand_policy_v2.sql',

      '0017_brand_document.sql',
        'app_alpha/0001_alpha_one.sql',
      ]);

      const audit = await db.pool.query<{ n: number }>(
        "select count(*)::int as n from audit_log where action = 'upgrade.marker'",
      );
      expect(audit.rows[0]?.n).toBe(1);
    });
  });
});
