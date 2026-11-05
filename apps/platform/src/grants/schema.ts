import { ID_PATTERN, UNIT_SCOPE_KINDS, type UnitScope } from '@company-os/contracts';
import { normalizeScope } from './scope.js';
import { GRANT_ROLES, GRANT_STATES, type GrantRole, type GrantState } from './types.js';

/**
 * 授權 API 的輸入驗證（issue #83）。
 *
 * 兩個原則寫在這裡，因為它們最容易被「方便」磨掉：
 *   1. 未知欄位一律拒絕。打錯字的人以為自己改了一樣東西，比收到 422 更危險。
 *   2. 範圍不可以省略：#82 的契約裡 all 要明寫，這裡也一樣 ——
 *      「忘了填」與「全公司」在資料裡長得一樣，而兩者的安全含義剛好相反。
 *
 * 一次過報齊所有問題，不是只報第一個：改 request body 的人不用試錯。
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 拒絕理由的長度上限；與 migration 的 check 一致，這裡先講清楚。 */
export const REASON_MAX_LENGTH = 200;

/** 參考用的上限：一個範圍最多列多少個單位（避免一個請求塞一萬個 id）。 */
export const SCOPE_UNITS_MAX = 200;

const REQUEST_FIELDS = ['userId', 'appId', 'role', 'scope'] as const;
const MODIFY_FIELDS = ['version', 'role', 'scope'] as const;
const LIST_FIELDS = ['appId', 'userId', 'state', 'role', 'limit', 'offset'] as const;

