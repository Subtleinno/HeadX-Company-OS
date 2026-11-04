/**
 * 視覺驗收用的靜態伺服器 ＋ 固定 API（issue #73）。
 *
 * 基準與候選都由這支伺服器提供同一份測試資料，令畫面狀態完全可重現：
 * 同一個 case 名 → 同一個 API 回應。這樣基準圖與候選圖的差異只可能來自程式碼。
 *
 * 只依賴 node 內建模組。
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** 虛構測試身份：不得使用真實員工資料（issue 實作規則 6）。 */
const TEST_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  displayName: '陳大文',
  role: 'owner',
};

/**
 * 每個 case 對應的 API 行為。
 *
 * state：GET /api/auth/state 的回應（null = 永不要回應，用來固定「載入中」）。
 * login：POST /api/auth/login 的回應。
 */
const MODES = {
  setup: { state: { status: 200, body: { setupRequired: true, signedIn: false } } },
  login: { state: { status: 200, body: { setupRequired: false, signedIn: false } } },
  home: {
    state: {
      status: 200,
      body: { setupRequired: false, signedIn: true, user: TEST_USER },
    },
  },
  unreachable: { state: { status: 500, body: { error: 'unavailable' } } },
  loading: { state: null },
  'login-error': {
    state: { status: 200, body: { setupRequired: false, signedIn: false } },
    login: { status: 401, body: { error: 'invalid_credentials' } },
  },
  'field-error': {
    state: { status: 200, body: { setupRequired: false, signedIn: false } },
    login: { status: 400, body: { error: 'invalid_input', field: 'email' } },
  },
};

function sendJson(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

/**
 * 啟動伺服器。
 * @param {{ distDir: string, mode: string, port: number }} options
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startServer({ distDir, mode, port }) {
  const config = MODES[mode];

  if (config === undefined) {
    throw new Error(`未知的 case：${mode}`);
  }

  const root = resolve(distDir);

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;

    if (path === '/api/auth/state') {
      if (config.state === null) {
        // 永不回應：畫面停在「載入中…」。請求會被 request 逾時或頁面關閉時丟棄。
        return;
      }

      sendJson(response, config.state.status, config.state.body);
      return;
    }

    if (path === '/api/auth/login') {
      const answer = config.login ?? { status: 401, body: { error: 'invalid_credentials' } };
      sendJson(response, answer.status, answer.body);
      return;
    }

    if (path === '/api/auth/logout') {
      response.writeHead(204, { 'cache-control': 'no-store' });
      response.end();
      return;
    }

    if (path === '/api/auth/setup') {
      sendJson(response, 409, { error: 'already_set_up' });
      return;
    }

    const relative = normalize(path === '/' ? '/index.html' : path).replace(/^[/\\]+/, '');
    const file = join(root, relative);
    const isFile = file.startsWith(root) && existsSync(file) && statSync(file).isFile();
    const target = isFile ? file : join(root, 'index.html');

    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(target).pipe(response);
  });

  await new Promise((done) => {
    server.listen(port, '127.0.0.1', done);
  });

  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections?.();
        server.close(() => {
          done();
        });
      }),
  };
}
