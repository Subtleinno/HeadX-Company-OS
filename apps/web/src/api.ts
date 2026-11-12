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
  /**
   * 首次登入未改密碼（issue 124）。
   *
   * 後端 `toPublicUser` 一定有回這一個欄位。這裡標成可選，是因為
   * `PublicUser` 同時是登入、setup、`/me` 三條路的回應型別，
   * 而舊測試夾具只寫了四個欄位。畫面一律用「明確等於 true 才算要改」，
   * 所以缺席不會被當成 false 還是 true —— 它只會被當成「不知道」。
   */
  mustChangePassword?: boolean;
  /**
   * 所屬部門（issue #12／#14）。`null` ＝ 未指派。
   *
   * 同樣標成可選：舊測試夾具沒有這一欄。畫面一律用「明確有值才當有部門」，
   * 缺席與 null 都當成「未指派」—— 兩者在分流上的結果一樣（擋住），
   * 所以不需要分辨。
   */
  department?: string | null;
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
      /**
       * 後端的一句人話。403／409 的授權錯誤用 `{ error, message }` 這種寫法
       * （不是 `reasons`），這一句是伺服器自己講的理由，例如
       * 「boss 是敏感 app，只有老闆可以批准」。畫面原樣顯示，不改寫。
       */
      message: string | null;
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
        message: typeof record.message === 'string' && record.message !== '' ? record.message : null,
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

/**
 * 自己的公開資料（issue 124）。
 *
 * 帳戶頁只用這一個作資料來源：`/auth/state` 是外殼的開機判斷（它未登入時
 * 也回 200），而這一頁要分得出「未登入」與「讀取失敗」。`/me` 在首次強制
 * 改密碼期間仍然讀得到（後端標了 `allowPendingPasswordChange`）。
 */
export function fetchMe(): Promise<ApiResult<{ user: PublicUser }>> {
  return request<{ user: PublicUser }>('/api/me');
}

/**
 * 改自己的密碼（issue 124）。
 *
 * 只送兩個欄位：後端對未知欄位回 422，前端連一個多餘的鍵都不加。
 * 成功時後端會換一個新 session cookie，回傳的 `user.mustChangePassword` 已變成 false
 * —— 畫面用回應更新，不自己假設。
 */
export function submitChangePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ApiResult<{ user: PublicUser }>> {
  return request<{ user: PublicUser }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    }),
  });
}

