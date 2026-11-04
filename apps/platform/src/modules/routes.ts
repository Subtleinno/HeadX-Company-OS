import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { getSignedInUser } from '../auth/current-user.js';
import type { ModuleKind, ModuleManifest, ModuleRegistry } from './registry/index.js';

/**
 * GET /modules：誰見到哪些模組。
 *
 * 老闆見全部（含老闆台）；員工只見到自己部門的那一個。
 * 回應只有 manifest 的六個欄位，不回傳檔案路徑 —— 路徑是伺服器的實作細節。
 *
 * R4 之後 manifest 多了 route、exposure、sensitive，但這一支的回應刻意不變：
 * 對外欄位在這裡逐個列出才輸出（白名單，不是黑名單），所以將來 manifest 再加
 * 欄位也不會靜靜漏出去。route 與 exposure 怎樣影響授權，是之後 S1-07 的工作。
 */

/** 對外公開的六個欄位。manifest 其他欄位一律不出現在回應裡。 */
export type PublicModule = {
  id: string;
  title: string;
  kind: ModuleKind;
  department: string | null;
  order: number;
  available: boolean;
};

/** 逐個欄位抄出來，不是 spread —— spread 會把新欄位一併帶出去。 */
export function toPublicModule(module: ModuleManifest): PublicModule {
  return {
    id: module.id,
    title: module.title,
    kind: module.kind,
    department: module.department,
    order: module.order,
    available: module.available,
  };
}

export type ModuleDeps = {
  registry: ModuleRegistry;
  pool: Pool;
  now?: () => Date;
};

export function registerModules(app: FastifyInstance, deps: ModuleDeps): void {
  const now = deps.now ?? ((): Date => new Date());

  app.get('/modules', async (request, reply) => {
    const user = await getSignedInUser(deps.pool, request, now());

    if (user === null) {
      return reply.code(401).send({ error: 'not_signed_in' });
    }

    if (user.role === 'owner') {
      return { modules: deps.registry.listModules().map(toPublicModule) };
    }

    // 員工沒有部門（或部門沒有對應模組）就是空清單，不會見到別人的模組。
    const modules = deps.registry
      .listModules()
      .filter((item) => item.kind === 'department' && item.department === user.department)
      .map(toPublicModule);

    return { modules };
  });
}
