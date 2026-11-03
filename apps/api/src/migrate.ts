import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';

/**
 * Migration 執行器。不引入任何 migration 或 ORM 套件：這裡只有 4 條規則。
 *
 * 1. 檔案在 db/migrations/，檔名 NNNN_英文小寫加底線.sql，編號由 0001 起連續。
 * 2. 每個檔案一個交易；失敗整個回滾，schema_migrations 不會留下那一筆。
 * 3. 已套用的檔案內容（SHA-256）不可以變，變了就拒絕啟動並指出檔名。
 * 4. 用 pg_advisory_lock 包住整段，兩個程序同時啟動只會有一個在套用。
 */

export const DEFAULT_MIGRATIONS_DIR = '/app/db/migrations';

const MIGRATION_NAME = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

/**
 * 全局鎖的 key。數字本身沒有意義，但必須全公司一致；改了等於換一把鎖，
 * 舊鎖上的程序不會再和新程序互斥。
 */
const ADVISORY_LOCK_KEY = 4_206_001;

export type MigrationFile = {
  name: string;
  sql: string;
};

export type MigrationLogger = (message: string) => void;

export type ParsedMigrationName = {
  name: string;
  number: number;
};

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

function pad(number: number): string {
  return String(number).padStart(4, '0');
}

/**
 * 內容的 SHA-256；記錄在 schema_migrations，用來發現「已套用的檔案被改」。
 *
 * 算之前先把 CRLF 統一成 LF。同一個檔案在 Windows（core.autocrlf=true，工作樹是 CRLF）
 * 與 Linux／容器（LF）算出來必須一樣，否則只是換行不同就會被誤判為內容被改，
 * API 會拒絕啟動。LF 版本的 checksum 不受影響，所以資料庫紀錄不需要動。
 */
export function checksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/**
 * 驗證檔名並依編號排序。
 * 格式錯、編號重複、編號不連續都擲 MigrationError —— 寧願啟不動，也不要套一個殘缺的 schema。
 */
export function sortMigrations(names: readonly string[]): ParsedMigrationName[] {
  const parsed: ParsedMigrationName[] = names.map((name) => {
    const matched = MIGRATION_NAME.exec(name);
    if (matched === null) {
      throw new MigrationError(
        `migration 檔名格式錯誤：${name}（要 4 位數字_英文小寫加底線.sql，例如 0001_audit_log.sql）`,
      );
    }

    return { name, number: Number(matched[1]) };
  });

  const byNumber = new Map<number, string[]>();
  for (const item of parsed) {
    const names = byNumber.get(item.number) ?? [];
    names.push(item.name);
    byNumber.set(item.number, names);
  }

  for (const [number, names] of byNumber) {
    if (names.length > 1) {
      throw new MigrationError(`migration 編號重複：${pad(number)}（${names.join('、')}）`);
    }
  }

  const numbers = [...byNumber.keys()].sort((left, right) => left - right);
  for (let index = 0; index < numbers.length; index += 1) {
    const expected = index + 1;
    if (numbers[index] !== expected) {
      throw new MigrationError(`migration 編號不連續：缺少 ${pad(expected)}`);
    }
  }

  return parsed.sort((left, right) => left.number - right.number);
}

/** 讀出資料夾內全部 migration，已排序。 */
export async function readMigrations(dir: string): Promise<MigrationFile[]> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new MigrationError(`找不到 migration 資料夾：${dir}`);
  }

  const names = sortMigrations(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );

  const files: MigrationFile[] = [];
  for (const item of names) {
    files.push({
      name: item.name,
      sql: await readFile(resolve(dir, item.name), 'utf8'),
    });
  }

  return files;
}

export type ApplyOptions = {
  client: PoolClient;
  migrations: readonly MigrationFile[];
  log?: MigrationLogger;
};

/**
 * 在一個已有的連線上套用 migration。鎖由 migrate() 負責，這裡只管順序與交易。
 * 回傳實際套用的檔名；沒有待套用的就回空陣列。
 */