/** 公司設定的其中一項。值是由 schema 驗證過的 JSON，前端不自己解讀成另一個事實。 */export type SettingView = {
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
  /** 這個 app 的入口路徑（`/boss`、`/design`）；外殼用它決定撳完去邊。 */
  route: string;
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
  /** 所屬部門（issue #12）。`null` ＝ 未指派。 */
  department: string | null;
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
  /**
   * 建立時一併指派部門（issue #28）。`null`／缺席＝未指派。
   *
   * 為什麼要一次做完：先建人、再指派，中間會有一個「帳戶存在但登入即被擋」
   * 的狀態 —— 對老闆只是少按一下，對那個人是「我登入之後進不去」。
   */
  department?: string | null;
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
 * 恢復被停用的員工（issue #30）。停用的逆操作，不帶任何 body。
 *
 * 恢復只是「可以再用原本的密碼登入」，不會開 session、不會改密碼，
 * 也不會順便指派部門 —— 那些各有自己的入口。
 */
export function enableStaff(id: string): Promise<ApiResult<{ staff: StaffMember }>> {
  return request<{ staff: StaffMember }>(`/api/staff/${encodeURIComponent(id)}/enable`, {
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

/**
 * 指派員工部門（issue #12）。
 *
 * `null` 代表取消指派，同「冇傳這個欄位」係兩件事：後端把兩者分開，
 * 所以這裡一定要明確送 `null`，不可以靠省略。
 *
 * 部門清單不是前端自己寫的：呼叫端一律由 `GET /modules` 的 `department`
 * 取得，否則總有一天會出現一個 registry 沒有、寫得進資料庫但登入時
 * 找不到 app 的部門。
 */
export function assignStaffDepartment(
  id: string,
  department: string | null,
): Promise<ApiResult<{ staff: StaffMember }>> {
  return request<{ staff: StaffMember }>(`/api/staff/${encodeURIComponent(id)}/department`, {
    method: 'PATCH',
    body: JSON.stringify({ department }),
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

// ---------------------------------------------------------------------------
// App 授權（issue 122）
// ---------------------------------------------------------------------------

export type GrantRole = 'member' | 'app_admin';

export type GrantState = 'requested' | 'approved' | 'active' | 'rejected' | 'revoked';

export type AppGrantQuery = {
  appId?: string;
  userId?: string;
  state?: GrantState | null;
  role?: GrantRole | null;
  limit?: number;
  offset?: number;
};

/**
 * `/app-grants` 的分頁形狀是 `page: { limit, offset, total }`；
 * `/agents/:id/grants` 只回一個 `total`。兩個形狀都照原樣收，
 * 不在前端補一個假的 `page` —— 那會令其中一邊的總數永遠算錯。
 */
export type AppGrantPage = {
  grants: GrantView[];
  page: { limit: number; offset: number; total: number };
};

export function fetchAppGrants(query: AppGrantQuery = {}): Promise<ApiResult<AppGrantPage>> {
  const params = new URLSearchParams();

  params.set('limit', String(query.limit ?? 20));
  params.set('offset', String(query.offset ?? 0));

  if (query.appId !== undefined) {
    params.set('appId', query.appId);
  }

  if (query.userId !== undefined) {
    params.set('userId', query.userId);
  }

  if (query.state !== undefined && query.state !== null) {
    params.set('state', query.state);
  }

  if (query.role !== undefined && query.role !== null) {
    params.set('role', query.role);
  }

  return request<AppGrantPage>(`/api/app-grants?${params.toString()}`);
}

/**
 * 單筆詳情（issue 166）。一律重新由後端讀，唔用列表快照冒充最新詳情。
 * 後端對非法 UUID、不存在或 canSee 唔允許一律回 404，前端唔區分原因。
 */
export function fetchAppGrant(id: string): Promise<ApiResult<{ grant: GrantView }>> {
  return request<{ grant: GrantView }>(`/api/app-grants/${encodeURIComponent(id)}`);
}

/** 後端只收四個欄位；同意圖不明的欄位會被 422 拒絕。 */
export function requestAppGrant(input: {
  userId: string;
  appId: string;
  role: GrantRole;
  scope: UnitScope;
}): Promise<ApiResult<{ grant: GrantView; created: boolean }>> {
  return request<{ grant: GrantView; created: boolean }>('/api/app-grants', {
    method: 'POST',
    body: JSON.stringify({
      userId: input.userId,
      appId: input.appId,
      role: input.role,
      scope: input.scope,
    }),
  });
}

export function approveAppGrant(
  id: string,
  version: number,
): Promise<ApiResult<{ grant: GrantView; activated?: boolean }>> {
  return request<{ grant: GrantView; activated?: boolean }>(
    `/api/app-grants/${encodeURIComponent(id)}/approve`,
    { method: 'POST', body: JSON.stringify({ version }) },
  );
}

export function activateAppGrant(id: string, version: number): Promise<ApiResult<{ grant: GrantView }>> {
  return request<{ grant: GrantView }>(`/api/app-grants/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

/** 拒絕的理由是必填（後端 422），所以這裡的型別也要求它。 */
export function rejectAppGrant(
  id: string,
  input: { version: number; reason: string },
): Promise<ApiResult<{ grant: GrantView }>> {
  return request<{ grant: GrantView }>(`/api/app-grants/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ version: input.version, reason: input.reason }),
  });
}

/** 撤銷的原因可選；沒有填就不送這個欄位（不是送空字串）。 */
export function revokeAppGrant(
  id: string,
  input: { version: number; reason?: string },
): Promise<ApiResult<{ grant: GrantView }>> {
  return request<{ grant: GrantView }>(`/api/app-grants/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    body: JSON.stringify(
      input.reason === undefined ? { version: input.version } : { version: input.version, reason: input.reason },
    ),
  });
}

/**
 * 修改是開新版本：縮範圍回 200（`requiresApproval: false`，即時生效），
 * 擴範圍／升角色回 201（`requiresApproval: true`，要人批）。兩者都不原地改舊列。
 */
export function modifyAppGrant(
  id: string,
  input: { version: number; role?: GrantRole; scope?: UnitScope },
): Promise<ApiResult<{ grant: GrantView; replacedId: string; requiresApproval: boolean }>> {
  const body: { version: number; role?: GrantRole; scope?: UnitScope } = { version: input.version };

  if (input.role !== undefined) {
    body.role = input.role;
  }

  if (input.scope !== undefined) {
    body.scope = input.scope;
  }

  return request<{ grant: GrantView; replacedId: string; requiresApproval: boolean }>(
    `/api/app-grants/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

/**
 * 人對某個 app 的存取判斷（issue 123）。與 agent 的檢查分開：agent 走
 * `/agents/:id/access/:appId`，人的 session 結果不可以用來冒充 agent 權限。
 */
export function checkAppAccess(appId: string): Promise<ApiResult<AccessDecision>> {
  return request<AccessDecision>(`/api/app-grants/access/${encodeURIComponent(appId)}`);
}

// ---------------------------------------------------------------------------
// 政策規則（issue 162）
// ---------------------------------------------------------------------------

/**
 * 條件子句嘅形狀照 `apps/platform/src/settings/policy.ts`：子句只可以有
 * field／op／value／currency，op 只得 eq／lte／gte／in，金額比較一定要帶貨幣。
 */
export type PolicyOperator = 'eq' | 'lte' | 'gte' | 'in';

export type PolicyClause = {
  field: string;
  op: PolicyOperator;
  value: string | number | boolean | (string | number | boolean)[];
  currency?: string;
};

export type PolicyCondition = { all: PolicyClause[] };

export type PolicyAction = 'allow' | 'require_approval';

/** `GET /policy-rules` 回傳嘅一條規則（後端 `toRuleView` 嘅形狀）。 */
export type PolicyRule = {
  id: string;
  domain: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  note: string | null;
  orgUnitId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * POST 只可以帶呢七個欄位：後端 `parseRuleInput` 對未知欄位回 422，
 * 所以前端連一個多餘嘅鍵都唔加，亦唔帶 id／createdAt 呢類只讀欄位。
 */
export type PolicyRuleInput = {
  domain: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  note: string | null;
  orgUnitId: string | null;
};

/** PATCH 係部分更新，只送有改動嘅欄位。 */
export type PolicyRulePatch = Partial<PolicyRuleInput>;

export function fetchPolicyRules(): Promise<ApiResult<{ rules: PolicyRule[] }>> {
  return request<{ rules: PolicyRule[] }>('/api/policy-rules');
}

export function createPolicyRule(
  input: PolicyRuleInput,
): Promise<ApiResult<{ rule: PolicyRule }>> {
  return request<{ rule: PolicyRule }>('/api/policy-rules', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function patchPolicyRule(
  id: string,
  patch: PolicyRulePatch,
): Promise<ApiResult<{ rule: PolicyRule }>> {
  return request<{ rule: PolicyRule }>(`/api/policy-rules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** 軟刪除，後端回 204（無 body）。 */
export function deletePolicyRule(id: string): Promise<ApiResult<null>> {
  return request<null>(`/api/policy-rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// 檔案層（issue 164）
// ---------------------------------------------------------------------------

/**
 * `GET /files` 回傳嘅公開欄位，照後端 `toPublicFile()` 嘅形狀：
 * 只有六個欄位，**沒有上傳者**，前端唔補、唔猜。
 */
export type PublicFile = {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

/** `nextCursor` 係不透明字串或 null；前端唔解讀內容，只原样帶去下一次請求。 */
export type FilePage = { files: PublicFile[]; nextCursor: string | null };

export function fetchFiles(input: {
  limit: number;
  cursor?: string;
}): Promise<ApiResult<FilePage>> {
  const params = new URLSearchParams();
  params.set('limit', String(input.limit));

  if (input.cursor !== undefined) {
    params.set('cursor', input.cursor);
  }

  return request<FilePage>(`/api/files?${params.toString()}`);
}

/**
 * 上傳：body 直接用 `File`，唔 `JSON.stringify`、唔轉 base64、唔送
 * `X-Content-SHA256`，畫面亦唔宣稱已校驗。
 *
 * `request()` 對有 body 嘅請求會預設加 `content-type: application/json`；
 * 呢度用 `init.headers` 嘅 `content-type` 覆寫（key 會被轉小寫），
 * 同時帶 URL 編碼嘅 `x-file-name`。原始 `File` 由 fetch 直接送出，
 * `request()` 唔會改寫 body，所以唔使重寫成個請求層。
 */
export function uploadFile(file: File): Promise<ApiResult<PublicFile>> {
  const contentType = file.type === '' ? 'application/octet-stream' : file.type;

  return request<PublicFile>('/api/files', {
    method: 'POST',
    body: file,
    headers: {
      'content-type': contentType,
      'x-file-name': encodeURIComponent(file.name),
    },
  });
}

/** 軟刪除，成功回 204；其餘一律 404，前端唔區分原因。 */
export function deleteFile(id: string): Promise<ApiResult<null>> {
  return request<null>(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 下載網址：inline 定 attachment 由伺服器 `Content-Disposition` 決定，前端唔猜。 */
export function fileDownloadUrl(id: string): string {
  return `/api/files/${encodeURIComponent(id)}`;
}

/**
 * Needs（issue 184）。
 *
 * 呢三條路只讀同一組事實：清單、計數、認領。狀態同逾期都由後端推導，
 * 前端唔自己算 —— 前端算一次就會與清單講唔同嘅故事（例如清單只載 50 筆）。
 */

export type NeedKind = 'deliverable' | 'decision';
export type NeedState = 'open' | 'claimed' | 'uploaded' | 'absorbed' | 'closed';
export type NeedFilter = 'all' | 'open' | 'claimed' | 'uploaded' | 'absorbed' | 'closed' | 'overdue';

export type NeedItem = {
  id: string;
  code: string;
  title: string;
  detail: string | null;
  kind: NeedKind;
  state: NeedState;
  appId: string | null;
  pageKey: string | null;
  assignee: { id: string; name: string } | null;
  dueAt: string | null;
  overdue: boolean;
  createdAt: string;
};

export type NeedCounts = {
  open: number;
  claimed: number;
  uploaded: number;
  absorbed: number;
  closed: number;
  overdue: number;
  total: number;
};

export type NeedQuery = {
  status?: NeedFilter;
  /** `'company'` ＝ 只要未綁 app 的公司層工作；唔傳 ＝ 全部來源。 */
  appId?: string;
  limit?: number;
};

function needQueryString(query: NeedQuery): string {
  const params = new URLSearchParams();

  if (query.status !== undefined) {
    params.set('status', query.status);
  }

  if (query.appId !== undefined) {
    params.set('appId', query.appId);
  }

  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }

  const text = params.toString();

  return text === '' ? '' : `?${text}`;
}

export function fetchNeeds(query: NeedQuery = {}): Promise<ApiResult<{ items: NeedItem[] }>> {
  return request<{ items: NeedItem[] }>(`/api/needs${needQueryString(query)}`);
}

export function fetchNeedSummary(query: NeedQuery = {}): Promise<ApiResult<{ counts: NeedCounts }>> {
  return request<{ counts: NeedCounts }>(`/api/needs/summary${needQueryString(query)}`);
}

export function claimNeed(id: string): Promise<ApiResult<{ item: NeedItem }>> {
  return request<{ item: NeedItem }>(`/api/needs/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
  });
}

/* ------------------------------------------------------------------ *
 * 品牌同據點（Frame 品牌 selector、Boss Portal 據點目錄）
 * ------------------------------------------------------------------ */

export type BrandItem = {
  id: string;
  code: string;
  name: string;
};

export type SiteItem = {
  id: string;
  code: string;
  name: string;
  companyLabel: string | null;
  city: string | null;
  isLocal: boolean;
  status: 'pending' | 'registered' | 'revoked';
  /** 只係頭尾幾位（`8F:2A…C1`）；未交換過就係 null。 */
  fingerprint: string | null;
  /** 對方機器網址；冇填就唔顯示「開新分頁」。 */
  entryUrl: string | null;
  lastCredentialAt: string | null;
  hasPendingInvite: boolean;
};

export type NewSiteInput = {
  code: string;
  name: string;
  companyLabel: string;
  city: string;
};

export function fetchBrands(): Promise<ApiResult<{ items: BrandItem[] }>> {
  return request<{ items: BrandItem[] }>('/api/brands');
}

/**
 * 我上次做緊邊個品牌（issue #15）。
 *
 * 讀與寫分開兩條路：讀一定成功（冇記錄就 null），寫只可以寫自己那一行。
 * 隨機「第一次揀邊個」由畫面決定，伺服器唔會替人揀 —— 見 `useDirectory`。
 */
export function fetchBrandFocus(): Promise<ApiResult<{ brandId: string | null }>> {
  return request<{ brandId: string | null }>('/api/me/brand-focus');
}

export function saveBrandFocus(brandId: string): Promise<ApiResult<{ brandId: string }>> {
  return request<{ brandId: string }>('/api/me/brand-focus', {
    method: 'PUT',
    body: JSON.stringify({ brandId }),
  });
}

export function createBrand(input: { code: string; name: string }): Promise<ApiResult<{ item: BrandItem }>> {
  return request<{ item: BrandItem }>('/api/brands', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * 品牌頁與頁版本（issue #33）。
 *
 * `current` 是**伺服器算出來的**最新未刪版本，不是前端從列表推的：前端推的話，
 * 兩個分頁同時開著就會各自有一個「現行」。畫面只顯示伺服器說的那一個。
 */
export type BrandPageVersionSummary = {
  id: string;
  versionNo: number;
  createdAt: string;
  note: string | null;
  preview: string;
  /**
   * 這一版當時用的是第幾版策略（#34）。`null`＝未記錄：策略功能之前的版本。
   * 畫面要如實講「未記錄」，不要當成第 1 版。
   */
  policyVersionNo: number | null;
};

export type BrandPageVersionDetail = BrandPageVersionSummary & { content: string };

export type BrandPageSummary = {
  id: string;
  brandId: string;
  kind: 'fixed' | 'custom';
  key: string;
  name: string;
  brief: string | null;
  sortOrder: number;
  current: BrandPageVersionSummary | null;
};

export type BrandPageDetail = {
  page: BrandPageSummary;
  versions: BrandPageVersionSummary[];
  current: BrandPageVersionDetail | null;
};

/** 一個品牌缺口（#58）。缺什麼由頁的文件講，這裡補「交了給誰跟」。 */
export type BrandGapItem = {
  pageKey: string;
  pageName: string;
  item: string;
  what: string;
  type: 'file' | 'judgement';
  ruleId: string | null;
  needId: string | null;
  needCode: string | null;
  needState: 'open' | 'claimed' | 'uploaded' | 'absorbed' | 'closed' | null;
  assigneeName: string | null;
};

export type BrandGapCounts = { total: number; file: number; judgement: number; open: number };

export function fetchBrandGaps(
  brandId: string,
  pageKey?: string,
): Promise<ApiResult<{ items: BrandGapItem[]; counts: BrandGapCounts }>> {
  const query = pageKey === undefined ? '' : `?page=${encodeURIComponent(pageKey)}`;
  return request<{ items: BrandGapItem[]; counts: BrandGapCounts }>(
    `/api/brands/${encodeURIComponent(brandId)}/gaps${query}`,
  );
}

/** 一鍵建立 Need。重複按會回同一張（`created: false`），不會開第二張。 */
export function createGapNeed(
  brandId: string,
  input: { pageKey: string; item: string },
): Promise<ApiResult<{ need: { id: string; code: string }; created: boolean }>> {
  return request<{ need: { id: string; code: string }; created: boolean }>(
    `/api/brands/${encodeURIComponent(brandId)}/gaps/needs`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/**
 * 這個品牌的頁清單，以及「我是不是可以改這個品牌的頁」。
 *
 * `canEdit` 由伺服器回答（老闆，或者被老闆授予品牌編輯權的人）。前端用它決定
 * 顯示什麼表單，但**不決定可不可以做**：每一條寫入路徑後端都會自己再問一次
 * （issue #32 第 13 點）。
 */
export function fetchBrandPages(
  brandId: string,
): Promise<ApiResult<{ items: BrandPageSummary[]; canEdit: boolean }>> {
  return request<{ items: BrandPageSummary[]; canEdit: boolean }>(
    `/api/brands/${encodeURIComponent(brandId)}/pages`,
  );
}

/** 建立自定義頁。三樣一次過要齊，缺一樣由後端回 400 並講明欠什麼。 */
export function createBrandPage(
  brandId: string,
  input: { name: string; slug: string; brief: string },
): Promise<ApiResult<{ page: BrandPageSummary }>> {
  return request<{ page: BrandPageSummary }>(`/api/brands/${encodeURIComponent(brandId)}/pages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** 改顯示名。**沒有 slug**：改 slug 等於另一張頁，舊連結會斷（C101）。 */
export function renameBrandPage(
  brandId: string,
  key: string,
  input: { name: string },
): Promise<ApiResult<{ page: BrandPageSummary }>> {
  return request<{ page: BrandPageSummary }>(
    `/api/brands/${encodeURIComponent(brandId)}/pages/${encodeURIComponent(key)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

/** 軟刪除自定義頁（連它的版本）。被成品釘住時後端回 409，原樣顯示理由。 */
export function deleteBrandPage(
  brandId: string,
  key: string,
): Promise<ApiResult<{ deleted: boolean; key: string; versions: number }>> {
  return request<{ deleted: boolean; key: string; versions: number }>(
    `/api/brands/${encodeURIComponent(brandId)}/pages/${encodeURIComponent(key)}`,
    { method: 'DELETE' },
  );
}

/**
 * 誰可以改這個品牌的頁（issue #32）。
 *
 * 這是 (品牌, 人) 一對的授權，不是職位、不是部門，role 仍然是 staff。老闆
 * 永遠可以改，所以永遠不在名單裡 —— 寫進來只會出現「老闆被移除編輯權」這種
 * 講不通的狀態。
 */
export type BrandEditor = {
  userId: string;
  displayName: string;
  email: string;
  grantedAt: string;
};

export function fetchBrandEditors(
  brandId: string,
): Promise<ApiResult<{ items: BrandEditor[] }>> {
  return request<{ items: BrandEditor[] }>(
    `/api/brands/${encodeURIComponent(brandId)}/editors`,
  );
}

export function grantBrandEditor(
  brandId: string,
  userId: string,
): Promise<ApiResult<{ items: BrandEditor[] }>> {
  return request<{ items: BrandEditor[] }>(
    `/api/brands/${encodeURIComponent(brandId)}/editors/${encodeURIComponent(userId)}`,
    { method: 'PUT' },
  );
}

export function revokeBrandEditor(
  brandId: string,
  userId: string,
): Promise<ApiResult<{ items: BrandEditor[] }>> {
  return request<{ items: BrandEditor[] }>(
    `/api/brands/${encodeURIComponent(brandId)}/editors/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export function fetchBrandPage(
  brandId: string,
  key: string,
): Promise<ApiResult<BrandPageDetail>> {
  return request<BrandPageDetail>(
    `/api/brands/${encodeURIComponent(brandId)}/pages/${encodeURIComponent(key)}`,
  );
}

export function saveBrandPageVersion(
  brandId: string,
  key: string,
  input: { content: string; note?: string },
): Promise<ApiResult<{ version: BrandPageVersionDetail }>> {
  return request<{ version: BrandPageVersionDetail }>(
    `/api/brands/${encodeURIComponent(brandId)}/pages/${encodeURIComponent(key)}/versions`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function restoreBrandPageVersion(
  brandId: string,
  key: string,
  versionId: string,
): Promise<ApiResult<{ version: BrandPageVersionDetail }>> {
  return request<{ version: BrandPageVersionDetail }>(
    `/api/brands/${encodeURIComponent(brandId)}/pages/${encodeURIComponent(key)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST' },
  );
}

export function deleteBrandPageVersion(
  brandId: string,
  key: string,
  versionId: string,
): Promise<ApiResult<{ deleted: boolean; versionNo: number }>> {
  return request<{ deleted: boolean; versionNo: number }>(
    `/api/brands/${encodeURIComponent(brandId)}/pages/${encodeURIComponent(key)}/versions/${encodeURIComponent(versionId)}`,
    { method: 'DELETE' },
  );
}

/**
 * 品牌頁策略（#34、#56）：一份策略、九個槽，只加不改。
 *
 * `current` 同樣由伺服器算（該槽最大版號），前端不推。`current === null` 代表
 * 這個槽真的沒有內容 —— 畫面要講缺，不要畫一個空的第 1 版。
 */
export type PolicyVersionSummary = {
  id: string;
  versionNo: number;
  createdAt: string;
  note: string | null;
  preview: string;
};

export type PolicyVersionDetail = PolicyVersionSummary & { content: string };

export type PolicySlotView = {
  slot: string;
  current: PolicyVersionDetail | null;
  versions: PolicyVersionSummary[];
  /** 現行這一版正在支撐哪些頁的現行版本（最多五個）。 */
  usedBy: { brand: string; page: string; versionNo: number }[];
};

/**
 * 規則 id 表（#56）。id 是「策略句」與「檢查器」之間唯一的契約 —— 前端只
 * 顯示，不另存一份；後端換一條定義，畫面就跟著換。
 */
export type BrandPolicyRule = {
  id: string;
  slot: string;
  summary: string;
  threshold: string;
  pass: string;
  fail: string;
  undetermined: string;
};

export function fetchPolicy(): Promise<
  ApiResult<{ slots: PolicySlotView[]; rules: BrandPolicyRule[] }>
> {
  return request<{ slots: PolicySlotView[]; rules: BrandPolicyRule[] }>('/api/policy');
}

export function savePolicyVersion(
  slot: string,
  input: { content: string; note?: string },
): Promise<ApiResult<{ version: PolicyVersionDetail }>> {
  return request<{ version: PolicyVersionDetail }>(
    `/api/policy/${encodeURIComponent(slot)}/versions`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function fetchSites(): Promise<ApiResult<{ items: SiteItem[] }>> {
  return request<{ items: SiteItem[] }>('/api/sites');
}

export function createSite(
  input: NewSiteInput,
): Promise<ApiResult<{ item: SiteItem; invite: { token: string; expiresAt: string } }>> {
  return request<{ item: SiteItem; invite: { token: string; expiresAt: string } }>('/api/sites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function approveSite(id: string): Promise<ApiResult<{ item: SiteItem }>> {
  return request<{ item: SiteItem }>(`/api/sites/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
  });
}

export type CompanyIdentity = {
  siteCode: string;
  name: string | null;
  city: string | null;
};

export function fetchCompanyIdentity(): Promise<ApiResult<CompanyIdentity>> {
  return request<CompanyIdentity>('/api/company');
}
