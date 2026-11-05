/**
 * 身份、授權與組織範圍的共用契約（issue #82）。
 *
 * 這些型別同時被 policy（判斷）與之後的 platform（讀資料、發授權）使用，所以放在
 * contracts，不各自複製一份 —— 兩份定義總有一天會不一致，而不一致的那一天就是
 * 「平台覺得有效、引擎覺得無效」的日子。
 *
 * 這裡只有形狀與詞彙，沒有任何判斷邏輯。
 */

/**
 * 可信入口：由服務端憑證判定（cookie 的 scope、入口容器的標記、mTLS），
 * **不是** HTTP body 自稱的 `X-Company-OS-Entry`。
 */
export type TrustedEntry = 'internal' | 'partner' | 'customer';

export const TRUSTED_ENTRIES: readonly TrustedEntry[] = ['internal', 'partner', 'customer'];

/**
 * 身份種類。**客戶身份刻意不在這裡**：客戶驗證、逐筆資料授權與 portal session
 * 隔離留給國際版相關 issue（issue #82 第 4 條）。型別上不存在，就不可能被誤用。
 */
export type IdentityKind = 'human' | 'agent';

export const IDENTITY_KINDS: readonly IdentityKind[] = ['human', 'agent'];

/** 人類角色。用家不可以自稱角色 —— 呼叫者要由服務端取得這份快照。 */
export type HumanRole = 'owner' | 'admin' | 'staff' | 'partner';

export const HUMAN_ROLES: readonly HumanRole[] = ['owner', 'admin', 'staff', 'partner'];

export type IdentityStatus = 'active' | 'disabled';

export const IDENTITY_STATUSES: readonly IdentityStatus[] = ['active', 'disabled'];

export type HumanIdentity = {
  kind: 'human';
  id: string;
  role: HumanRole;
  status: IdentityStatus;
};

/**
 * Agent 沒有角色、沒有部門：它的權限只可以來自明確的授權，
 * 人類老闆或管理員的權限不會自動套用到它身上（第 5 條）。
 */
export type AgentIdentity = {
  kind: 'agent';
  id: string;
  status: IdentityStatus;
};

export type Identity = HumanIdentity | AgentIdentity;

/** 授權的狀態。只有 active 有效；申請中、已撤銷、已過期都不算。 */
export type GrantStatus = 'pending' | 'active' | 'revoked' | 'expired';

export const GRANT_STATUSES: readonly GrantStatus[] = ['pending', 'active', 'revoked', 'expired'];

/**
 * 組織範圍。三種要明確分得開 —— 特別是「未給範圍」不等於「全部」，
 * 所以這裡沒有「空＝全部」這種寫法，`all` 一定要明寫。
 */
export type UnitScope =
  | { kind: 'all' }
  | { kind: 'units'; unitIds: readonly string[] }
  | { kind: 'subtree'; unitIds: readonly string[] };

export const UNIT_SCOPE_KINDS: readonly UnitScope['kind'][] = ['all', 'units', 'subtree'];

export type AppGrant = {
  appId: string;
  /** 授權給誰；要與身份快照的 id 與 kind 同時對得上。 */
  subjectId: string;
  subjectKind: IdentityKind;
  status: GrantStatus;
  /** 未給＝不明，不代表全部。Agent 的授權一定要有。 */
  unitScope?: UnitScope;
};

/** 判斷用的 app 快照（由服務端讀出來，不是請求 body）。 */
export type AppSnapshot = {
  id: string;
  exposure: 'internal' | 'partner' | 'customer';
  enabled: boolean;
};

/**
 * 版本能力快照：由 edition-profile 解析後傳入。
 * policy 不做地區判斷 —— 它只認得「這個安裝有沒有開放外部入口」。
 */
export type CapabilitySnapshot = {
  externalEntry: boolean;
};

export type OrgUnitNode = {
  id: string;
  /** 軟刪除的單位仍然在圖上（要判斷「已刪除」），但不可以被存取。 */
  deleted?: boolean;
};

export type OrgUnitEdge = {
  parentId: string;
  childId: string;
};

export type OrgSnapshot = {
  units: readonly OrgUnitNode[];
  edges: readonly OrgUnitEdge[];
};
