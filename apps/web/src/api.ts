/**
 * 網頁對 API 的唯一出入口。
 *
 * 一律回傳結果物件而不是擲出錯誤：畫面要能分辨網絡錯誤、401、409、429，
 * 用例外控制流程會把這四種情況壓成同一個 catch。
 */

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'staff';
};

export type AuthState = {
  setupRequired: boolean;
  signedIn: boolean;
  user?: PublicUser;
};

export type ApiFailure =
  | { kind: 'network' }
  | {
      kind: 'http';
      status: number;
      error: string | null;
      field: string | null;
      retryAfterSeconds: number | null;
      /**
       * 逐條原因。設定頁要原樣講出伺服器拒絕的理由，不要自己改寫。
       *
       * 後端有兩種寫法：422 用 `reasons`（多條），409 與部分 422 用 `reason`
       * （單條，例如「這條上級關係已經存在」）。兩種都要收，否則畫面只會顯示
       * `cycle` 這類錯誤碼，而真正那句中文理由就被丟掉。
       */
      reasons: string[];
    };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

function parseRetryAfter(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const seconds = Number(value.trim());

  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return Math.floor(seconds);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { accept: 'application/json' };

  // 只有真的有 body 才加 content-type；登出是 POST 但沒有 body。
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  for (const [key, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
    headers[key.toLowerCase()] = value;
  }

  let response: Response;

  try {
    response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    return { ok: false, failure: { kind: 'network' } };
  }

  let body: unknown = null;

  if (response.status !== 204) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const record = asRecord(body);
    const list = Array.isArray(record.reasons)
      ? record.reasons.filter((item): item is string => typeof item === 'string')
      : [];
    // 單條 `reason` 也要收（409 的組織與授權錯誤用這種寫法）。
    const single = typeof record.reason === 'string' && record.reason !== '' ? [record.reason] : [];
    const reasons = list.length > 0 ? list : single;

    return {
      ok: false,
      failure: {
        kind: 'http',
        status: response.status,
        error: typeof record.error === 'string' ? record.error : null,
        field: typeof record.field === 'string' ? record.field : null,
        retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
        reasons,
      },
    };
  }

  return { ok: true, data: body as T };
}

export function fetchAuthState(): Promise<ApiResult<AuthState>> {
  return request<AuthState>('/api/auth/state');
}

