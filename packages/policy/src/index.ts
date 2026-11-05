/**
 * 共用權限引擎（issue #82／決策 C18 的配套）。
 *
 * 這是**純函數**：不讀資料庫、不看環境變數、不碰檔案或網絡、不取系統時間。
 * 所有事實（身份快照、app 快照、入口、授權、組織圖）都由呼叫者注入。
 *
 * ## 呼叫者的責任（很重要，寫給下一個用這個引擎的人）
 *
 * 這兩個函數**不驗證 session、不驗簽章、不相信 HTTP**。傳進來的 `identity`、`entry`、
 * `grants` 必須由服務端自己取得：
 *
 *   - `identity` 來自 session 對應的使用者列（或 agent 金鑰的持有者），不是 `req.body.user`。
 *   - `entry` 來自入口容器／cookie scope／mTLS，不是 `X-Company-OS-Entry` 這種可以自填的標頭。
 *   - `grants` 來自資料庫的授權列，並且已經濾掉「申請中」「已撤銷」「已過期」以外的狀態。
 *
 * 如果呼叫者把 HTTP body 的東西直接塞進來，這個引擎會非常準確地判斷一個假身份。
 * 判斷正確不等於安全 —— 安全的一半在呼叫者手上。
 *
 * ## 判斷次序
 *
 * 先安全檢查（身份、app、入口），再身份規則（老闆／員工／夥伴／agent），最後才是
 * 組織範圍。次序不可以倒過來：先講「你不在這個單位的範圍內」會洩漏「這個單位存在」。
 */

import {
  EXPOSURES,
  GRANT_STATUSES,
  HUMAN_ROLES,
  IDENTITY_KINDS,
  IDENTITY_STATUSES,
  TRUSTED_ENTRIES,
  UNIT_SCOPE_KINDS,
  type AgentIdentity,
  type AppGrant,
  type CapabilitySnapshot,
  type GrantStatus,
  type HumanIdentity,
  type Identity,
  type IdentityKind,
  type OrgSnapshot,
  type TrustedEntry,
  type UnitScope,
} from '@company-os/contracts';

/**
 * 拒絕原因。全部是固定的代碼，不含任何使用者資料或秘密 ——
 * 錯誤訊息會被寫進日誌與審計，所以它本身不可以洩漏什麼。
 */
export type AccessReason =
  | 'input_invalid'
  | 'identity_kind_unsupported'
  | 'identity_disabled'
  | 'app_disabled'
  | 'app_exposure_invalid'
  | 'entry_invalid'
  | 'entry_not_allowed'
  | 'entry_disabled'
  | 'role_not_permitted'
  | 'grant_missing'
  | 'grant_scope_missing'
  | 'scope_missing'
  | 'scope_invalid'
  | 'unit_not_found'
  | 'unit_deleted'
  | 'unit_out_of_scope'
  | 'graph_cycle';

/**
 * 判斷結果。`via` 講清楚是「憑身份（老闆／管理員）」還是「憑授權」——
 * 之後寫審計時，這兩件事的分量不一樣。
 */
export type AccessDecision =
  | { allowed: true; via: 'owner' | 'grant' }
  | { allowed: false; reason: AccessReason };

export type AppAccessInput = {
  identity: Identity;
  app: { id: string; exposure: 'internal' | 'partner' | 'customer'; enabled: boolean };
  entry: TrustedEntry;
  grants?: readonly AppGrant[];
  /** 版本能力快照；未給＝外部入口開放。 */
  capabilities?: CapabilitySnapshot;
};

export type UnitAccessInput = AppAccessInput & {
  targetUnitId: string;
  org: OrgSnapshot;
};

