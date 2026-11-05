import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { TrustedEntry } from '@company-os/contracts';
import type { Pool } from 'pg';
import { getSignedInUser } from '../auth/current-user.js';
import { entryOfRequest } from '../auth/trusted-entry.js';
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
  /**
   * 這次請求由哪個入口進來（issue #87）。預設讀入口守衛放進請求的值。
   * 測試可以注入固定值；正式接線不傳。
   */
  resolveEntry?: (request: FastifyRequest) => TrustedEntry | null;
};

export function registerModules(app: FastifyInstance, deps: ModuleDeps): void {
  const now = deps.now ?? ((): Date => new Date());
  const resolveEntry =
    deps.resolveEntry ?? ((request: FastifyRequest): TrustedEntry | null => entryOfRequest(request));

  app.get('/modules', async (request, reply) => {
    // 入口（issue #87）只可以由守衛放進請求的那一個值取：session 記住了
    // 它是經由哪個入口發出的，入口不同就當成沒有登入。
    const entry = resolveEntry(request);
    const user = entry === null ? null : await getSignedInUser(deps.pool, request, now(), entry);

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
