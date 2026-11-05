/**
 * 組織單位的輸入驗證（issue #81）。
 *
 * 只管「這份輸入有沒有意義」，不查資料庫：單位是否存在、有沒有成環、是不是根，
 * 都要看資料，那是 store 與資料庫 trigger 的事。
 *
 * 名稱與類型一律去掉前後空白才存 —— 存進去的值就是畫面顯示的值，
 * 不留下「看起來一樣、比對卻不相等」的字串。
 */

export const UNIT_NAME_MAX_LENGTH = 80;
export const UNIT_TYPE_MAX_LENGTH = 40;

/** 只接受標準 UUID 形狀；不是的話一定不存在，不必丟給 Postgres 換一個 500。 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ISO 3166-1 alpha-2。 */
const COUNTRY = /^[A-Z]{2}$/;

/** ISO 4217。 */
const CURRENCY = /^[A-Z]{3}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** IANA 時區：交給 ICU 判斷，不在程式裡抄一份會過期的清單。 */
export function isValidTimezone(value: string): boolean {
  if (value.trim() === '') {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export type UnitInput = {
  name: string;
  type: string;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  parentIds: string[];
};

/** PATCH 用：只帶有出現的欄位；`null` 代表清空。 */
export type UnitPatch = Partial<Omit<UnitInput, 'parentIds'>>;

export type UnitInputValidation<T> = {
  value: T;
  errors: string[];
};

const CREATE_FIELDS: readonly string[] = ['name', 'type', 'country', 'currency', 'timezone', 'parentIds'];
const PATCH_FIELDS: readonly string[] = ['name', 'type', 'country', 'currency', 'timezone'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function readText(
  record: Record<string, unknown>,
  field: 'name' | 'type',
  maxLength: number,
  errors: string[],
): string | undefined {
  const raw = record[field];

  if (typeof raw !== 'string') {
    errors.push(`${field} 必須是字串（現在是 ${describe(raw)}）`);
    return undefined;
  }

  const trimmed = raw.trim();

  if (trimmed === '') {
    errors.push(`${field} 不可以是空的或只有空白`);
    return undefined;
  }

  if (trimmed.length > maxLength) {
    errors.push(`${field} 不可以超過 ${maxLength} 個字（現在是 ${trimmed.length} 個）`);
    return undefined;
  }

  return trimmed;
}

/** 可選的代碼欄位：沒給或給了 null 都等於「空」，給了就要合形狀。 */
function readOptionalCode(
  record: Record<string, unknown>,
  field: 'country' | 'currency',
  pattern: RegExp,
  hint: string,
  errors: string[],
): string | null | undefined {
  const raw = record[field];

  if (raw === undefined || raw === null) {
    return null;
  }

  if (typeof raw !== 'string' || !pattern.test(raw)) {
    errors.push(`${field} ${hint}（現在是 ${describe(raw)}）`);
    return undefined;
  }

  return raw;
}

function readTimezone(
  record: Record<string, unknown>,
  errors: string[],
): string | null | undefined {
  const raw = record.timezone;

  if (raw === undefined || raw === null) {
    return null;
  }

  if (typeof raw !== 'string' || !isValidTimezone(raw)) {
    errors.push(
      `timezone 必須是 IANA 時區名稱（例如 Asia/Hong_Kong、UTC）（現在是 ${describe(raw)}）`,
    );
    return undefined;
  }

  return raw;
}

/**
 * 解析建立單位的輸入。
 *
 * 非根單位一定要有至少一個上級 —— 「懸空的單位」在圖上永遠繼承不到任何東西，
 * 它會安靜地拿到公司預設值，看起來像設定沒生效。
 */
export function parseUnitInput(
  raw: unknown,
  options: { partial?: boolean } = {},
): UnitInputValidation<Partial<UnitInput>> {
  const partial = options.partial === true;
  const errors: string[] = [];
  const value: Partial<UnitInput> = {};

  if (!isRecord(raw)) {
    return { value, errors: ['單位必須是物件'] };
  }

  const allowed = partial ? PATCH_FIELDS : CREATE_FIELDS;

  for (const field of Object.keys(raw)) {
    if (!allowed.includes(field)) {
      errors.push(
        partial && field === 'parentIds'
          ? 'parentIds 只在建立時提供；之後用 POST／DELETE /org-units/:id/parents 逐條增減（每次都會寫審計）'
          : `${field} 不是可以設定的欄位（只可以有 ${allowed.join('、')}）`,
      );
    }
  }

  if (!partial || raw.name !== undefined) {
    const name = readText(raw, 'name', UNIT_NAME_MAX_LENGTH, errors);
    if (name !== undefined) {
      value.name = name;
    }
  }

  if (!partial || raw.type !== undefined) {
    const type = readText(raw, 'type', UNIT_TYPE_MAX_LENGTH, errors);
    if (type !== undefined) {
      value.type = type;
    }
  }

  // PATCH 只處理真的出現過的欄位：沒出現不代表「清空」，代表「不要動」。
  const has = (field: string): boolean => Object.prototype.hasOwnProperty.call(raw, field);

  if (!partial || has('country')) {
    const country = readOptionalCode(raw, 'country', COUNTRY, '只可以是兩個大寫字母（ISO 3166-1，例如 HK）', errors);
    if (country !== undefined) {
      value.country = country;
    }
  }

  if (!partial || has('currency')) {
    const currency = readOptionalCode(raw, 'currency', CURRENCY, '只可以是三個大寫字母（ISO 4217，例如 HKD）', errors);
    if (currency !== undefined) {
      value.currency = currency;
    }
  }

  if (!partial || has('timezone')) {
    const timezone = readTimezone(raw, errors);
    if (timezone !== undefined) {
      value.timezone = timezone;
    }
  }

  if (!partial) {
    const parentIds = raw.parentIds;

    if (!Array.isArray(parentIds) || parentIds.length === 0) {
      errors.push('parentIds 至少要有一個上級（根單位由種子建立，不是經 API）');
    } else if (!parentIds.every(isUuid)) {
      errors.push('parentIds 每一項都要是 UUID');
    } else if (new Set(parentIds).size !== parentIds.length) {
      errors.push('parentIds 有重複的上級');
    } else {
      value.parentIds = parentIds as string[];
    }
  }

  return { value, errors };
}

export type EdgeInput = {
  parentId: string;
  position: number;
};

/** 加一條邊的輸入。position 只要求整數：排列時數字小的先，負數也一樣有次序。 */
export function parseEdgeInput(raw: unknown): UnitInputValidation<Partial<EdgeInput>> {
  const errors: string[] = [];
  const value: Partial<EdgeInput> = {};

  if (!isRecord(raw)) {
    return { value, errors: ['邊必須是物件'] };
  }

  for (const field of Object.keys(raw)) {
    if (field !== 'parentId' && field !== 'position') {
      errors.push(`${field} 不是可以設定的欄位（只可以有 parentId、position）`);
    }
  }

  if (!isUuid(raw.parentId)) {
    errors.push(`parentId 必須是 UUID（現在是 ${describe(raw.parentId)}）`);
  } else {
    value.parentId = raw.parentId;
  }

  if (raw.position === undefined) {
    value.position = 0;
  } else if (typeof raw.position !== 'number' || !Number.isInteger(raw.position)) {
    errors.push(`position 必須是整數（現在是 ${describe(raw.position)}）`);
  } else {
    value.position = raw.position;
  }

  return { value, errors };
}