const DENY = (reason: AccessReason): { allowed: false; reason: AccessReason } => ({
  allowed: false,
  reason,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * 入口與 exposure 的對應（issue 第 2 條）。
 *
 * internal app 只可以由 internal 入口進；
 * partner app 可以由 internal 或 partner 入口進（大陸版員工就是走這條）；
 * customer app 只可以由 customer 入口進。
 *
 * 老闆不在這張表裡有例外 —— 入口限制是「你從哪裡來」，不是「你是誰」。
 */
const ENTRY_MATRIX: Record<'internal' | 'partner' | 'customer', readonly TrustedEntry[]> = {
  internal: ['internal'],
  partner: ['internal', 'partner'],
  customer: ['customer'],
};

type ReadResult<T> = { ok: true; value: T } | { ok: false; reason: AccessReason };

function readIdentity(raw: unknown): ReadResult<Identity> {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'input_invalid' };
  }

  const kind = raw.kind;

  // 客戶身份：明確拒絕，而且原因與「亂填」分得開（第 4 條：本張不預先開放）。
  if (kind === 'customer') {
    return { ok: false, reason: 'identity_kind_unsupported' };
  }

  if (!isOneOf<IdentityKind>(kind, IDENTITY_KINDS)) {
    return { ok: false, reason: 'input_invalid' };
  }

  if (!isNonEmptyString(raw.id) || !isOneOf(raw.status, IDENTITY_STATUSES)) {
    return { ok: false, reason: 'input_invalid' };
  }

  if (raw.status === 'disabled') {
    return { ok: false, reason: 'identity_disabled' };
  }

  if (kind === 'human') {
    if (!isOneOf(raw.role, HUMAN_ROLES)) {
      return { ok: false, reason: 'input_invalid' };
    }

    const human: HumanIdentity = {
      kind: 'human',
      id: raw.id,
      role: raw.role,
      status: 'active',
    };

    return { ok: true, value: human };
  }

  const agent: AgentIdentity = { kind: 'agent', id: raw.id, status: 'active' };

  return { ok: true, value: agent };
}

function readApp(raw: unknown): ReadResult<AppAccessInput['app']> {
  if (!isRecord(raw) || !isNonEmptyString(raw.id) || typeof raw.enabled !== 'boolean') {
    return { ok: false, reason: 'input_invalid' };
  }

  if (!raw.enabled) {
    return { ok: false, reason: 'app_disabled' };
  }

  if (!isOneOf(raw.exposure, EXPOSURES)) {
    return { ok: false, reason: 'app_exposure_invalid' };
  }

  return { ok: true, value: { id: raw.id, exposure: raw.exposure, enabled: true } };
}

/**
 * 授權清單的形狀。這裡只驗「這一列是不是一條授權」；
 * 範圍的內容留給 canAccessUnit 驗（那時才需要圖）。
 */
function readGrants(raw: unknown): ReadResult<AppGrant[]> {
  if (raw === undefined) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'input_invalid' };
  }

  const grants: AppGrant[] = [];

  for (const item of raw) {
    if (!isRecord(item)) {
      return { ok: false, reason: 'input_invalid' };
    }

    const { appId, subjectId, subjectKind, status, unitScope } = item;

    if (!isNonEmptyString(appId) || !isNonEmptyString(subjectId)) {
      return { ok: false, reason: 'input_invalid' };
    }

    if (!isOneOf<IdentityKind>(subjectKind, IDENTITY_KINDS)) {
      return { ok: false, reason: 'input_invalid' };
    }

    if (!isOneOf<GrantStatus>(status, GRANT_STATUSES)) {
      return { ok: false, reason: 'input_invalid' };
    }

    if (unitScope !== undefined && !isRecord(unitScope)) {
      return { ok: false, reason: 'input_invalid' };
    }

    grants.push({
      appId,
      subjectId,
      subjectKind,
      status,
      ...(unitScope === undefined ? {} : { unitScope: unitScope as UnitScope }),
    });
  }

  return { ok: true, value: grants };
}

type Evaluation =
  | { allowed: true; via: 'owner' }
  | { allowed: true; via: 'grant'; grant: AppGrant }
  | { allowed: false; reason: AccessReason };

/**
 * 共用的前半段：身份、app、入口、授權。
 * canAccessApp 與 canAccessUnit 都走這一支，所以「app 檢查先於單位檢查」是結構上的保證，
 * 不是靠兩處各自記得。
 */
