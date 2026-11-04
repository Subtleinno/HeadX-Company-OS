import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';

/**
 * Migration 執行器。不引入任何 migration 或 ORM 套件。規則是這 7 條。
 *
 * 1. 兩種位置，全部是純 SQL：
 *    - `db/migrations/NNNN_說明.sql` —— 平目錄，platform 自己的串，規則與以前完全一樣；
 *      檔名 `[0-9]{4}` 開頭，英文小寫加底線，編號由 0001 起連續。
 *    - `db/migrations/<schema>/NNNN_說明.sql` —— 每個 app 一串，資料夾名就是 schema 名，
 *      每一串各自由 0001 起連續。
 * 2. 套用次序固定：平目錄先，再按 schema 名稱字母順序。不支援跨串依賴。
 * 3. 每個檔案一個交易；失敗整個回滾，`schema_migrations` 不會留下那一筆。
 *    串的檔案在同一個交易內先 `create schema if not exists`、再 `set local search_path`，
 *    所以 schema 與表一齊成功或一齊消失，`SET LOCAL` 也不會漏到交易外或下一串。
 * 4. 已套用的檔案內容（SHA-256）不可以變，變了就拒絕啟動並指出是哪一串哪個檔。
 * 5. ledger 只有一張（`schema_migrations`）。新串的 name 記為 `<schema>/NNNN_說明.sql`，
 *    避免與平目錄撞名；寫入時用完整限定名稱，不受當前 search_path 影響，
 *    也不會在 app schema 裡另建一張。
 * 6. 發現檔案與各串 ledger 一致性**全部驗證完**才開始套用：有不合法的檔案時，
 *    不會先套用其他新 migration。
 * 7. 用 `pg_advisory_lock` 包住整段，兩個程序同時啟動只會有一個在套用。
 *
 * `set local search_path` 只控制未限定名稱的解析，**不是**權限隔離：
 * 有權限的連線仍然可以用 `public.表名` 這種完整名稱存取任何表。
 * app 之間的 runtime 權限隔離由 #88 用真正的 Postgres ACL 負責，不是靠這裡。
 * migration 是經審查、隨程式發佈的可信 SQL，不是使用者可提交的任意 SQL。
 */

export const DEFAULT_MIGRATIONS_DIR = '/app/db/migrations';

const MIGRATION_NAME = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

/** 串的資料夾名：小寫字母開頭，只用小寫英數與底線，最多 41 個字元。 */
const STREAM_SCHEMA = /^[a-z][a-z0-9_]{0,40}$/;

/** `public` 放 ledger 與 platform 的表；`information_schema` 是系統的。兩者都不可以當串。 */
const RESERVED_SCHEMAS: readonly string[] = ['public', 'information_schema'];

/**
 * 全局鎖的 key。數字本身沒有意義，但必須全公司一致；改了等於換一把鎖，
 * 舊鎖上的程序不會再和新程序互斥。
 *
 * 匯出只為讓並發測試可以觀察「有誰正在等這把鎖」，產品程式不應該改它。
 */
export const ADVISORY_LOCK_KEY = 4_206_001;

/** 平目錄那一串在錯誤訊息與日誌裡的名字。 */
export const PLATFORM_STREAM_LABEL = '平目錄';

const LEDGER_TABLE = 'schema_migrations';

/**
 * ledger 沒有既有紀錄時，建在 `public`。
 * 這是歷史行為：舊執行器用未限定名稱建表，連線的 search_path 是 `"$user", public`，
 * 而 `$user` 這個 schema 通常不存在，所以實際落點一直是 public。
 */
const LEDGER_FALLBACK_SCHEMA = 'public';

export type MigrationFile = {
  name: string;
  sql: string;
};

export type MigrationLogger = (message: string) => void;

export type ParsedMigrationName = {
  name: string;
  number: number;
};

