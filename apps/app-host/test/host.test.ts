import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { databaseEnvNames, parseAppSet, readConfig } from '../src/config';
import { resolveCredentials } from '../src/database';
import { resolveAppModule } from '../src/host';
import { runMain, type RunOptions } from '../src/index';
import { contentTypeOf, resolveStaticPath } from '../src/static';

/**
 * app-host 的載入約定（issue #77）。
 *
 * 這裡用 APPS_DIR 指向 test/fixtures/apps 的假 app，真正的 apps/ 一個都沒有動 ——
 * 測試要證的是「機制可用」，不是「有幾個真 app」。驗收要的每一項都對應一個 describe
 * 小節：空 APP_SET、找不到、manifest 壞、id 重複、exposure 不同、載入丟錯、
 * 缺資料庫帳號、成功掛在 route 前綴、靜態網頁。
 */

const here = dirname(fileURLToPath(import.meta.url));
const APPS_DIR = resolve(here, 'fixtures/apps');

/** 每個測試自己收掉 Fastify，避免開放 handle 令 vitest 收唔到尾。 */
const opened: FastifyInstance[] = [];

afterEach(async () => {
  for (const server of opened.splice(0)) {
    await server.close();
  }
});

type Started = {
  code: number;
  lines: string[];
  errors: string[];
  server?: FastifyInstance;
};

/** 啟動一次 app-host 但不監聽：回傳退出碼與訊息，啟動成功就交出 Fastify 實例。 */
async function start(env: NodeJS.ProcessEnv, options: RunOptions = {}): Promise<Started> {
  const lines: string[] = [];
  const errors: string[] = [];

  const result = await runMain(
    { APPS_DIR, ...env },
    {
      listen: false,
      logLine: (line) => lines.push(line),
      logError: (line) => errors.push(line),
      // 單元測試冇真資料庫：角色檢查是 #88 的行為，另有整合測試用真 Postgres 驗。
      verifyRole: async () => undefined,
      ...options,
    },
  );

  if (result.host !== undefined) {
    opened.push(result.host.server);
  }

  return {
    code: result.code,
    lines,
    errors,
    ...(result.host === undefined ? {} : { server: result.host.server }),
  };
}

/** 一次過看全部錯誤訊息，方便斷言「有講到某件事」。 */
function allText(started: Started): string {
  return [...started.errors, ...started.lines].join('\n');
}

describe('APP_SET 與啟動設定', () => {
  it('未設定與空白都當成「不載入任何 app」', () => {
    expect(parseAppSet(undefined)).toEqual([]);
    expect(parseAppSet('')).toEqual([]);
    expect(parseAppSet('   ')).toEqual([]);
    expect(parseAppSet(',,')).toEqual([]);
  });

  it('逗號分隔、逐項 trim，重複保留給 manifests 報錯', () => {
    expect(parseAppSet('sales, finance')).toEqual(['sales', 'finance']);
    expect(parseAppSet(' sales ,, finance ')).toEqual(['sales', 'finance']);
    expect(parseAppSet('sales,sales')).toEqual(['sales', 'sales']);
  });

  it('預設 APPS_DIR 是 /app/apps、容器內監聽 8080', () => {
    expect(readConfig({})).toEqual({ appIds: [], appsDir: '/app/apps', port: 8080 });
  });

  it('PORT 不是數字或超出範圍就拒絕啟動', () => {
    expect(() => readConfig({ PORT: 'http' })).toThrow(/PORT 不是有效端口：http/);
    expect(() => readConfig({ PORT: '70000' })).toThrow(/PORT 超出 1–65535：70000/);
  });

  it('每個 app 的資料庫帳號變數名由 id 大寫而來', () => {
    expect(databaseEnvNames('sales')).toEqual({
      user: 'APP_DB_SALES_USER',
      password: 'APP_DB_SALES_PASSWORD',
    });
  });

  it('只設一半的帳號算設定不完整，不會靜靜用半邊', () => {
    expect(() => resolveCredentials('sales', { APP_DB_SALES_USER: 'app_sales' })).toThrow(
      /缺少 APP_DB_SALES_PASSWORD/,
    );
    expect(resolveCredentials('sales', {})).toBeNull();
  });
});

