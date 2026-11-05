import { ID_PATTERN, UNIT_SCOPE_KINDS, type UnitScope } from '@company-os/contracts';
import { normalizeScope } from '../grants/scope.js';
import { isRecord, unknownFields, type ParseResult } from '../pagination.js';

/**
 * agent API 的輸入驗證（issue #84）。
 *
 * 與 #83 的分別：這裡沒有角色選擇。agent 只可以是 member —— app_admin 是
 * 「代人批准授權」的權力，而 agent 本身不可以申請或批准授權，所以那個角色
 * 對它沒有意義。與其收下再靜靜降級，不如明確拒絕（422），
 * 讓送請求的人知道自己的理解錯了。
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AGENT_NAME_MAX_LENGTH = 100;
const SCOPE_UNITS_MAX = 200;
const REASON_MAX_LENGTH = 200;

export type CreateAgentInput = { name: string };

export function parseCreateAgentInput(raw: unknown): ParseResult<CreateAgentInput> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, ['name'], 'body');
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';

  if (name === '') {
    errors.push('name 不可以是空白');
  } else if (name.length > AGENT_NAME_MAX_LENGTH) {
    errors.push(`name 最多 ${AGENT_NAME_MAX_LENGTH} 個字`);
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { errors: [], value: { name } };
}

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
      return { errors: ['scope.kind 是 all 時不可以帶 unitIds'] };
    }

    return { errors: [], value: { kind: 'all' } };
  }

  const unitIds = raw.unitIds;

  if (!Array.isArray(unitIds) || unitIds.length === 0) {
    return { errors: ['scope.unitIds 至少要有一個單位（空集合不是「全部」）'] };
  }

  if (unitIds.length > SCOPE_UNITS_MAX) {
    return { errors: [`scope.unitIds 最多 ${SCOPE_UNITS_MAX} 個`] };
  }

  if (!unitIds.every((id) => typeof id === 'string' && id.trim() !== '' && id.length <= 64)) {
    return { errors: ['scope.unitIds 每一個都要是非空的單位 id'] };
  }

  return {
    errors: [],
    value: normalizeScope({ kind: kind as 'units' | 'subtree', unitIds: unitIds as string[] }),
  };
}

export type AgentGrantInput = {
  appId: string;
  role: 'member';
  scope: UnitScope;
};

export function parseAgentGrantInput(raw: unknown): ParseResult<AgentGrantInput> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, ['appId', 'role', 'scope'], 'body');

  const appId = raw.appId;

  if (typeof appId !== 'string' || !ID_PATTERN.test(appId) || appId.length > 64) {
    errors.push('appId 格式不對：只可以小寫英文字母、數字、底線，並以字母開頭');
  }

  if (raw.role !== undefined && raw.role !== 'member') {
    errors.push('agent 的授權只可以是 member：agent 不可以成為 app_admin，也不可以批准授權');
  }

  const scope = parseScope(raw.scope);
  errors.push(...scope.errors);

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    value: {
      appId: appId as string,
      role: 'member',
      scope: scope.value as UnitScope,
    },
  };
}

export type RevokeInput = { version: number; reason?: string };

export function parseRevokeInput(raw: unknown): ParseResult<RevokeInput> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, ['version', 'reason'], 'body');

  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    errors.push('version 必須是正整數（由查詢拿到的那個版本號）');
  }

  let reason: string | undefined;

  if (raw.reason !== undefined) {
    if (typeof raw.reason !== 'string' || raw.reason.trim() === '') {
      errors.push('reason 必須是非空的字串');
    } else if (raw.reason.trim().length > REASON_MAX_LENGTH) {
      errors.push(`reason 最多 ${REASON_MAX_LENGTH} 個字`);
    } else {
      reason = raw.reason.trim();
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const value: RevokeInput = { version: raw.version as number };

  if (reason !== undefined) {
    value.reason = reason;
  }

  return { errors: [], value };
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
