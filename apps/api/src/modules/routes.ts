import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { getSignedInUser } from '../auth/current-user.js';
import type { ModuleRegistry } from './registry.js';

/**
 * GET /modules：誰見到哪些模組。
 *
 * 老闆見全部（含老闆台）；員工只見到自己部門的那一個。
 * 回應只有 manifest 的六個欄位，不回傳檔案路徑 —— 路徑是伺服器的實作細節。
 */
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
      return { modules: deps.registry.listModules() };
    }

    // 員工沒有部門（或部門沒有對應模組）就是空清單，不會見到別人的模組。
    const modules = deps.registry
      .listModules()
      .filter((item) => item.kind === 'department' && item.department === user.department);

    return { modules };
  });
}