describe('app-host 啟動失敗的情形', () => {
  it('APP_SET 為空仍然正常啟動，health 講明沒有 app', async () => {
    const started = await start({});

    expect(started.code, allText(started)).toBe(0);
    expect(started.lines.join('\n')).toContain('APP_SET 為空：不載入任何 app');

    const health = await (started.server as FastifyInstance).inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true, exposure: null, apps: [] });

    const livez = await (started.server as FastifyInstance).inject({ method: 'GET', url: '/livez' });
    expect(livez.json()).toEqual({ ok: true });
  });

  it('id 不存在：講出找哪個檔案、APPS_DIR 在哪', async () => {
    const started = await start({ APP_SET: 'nope' });

    expect(started.code).toBe(1);
    expect(allText(started)).toContain('找不到 app：apps/nope/manifest.json');
    expect(allText(started)).toContain(`APPS_DIR=${APPS_DIR}`);
    expect(started.server).toBeUndefined();
  });

  it('manifest 驗證失敗：一次過報齊欄位層面的原因', async () => {
    const started = await start({ APP_SET: 'broken' });

    expect(started.code).toBe(1);
    // broken 少了 sensitive —— #74 定下的訊息文字，一個字都沒有改。
    expect(allText(started)).toContain(
      'apps/broken/manifest.json：sensitive 必須是 true 或 false（現在是 undefined）',
    );
  });

  it('id 重複：同一個 app 只可以載入一次', async () => {
    const started = await start({
      APP_SET: 'sales,sales',
      APP_DB_SALES_USER: 'app_sales',
      APP_DB_SALES_PASSWORD: 'x',
    });

    expect(started.code).toBe(1);
    expect(allText(started)).toContain('APP_SET 內有重複的 id：sales');
  });

  it('兩個 app exposure 不同就拒絕啟動，並指出是哪兩個（C32）', async () => {
    const started = await start({ APP_SET: 'sales,partner_desk' });

    expect(started.code).toBe(1);
    expect(allText(started)).toContain(
      'apps/sales 與 apps/partner_desk 的 exposure 不同（internal 與 partner）：同一個 app-host 只可以載入同一種 exposure 的 app',
    );
  });

  it('app 載入時丟出錯誤：以非 0 退出，訊息帶 app id 與原因', async () => {
    const started = await start({ APP_SET: 'boom' });

    expect(started.code).toBe(1);
    expect(allText(started)).toContain('載入 app boom 失敗：假 app 故意失敗');
  });

  it('dist/index.js 沒有匯出 registerApi：拒絕啟動', async () => {
    const started = await start({ APP_SET: 'no_export' });

    expect(started.code).toBe(1);
    expect(allText(started)).toContain(
      '載入 app no_export 失敗：apps/no_export/dist/index.js 沒有匯出 registerApi',
    );
  });

  it('未建置（沒有 dist/index.js）：拒絕啟動並講出路徑', async () => {
    const started = await start({ APP_SET: 'no_dist' });

    expect(started.code).toBe(1);
    expect(allText(started)).toContain(
      '載入 app no_dist 失敗：找不到建置好的 API（apps/no_dist/dist/index.js）',
    );
  });

  it('需要資料庫的 app 缺帳號環境變數：啟動失敗，不會回退用共用帳號', async () => {
    const started = await start({ APP_SET: 'sales' });

    expect(started.code).toBe(1);
    expect(allText(started)).toContain(
      'apps/sales 需要資料庫，但沒有設定 APP_DB_SALES_USER 與 APP_DB_SALES_PASSWORD（不會回退用共用帳號）',
    );
    expect(started.server).toBeUndefined();
  });

  it('只設了帳號但沒有密碼：一樣啟動失敗', async () => {
    const started = await start({ APP_SET: 'sales', APP_DB_SALES_USER: 'app_sales' });

    expect(started.code).toBe(1);
    expect(allText(started)).toContain('缺少 APP_DB_SALES_PASSWORD');
  });
});

