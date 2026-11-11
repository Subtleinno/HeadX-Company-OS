import { vi } from 'vitest';

/**
 * 元件測試用的假 API。
 *
 * 只用 fetch 的最小介面（status、headers.get、json），不引入任何 mock 套件；
 * 每個請求都會被記錄，測試可以斷言「發了什麼」而不是只看畫面。
 */

export type RecordedRequest = {
  path: string;
  method: string;
  contentType: string | null;
  body: string | null;
  /** 未經轉換嘅原始 body：上傳測試要證明 fetch 收到嘅係同一個 `File`，唔係字串。 */
  rawBody: unknown;
  /** 全部請求標頭（key 已轉小寫）：用嚟證明有 `x-file-name`、冇 `x-content-sha256`。 */
  headers: Record<string, string>;
};

export type FakeResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
};

export type Handler = (request: RecordedRequest) => FakeResponse | Promise<FakeResponse>;

export type FakeHandlers = Partial<
  Record<
    | 'state'
    | 'setup'
    | 'login'
    | 'logout'
    | 'me'
    | 'changePassword'
    | 'settings'
    | 'settingSave'
    | 'orgUnits'
    | 'orgUnitCreate'
    | 'orgUnitPatch'
    | 'orgUnitDelete'
    | 'orgParentAdd'
    | 'orgParentRemove'
    | 'unitSettings'
    | 'unitSettingSave'
    | 'unitSettingRemove'
    | 'modules'
    | 'staff'
    | 'staffCreate'
    | 'staffDisable'
    | 'staffEnable'
    | 'staffReset'
    | 'staffDepartment'
    | 'agents'
    | 'agentCreate'
    | 'agentDisable'
    | 'agentGrants'
    | 'agentGrantCreate'
    | 'agentGrantRevoke'
    | 'agentAccess'
    | 'appGrants'
    | 'appGrantDetail'
    | 'appGrantCreate'
    | 'appGrantApprove'
    | 'appGrantActivate'
    | 'appGrantReject'
    | 'appGrantRevoke'
    | 'appGrantPatch'
    | 'appAccess'
    | 'policyRules'
    | 'policyRuleCreate'
    | 'policyRulePatch'
    | 'policyRuleDelete'
    | 'filesList'
    | 'filesUpload'
    | 'filesDelete'
    | 'brands'
    | 'brandCreate'
    | 'brandFocus'
    | 'brandPages'
    | 'brandPage'
    | 'brandPageSave'
    | 'brandPageRestore'
    | 'brandPageDelete'
    | 'policy'
    | 'policySave',
    Handler
  >
>;

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): FakeResponse {
  const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower.get(name.toLowerCase()) ?? null },
    json: async () => body,
  };
}

function readHeader(headers: unknown, name: string): string | null {
  if (headers === undefined || headers === null) {
    return null;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && String(entry[0]).toLowerCase() === name) {
        return String(entry[1]);
      }
    }

    return null;
  }

  if (typeof headers === 'object') {
    const record = headers as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase() === name) {
        return typeof value === 'string' ? value : String(value);
      }
    }
  }

  return null;
}

/** 把請求標頭收成小寫 key 嘅物件；測試可以逐個 header 斷言，唔使只靠 content-type。 */
function readAllHeaders(headers: unknown): Record<string, string> {
  const result: Record<string, string> = {};

  if (headers === undefined || headers === null) {
    return result;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry)) {
        result[String(entry[0]).toLowerCase()] = String(entry[1]);
      }
    }

    return result;
  }

  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      result[key.toLowerCase()] = String(value);
    }
  }

  return result;
}

