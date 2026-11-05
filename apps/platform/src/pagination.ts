/**
 * 分頁查詢參數（員工與 agent 列表共用）。
 *
 * 一份實作、一個上限：#83 的授權列表已經有 20／100 的規矩，
 * 這裡不重新發明另一組數字 —— 同一個系統不應該有兩種「一頁幾多」。
 */

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export type ParseResult<T> = { errors: string[]; value?: T };

export type PageQuery = { limit: number; offset: number };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function unknownFields(
  body: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): string[] {
  return Object.keys(body)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${where}：未知欄位 ${key}（只可以有 ${allowed.join('、')}）`);
}

function parseCount(
  raw: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number,
): { errors: string[]; value?: number } {
  if (raw === undefined) {
    return { errors: [], value: fallback };
  }

  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return { errors: [`${name} 必須是整數`] };
  }

  const value = Number(raw);

  if (value < min || value > max) {
    return { errors: [`${name} 必須介乎 ${min} 至 ${max}`] };
  }

  return { errors: [], value };
}

export function parsePageQuery(raw: unknown): ParseResult<PageQuery> {
  if (!isRecord(raw)) {
    return { errors: ['查詢參數格式不對'] };
  }

  const errors = unknownFields(raw, ['limit', 'offset'], 'query');

  const limit = parseCount(raw.limit, 'limit', DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const offset = parseCount(raw.offset, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);
  errors.push(...limit.errors, ...offset.errors);

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    value: {
      limit: limit.value as number,
      offset: offset.value as number,
    },
  };
}