export type ParseResult<T> = {
  errors: string[];
  value?: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownFields(
  body: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): string[] {
  return Object.keys(body)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${where}：未知欄位 ${key}（只可以有 ${allowed.join('、')}）`);
}

/** 範圍的形狀。回傳錯誤訊息或已正規化的範圍。 */
function parseScope(raw: unknown): { errors: string[]; value?: UnitScope } {
  if (raw === undefined) {
    return {
      errors: [
        'body 必須有 scope：範圍要明寫（{ "kind": "all" } 或 { "kind": "units" | "subtree", "unitIds": [...] }）—— 未給範圍不代表全部',
      ],
    };
  }

  if (!isRecord(raw)) {
    return { errors: ['scope 必須是一個物件'] };
  }

  const extra = Object.keys(raw).filter((key) => key !== 'kind' && key !== 'unitIds');

  if (extra.length > 0) {
    return { errors: [`scope：未知欄位 ${extra.join('、')}（只可以有 kind、unitIds）`] };
  }

  const kind = raw.kind;

  if (!UNIT_SCOPE_KINDS.includes(kind as UnitScope['kind'])) {
    return { errors: [`scope.kind 必須是 ${UNIT_SCOPE_KINDS.join('、')} 其中之一`] };
  }

  if (kind === 'all') {
    const unitIds = raw.unitIds;

    if (unitIds !== undefined && (!Array.isArray(unitIds) || unitIds.length > 0)) {
      return { errors: ['scope.kind 是 all 時不可以帶 unitIds（all 就是全部單位，不需要列）'] };
    }

    return { errors: [], value: { kind: 'all' } };
  }

  const unitIds = raw.unitIds;

  if (!Array.isArray(unitIds)) {
    return { errors: ['scope.unitIds 必須是一個陣列'] };
  }

  if (unitIds.length === 0) {
    return { errors: ['scope.unitIds 至少一個單位（空集合不是「全部」，也不是「沒有」）'] };
  }

  if (unitIds.length > SCOPE_UNITS_MAX) {
    return { errors: [`scope.unitIds 最多 ${SCOPE_UNITS_MAX} 個`] };
  }

  // 這裡只驗「是一串非空的字串」。單位存不存在由路由查資料庫決定（422 unknown_unit）——
  // 在這個檔驗 UUID 形狀也可以，但那樣「格式不對」與「不存在」會變成兩個原因，
  // 對送請求的人來說它們是同一件事。
  if (!unitIds.every((id) => typeof id === 'string' && id.trim() !== '' && id.length <= 64)) {
    return { errors: ['scope.unitIds 每一個都要是非空的單位 id'] };
  }

  return {
    errors: [],
    value: normalizeScope({ kind: kind as 'units' | 'subtree', unitIds: unitIds as string[] }),
  };
}

function parseRole(raw: unknown): { errors: string[]; value?: GrantRole } {
  if (!GRANT_ROLES.includes(raw as GrantRole)) {
    return { errors: [`role 必須是 ${GRANT_ROLES.join(' 或 ')}`] };
  }

  return { errors: [], value: raw as GrantRole };
}

function parseVersion(raw: unknown): { errors: string[]; value?: number } {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { errors: ['version 必須是正整數（由查詢拿到的那個版本號）'] };
  }

  return { errors: [], value: raw };
}

function parseReason(raw: unknown, required: boolean): { errors: string[]; value?: string } {
  if (raw === undefined || raw === null) {
    return required ? { errors: ['reason 必須填寫（拒絕要說得出為甚麼）'] } : { errors: [] };
  }

  if (typeof raw !== 'string') {
    return { errors: ['reason 必須是字串'] };
  }

  const trimmed = raw.trim();

  if (trimmed === '') {
    return required ? { errors: ['reason 不可以是空白'] } : { errors: [] };
  }

  if (trimmed.length > REASON_MAX_LENGTH) {
    return { errors: [`reason 最多 ${REASON_MAX_LENGTH} 個字`] };
  }

  return { errors: [], value: trimmed };
}

export type RequestInput = {
  userId: string;
  appId: string;
  role: GrantRole;
  scope: UnitScope;
};

export function parseRequestInput(raw: unknown): ParseResult<RequestInput> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, REQUEST_FIELDS, 'body');

  const userId = raw.userId;
  if (typeof userId !== 'string' || !UUID.test(userId)) {
    errors.push('userId 必須是使用者的 UUID');
  }

  const appId = raw.appId;
  if (typeof appId !== 'string' || !ID_PATTERN.test(appId) || appId.length > 64) {
    errors.push('appId 格式不對：只可以小寫英文字母、數字、底線，並以字母開頭');
  }

  const role = parseRole(raw.role);
  errors.push(...role.errors);

  const scope = parseScope(raw.scope);
  errors.push(...scope.errors);

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    value: {
      userId: userId as string,
      appId: appId as string,
      role: role.value as GrantRole,
      scope: scope.value as UnitScope,
    },
  };
}

export function parseTransitionInput(raw: unknown): ParseResult<{ version: number }> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, ['version'], 'body');
  const version = parseVersion(raw.version);
  errors.push(...version.errors);

  if (errors.length > 0) {
    return { errors };
  }

  return { errors: [], value: { version: version.value as number } };
}

export function parseRejectInput(raw: unknown): ParseResult<{ version: number; reason: string }> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, ['version', 'reason'], 'body');
  const version = parseVersion(raw.version);
  const reason = parseReason(raw.reason, true);
  errors.push(...version.errors, ...reason.errors);

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    value: { version: version.value as number, reason: reason.value as string },
  };
}

export function parseRevokeInput(raw: unknown): ParseResult<{ version: number; reason?: string }> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, ['version', 'reason'], 'body');
  const version = parseVersion(raw.version);
  const reason = parseReason(raw.reason, false);
  errors.push(...version.errors, ...reason.errors);

  if (errors.length > 0) {
    return { errors };
  }

  const value: { version: number; reason?: string } = { version: version.value as number };

  if (reason.value !== undefined) {
    value.reason = reason.value;
  }

  return { errors: [], value };
}

export type ModifyInput = {
  version: number;
  role?: GrantRole;
  scope?: UnitScope;
};

export function parseModifyInput(raw: unknown): ParseResult<ModifyInput> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, MODIFY_FIELDS, 'body');
  const version = parseVersion(raw.version);
  errors.push(...version.errors);

  const role = raw.role === undefined ? { errors: [] } : parseRole(raw.role);
  errors.push(...role.errors);

  const scope = raw.scope === undefined ? { errors: [], value: undefined } : parseScope(raw.scope);
  errors.push(...scope.errors);

  if (errors.length > 0) {
    return { errors };
  }

  if (raw.role === undefined && raw.scope === undefined) {
    return { errors: ['至少要有 role 或 scope 其中一樣（沒有任何改變不是一次修改）'] };
  }

  const value: ModifyInput = { version: version.value as number };

  if (role.value !== undefined) {
    value.role = role.value;
  }

  if (scope.value !== undefined) {
    value.scope = scope.value;
  }

  return { errors: [], value };
}

export type ListQuery = {
  appId?: string;
  userId?: string;
  state?: GrantState;
  role?: GrantRole;
  limit: number;
  offset: number;
};

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

function parseCount(
  raw: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number,
): {
  errors: string[];
  value?: number;
} {
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

export function parseListQuery(raw: unknown): ParseResult<ListQuery> {
  if (!isRecord(raw)) {
    return { errors: ['查詢參數格式不對'] };
  }

  const errors = unknownFields(raw, LIST_FIELDS, 'query');

  const limit = parseCount(raw.limit, 'limit', DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const offset = parseCount(raw.offset, 'offset', 0, 0, Number.MAX_SAFE_INTEGER);
  errors.push(...limit.errors, ...offset.errors);

  const value: ListQuery = {
    limit: (limit.value ?? DEFAULT_PAGE_LIMIT) as number,
    offset: (offset.value ?? 0) as number,
  };

  if (raw.appId !== undefined) {
    if (typeof raw.appId !== 'string' || !ID_PATTERN.test(raw.appId)) {
      errors.push('appId 格式不對');
    } else {
      value.appId = raw.appId;
    }
  }

  if (raw.userId !== undefined) {
    if (typeof raw.userId !== 'string' || !UUID.test(raw.userId)) {
      errors.push('userId 必須是使用者的 UUID');
    } else {
      value.userId = raw.userId;
    }
  }

  if (raw.state !== undefined) {
    if (!GRANT_STATES.includes(raw.state as GrantState)) {
      errors.push(`state 必須是 ${GRANT_STATES.join('、')} 其中之一`);
    } else {
      value.state = raw.state as GrantState;
    }
  }

  if (raw.role !== undefined) {
    const role = parseRole(raw.role);
    errors.push(...role.errors);

    if (role.value !== undefined) {
      value.role = role.value;
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { errors: [], value };
}