/** 一串 migration：平目錄一串（schema 為 null），每個 `db/migrations/<schema>/` 各一串。 */
export type MigrationStream = {
  /** null 代表平目錄，即 platform 自己的串。 */
  schema: string | null;
  /** ledger 前綴；平目錄是空字串，串是 `<schema>/`。 */
  prefix: string;
  /** 錯誤訊息與日誌用的標籤，例如 `串 "app_alpha"`。 */
  label: string;
  dir: string;
  files: MigrationFile[];
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

/** 把識別名稱安全地放進 SQL；名字來自磁碟或資料庫，所以用雙引號包住並轉義。 */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** 由 ledger 內的 name 取回它屬於哪一串；平目錄的紀錄沒有 `/`。 */
export function parseLedgerName(name: string): { schema: string | null; file: string } {
  const slash = name.indexOf('/');
  if (slash < 0) {
    return { schema: null, file: name };
  }

  return { schema: name.slice(0, slash), file: name.slice(slash + 1) };
}

/** 某串內的一個檔案，在 ledger 內的名字。串會加 `<schema>/` 前綴，避免與平目錄撞名。 */
export function ledgerName(
  stream: Pick<MigrationStream, 'schema'>,
  fileName: string,
): string {
  return stream.schema === null ? fileName : `${stream.schema}/${fileName}`;
}

/**
 * 驗證串的資料夾名（即 schema 名）。
 * 不合格就擲錯 —— 寧願啟不動，也不要在一個名字有問題的 schema 裡建表。
 */
export function validateStreamSchema(name: string): void {
  if (RESERVED_SCHEMAS.includes(name)) {
    throw new MigrationError(
      `migration 串的 schema 名稱不可以是保留名稱：${name}（public 放 ledger 與 platform 的表，information_schema 是系統的）`,
    );
  }

  if (name.startsWith('pg_')) {
    throw new MigrationError(
      `migration 串的 schema 名稱不可以 pg_ 開頭：${name}（那是 Postgres 系統保留的）`,
    );
  }

  if (!STREAM_SCHEMA.test(name)) {
    throw new MigrationError(
      `migration 串的 schema 名稱格式錯誤：${name}（要小寫字母開頭，只用小寫英數與底線，最多 41 個字元）`,
    );
  }
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
 * 驗證一串的檔名並依編號排序。
 * 格式錯、編號重複、編號不連續都擲 MigrationError —— 寧願啟不動，也不要套一個殘缺的 schema。
 * `options.label` 會出現在訊息前面，用來指出是哪一串。
 */
export function sortMigrations(
  names: readonly string[],
  options: { label?: string } = {},
): ParsedMigrationName[] {
  const where = options.label === undefined ? '' : `[${options.label}] `;

  const parsed: ParsedMigrationName[] = names.map((name) => {
    const matched = MIGRATION_NAME.exec(name);
    if (matched === null) {
      throw new MigrationError(
        `${where}migration 檔名格式錯誤：${name}（要 4 位數字_英文小寫加底線.sql，例如 0001_audit_log.sql）`,
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
      throw new MigrationError(`${where}migration 編號重複：${pad(number)}（${names.join('、')}）`);
    }
  }

  const numbers = [...byNumber.keys()].sort((left, right) => left - right);
  for (let index = 0; index < numbers.length; index += 1) {
    const expected = index + 1;
    if (numbers[index] !== expected) {
      throw new MigrationError(`${where}migration 編號不連續：缺少 ${pad(expected)}`);
    }
  }

  return parsed.sort((left, right) => left.number - right.number);
}

/** 讀出一串的檔案內容；`names` 已在同一串之內。 */
async function readStreamFiles(
  dir: string,
  names: readonly string[],
  label: string,
): Promise<MigrationFile[]> {
  const files: MigrationFile[] = [];

  for (const item of sortMigrations(names, { label })) {
    files.push({
      name: item.name,
      sql: await readFile(resolve(dir, item.name), 'utf8'),
    });
  }

  return files;
}

/**
 * 讀出平目錄的 migration（只有 `dir` 第一層的檔案，不看子資料夾）。
 * 保留這個匯出是因為既有測試與備份腳本用它；多串請用 `readStreams`。
 */
export async function readMigrations(dir: string): Promise<MigrationFile[]> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new MigrationError(`找不到 migration 資料夾：${dir}`);
  }

  const names = entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name);

  return readStreamFiles(dir, names, PLATFORM_STREAM_LABEL);
}

/**
 * 讀出資料夾內的**全部**串：平目錄一串，加每個子資料夾一串。
 * 回傳次序就是套用次序：平目錄最先，其餘按 schema 名稱字母順序。
 */
export async function readStreams(dir: string): Promise<MigrationStream[]> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new MigrationError(`找不到 migration 資料夾：${dir}`);
  }

  const flatNames: string[] = [];
  const schemaNames: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // 資料夾一定是串：名字不合格就即刻失敗，不會被當成「不認識的東西」跳過。
      validateStreamSchema(entry.name);
      schemaNames.push(entry.name);
      continue;
    }

    flatNames.push(entry.name);
  }

  const streams: MigrationStream[] = [
    {
      schema: null,
      prefix: '',
      label: PLATFORM_STREAM_LABEL,
      dir,
      files: await readStreamFiles(dir, flatNames, PLATFORM_STREAM_LABEL),
    },
  ];

  // 用字碼排序，不用 localeCompare：排序結果不可以隨機器的語系設定改變。
  for (const schema of schemaNames.sort()) {
    const streamDir = resolve(dir, schema);
    const label = `串 "${schema}"`;
    const streamEntries = await readdir(streamDir, { withFileTypes: true });

    const nested = streamEntries.find((entry) => entry.isDirectory());
    if (nested !== undefined) {
      throw new MigrationError(`[${label}] 串之內不可以再有子資料夾：${nested.name}`);
    }

    streams.push({
      schema,
      prefix: `${schema}/`,
      label,
      dir: streamDir,
      files: await readStreamFiles(
        streamDir,
        streamEntries.map((entry) => entry.name),
        label,
      ),
    });
  }

  return streams;
}