function routeKey(path: string, method: string): keyof FakeHandlers | null {
  if (path.endsWith('/auth/state')) {
    return 'state';
  }

  if (path.endsWith('/auth/setup')) {
    return 'setup';
  }

  if (path.endsWith('/auth/login')) {
    return 'login';
  }

  if (path.endsWith('/auth/logout')) {
    return 'logout';
  }

  // 個人帳戶（issue 124）。`/me` 與改密碼都是 auth 之下更具體的路徑。
  if (path.endsWith('/auth/change-password')) {
    return 'changePassword';
  }

  if (path.endsWith('/me')) {
    return 'me';
  }

  // 組織（issue 120）。次序有意義：先配對更具體的路徑。
  if (/\/org-units\/[^/]+\/settings\/[^/]+$/.test(path)) {
    if (method === 'PUT') {
      return 'unitSettingSave';
    }

    return method === 'DELETE' ? 'unitSettingRemove' : null;
  }

  if (/\/org-units\/[^/]+\/settings$/.test(path)) {
    return method === 'GET' ? 'unitSettings' : null;
  }

  if (/\/org-units\/[^/]+\/parents\/[^/]+$/.test(path)) {
    return method === 'DELETE' ? 'orgParentRemove' : null;
  }

  if (/\/org-units\/[^/]+\/parents$/.test(path)) {
    return method === 'POST' ? 'orgParentAdd' : null;
  }

  if (/\/org-units\/[^/]+$/.test(path)) {
    if (method === 'PATCH') {
      return 'orgUnitPatch';
    }

    return method === 'DELETE' ? 'orgUnitDelete' : null;
  }

  if (path.endsWith('/org-units')) {
    return method === 'GET' ? 'orgUnits' : method === 'POST' ? 'orgUnitCreate' : null;
  }

  // ── 員工與 agent（issue 121）。次序同樣有意義：更具體的路徑先配對。
  // 這幾條會有 `?limit=&offset=`，所以比對之前先切掉查詢字串；
  // 否則 `endsWith('/staff')` 永遠配不上，測試會以「沒有預期的請求」爆掉。
  const bare = path.split('?')[0] ?? path;

  if (/\/agents\/[^/]+\/grants\/[^/]+\/revoke$/.test(bare)) {
    return method === 'POST' ? 'agentGrantRevoke' : null;
  }

  if (/\/agents\/[^/]+\/grants$/.test(bare)) {
    return method === 'GET' ? 'agentGrants' : method === 'POST' ? 'agentGrantCreate' : null;
  }

  if (/\/agents\/[^/]+\/access\/[^/]+$/.test(bare)) {
    return method === 'GET' ? 'agentAccess' : null;
  }

  if (/\/agents\/[^/]+\/disable$/.test(bare)) {
    return method === 'POST' ? 'agentDisable' : null;
  }

  if (bare.endsWith('/agents')) {
    return method === 'GET' ? 'agents' : method === 'POST' ? 'agentCreate' : null;
  }

  if (/\/staff\/[^/]+\/reset-password$/.test(bare)) {
    return method === 'POST' ? 'staffReset' : null;
  }

  // 指派部門（issue #12／#13）。
  if (/\/staff\/[^/]+\/department$/.test(bare)) {
    return method === 'PATCH' ? 'staffDepartment' : null;
  }

  if (/\/staff\/[^/]+\/disable$/.test(bare)) {
    return method === 'POST' ? 'staffDisable' : null;
  }

  // 恢復停用帳戶（issue #30）：停用的逆操作，同樣只有 POST。
  if (/\/staff\/[^/]+\/enable$/.test(bare)) {
    return method === 'POST' ? 'staffEnable' : null;
  }

  if (bare.endsWith('/staff')) {
    return method === 'GET' ? 'staff' : method === 'POST' ? 'staffCreate' : null;
  }

  // ── App 授權（issue 122）。同樣先配對更具體的路徑。
  if (/\/app-grants\/[^/]+\/approve$/.test(bare)) {
    return method === 'POST' ? 'appGrantApprove' : null;
  }

  if (/\/app-grants\/[^/]+\/activate$/.test(bare)) {
    return method === 'POST' ? 'appGrantActivate' : null;
  }

  if (/\/app-grants\/[^/]+\/reject$/.test(bare)) {
    return method === 'POST' ? 'appGrantReject' : null;
  }

  if (/\/app-grants\/[^/]+\/revoke$/.test(bare)) {
    return method === 'POST' ? 'appGrantRevoke' : null;
  }

  if (/\/app-grants\/access\/[^/]+$/.test(bare)) {
    return method === 'GET' ? 'appAccess' : null;
  }

  if (/\/app-grants\/[^/]+$/.test(bare)) {
    if (method === 'GET') {
      return 'appGrantDetail';
    }

    return method === 'PATCH' ? 'appGrantPatch' : null;
  }

  if (bare.endsWith('/app-grants')) {
    return method === 'GET' ? 'appGrants' : method === 'POST' ? 'appGrantCreate' : null;
  }

  if (bare.endsWith('/modules')) {
    return method === 'GET' ? 'modules' : null;
  }

  // ── 政策規則（issue 162）。次序有意義：/policy-rules/:id 先於 /policy-rules。
  if (/\/policy-rules\/[^/]+$/.test(bare)) {
    return method === 'PATCH' ? 'policyRulePatch' : method === 'DELETE' ? 'policyRuleDelete' : null;
  }

  if (bare.endsWith('/policy-rules')) {
    return method === 'GET' ? 'policyRules' : method === 'POST' ? 'policyRuleCreate' : null;
  }

  // ── 檔案層（issue 164）。`/api/files/:id` 先於 `/api/files`；
  // 下載係 `<a href>` 開新分頁，唔經 fetch，所以呢度只需要 DELETE。
  if (/\/files\/[^/]+$/.test(bare)) {
    return method === 'DELETE' ? 'filesDelete' : null;
  }

  if (bare.endsWith('/files')) {
    return method === 'GET' ? 'filesList' : method === 'POST' ? 'filesUpload' : null;
  }

  // ── 品牌與「我上次做緊邊個品牌」（issue #15）。
  // `/me/brand-focus` 要放喺 `/me` 之前配對：兩者都係 GET。
  if (bare.endsWith('/me/brand-focus')) {
    return method === 'GET' || method === 'PUT' ? 'brandFocus' : null;
  }

  // ── 品牌頁版本（issue #33）。更具體的路徑先配對，否則 `/brands/:id/pages`
  // 會被下面的 `/brands` 當成品牌清單。
  if (/\/brands\/[^/]+\/pages\/[^/]+\/versions\/[^/]+\/restore$/.test(bare)) {
    return method === 'POST' ? 'brandPageRestore' : null;
  }

  if (/\/brands\/[^/]+\/pages\/[^/]+\/versions\/[^/]+$/.test(bare)) {
    return method === 'DELETE' ? 'brandPageDelete' : null;
  }

  if (/\/brands\/[^/]+\/pages\/[^/]+\/versions$/.test(bare)) {
    return method === 'POST' ? 'brandPageSave' : null;
  }

  if (/\/brands\/[^/]+\/pages\/[^/]+$/.test(bare)) {
    return method === 'GET' ? 'brandPage' : null;
  }

  if (/\/brands\/[^/]+\/pages$/.test(bare)) {
    return method === 'GET' ? 'brandPages' : null;
  }

  // ── 品牌頁策略（issue #34）。`/policy/:slot/versions` 要放喺 `/policy` 之前。
  if (/\/policy\/[^/]+\/versions$/.test(bare)) {
    return method === 'POST' ? 'policySave' : null;
  }

  if (bare.endsWith('/policy')) {
    return method === 'GET' ? 'policy' : null;
  }

  if (bare.endsWith('/brands')) {
    return method === 'GET' ? 'brands' : method === 'POST' ? 'brandCreate' : null;
  }

  // 逐 key 保存：`/api/settings/<key>`，只有 PUT。
  if (/\/settings\/[^/]+$/.test(path)) {
    return method === 'PUT' ? 'settingSave' : null;
  }

  if (path.endsWith('/settings')) {
    return method === 'GET' ? 'settings' : null;
  }

  return null;
}

export type FakeApi = {
  calls: RecordedRequest[];
  /** 某個端點被呼叫了幾次。 */
  count: (key: keyof FakeHandlers) => number;
};

export function installFakeApi(handlers: FakeHandlers): FakeApi {
  const calls: RecordedRequest[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const path = typeof input === 'string' ? input : String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body =
        typeof init?.body === 'string'
          ? init.body
          : init?.body === undefined || init.body === null
            ? null
            : String(init.body);

      const recorded: RecordedRequest = {
        path,
        method,
        contentType: readHeader(init?.headers, 'content-type'),
        body,
        rawBody: init?.body,
        headers: readAllHeaders(init?.headers),
      };

      calls.push(recorded);

      const key = routeKey(path, method);
      if (key === null) {
        throw new Error(`測試沒有預期的請求：${method} ${path}`);
      }

      const handler = handlers[key];
      if (handler === undefined) {
        throw new Error(`測試沒有為 ${key} 準備回應`);
      }

      return handler(recorded);
    }),
  );

  return {
    calls,
    count: (key) => calls.filter((call) => routeKey(call.path, call.method) === key).length,
  };
}

/** 每個測試之後都要清掉前一個測試留下的網址、storage 與 fetch stub。 */
export function resetBrowserState(): void {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
}
