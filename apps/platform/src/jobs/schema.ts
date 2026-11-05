import {
  DEFAULT_MAX_ATTEMPTS,
  IDEMPOTENCY_KEY_PATTERN,
  JOB_TYPE_MAX_LENGTH,
  JOB_TYPE_PATTERN,
  MAX_ATTEMPTS_CEILING,
  PAYLOAD_KEY_MAX_LENGTH,
  PAYLOAD_MAX_BYTES,
  PAYLOAD_MAX_DEPTH,
  type ParseResult,
} from './types.js';

// 呼叫者只需要 schema 的時候不用另外記住哪個常數在哪個檔。
export { PAYLOAD_KEY_MAX_LENGTH, PAYLOAD_MAX_BYTES, PAYLOAD_MAX_DEPTH } from './types.js';

/**
 * 入隊輸入的驗證（issue #85「資料與介面」）。
 *
 * payload 是唯一可以由呼叫者帶入隊列的內容，所以它是這一張最大的攻擊面：
 * 太大、太深、不是 JSON、或者夾帶機密，都要在寫入資料庫之前被拒。
 *
 * 兩個原則：
 *   1. 未知欄位一律拒絕 —— 打錯字的人以為自己改了一樣東西，比收到錯誤更危險。
 *   2. 一次過報齊所有問題 —— 改呼叫端的人不用逐個試。
 */

/** 去掉分隔符再比較，所以 `apiKey`、`api_key`、`API-KEY` 都當同一個名字。 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * 看起來是機密的欄位名。
 *
 * 這是便宜的第一道閘，不是完備的證明：一句「我的密碼是 hunter2」看不出來。
 * 但它擋得住最常見的形狀 —— 有人順手把整個連線設定塞進 payload。
 */
const SECRET_KEY_NAMES = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'clientsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'privatekey',
  'credential',
  'credentials',
  'authorization',
  'cookie',
  'sessiontoken',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walkPayload(value: unknown, depth: number, path: string, errors: string[]): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(`${path}：數字必須是有限值（NaN 與 Infinity 不是 JSON）`);
    }
    return;
  }

  const isArray = Array.isArray(value);
  const isObject = typeof value === 'object' && !isArray;

  if (!isArray && !isObject) {
    errors.push(`${path}：不支援 ${typeof value}（payload 只可以是 JSON）`);
    return;
  }

  if (depth > PAYLOAD_MAX_DEPTH) {
    errors.push(`${path}：嵌套超過 ${PAYLOAD_MAX_DEPTH} 層（上限 ${PAYLOAD_MAX_DEPTH}）`);
    return;
  }

  if (isArray) {
    (value as unknown[]).forEach((item, index) => {
      walkPayload(item, depth + 1, `${path}[${index}]`, errors);
    });
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.length > PAYLOAD_KEY_MAX_LENGTH) {
      errors.push(`${path}：欄位名太長（上限 ${PAYLOAD_KEY_MAX_LENGTH} 字元）`);
    }

    if (SECRET_KEY_NAMES.has(normalizeKey(key))) {
      errors.push(`${path}.${key}：payload 不可以放機密（密碼、token、金鑰）`);
    }

    walkPayload(child, depth + 1, `${path}.${key}`, errors);
  }
}

/**
 * payload 必須是一個 JSON 物件。
 *
 * 回傳的是「經 JSON 往返之後」的副本：入隊寫入的內容與之後讀回的內容
 * 一定一樣，不會出現「寫入時是 undefined，讀回時不見了」這種沉默的差異。
 */
export function parsePayload(input: unknown): ParseResult<Record<string, unknown>> {
  if (!isRecord(input)) {
    return {
      errors: ['payload 必須是一個 JSON 物件（不可以是陣列、字串、數字或 null）'],
    };
  }

  const errors: string[] = [];
  walkPayload(input, 0, 'payload', errors);

  if (errors.length > 0) {
    return { errors };
  }

  let json: string;

  try {
    json = JSON.stringify(input);
  } catch {
    return { errors: ['payload 含有無法轉成 JSON 的值'] };
  }

  const bytes = Buffer.byteLength(json, 'utf8');

  if (bytes > PAYLOAD_MAX_BYTES) {
    return { errors: [`payload 太大：${bytes} bytes，上限 ${PAYLOAD_MAX_BYTES} bytes`] };
  }

  return { errors: [], value: JSON.parse(json) as Record<string, unknown> };
}

