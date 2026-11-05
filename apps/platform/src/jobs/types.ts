/**
 * 背景工作的共用詞彙（issue #85）。
 *
 * 狀態刻意少：pending、running、succeeded、dead。每一次轉換都有程式寫入
 * （見 db/migrations/0008_jobs.sql 的註解與 jobs.integration.test.ts）。
 */

export const JOB_STATES = ['pending', 'running', 'succeeded', 'dead'] as const;

export type JobState = (typeof JOB_STATES)[number];

/** 終態：唔會再被領取，亦唔會再有租約。 */
export const TERMINAL_JOB_STATES: readonly JobState[] = ['succeeded', 'dead'];

export const DEFAULT_MAX_ATTEMPTS = 5;
export const MAX_ATTEMPTS_CEILING = 25;

/** payload 的業務上限。與 DB 的硬上限（256 KiB）刻意不同，見 0008 的註解。 */
export const PAYLOAD_MAX_BYTES = 65_536;

/** payload 的嵌套層數上限；頂層物件是第 0 層。 */
export const PAYLOAD_MAX_DEPTH = 5;

/** 欄位名長度上限。 */
export const PAYLOAD_KEY_MAX_LENGTH = 100;

export const JOB_TYPE_MAX_LENGTH = 100;

/** 工作種類：小寫開頭，可以用點分段（例如 `need.overdue`）。 */
export const JOB_TYPE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/** 錯誤代碼：小寫開頭，只用小寫英數與底線，最多 64 字元。 */
export const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 租約 token 與 job id 都是 uuid 型別。傳一個「不是 token 的 token」入 SQL，
 * Postgres 會擲 22P02（invalid input syntax），而不是回「唔係你嘅租約」。
 *
 * 但「唔係你嘅租約」才是正確答案：過期的 worker、重播的請求、壞掉的資料
 * 都會帶一個唔係 uuid 的字串來，這種情況一個正常人都預期係 false，而唔係 500。
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** 一列工作，欄位名與資料庫一致（這一層是內部介面，不做 camelCase 轉換）。 */
export type JobRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  state: JobState;
  run_at: Date;
  attempts: number;
  max_attempts: number;
  lease_token: string | null;
  lease_expires_at: Date | null;
  locked_by: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
};

/**
 * handler 收到的東西。
 *
 * `signal` 是合作式的：租約失效或 worker 放棄等待時會 abort，但**無法**強制
 * 停止一段唔肯返回的程式碼。所以 worker 不會假裝它停了（見 jobs/worker.ts）。
 */
export type JobContext<TPayload = Record<string, unknown>> = {
  jobId: string;
  type: string;
  payload: Readonly<TPayload>;
  /** 第幾次執行，由 1 開始。 */
  attempt: number;
  maxAttempts: number;
  workerId: string;
  signal: AbortSignal;
};

/**
 * 一個工作種類的實作。必須自己做到冪等或去重：隊列是「至少一次」。
 */
export type JobHandler<TPayload = Record<string, unknown>> = (
  context: JobContext<TPayload>,
) => Promise<void>;

/**
 * handler 主動回報的失敗。
 *
 * `permanent`：重試都唔會成功（例如 payload 內容唔合法），即刻入 dead，
 * 唔好燒五次退避去證明同一件事。
 *
 * 代碼在建構時就驗格式：格式錯係程式錯，唔應該等到寫資料庫才發現。
 */
export class JobFailure extends Error {
  readonly code: string;
  readonly permanent: boolean;

  constructor(code: string, message?: string, options: { permanent?: boolean } = {}) {
    if (!ERROR_CODE_PATTERN.test(code)) {
      throw new TypeError(
        `JobFailure 的 code 格式不合法：${String(code)}（要小寫字母開頭，只用小寫英數與底線，最多 64 字元）`,
      );
    }

    super(message ?? code);
    this.name = 'JobFailure';
    this.code = code;
    this.permanent = options.permanent ?? false;
  }
}

/** 驗證結果。一次過報齊所有問題，改呼叫端的人不用逐個試。 */
export type ParseResult<T> = {
  errors: string[];
  value?: T;
};
