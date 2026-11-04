/**
 * HTTP Range 標頭 → 位元組區間。
 *
 * 為什麼要自己寫：Storage 的 getRange 要接住呼叫端傳來的 Range，
 * 而 suffix（bytes=-500）、開放式（bytes=900-）、越界（416）這三種情況
 * 各有各的陷阱，寫成純函式才可以不需要 MinIO 也能驗。
 *
 * 這張 issue 只做函式，不做 HTTP 路由，所以這裡不碰 Fastify。
 */

export type ByteRange = { start: number; end: number };

/**
 * 兩種失敗要分開，因為 HTTP 的處理不同：
 *
 * - `unsatisfiable`：語法正確，但物件沒有這些位元組（例如起始位置超出長度）。一定要回 416。
 * - `invalid`：語法錯誤、多段 range、不支援的單位。RFC 9110 容許伺服器忽略 Range，
 *   所以下載路由會回 200 全檔，而不是假裝使用者要的東西做到了。
 */
export type RangeErrorKind = 'invalid' | 'unsatisfiable';

/**
 * Range 無法對應到物件的任何位元組：對應 HTTP 416 與 `content-range: bytes *\/<total>`。
 * 多段 range（`bytes=0-9,20-29`）沒有實作，一樣擲這個錯誤（kind 是 invalid），
 * 由呼叫端決定忽略，而不是靜靜只取第一段。
 */
export class RangeNotSatisfiableError extends Error {
  readonly kind: RangeErrorKind;
  readonly total: number;

  constructor(header: string, total: number, kind: RangeErrorKind = 'invalid') {
    super(`Range 無法對應 ${total} bytes 的物件：${header}`);
    this.name = 'RangeNotSatisfiableError';
    this.kind = kind;
    this.total = total;
  }

  /** 416 回應要帶的 content-range。 */
  get contentRange(): string {
    return `bytes */${this.total}`;
  }
}

export function parseRange(header: string, total: number): ByteRange {
  if (!Number.isInteger(total) || total < 0) {
    // 呼叫端傳錯長度是程式錯誤，不是用戶端錯誤，所以是 TypeError 而不是 416。
    throw new TypeError(`物件長度必須是非負整數，收到 ${total}`);
  }

  const trimmed = header.trim();
  if (!/^bytes=/i.test(trimmed)) {
    // 不支援的單位（例如 items=0-9）。
    throw new RangeNotSatisfiableError(header, total, 'invalid');
  }

  const spec = trimmed.slice('bytes='.length).trim();
  if (spec.includes(',')) {
    // 多段 range：沒有實作，忽略而不是只取第一段。
    throw new RangeNotSatisfiableError(header, total, 'invalid');
  }

  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (match === null) {
    throw new RangeNotSatisfiableError(header, total, 'invalid');
  }

  const rawStart = match[1] ?? '';
  const rawEnd = match[2] ?? '';

  if (rawStart === '' && rawEnd === '') {
    throw new RangeNotSatisfiableError(header, total, 'invalid');
  }

  if (rawStart === '') {
    // suffix：bytes=-500 是最後 500 bytes，不是由 0 開始。
    const suffixLength = Number(rawEnd);
    if (suffixLength === 0 || total === 0) {
      // 語法正確，但取不到任何位元組。
      throw new RangeNotSatisfiableError(header, total, 'unsatisfiable');
    }

    return { start: Math.max(0, total - suffixLength), end: total - 1 };
  }

  const start = Number(rawStart);
  if (start >= total) {
    throw new RangeNotSatisfiableError(header, total, 'unsatisfiable');
  }

  // 沒有結尾（bytes=900-）讀到最後；結尾超出長度夾到最後一個位元組（RFC 9110 對可滿足 range 的處理）。
  const end = rawEnd === '' ? total - 1 : Math.min(Number(rawEnd), total - 1);

  if (end < start) {
    // bytes=50-10：last-byte-pos 小於 first-byte-pos，語法不成立。
    throw new RangeNotSatisfiableError(header, total, 'invalid');
  }

  return { start, end };
}

/**
 * 下載路由的決定：要不要讀區段、讀哪裡、還是回 416 或整份。
 * 純函式，不需要 MinIO 也能驗所有分支。
 */
export type RangeDecision =
  | { kind: 'none' }
  | { kind: 'satisfiable'; range: ByteRange }
  | { kind: 'unsatisfiable' }
  | { kind: 'ignore' };

export function decideRange(header: string | undefined, total: number): RangeDecision {
  if (header === undefined || header.trim() === '') {
    return { kind: 'none' };
  }

  try {
    return { kind: 'satisfiable', range: parseRange(header, total) };
  } catch (error) {
    if (error instanceof RangeNotSatisfiableError) {
      return { kind: error.kind === 'unsatisfiable' ? 'unsatisfiable' : 'ignore' };
    }

    throw error;
  }
}
