import type { UnitScope } from '@company-os/contracts';
import { isSubsetOf } from './scope.js';
import { isTerminal, type GrantRole, type GrantState } from './types.js';

/**
 * 誰可以對授權做什麼（issue #83 的授權規則 2 至 5）。
 *
 * 純函數：不查資料庫、不看時鐘、不讀環境變數。呼叫者要先讀好三件事再交進來：
 *   1. 操作者的身分（是否老闆）
 *   2. 操作者在每個 app 可以管理到哪些單位（有效 app_admin 授權的覆蓋範圍）
 *   3. 目標範圍實際覆蓋哪些單位
 *
 * 第 2 點是關鍵：**管理權要當下有效**。批准那一刻才去查，不是申請時查完就一直信。
 * 撤銷了管理權的人，手上那個舊畫面按下去也會被擋。
 *
 * 這裡刻意沒有「因為我是 app_admin 所以例外」這種分支：入口與 app 存取一律經 #82，
 * 授權管理權只決定「可不可以發授權」，不決定「可不可以進 app」。
 */

export type GrantErrorCode =
  | 'not_app_admin'
  | 'sensitive_requires_owner'
  | 'self_approval'
  | 'self_escalation'
  | 'scope_exceeds_own'
  | 'invalid_transition';

export type Decision = { ok: true } | { ok: false; code: GrantErrorCode; message: string };

export type Actor = {
  id: string;
  isOwner: boolean;
  /** appId → 這個人可以管理的單位集合（由有效的 app_admin 授權算出來）。 */
  adminOf: ReadonlyMap<string, ReadonlySet<string>>;
};

export type GrantLike = {
  userId: string;
  appId: string;
  role: GrantRole;
  state: GrantState;
  scope: UnitScope;
};

export const ALLOW: Decision = { ok: true };

export function deny(code: GrantErrorCode, message: string): Decision {
  return { ok: false, code, message };
}

/**
 * 這個範圍覆蓋哪些單位。
 *
 * 給了 `provided` 就用（呼叫者由組織圖算出來，最準）；沒有給的話，只有 `units`
 * 這一種可以就地算 —— `all` 與 `subtree` 沒有組織圖就算不出來，回 null，
 * 呼叫者一律當成「超出範圍」（fail closed）。忘記傳比傳錯安全。
 */
function coverOf(
  scope: UnitScope,
  provided: ReadonlySet<string> | undefined,
): ReadonlySet<string> | null {
  if (provided !== undefined) {
    return provided;
  }

  return scope.kind === 'units' ? new Set(scope.unitIds) : null;
}

/** 非老闆要對某個 app 發授權，先要當下有效的 app_admin 授權。 */
function manageRight(actor: Actor, appId: string): ReadonlySet<string> | null {
  return actor.adminOf.get(appId) ?? null;
}

function notAdmin(appId: string): Decision {
  return deny('not_app_admin', `你沒有 ${appId} 的有效管理授權（app_admin），不可以發這個 app 的授權`);
}

/** 非老闆發出的範圍不可以超出自己可以管理的範圍。 */
function withinOwnScope(
  actorScope: ReadonlySet<string>,
  scope: UnitScope,
  provided: ReadonlySet<string> | undefined,
): Decision {
  const cover = coverOf(scope, provided);

  if (cover === null || !isSubsetOf(cover, actorScope)) {
    return deny(
      'scope_exceeds_own',
      '這個範圍超出你可以管理的組織範圍：你能管的才可以轉授予人（包含下級）',
    );
  }

  return ALLOW;
}

export type RequestInput = {
  appId: string;
  subjectId: string;
  role: GrantRole;
  scope: UnitScope;
  /** 目標範圍覆蓋的單位（由組織圖算）。 */
  scopeCover?: ReadonlySet<string>;
};

/**
 * 申請（建立一個 requested 版本）。
 *
 * 為自己申請在還一步是准的：非老闆不可以**批准**自己的新授權，但可以提出申請，
 * 由老闆或有管理權的人批准。這樣「想多一點權限」有正路可走，不用共用帳戶。
 */
export function canRequest(actor: Actor, input: RequestInput): Decision {
  if (actor.isOwner) {
    return ALLOW;
  }

  const own = manageRight(actor, input.appId);

  if (own === null) {
    return notAdmin(input.appId);
  }

  return withinOwnScope(own, input.scope, input.scopeCover);
}

