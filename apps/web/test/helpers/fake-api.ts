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
};

export type FakeResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
};

export type Handler = (request: RecordedRequest) => FakeResponse | Promise<FakeResponse>;

export type FakeHandlers = Partial<Record<'state' | 'setup' | 'login' | 'logout', Handler>>;

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

function routeKey(path: string): keyof FakeHandlers | null {
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
      };

      calls.push(recorded);

      const key = routeKey(path);
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
    count: (key) => calls.filter((call) => routeKey(call.path) === key).length,
  };
}

/** 每個測試之後都要清掉前一個測試留下的網址、storage 與 fetch stub。 */
export function resetBrowserState(): void {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
}
