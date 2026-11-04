import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * app 的靜態網頁（`dist/web`）在同一條 route 前綴下提供。
 *
 * 為甚麼自己寫而不裝 `@fastify/static`：#77 規定不新增外部依賴。
 * 這裡只需要「把 build 好的檔案送出」這一件小事，而多一個插件就多一條版本線。
 *
 * 安全底線：路徑正規化之後必須仍在 webDir 之內（擋 `..` 與絕對路徑），
 * 只認得白名單的副檔名，不列出目錄。
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function contentTypeOf(filePath: string): string {
  return MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * 把請求路徑對應到 webDir 內的檔案；不存在、走出 webDir 或副檔名不認得就回 null。
 * `relative` 是 route 前綴之後的部分（可能以 / 開頭，可能是空字串）。
 */
export function resolveStaticPath(webDir: string, relative: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(relative);
    } catch {
      return null;
    }
  })();

  if (decoded === null || decoded.includes('\0')) {
    return null;
  }

  const trimmed = decoded.replace(/^\/+/, '');
  const candidate = trimmed === '' ? join(webDir, 'index.html') : resolve(webDir, trimmed);
  const root = resolve(webDir);

  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }

  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    return null;
  }

  if (MIME[extname(candidate).toLowerCase()] === undefined) {
    return null;
  }

  return candidate;
}

async function sendFile(reply: FastifyReply, filePath: string): Promise<void> {
  const body = await readFile(filePath);
  await reply.type(contentTypeOf(filePath)).send(body);
}

/**
 * 把 `webDir` 掛在 `prefix` 之下。`prefix` 本身與 `prefix/*` 都會處理，
 * 所以 `/sales`、`/sales/`、`/sales/index.html`、`/sales/assets/x.js` 都通。
 */
export function registerStatic(app: FastifyInstance, prefix: string, webDir: string): void {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

  app.get(base, async (_request, reply) => {
    const filePath = resolveStaticPath(webDir, '');
    if (filePath === null) {
      await reply.code(404).send({ error: '找不到頁面' });
      return;
    }
    await sendFile(reply, filePath);
  });

  app.get(`${base}/*`, async (request, reply) => {
    const wildcard = (request.params as Record<string, string>)['*'] ?? '';
    const filePath = resolveStaticPath(webDir, wildcard);
    if (filePath === null) {
      await reply.code(404).send({ error: '找不到頁面' });
      return;
    }
    await sendFile(reply, filePath);
  });
}
