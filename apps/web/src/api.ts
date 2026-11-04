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

    return {
      ok: false,
      failure: {
        kind: 'http',
        status: response.status,
        error: typeof record.error === 'string' ? record.error : null,
        field: typeof record.field === 'string' ? record.field : null,
        retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
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
