import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { canAccessApp } from '@company-os/policy';
import type { AppGrant, TrustedEntry } from '@company-os/contracts';
import { activeGrantsForAgent } from '../agents/store.js';
import { listActiveForApp, toScope } from '../grants/store.js';
import type { ModuleRegistry } from '../modules/registry/index.js';

export type DesignAccessDeps = {
  pool: Pool;
  registry: ModuleRegistry;
  resolveEntry: (request: FastifyRequest) => TrustedEntry | null;
};

function deny(reply: FastifyReply, reason: string) {
  return reply.code(403).send({ error: 'forbidden', reason });
}

/** 所有 Marketing Design HTTP／MCP adapter 共用同一次身份與 app policy 判斷。 */
export function createDesignAccess(app: FastifyInstance, deps: DesignAccessDeps) {
  const manifest = deps.registry.listModules().find((item) => item.id === 'design');
  if (manifest === undefined) throw new Error('Design API 需要 design manifest');
  const design = { id: manifest.id, exposure: manifest.exposure, enabled: manifest.available };

  async function humanAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.currentUser;
    if (user === null) {
      await reply.code(401).send({ error: 'not_signed_in' });
      return;
    }
    if (user.role !== 'owner' && user.department !== 'design') {
      await deny(reply, 'not_design_staff');
      return;
    }
    const entry = deps.resolveEntry(request);
    if (entry === null) {
      await deny(reply, 'entry_untrusted');
      return;
    }
    const rows = await listActiveForApp(deps.pool, { userId: user.id, appId: 'design' });
    const grants: AppGrant[] = rows.map((row) => ({
      appId: row.app_id, subjectId: user.id, subjectKind: 'human', status: 'active', unitScope: toScope(row),
    }));
    const decision = canAccessApp({
      identity: { kind: 'human', id: user.id, role: user.role, status: user.disabled_at === null ? 'active' : 'disabled' },
      app: design, entry, grants,
    });
    if (!decision.allowed) await deny(reply, decision.reason ?? 'app_access_denied');
  }

  async function agentAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const agent = request.currentAgent;
    if (agent === null) {
      await reply.code(401).send({ error: 'agent_not_authenticated' });
      return;
    }
    const entry = deps.resolveEntry(request);
    if (entry === null) {
      await deny(reply, 'entry_untrusted');
      return;
    }
    const rows = await activeGrantsForAgent(deps.pool, agent.id);
    const grants: AppGrant[] = rows.map((row) => ({
      appId: row.app_id, subjectId: agent.id, subjectKind: 'agent', status: 'active', unitScope: toScope(row),
    }));
    const decision = canAccessApp({
      identity: { kind: 'agent', id: agent.id, status: 'active' }, app: design, entry, grants,
      capabilities: { externalEntry: true },
    });
    if (!decision.allowed) await deny(reply, decision.reason ?? 'app_access_denied');
  }

  return { human: [app.requireUser, humanAccess], agent: [app.requireAgent, agentAccess] };
}