export function submitSetup(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<ApiResult<{ user: PublicUser }>> {
  return request<{ user: PublicUser }>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function submitLogin(input: {
  email: string;
  password: string;
}): Promise<ApiResult<{ user: PublicUser }>> {
  return request<{ user: PublicUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * 登出：POST、帶 content-type: application/json、沒有 body。
 * API 在 #54 特意把空 body 當成 {}，就是為了這種請求。
 */
export function submitLogout(): Promise<ApiResult<null>> {
  return request<null>('/api/auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

/** 公司設定的其中一項。值是由 schema 驗證過的 JSON，前端不自己解讀成另一個事實。 */
export type SettingView = {
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy: string | null;
};

export function fetchSettings(): Promise<ApiResult<{ settings: SettingView[] }>> {
  return request<{ settings: SettingView[] }>('/api/settings');
}

/**
 * 逐 key 保存（issue 119）。API 沒有整頁批次入口，所以前端也不假裝有：
 * 一次只送一個 key，畫面按實際回應逐項標示成功或失敗。
 */
export function saveSetting(
  key: string,
  value: unknown,
): Promise<ApiResult<{ setting: SettingView }>> {
  return request<{ setting: SettingView }>(`/api/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

/** 組織單位（issue 120）。欄位以 `GET /org-units` 實際回傳為準，沒有品牌欄位。 */
export type OrgUnit = {
  id: string;
  name: string;
  /** 自由文字（最長 40 字）。UI 不從它推斷「是不是品牌」。 */
  type: string;
  isRoot: boolean;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgEdge = { parentId: string; childId: string; position: number };

export type OrgGraph = { units: OrgUnit[]; edges: OrgEdge[] };

export type OrgUnitInput = {
  name: string;
  type: string;
  country: string | null;
  currency: string | null;
  timezone: string | null;
};

export function fetchOrgUnits(): Promise<ApiResult<OrgGraph>> {
  return request<OrgGraph>('/api/org-units');
}

export function createOrgUnit(
  input: OrgUnitInput & { parentIds: string[] },
): Promise<ApiResult<{ unit: OrgUnit; parents: OrgEdge[] }>> {
  return request<{ unit: OrgUnit; parents: OrgEdge[] }>('/api/org-units', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function patchOrgUnit(
  id: string,
  patch: Partial<OrgUnitInput>,
): Promise<ApiResult<{ unit: OrgUnit }>> {
  return request<{ unit: OrgUnit }>(`/api/org-units/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteOrgUnit(id: string): Promise<ApiResult<null>> {
  return request<null>(`/api/org-units/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function addOrgUnitParent(
  id: string,
  parentId: string,
  position: number,
): Promise<ApiResult<{ edge: OrgEdge }>> {
  return request<{ edge: OrgEdge }>(`/api/org-units/${encodeURIComponent(id)}/parents`, {
    method: 'POST',
    body: JSON.stringify({ parentId, position }),
  });
}

export function removeOrgUnitParent(id: string, parentId: string): Promise<ApiResult<null>> {
  return request<null>(
    `/api/org-units/${encodeURIComponent(id)}/parents/${encodeURIComponent(parentId)}`,
    { method: 'DELETE' },
  );
}

/**
 * 有效值來自哪裡。**這是一個物件，不是字串**（`org/graph.ts` 的 `SettingSource`）：
 * `{ kind: 'company' }` 或 `{ kind: 'unit', unitId }`。
 * 曾經把它當成字串，畫面就顯示成「來源：[object Object]」。
 */
export type SettingSource = { kind: 'company' } | { kind: 'unit'; unitId: string };

/** 有效值＋來源＋本單位自己的覆寫。繼承由後端解析，前端不另算一套。 */
export type UnitSettingEffective = { key: string; value: unknown; source: SettingSource | null };

export type UnitSettingsPayload = {
  unitId: string;
  settings: UnitSettingEffective[];
  overrides: SettingView[];
};

export function fetchUnitSettings(id: string): Promise<ApiResult<UnitSettingsPayload>> {
  return request<UnitSettingsPayload>(`/api/org-units/${encodeURIComponent(id)}/settings`);
}

export function saveUnitSetting(
  id: string,
  key: string,
  value: unknown,
): Promise<ApiResult<{ setting: SettingView }>> {
  return request<{ setting: SettingView }>(
    `/api/org-units/${encodeURIComponent(id)}/settings/${encodeURIComponent(key)}`,
    { method: 'PUT', body: JSON.stringify({ value }) },
  );
}

/** 移除本單位的覆寫＝恢復繼承。不是把上級目前的值抄一份下來。 */
export function removeUnitSetting(id: string, key: string): Promise<ApiResult<null>> {
  return request<null>(
    `/api/org-units/${encodeURIComponent(id)}/settings/${encodeURIComponent(key)}`,
    { method: 'DELETE' },
  );
}

/* ── app 清單（員工與 agent 頁要用 appId 的可選值） ─────────────────── */

/**
 * `GET /modules` 是 appId 的唯一來源：授權路由用同一個 registry 驗證 appId，
 * 前端另寫一份清單就一定有一天對不上。
 */
export type PublicModule = {
  id: string;
  title: string;
  /** 與 `@company-os/contracts` 的 `ModuleKind` 一致：console 或 department。 */
  kind: 'console' | 'department';
  department: string | null;
  order: number;
  /** false ＝ 未接駁。授權可以建，但存取檢查會拒絕，畫面要照實講。 */
  available: boolean;
};

export function fetchModules(): Promise<ApiResult<{ modules: PublicModule[] }>> {
  return request<{ modules: PublicModule[] }>('/api/modules');
}

/* ── 員工（issue 121） ────────────────────────────────────────────── */

export type StaffMember = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  mustChangePassword: boolean;
  disabledAt: string | null;
  createdAt: string;
};

export type StaffPage = { staff: StaffMember[]; total: number };

export type PageInput = { limit?: number; offset?: number };

function pageQuery(input: PageInput): string {
  const parts: string[] = [];

  if (input.limit !== undefined) {
    parts.push(`limit=${String(input.limit)}`);
  }

  if (input.offset !== undefined) {
    parts.push(`offset=${String(input.offset)}`);
  }

  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

export function fetchStaff(input: PageInput = {}): Promise<ApiResult<StaffPage>> {
  return request<StaffPage>(`/api/staff${pageQuery(input)}`);
}

export function createStaff(input: {
  displayName: string;
  email: string;
  initialPassword: string;
}): Promise<ApiResult<{ staff: StaffMember }>> {
  return request<{ staff: StaffMember }>('/api/staff', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function disableStaff(id: string): Promise<ApiResult<{ staff: StaffMember }>> {
  return request<{ staff: StaffMember }>(`/api/staff/${encodeURIComponent(id)}/disable`, {
    method: 'POST',
  });
}

/**
 * 重設員工密碼。**一定要帶老闆自己的密碼**：後端真的驗，前端沒有任何旗標可以代替。
 * 這兩個字串只留在呼叫端那一次請求裡，不寫入任何全域狀態或紀錄。
 */
export function resetStaffPassword(
  id: string,
  input: { ownerPassword: string; newTemporaryPassword: string },
): Promise<ApiResult<{ staff: StaffMember }>> {
  return request<{ staff: StaffMember }>(`/api/staff/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/* ── agent 身份與授權（issue 121） ───────────────────────────────── */

/** 授權範圍。`all` 要明寫；空集合不是「全部」，後端會拒絕。 */
export type UnitScope = { kind: 'all' } | { kind: 'units' | 'subtree'; unitIds: string[] };

export type AgentIdentity = {
  id: string;
  name: string;
  createdAt: string;
  disabledAt: string | null;
};

export type AgentPage = { agents: AgentIdentity[]; total: number };

export type GrantView = {
  id: string;
  userId: string | null;
  agentId: string | null;
  appId: string;
  role: string;
  scope: UnitScope;
  state: string;
  version: number;
  requestedBy: string | null;
  approvedBy: string | null;
  requestedAt: string;
  approvedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
  rejectionReason: string | null;
  replacesId: string | null;
};

export type GrantPage = { grants: GrantView[]; total: number };

export function fetchAgents(input: PageInput = {}): Promise<ApiResult<AgentPage>> {
  return request<AgentPage>(`/api/agents${pageQuery(input)}`);
}

export function createAgent(input: { name: string }): Promise<ApiResult<{ agent: AgentIdentity }>> {
  return request<{ agent: AgentIdentity }>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function disableAgent(id: string): Promise<ApiResult<{ agent: AgentIdentity }>> {
  return request<{ agent: AgentIdentity }>(`/api/agents/${encodeURIComponent(id)}/disable`, {
    method: 'POST',
  });
}

export function fetchAgentGrants(id: string, input: PageInput = {}): Promise<ApiResult<GrantPage>> {
  return request<GrantPage>(`/api/agents/${encodeURIComponent(id)}/grants${pageQuery(input)}`);
}

/** agent 的授權角色固定是 member —— 後端會拒絕 app_admin，這裡不提供選項。 */
export function createAgentGrant(
  id: string,
  input: { appId: string; role: 'member'; scope: UnitScope },
): Promise<ApiResult<{ grant: GrantView }>> {
  return request<{ grant: GrantView }>(`/api/agents/${encodeURIComponent(id)}/grants`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** 撤銷要帶查詢拿到的那個 `version`；版本不對回 409，不自動重送。 */
export function revokeAgentGrant(
  id: string,
  grantId: string,
  input: { version: number; reason?: string },
): Promise<ApiResult<{ grant: GrantView }>> {
  return request<{ grant: GrantView }>(
    `/api/agents/${encodeURIComponent(id)}/grants/${encodeURIComponent(grantId)}/revoke`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/** `via` 只有兩種：憑身份（owner）或憑授權（grant）。`reason` 是拒絕原因代碼。 */
export type AccessDecision =
  | { allowed: true; via: 'owner' | 'grant' }
  | { allowed: false; reason: string };

export function checkAgentAccess(id: string, appId: string): Promise<ApiResult<AccessDecision>> {
  return request<AccessDecision>(
    `/api/agents/${encodeURIComponent(id)}/access/${encodeURIComponent(appId)}`,
  );
}