function evaluate(input: AppAccessInput): Evaluation {
  const identity = readIdentity(input?.identity);

  if (!identity.ok) {
    return DENY(identity.reason);
  }

  const app = readApp(input?.app);

  if (!app.ok) {
    return DENY(app.reason);
  }

  if (!isOneOf<TrustedEntry>(input.entry, TRUSTED_ENTRIES)) {
    return DENY('entry_invalid');
  }

  const entry = input.entry;

  // 能力快照：由 edition-profile 解析後傳入，policy 自己不做地區判斷。
  let externalEntry = true;

  if (input.capabilities !== undefined) {
    if (!isRecord(input.capabilities) || typeof input.capabilities.externalEntry !== 'boolean') {
      return DENY('input_invalid');
    }

    externalEntry = input.capabilities.externalEntry;
  }

  // 這個安裝沒有開放外部入口：internal 以外的入口一律進不來。
  if (entry !== 'internal' && !externalEntry) {
    return DENY('entry_disabled');
  }

  if (!ENTRY_MATRIX[app.value.exposure].includes(entry)) {
    return DENY('entry_not_allowed');
  }

  const grants = readGrants(input.grants);

  if (!grants.ok) {
    return DENY(grants.reason);
  }

  const subject = identity.value;

  // 夥伴只可以進 partner app：從 internal 入口進來也一樣（第 3 條）。
  if (subject.kind === 'human' && subject.role === 'partner' && app.value.exposure !== 'partner') {
    return DENY('role_not_permitted');
  }

  // 老闆與管理員：通過入口檢查之後可以直接存取員工側 app，不需要授權。
  if (subject.kind === 'human' && (subject.role === 'owner' || subject.role === 'admin')) {
    return { allowed: true, via: 'owner' };
  }

  // 其餘一律要有「生效中」而且主體對得上的授權。
  const grant = grants.value.find(
    (candidate) =>
      candidate.appId === app.value.id &&
      candidate.subjectId === subject.id &&
      candidate.subjectKind === subject.kind &&
      candidate.status === 'active',
  );

  if (grant === undefined) {
    return DENY('grant_missing');
  }

  // Agent 的授權一定要帶組織範圍；未給範圍不代表全部（第 5、6 條）。
  if (subject.kind === 'agent' && grant.unitScope === undefined) {
    return DENY('grant_scope_missing');
  }

  return { allowed: true, via: 'grant', grant };
}

/**
 * 這個身份可不可以進入這個 app？
 *
 * 只回答 app 層面的問題（身份有效、app 啟用、入口相符、授權有效）。
 * 組織範圍請用 canAccessUnit；沒有單位概念的流程用這一個就夠。
 */
export function canAccessApp(input: AppAccessInput): AccessDecision {
  const result = evaluate(input);

  return result.allowed ? { allowed: true, via: result.via } : DENY(result.reason);
}

// ---------------------------------------------------------------------------
// 組織範圍
// ---------------------------------------------------------------------------

type OrgIndex = {
  deleted: Map<string, boolean>;
  /** 子 → 上級清單。 */
  parentsOf: Map<string, string[]>;
};

function readOrg(raw: unknown): ReadResult<OrgIndex> {
  if (!isRecord(raw) || !Array.isArray(raw.units) || !Array.isArray(raw.edges)) {
    return { ok: false, reason: 'input_invalid' };
  }

  const deleted = new Map<string, boolean>();

  for (const unit of raw.units) {
    if (!isRecord(unit) || !isNonEmptyString(unit.id)) {
      return { ok: false, reason: 'input_invalid' };
    }

    if (unit.deleted !== undefined && typeof unit.deleted !== 'boolean') {
      return { ok: false, reason: 'input_invalid' };
    }

    if (deleted.has(unit.id)) {
      // 同一個 id 出現兩次：資料本身不可信，不要猜哪一筆才算。
      return { ok: false, reason: 'input_invalid' };
    }

    deleted.set(unit.id, unit.deleted === true);
  }

  const parentsOf = new Map<string, string[]>();

  for (const edge of raw.edges) {
    if (!isRecord(edge) || !isNonEmptyString(edge.parentId) || !isNonEmptyString(edge.childId)) {
      return { ok: false, reason: 'input_invalid' };
    }

    // 邊指向不存在的單位：圖壞了，不要靜靜忽略（忽略了就會變成「剛好沒有上級」）。
    if (!deleted.has(edge.parentId) || !deleted.has(edge.childId)) {
      return { ok: false, reason: 'input_invalid' };
    }

    const list = parentsOf.get(edge.childId) ?? [];
    list.push(edge.parentId);
    parentsOf.set(edge.childId, list);
  }

  return { ok: true, value: { deleted, parentsOf } };
}

/**
 * 由目標單位沿上級往上走，看有沒有循環。
 *
 * 菱形（同一個祖先經兩條路都到）是正常形狀，所以用 done 記錄「已經算完的」，
 * 只有「仍然在當前路徑上」的節點才算循環 —— 不然菱形會被誤判成環。
 */
