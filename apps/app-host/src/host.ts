import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { AppContext, AppLog, AppModule } from '@company-os/contracts';
import { AppHostError, type HostConfig } from './config';
import { createAppPool, requireCredentials } from './database';
import { exposureOf, selectApps, type LoadedApp } from './manifests';
import { registerStatic } from './static';

/**
 * 用同一個映像載入 `APP_SET` 指定的 app（決策 C32）。
 *
 * 約定：
 *   - app 的 API 掛在 manifest 的 `route` 前綴之下。
 *   - app 若有建置好的網頁（`dist/web`），在同一條前綴下提供靜態檔案。
 *   - app 的 `dist/index.js` 必須匯出 `registerApi(app, ctx)`；宣告
 *     `needsDatabase: true` 的 app 必須有 `APP_DB_<ID>_USER`／`APP_DB_<ID>_PASSWORD`，
 *     否則拒絕啟動（不會回退用共用帳號）。
 *   - 任何一個 app 載入失敗都是啟動失敗，訊息要帶 app id 與原因。
 */

export type ModuleLoader = (file: string) => Promise<Record<string, unknown>>;

export const defaultModuleLoader: ModuleLoader = async (file) =>
  (await import(pathToFileURL(file).href)) as Record<string, unknown>;

export type BuiltHost = {
  server: FastifyInstance;
  apps: LoadedApp[];
  pools: Pool[];
};

export type BuildHostOptions = {
  config: HostConfig;
  env: NodeJS.ProcessEnv;
  /** 測試可以換掉真正的 import。 */
  loadModule?: ModuleLoader;
  /** 測試可以拿到 host 層的錯誤訊息。 */
  log?: AppLog;
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logFor(appId: string): AppLog {
  return {
    info: (message) => console.log(`[${appId}] ${message}`),
    warn: (message) => console.warn(`[${appId}] ${message}`),
    error: (message) => console.error(`[${appId}] ${message}`),
  };
}

/** 支援 CJS（`exports.registerApi`）與 ESM（`export default { registerApi }`）兩種寫法。 */
export function resolveAppModule(mod: Record<string, unknown>): AppModule<FastifyInstance> | null {
  const candidate =
    typeof mod.registerApi === 'function'
      ? mod
      : typeof (mod.default as Record<string, unknown> | undefined)?.registerApi === 'function'
        ? (mod.default as Record<string, unknown>)
        : null;

  if (candidate === null) {
    return null;
  }

  return candidate as unknown as AppModule<FastifyInstance>;
}

export async function buildHost(options: BuildHostOptions): Promise<BuiltHost> {
  const loadModule = options.loadModule ?? defaultModuleLoader;
  const apps = selectApps(options.config.appIds, options.config.appsDir);
  const server = Fastify({ logger: false });
  const pools: Pool[] = [];

  // 收掉 server 就要收掉連線池，否則關閉後仍有 app 的 handle 留住（測試會掛住）。
  server.addHook('onClose', async () => {
    await Promise.all(pools.map(async (pool) => pool.end()));
  });

  server.get('/livez', async () => ({ ok: true }));

  server.get('/health', async () => ({
    ok: true,
    exposure: exposureOf(apps),
    apps: apps.map((item) => ({
      id: item.manifest.id,
      route: item.manifest.route,
      status: 'ok',
    })),
  }));

  for (const item of apps) {
    const id = item.manifest.id;
    const entry = join(item.dir, 'dist', 'index.js');

    if (!existsSync(entry)) {
      throw new AppHostError(
        `載入 app ${id} 失敗：找不到建置好的 API（apps/${id}/dist/index.js）`,
      );
    }

    let mod: Record<string, unknown>;
    try {
      mod = await loadModule(entry);
    } catch (error) {
      throw new AppHostError(`載入 app ${id} 失敗：${describe(error)}`);
    }

    const exported = resolveAppModule(mod);
    if (exported === null) {
      throw new AppHostError(
        `載入 app ${id} 失敗：apps/${id}/dist/index.js 沒有匯出 registerApi`,
      );
    }

    // 只有 app 自己宣告需要資料庫時才連線；宣告了卻沒有帳號就拒絕啟動。
    let pool: Pool | null = null;
    if (exported.needsDatabase === true) {
      pool = createAppPool(id, options.env, requireCredentials(id, options.env));
      pools.push(pool);
    }

    const ctx: AppContext = { appId: id, log: logFor(id), db: pool };

    try {
      await server.register(
        async (instance) => {
          await exported.registerApi(instance, ctx);
        },
        { prefix: item.manifest.route },
      );
    } catch (error) {
      throw new AppHostError(`載入 app ${id} 失敗：${describe(error)}`);
    }

    const webDir = join(item.dir, 'dist', 'web');
    if (existsSync(webDir)) {
      registerStatic(server, item.manifest.route, webDir);
    }
  }

  options.log?.info(
    apps.length === 0
      ? 'APP_SET 為空：不載入任何 app'
      : `已載入 ${apps.length} 個 app：${apps.map((item) => item.manifest.id).join('、')}`,
  );

  return { server, apps, pools };
}