describe('app-host 啟動成功的情形', () => {
  it('同一種 exposure 的 app 可以一齊載入，API 掛在 route 前綴之下', async () => {
    const started = await start({
      APP_SET: 'sales,finance',
      APP_DB_SALES_USER: 'app_sales',
      APP_DB_SALES_PASSWORD: 'x',
    });

    expect(started.code, allText(started)).toBe(0);
    expect(started.lines.join('\n')).toContain('已載入 2 個 app：sales、finance');

    const server = started.server as FastifyInstance;

    const sales = await server.inject({ method: 'GET', url: '/sales/summary' });
    expect(sales.statusCode).toBe(200);
    // sales 宣告 needsDatabase，ctx.db 是一條真連線；finance 沒有宣告，收到 null。
    expect(sales.json()).toEqual({ app: 'sales', db: 'connected' });

    const finance = await server.inject({ method: 'GET', url: '/finance/summary' });
    expect(finance.json()).toEqual({ app: 'finance', db: 'null' });

    // 沒有 route 前綴就摸不到 app 的 API。
    const unprefixed = await server.inject({ method: 'GET', url: '/summary' });
    expect(unprefixed.statusCode).toBe(404);

    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.json()).toEqual({
      ok: true,
      exposure: 'internal',
      apps: [
        { id: 'sales', route: '/sales', status: 'ok' },
        { id: 'finance', route: '/finance', status: 'ok' },
      ],
    });
  });

  it('靜態網頁在同一個 route 前綴下提供', async () => {
    const started = await start({
      APP_SET: 'sales',
      APP_DB_SALES_USER: 'app_sales',
      APP_DB_SALES_PASSWORD: 'x',
    });

    expect(started.code, allText(started)).toBe(0);
    const server = started.server as FastifyInstance;

    for (const url of ['/sales', '/sales/']) {
      const page = await server.inject({ method: 'GET', url });
      expect(page.statusCode, url).toBe(200);
      expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(page.body).toContain('銷售頁面');
    }

    const asset = await server.inject({ method: 'GET', url: '/sales/app.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(asset.body).toContain("dataset.loaded = 'yes'");

    // finance 沒有 dist/web，前綴之下沒有靜態檔案可言。
    const noWeb = await server.inject({ method: 'GET', url: '/finance' });
    expect(noWeb.statusCode).toBe(404);
  });

  it('靜態路徑走不出 web 目錄', async () => {
    const started = await start({
      APP_SET: 'sales',
      APP_DB_SALES_USER: 'app_sales',
      APP_DB_SALES_PASSWORD: 'x',
    });

    const server = started.server as FastifyInstance;

    // 全部都指向 dist/index.js（真的存在、.js 認得）：拿掉邊界檢查就會漏出去。
    for (const url of [
      '/sales/..%2findex.js',
      '/sales/%2e%2e%2findex.js',
      '/sales/..%2findex.js.map',
    ]) {
      const response = await server.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
      expect(response.body, url).not.toContain('module.exports');
      expect(response.body, url).not.toContain('needsDatabase');
    }
  });
});

describe('靜態檔案解析', () => {
  const webDir = resolve(APPS_DIR, 'sales/dist/web');

  it('空路徑等於 index.html，開頭斜線不影響', () => {
    expect(resolveStaticPath(webDir, '')).toBe(resolve(webDir, 'index.html'));
    expect(resolveStaticPath(webDir, '/')).toBe(resolve(webDir, 'index.html'));
    expect(resolveStaticPath(webDir, 'app.js')).toBe(resolve(webDir, 'app.js'));
    expect(resolveStaticPath(webDir, '/app.js')).toBe(resolve(webDir, 'app.js'));
  });

  it('走出 web 目錄、不存在、不明副檔名一律 null', () => {
    // 這幾個刻意指向**真正存在**的檔案（dist/index.js、dist/index.js.map）：
    // 如果邊界檢查被拿掉，它們就會被當成正常檔案回傳，測試才會紅。
    // 指住不存在的路徑（例如 ../manifest.json）是沒有意義的 —— 無論有沒有檢查
    // 都會回 null，一個永遠綠的案例等於沒有案例。
    expect(resolveStaticPath(webDir, '../index.js')).toBeNull();
    expect(resolveStaticPath(webDir, '../index.js.map')).toBeNull();
    expect(resolveStaticPath(webDir, '..%2Findex.js')).toBeNull();
    expect(resolveStaticPath(webDir, '../../sales/manifest.json')).toBeNull();
    expect(resolveStaticPath(webDir, 'nope.html')).toBeNull();
    expect(resolveStaticPath(webDir, 'a\0b.js')).toBeNull();
  });

  it('web 目錄之內的子路徑照樣讀得到（邊界檢查不會連正常檔案都擋）', () => {
    expect(resolveStaticPath(webDir, '../web/index.html')).toBe(resolve(webDir, 'index.html'));
    expect(resolveStaticPath(webDir, './app.js')).toBe(resolve(webDir, 'app.js'));
  });

  it('副檔名決定 content-type；認不得的當串流', () => {
    expect(contentTypeOf('a.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeOf('a.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeOf('a.woff2')).toBe('font/woff2');
    expect(contentTypeOf('a.bin')).toBe('application/octet-stream');
  });
});

describe('app 模組的兩種寫法', () => {
  it('CJS 的 exports.registerApi 與 ESM 的 default.registerApi 都認得', () => {
    const registerApi = (): void => undefined;

    expect(resolveAppModule({ registerApi })?.registerApi).toBe(registerApi);
    expect(resolveAppModule({ default: { registerApi } })?.registerApi).toBe(registerApi);
    expect(resolveAppModule({ default: { registerApi }, registerApi })).toEqual(
      expect.objectContaining({ registerApi }),
    );
    expect(resolveAppModule({ hello: 'world' })).toBeNull();
    expect(resolveAppModule({ default: {} })).toBeNull();
  });
});