function hasCycle(startId: string, parentsOf: Map<string, string[]>): boolean {
  const done = new Set<string>();
  const onPath = new Set<string>();
  const stack: { id: string; leaving: boolean }[] = [{ id: startId, leaving: false }];

  while (stack.length > 0) {
    const frame = stack.pop() as { id: string; leaving: boolean };

    if (frame.leaving) {
      onPath.delete(frame.id);
      done.add(frame.id);
      continue;
    }

    if (done.has(frame.id)) {
      continue;
    }

    if (onPath.has(frame.id)) {
      return true;
    }

    onPath.add(frame.id);
    stack.push({ id: frame.id, leaving: true });

    for (const parentId of parentsOf.get(frame.id) ?? []) {
      if (onPath.has(parentId)) {
        return true;
      }

      if (!done.has(parentId)) {
        stack.push({ id: parentId, leaving: false });
      }
    }
  }

  return false;
}

/** 目標單位是不是 scope 之內（呼叫前已經確認 target 存在、未刪除、圖沒有循環）。 */
function inScope(
  scope: UnitScope,
  targetId: string,
  parentsOf: Map<string, string[]>,
): boolean {
  if (scope.kind === 'all') {
    return true;
  }

  if (scope.unitIds.includes(targetId)) {
    return true;
  }

  // 指定集合：不含後代，所以到這裡就是不在範圍內。
  if (scope.kind === 'units') {
    return false;
  }

  // subtree：沿上級往上走，碰到任何一個指定單位就算在範圍內。
  const seen = new Set<string>([targetId]);
  const queue = [...(parentsOf.get(targetId) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift() as string;

    if (scope.unitIds.includes(current)) {
      return true;
    }

    if (seen.has(current)) {
      continue;
    }

    seen.add(current);
    queue.push(...(parentsOf.get(current) ?? []));
  }

  return false;
}

function readScope(raw: unknown): ReadResult<UnitScope> {
  if (raw === undefined) {
    // 未給範圍不代表全部。這一句是這一段程式碼存在的理由。
    return { ok: false, reason: 'scope_missing' };
  }

  if (!isRecord(raw) || !isOneOf<UnitScope['kind']>(raw.kind, UNIT_SCOPE_KINDS)) {
    return { ok: false, reason: 'scope_invalid' };
  }

  if (raw.kind === 'all') {
    return { ok: true, value: { kind: 'all' } };
  }

  const unitIds = raw.unitIds;

  if (
    !Array.isArray(unitIds) ||
    unitIds.length === 0 ||
    !unitIds.every((id) => isNonEmptyString(id))
  ) {
    // 空集合不是「全部」，也不是「剛好沒有」—— 它是一個填錯的範圍。
    return { ok: false, reason: 'scope_invalid' };
  }

  return { ok: true, value: { kind: raw.kind, unitIds: unitIds as string[] } };
}

/**
 * 這個身份可不可以存取這個組織單位？
 *
 * 次序：先過 app 檢查（身份、app、入口、授權），再確認目標單位存在、未刪除、
 * 圖沒有循環，最後才看授權的範圍。前面任何一步失敗都會回它自己的原因，
 * 不會被後面的「範圍外」蓋掉 —— 否則錯誤訊息會變成一本組織結構導覽。
 */
export function canAccessUnit(input: UnitAccessInput): AccessDecision {
  const app = evaluate(input);

  if (!app.allowed) {
    return DENY(app.reason);
  }

  if (!isNonEmptyString(input.targetUnitId)) {
    return DENY('input_invalid');
  }

  const org = readOrg(input.org);

  if (!org.ok) {
    return DENY(org.reason);
  }

  const { deleted, parentsOf } = org.value;
  const targetId = input.targetUnitId;

  if (!deleted.has(targetId)) {
    return DENY('unit_not_found');
  }

  if (deleted.get(targetId) === true) {
    return DENY('unit_deleted');
  }

  // 圖壞了就拒絕，不管範圍是什麼 —— 在一個成環的圖上講「在範圍內」沒有意義。
  if (hasCycle(targetId, parentsOf)) {
    return DENY('graph_cycle');
  }

  // 老闆與管理員的範圍是整間公司。
  if (app.via === 'owner') {
    return { allowed: true, via: 'owner' };
  }

  const scope = readScope(app.grant.unitScope);

  if (!scope.ok) {
    return DENY(scope.reason);
  }

  if (!inScope(scope.value, targetId, parentsOf)) {
    return DENY('unit_out_of_scope');
  }

  return { allowed: true, via: 'grant' };
}