/** 工作種類：只可以由程式註冊，所以名格式也要收緊。 */
export function parseJobType(input: unknown): ParseResult<string> {
  if (typeof input !== 'string' || input === '') {
    return { errors: ['type 必須是字串（工作種類由程式註冊，不是由呼叫者自創）'] };
  }

  if (input.length > JOB_TYPE_MAX_LENGTH) {
    return { errors: [`type 太長（上限 ${JOB_TYPE_MAX_LENGTH} 字元）`] };
  }

  if (!JOB_TYPE_PATTERN.test(input)) {
    return {
      errors: [
        `type 格式錯誤：${input}（要小寫字母開頭，只用小寫英數與底線，可以用點分段，例如 need.overdue）`,
      ],
    };
  }

  return { errors: [], value: input };
}

/** 省略代表「不需要去重」。有值就只可以是一組安全字元。 */
export function parseIdempotencyKey(input: unknown): ParseResult<string | null> {
  if (input === undefined) {
    return { errors: [], value: null };
  }

  if (typeof input !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(input)) {
    return {
      errors: [
        `idempotencyKey 只可以用英數與 . _ : -，長度 1 至 200（現在 ${JSON.stringify(input)}）`,
      ],
    };
  }

  return { errors: [], value: input };
}

export function parseMaxAttempts(input: unknown): ParseResult<number> {
  if (input === undefined) {
    return { errors: [], value: DEFAULT_MAX_ATTEMPTS };
  }

  if (
    typeof input !== 'number' ||
    !Number.isInteger(input) ||
    input < 1 ||
    input > MAX_ATTEMPTS_CEILING
  ) {
    return {
      errors: [`maxAttempts 必須是 1 至 ${MAX_ATTEMPTS_CEILING} 的整數（現在 ${JSON.stringify(input)}）`],
    };
  }

  return { errors: [], value: input };
}

/**
 * 省略代表即時。將來的時間就排到將來。
 *
 * 過去的時間夾回現在，而不是報錯：遲到的工作即刻可領取才是正確行為，
 * 而呼叫端通常無法控制自己幾時送到。
 */
export function parseRunAt(input: unknown, now: Date): ParseResult<Date> {
  if (input === undefined) {
    return { errors: [], value: now };
  }

  if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
    return { errors: ['runAt 必須是一個有效的 Date'] };
  }

  return { errors: [], value: input.getTime() < now.getTime() ? now : input };
}

const ENQUEUE_FIELDS = ['type', 'payload', 'idempotencyKey', 'maxAttempts', 'runAt'] as const;

export type EnqueueRequest = {
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  maxAttempts: number;
  runAt: Date;
};

/** 完整的入隊輸入：先驗所有欄位，全部合格才組出 value。 */
export function parseEnqueueInput(input: unknown, now: Date): ParseResult<EnqueueRequest> {
  if (!isRecord(input)) {
    return { errors: ['入隊輸入必須是一個物件'] };
  }

  const errors: string[] = Object.keys(input)
    .filter((key) => !(ENQUEUE_FIELDS as readonly string[]).includes(key))
    .map((key) => `未知欄位 ${key}（只可以有 ${ENQUEUE_FIELDS.join('、')}）`);

  const type = parseJobType(input.type);
  const payload = parsePayload(input.payload);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  const maxAttempts = parseMaxAttempts(input.maxAttempts);
  const runAt = parseRunAt(input.runAt, now);

  errors.push(...type.errors, ...payload.errors, ...idempotencyKey.errors, ...maxAttempts.errors, ...runAt.errors);

  if (
    errors.length > 0 ||
    type.value === undefined ||
    payload.value === undefined ||
    idempotencyKey.value === undefined ||
    maxAttempts.value === undefined ||
    runAt.value === undefined
  ) {
    return { errors };
  }

  return {
    errors: [],
    value: {
      type: type.value,
      payload: payload.value,
      idempotencyKey: idempotencyKey.value,
      maxAttempts: maxAttempts.value,
      runAt: runAt.value,
    },
  };
}