export type ApproveOptions = {
  /** app 現在敏不敏感 —— 由 manifest 即時讀，不是申請當時記下來的。 */
  sensitive: boolean;
  /** 目標範圍覆蓋的單位（由組織圖算）。 */
  scopeCover?: ReadonlySet<string>;
};

/**
 * 批准（requested → approved，然後可能即刻生效）。
 *
 * 敏感 app 一律要老闆：新授權、擴大範圍、升級角色都不可以由 app_admin 自己批。
 * 理由不是「不信任管理員」，是這一類授權一旦批錯，代價由全公司承擔。
 */
export function canApprove(actor: Actor, grant: GrantLike, options: ApproveOptions): Decision {
  if (grant.state !== 'requested' && grant.state !== 'approved') {
    return deny('invalid_transition', `只有申請中或已批准的授權可以批准（現在是 ${grant.state}）`);
  }

  if (options.sensitive && !actor.isOwner) {
    return deny('sensitive_requires_owner', `${grant.appId} 是敏感 app，只有老闆可以批准`);
  }

  if (actor.isOwner) {
    return ALLOW;
  }

  // 次序：先講「你根本管不到這個 app」，再講「你不可以批自己的」。
  // 反過來會令一個完全沒有管理權的人以為問題出在「對象是自己」。
  const own = manageRight(actor, grant.appId);

  if (own === null) {
    return notAdmin(grant.appId);
  }

  if (grant.userId === actor.id) {
    return deny('self_approval', '不可以批准自己的授權（就算你是這個 app 的管理員）');
  }

  return withinOwnScope(own, grant.scope, options.scopeCover);
}

/**
 * 拒絕。拒絕等於「不給」，所以不設敏感閘門 —— 一個 app_admin 連拒絕都不行，
 * 會迫使他去找老闆拒絕一件他明明最清楚的事。
 */
export function canReject(actor: Actor, grant: GrantLike): Decision {
  if (grant.state !== 'requested' && grant.state !== 'approved') {
    return deny('invalid_transition', `只有申請中或已批准的授權可以拒絕（現在是 ${grant.state}）`);
  }

  if (actor.isOwner) {
    return ALLOW;
  }

  return manageRight(actor, grant.appId) === null ? notAdmin(grant.appId) : ALLOW;
}

/**
 * 撤銷。撤銷一樣要管理權（規則 5：操作者仍須具備管理權），
 * 但沒有敏感閘門：收回權限是減少風險，不是增加。
 *
 * 撤銷可以作用在申請中（等於取消）、已批准與已生效的授權；已結束的不行。
 */
export function canRevoke(actor: Actor, grant: GrantLike): Decision {
  if (isTerminal(grant.state)) {
    return deny('invalid_transition', `授權已經是 ${grant.state}，不可以再撤銷`);
  }

  if (actor.isOwner) {
    return ALLOW;
  }

  return manageRight(actor, grant.appId) === null ? notAdmin(grant.appId) : ALLOW;
}

/**
 * 修改（改範圍或改角色）。
 *
 * 一列授權的角色與範圍是定死的，所以「修改」其實是開一個新版本：
 *   - 縮範圍 → 新版本即時生效（規則 5 允許），舊的即刻撤銷
 *   - 擴範圍或升角色 → 新版本由 requested 開始，要人批准
 * 兩條路都不會原地改到舊那列，所以「不得原地擴權」是結構上的，不是靠檢查。
 */
export function canModify(
  actor: Actor,
  grant: GrantLike,
  scopeCover?: ReadonlySet<string>,
): Decision {
  if (isTerminal(grant.state)) {
    return deny('invalid_transition', `授權已經是 ${grant.state}，不可以再修改`);
  }

  if (actor.isOwner) {
    return ALLOW;
  }

  if (grant.userId === actor.id) {
    return deny('self_escalation', '不可以修改自己的授權（範圍或角色都一樣）');
  }

  const own = manageRight(actor, grant.appId);

  if (own === null) {
    return notAdmin(grant.appId);
  }

  return withinOwnScope(own, grant.scope, scopeCover);
}
