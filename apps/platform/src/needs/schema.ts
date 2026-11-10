/**
 * Needs 的型別與純函數（issue 184）。
 *
 * 狀態唔係一個欄位：資料庫只存四個時間戳，狀態由 `deriveState` 推導（決策 C06）。
 * 咁樣「狀態同時間戳講唔同嘅事」根本寫唔入去。呢個檔負責推導，store 只負責搬資料。
 */

/** 兩種 Need：要你交成果，或者要你揀。 */
export const NEED_KINDS = ['deliverable', 'decision'] as const;
export type NeedKind = (typeof NEED_KINDS)[number];

/** 五個推導出嚟的狀態，未驗收的四個在清單上，第五個在「已關閉」。 */
export const NEED_STATES = ['open', 'claimed', 'uploaded', 'absorbed', 'closed'] as const;
export type NeedState = (typeof NEED_STATES)[number];

/** 清單篩選。`overdue` 不是狀態，是「未驗收而且過了 due_at」。 */
export const NEED_FILTERS = [
  'all',
  'open',
  'claimed',
  'uploaded',
  'absorbed',
  'closed',
  'overdue',
] as const;
export type NeedFilter = (typeof NEED_FILTERS)[number];

/** 推導狀態只需要四個時間戳。 */
export type NeedTimestamps = {
  claimedAt: Date | null;
  uploadedAt: Date | null;
  absorbedAt: Date | null;
  acceptedAt: Date | null;
};

/**
 * 由時間戳推導狀態，次序由「最完成」排到「最未開始」。
 * 驗收之後就算之前發生過甚麼都當 closed：一件已收貨的工作，中間做過幾多步都唔重要。
 */
export function deriveState(times: NeedTimestamps): NeedState {
  if (times.acceptedAt !== null) {
    return 'closed';
  }

  if (times.absorbedAt !== null) {
    return 'absorbed';
  }

  if (times.uploadedAt !== null) {
    return 'uploaded';
  }

  if (times.claimedAt !== null) {
    return 'claimed';
  }

  return 'open';
}

/**
 * 逾期＝有到期日、過了期、而且未驗收。
 * 已驗收的工作逾期與否都冇意義，唔應該繼續計入「逾期 1」呢個數字。
 */
export function isOverdue(dueAt: Date | null, state: NeedState, now: Date): boolean {
  if (dueAt === null || state === 'closed') {
    return false;
  }

  return dueAt.getTime() < now.getTime();
}

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export type NeedListQuery = {
  filter: NeedFilter;
  /** undefined ＝ 全部來源；null ＝ 明確只要「未綁 app」嘅公司層工作；陣列＝該 app。 */
  appId: string | null | undefined;
  limit: number;
};

export type QueryParse =
  | { ok: true; value: NeedListQuery }
  | { ok: false; errors: readonly string[] };

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * 解析 `GET /needs` 的 query。
 *
 * 寧願 400 都唔靜靜用預設值：`?status=pendng` 打錯一個字，回一份「全部」的清單
 * 會令人以為冇篩選係正常，而真正嘅錯誤就永遠冇人知。
 */
export function parseListQuery(query: unknown): QueryParse {
  const record = typeof query === 'object' && query !== null ? (query as Record<string, unknown>) : {};
  const errors: string[] = [];

  const rawStatus = asString(record.status);
  const filter: NeedFilter = rawStatus === null ? 'all' : (rawStatus as NeedFilter);

  if (!NEED_FILTERS.includes(filter)) {
    errors.push(`status 只可以是 ${NEED_FILTERS.join('、')}，收到「${String(rawStatus)}」`);
  }

  // `appId=company` 明確表示「公司層」，與「冇傳」不同：前者是篩選，後者是全部。
  const rawApp = asString(record.appId);
  let appId: string | null | undefined;

  if (rawApp === null) {
    appId = undefined;
  } else if (rawApp === 'company') {
    appId = null;
  } else {
    appId = rawApp;
  }

  const rawLimit = asString(record.limit);
  let limit = DEFAULT_LIST_LIMIT;

  if (rawLimit !== null) {
    const parsed = Number(rawLimit);

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_LIST_LIMIT) {
      errors.push(`limit 只可以是 1 至 ${MAX_LIST_LIMIT} 的整數，收到「${rawLimit}」`);
    } else {
      limit = parsed;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: { filter, appId, limit } };
}