export async function applyMigrations(options: ApplyOptions): Promise<string[]> {
  const { client } = options;
  const log = options.log ?? (() => undefined);

  const ordered = sortMigrations(options.migrations.map((file) => file.name));
  const sqlByName = new Map(options.migrations.map((file) => [file.name, file.sql]));

  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const recorded = await client.query<{ name: string; checksum: string }>(
    'select name, checksum from schema_migrations order by name',
  );
  const appliedByName = new Map(recorded.rows.map((row) => [row.name, row.checksum]));

  // 紀錄存在但檔案不見了：schema 已經無法由 repo 重建，直接拒絕。
  for (const name of appliedByName.keys()) {
    if (!sqlByName.has(name)) {
      throw new MigrationError(
        `已套用的 migration 找不到檔案：${name}（已套用的檔案永不刪除，只往前加）`,
      );
    }
  }

  // 已套用但內容不同：有人改了歷史，拒絕啟動。
  for (const [name, recordedChecksum] of appliedByName) {
    const currentChecksum = checksum(sqlByName.get(name) ?? '');
    if (currentChecksum !== recordedChecksum) {
      throw new MigrationError(
        `已套用的 migration 內容被修改：${name}（紀錄 ${recordedChecksum.slice(0, 12)}…，現在 ${currentChecksum.slice(0, 12)}…）`,
      );
    }
  }

  // 新檔案編號必須大於所有已套用的編號，否則就是中間插隊。
  const appliedNumbers = [...appliedByName.keys()].map((name) => Number(name.slice(0, 4)));
  const highestApplied = appliedNumbers.length === 0 ? 0 : Math.max(...appliedNumbers);

  const pending = ordered.filter((item) => !appliedByName.has(item.name));
  for (const item of pending) {
    if (item.number <= highestApplied) {
      throw new MigrationError(
        `migration 編號比已套用的更早：${item.name}（已套用到 ${pad(highestApplied)}，只准往前加）`,
      );
    }
  }

  if (pending.length === 0) {
    log('沒有待套用的 migration');
    return [];
  }

  const applied: string[] = [];

  for (const item of pending) {
    const sql = sqlByName.get(item.name) ?? '';

    // 一個檔案一個交易：DDL 在 Postgres 是交易性的，所以整份會一齊成功或一齊消失。
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
        item.name,
        checksum(sql),
      ]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      const reason = error instanceof Error ? error.message : String(error);
      throw new MigrationError(`套用 ${item.name} 失敗（已整份回滾）：${reason}`);
    }

    applied.push(item.name);
    log(`已套用 ${item.name}`);
  }

  return applied;
}

export type MigrateOptions = {
  pool: Pool;
  dir?: string;
  log?: MigrationLogger;
};

/**
 * 啟動時呼叫：先取鎖，再套用，最後解鎖。
 * 任何錯誤都往外擲，由呼叫者印出原因並結束程序 —— 沒有 schema 的 API 不應該假裝健康。
 */
export async function migrate(options: MigrateOptions): Promise<string[]> {
  const dir = options.dir ?? resolveMigrationsDir();
  const migrations = await readMigrations(dir);
  const client = await options.pool.connect();

  try {
    // session 級鎖：一定要解鎖，否則連線回到 pool 之後仍然佔著。
    await client.query(`select pg_advisory_lock(${ADVISORY_LOCK_KEY})`);

    try {
      return await applyMigrations({
        client,
        migrations,
        ...(options.log === undefined ? {} : { log: options.log }),
      });
    } finally {
      await client.query(`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
    }
  } finally {
    client.release();
  }
}

/** 映像內的預設路徑；本機要指向 repo 的 db/migrations 時設 MIGRATIONS_DIR。 */
export function resolveMigrationsDir(): string {
  const fromEnv = process.env.MIGRATIONS_DIR;
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : DEFAULT_MIGRATIONS_DIR;
}