/**
 * 找出既有 ledger 的實際 schema，並確保那張表存在。
 *
 * 為甚麼要查而不是寫死 `public`：ledger 的落點是歷史造成的（見 LEDGER_FALLBACK_SCHEMA），
 * 寫死等於用猜的。查 pg_class 拿到的是實體位置，之後用完整限定名稱操作，
 * 連線的 search_path 怎麼設都不影響，也不會在 app schema 裡另建一張。
 * 若同時存在兩張（例如有人曾經在 app schema 建過），拒絕啟動而不是選一張。
 */
async function ensureLedger(client: PoolClient): Promise<string> {
  const found = await client.query<{ schema: string }>(
    `select n.nspname as schema
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relname = $1
        and c.relkind in ('r', 'p')
      order by n.nspname`,
    [LEDGER_TABLE],
  );

  if (found.rows.length > 1) {
    const where = found.rows.map((row) => row.schema).join('、');
    throw new MigrationError(
      `找到多過一張 ${LEDGER_TABLE}（${where}）：不肯猜哪一張才是真的 ledger，請人手清理`,
    );
  }

  const schema = found.rows[0]?.schema ?? LEDGER_FALLBACK_SCHEMA;
  const qualified = `${quoteIdent(schema)}.${quoteIdent(LEDGER_TABLE)}`;

  await client.query(`
    create table if not exists ${qualified} (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  return qualified;
}

/** 由檔名取編號；已套用的紀錄一定要有 4 位數字開頭，否則 ledger 已經無法解讀。 */
function numberFromLedgerFile(file: string, ledgerEntry: string): number {
  const matched = /^(\d{4})_/.exec(file);
  if (matched === null) {
    throw new MigrationError(
      `ledger 內有一筆無法辨識的檔名：${ledgerEntry}（要 4 位數字開頭，例如 0001_audit_log.sql）`,
    );
  }

  return Number(matched[1]);
}

export type ApplyStreamsOptions = {
  client: PoolClient;
  streams: readonly MigrationStream[];
  log?: MigrationLogger;
};

/**
 * 在一個已有的連線上套用全部串。鎖由 migrate() 負責，這裡只管驗證、次序與交易。
 * 回傳實際套用的 ledger 名稱（串會帶 `<schema>/` 前綴）；沒有待套用的就回空陣列。
 *
 * 驗證與套用是分開的兩段：先把每一串的命名、編號與 ledger 一致性全部驗完，
 * 有任何一條不合格就擲錯，**一個檔案都不會套用**。
 */
export async function applyStreams(options: ApplyStreamsOptions): Promise<string[]> {
  const { client } = options;
  const log = options.log ?? (() => undefined);

  // 第一段：每一串自己的檔名與編號。readStreams 已經排過，這裡再排一次是因為
  // applyStreams 也可以被直接呼叫（測試與其他呼叫者只給檔案清單）。
  const prepared = options.streams.map((stream) => {
    const sqlByName = new Map(stream.files.map((file) => [file.name, file.sql]));
    return {
      stream,
      ordered: sortMigrations(
        stream.files.map((file) => file.name),
        { label: stream.label },
      ),
      sqlByName,
    };
  });

  const ledger = await ensureLedger(client);

  const recorded = await client.query<{ name: string; checksum: string }>(
    `select name, checksum from ${ledger} order by name`,
  );

  const known = new Map(prepared.map((item) => [item.stream.prefix, item]));
  const appliedByStream = new Map<string, Map<string, string>>();

  for (const row of recorded.rows) {
    const { schema, file } = parseLedgerName(row.name);
    const prefix = schema === null ? '' : `${schema}/`;

    if (!known.has(prefix)) {
      throw new MigrationError(
        schema === null
          ? `ledger 有一筆不屬於任何已知串的紀錄：${row.name}`
          : `已套用的 migration 所屬的串不見了：${row.name}（找不到 db/migrations/${schema}/ 這個資料夾）`,
      );
    }

    const forStream = appliedByStream.get(prefix) ?? new Map<string, string>();
    forStream.set(file, row.checksum);
    appliedByStream.set(prefix, forStream);
  }

  for (const { stream, ordered, sqlByName } of prepared) {
    const applied = appliedByStream.get(stream.prefix) ?? new Map<string, string>();
    const present = new Set(ordered.map((item) => item.name));

    // 紀錄存在但檔案不見了：schema 已經無法由 repo 重建，直接拒絕。
    for (const file of applied.keys()) {
      if (!present.has(file)) {
        throw new MigrationError(
          `[${stream.label}] 已套用的 migration 找不到檔案：${ledgerName(stream, file)}（已套用的檔案永不刪除，只往前加）`,
        );
      }
    }

    // 已套用但內容不同：有人改了歷史，拒絕啟動。
    for (const [file, recordedChecksum] of applied) {
      const currentChecksum = checksum(sqlByName.get(file) ?? '');
      if (currentChecksum !== recordedChecksum) {
        throw new MigrationError(
          `[${stream.label}] 已套用的 migration 內容被修改：${ledgerName(stream, file)}（紀錄 ${recordedChecksum.slice(0, 12)}…，現在 ${currentChecksum.slice(0, 12)}…）`,
        );
      }
    }

    // 新檔案編號必須大於同一串內所有已套用的編號，否則就是中間插隊。
    const appliedNumbers = [...applied.keys()].map((file) =>
      numberFromLedgerFile(file, ledgerName(stream, file)),
    );
    const highestApplied = appliedNumbers.length === 0 ? 0 : Math.max(...appliedNumbers);

    for (const item of ordered) {
      if (!applied.has(item.name) && item.number <= highestApplied) {
        throw new MigrationError(
          `[${stream.label}] migration 編號比已套用的更早：${item.name}（這一串已套用到 ${pad(highestApplied)}，只准往前加）`,
        );
      }
    }
  }

  // 第二段：套用。次序由 prepared 的次序決定（平目錄先，再按 schema 字母序）。
  const appliedNames: string[] = [];

  for (const { stream, ordered, sqlByName } of prepared) {
    const applied = appliedByStream.get(stream.prefix) ?? new Map<string, string>();
    const pending = ordered.filter((item) => !applied.has(item.name));

    for (const item of pending) {
      const sql = sqlByName.get(item.name) ?? '';
      const name = ledgerName(stream, item.name);

      // 一個檔案一個交易：DDL 在 Postgres 是交易性的，所以整份會一齊成功或一齊消失。
      // 串的 schema 建立與 search_path 都放在同一個交易內：
      // - 建立 schema 失敗／SQL 失敗時，新建的 schema 也會一齊回滾；
      // - SET LOCAL 在交易結束就失效，不會漏到下一串。
      await client.query('begin');
      try {
        if (stream.schema !== null) {
          await client.query(`create schema if not exists ${quoteIdent(stream.schema)}`);
          await client.query(`set local search_path to ${quoteIdent(stream.schema)}`);
        }

        await client.query(sql);
        await client.query(`insert into ${ledger} (name, checksum) values ($1, $2)`, [
          name,
          checksum(sql),
        ]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        const reason = error instanceof Error ? error.message : String(error);
        // 帶上 SQLSTATE：42P01（找不到關聯）之類的分別，靠訊息文字猜不出來。
        const code = (error as { code?: unknown }).code;
        const state = typeof code === 'string' ? `（SQLSTATE ${code}）` : '';
        throw new MigrationError(
          `[${stream.label}] 套用 ${item.name} 失敗（已整份回滾）：${reason}${state}`,
        );
      }

      appliedNames.push(name);
      log(stream.schema === null ? `已套用 ${item.name}` : `已套用 ${name}`);
    }
  }

  if (appliedNames.length === 0) {
    log('沒有待套用的 migration');
  }

  return appliedNames;
}

export type ApplyOptions = {
  client: PoolClient;
  migrations: readonly MigrationFile[];
  log?: MigrationLogger;
};

/**
 * 套用平目錄的 migration（只有一串）。
 * 保留這個匯出是因為既有測試用它；要套用多串請用 `applyStreams`。
 */
export async function applyMigrations(options: ApplyOptions): Promise<string[]> {
  const stream: MigrationStream = {
    schema: null,
    prefix: '',
    label: PLATFORM_STREAM_LABEL,
    dir: '',
    files: [...options.migrations],
  };

  return applyStreams({
    client: options.client,
    streams: [stream],
    ...(options.log === undefined ? {} : { log: options.log }),
  });
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
  const streams = await readStreams(dir);
  const client = await options.pool.connect();

  try {
    // session 級鎖：一定要解鎖，否則連線回到 pool 之後仍然佔著。
    await client.query(`select pg_advisory_lock(${ADVISORY_LOCK_KEY})`);

    try {
      return await applyStreams({
        client,
        streams,
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
