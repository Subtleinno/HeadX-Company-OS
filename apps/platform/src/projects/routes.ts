import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { canAccessApp } from '@company-os/policy';
import type { AppGrant, TrustedEntry } from '@company-os/contracts';
import { activeGrantsForAgent } from '../agents/store.js';
import type { UserRow } from '../auth/store.js';
import { listActiveForApp, toScope } from '../grants/store.js';
import type { ModuleRegistry } from '../modules/registry/index.js';
import { isProjectUuid, parseCreateProjectInput, parseSubmitBriefInput, validRequestKey } from './schema.js';
import {
  appendBriefVersion,
  claimAgentRun,
  createProject,
  getProjectDetail,
  listProjects,
} from './store.js';

export type ProjectsDeps = {
  pool: Pool;
  registry: ModuleRegistry;
  resolveEntry: (request: FastifyRequest) => TrustedEntry | null;
};

function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function readIdempotencyKey(request: FastifyRequest, reply: FastifyReply): string | null {
  const value = request.headers['idempotency-key'];
  if (!validRequestKey(value)) {
    void reply.code(422).send({
      error: 'invalid_idempotency_key',
      reasons: ['Idempotency-Key 必須是 1 至 100 位英數、點、底線、冒號或連字號'],
    });
    return null;
  }
  return value;
}

function readRequestId(request: FastifyRequest, reply: FastifyReply): string | null {
  const value = request.headers['x-request-id'];
  if (value === undefined) return randomUUID();
  if (!validRequestKey(value)) {
    void reply.code(422).send({ error: 'invalid_request_id' });
    return null;
  }
  return value;
}

function readBrandFilter(request: FastifyRequest, reply: FastifyReply): string | null | undefined {
  const value = (request.query as Record<string, unknown>).brandId;
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !isProjectUuid(value)) {
    void reply.code(422).send({ error: 'invalid_input', field: 'brandId' });
    return null;
  }
  return value;
}

function deny(reply: FastifyReply, reason: string) {
  return reply.code(403).send({ error: 'forbidden', reason });
}

export function registerProjects(app: FastifyInstance, deps: ProjectsDeps): void {
  const designManifest = deps.registry.listModules().find((item) => item.id === 'design');

  if (designManifest === undefined) {
    throw new Error('Project API 需要 design manifest');
  }

  const design = {
    id: designManifest.id,
    exposure: designManifest.exposure,
    enabled: designManifest.available,
  };

  async function humanAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.currentUser;
    if (user === null) {
      await reply.code(401).send({ error: 'not_signed_in' });
      return;
    }

    // 部門指派決定工作入口，app_grant 決定實際 API 權限；兩者都要成立。
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
      appId: row.app_id,
      subjectId: user.id,
      subjectKind: 'human',
      status: 'active',
      unitScope: toScope(row),
    }));
    const decision = canAccessApp({
      identity: {
        kind: 'human',
        id: user.id,
        role: user.role,
        status: user.disabled_at === null ? 'active' : 'disabled',
      },
      app: design,
      entry,
      grants,
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
      appId: row.app_id,
      subjectId: agent.id,
      subjectKind: 'agent',
      status: 'active',
      unitScope: toScope(row),
    }));
    const decision = canAccessApp({
      identity: { kind: 'agent', id: agent.id, status: 'active' },
      app: design,
      entry,
      grants,
      capabilities: { externalEntry: true },
    });

    if (!decision.allowed) await deny(reply, decision.reason ?? 'app_access_denied');
  }

  const human = [app.requireUser, humanAccess];
  const agent = [app.requireAgent, agentAccess];

  app.get('/projects', { preHandler: human }, async (request, reply) => {
    const brandId = readBrandFilter(request, reply);
    if (brandId === null) return;
    return listProjects(deps.pool, brandId);
  });

  app.post('/projects', { preHandler: human }, async (request, reply) => {
    const parsed = parseCreateProjectInput(request.body);
    if (!parsed.ok) return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });

    const key = readIdempotencyKey(request, reply);
    if (key === null) return;
    const actor = request.currentUser as UserRow;
    const result = await createProject(deps.pool, {
      ...parsed.value,
      actorId: actor.id,
      idempotencyKey: key,
      requestHash: requestHash(parsed.value),
    });

    if (result.status === 'brand_not_found') {
      return reply.code(422).send({ error: 'invalid_input', reasons: ['品牌不存在'] });
    }
    if (result.status === 'idempotency_conflict') {
      return reply.code(409).send({ error: 'idempotency_conflict' });
    }

    const project = await getProjectDetail(deps.pool, result.projectId);
    if (project === null) throw new Error('建立 Project 之後讀不到詳情');
    return reply.code(result.created ? 201 : 200).send({ project, created: result.created });
  });

  app.get<{ Params: { id: string } }>(
    '/projects/:id',
    { preHandler: human },
    async (request, reply) => {
      if (!isProjectUuid(request.params.id)) return reply.code(404).send({ error: 'not_found' });
      const project = await getProjectDetail(deps.pool, request.params.id);
      return project === null ? reply.code(404).send({ error: 'not_found' }) : { project };
    },
  );

  app.get('/agent/projects', { preHandler: agent }, async (request, reply) => {
    const brandId = readBrandFilter(request, reply);
    if (brandId === null) return;
    return listProjects(deps.pool, brandId);
  });

  app.get<{ Params: { id: string } }>(
    '/agent/projects/:id',
    { preHandler: agent },
    async (request, reply) => {
      if (!isProjectUuid(request.params.id)) return reply.code(404).send({ error: 'not_found' });
      const project = await getProjectDetail(deps.pool, request.params.id);
      return project === null ? reply.code(404).send({ error: 'not_found' }) : { project };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/agent/projects/:id/claim',
    { preHandler: agent },
    async (request, reply) => {
      if (!isProjectUuid(request.params.id)) return reply.code(404).send({ error: 'not_found' });
      const key = readIdempotencyKey(request, reply);
      if (key === null) return;
      const requestId = readRequestId(request, reply);
      if (requestId === null) return;
      const actor = request.currentAgent;
      if (actor === null) return reply.code(401).send({ error: 'agent_not_authenticated' });

      const result = await claimAgentRun(deps.pool, {
        projectId: request.params.id,
        agentId: actor.id,
        tokenId: actor.tokenId,
        requestId,
        idempotencyKey: key,
        requestHash: requestHash({ projectId: request.params.id }),
      });

      if (result.status === 'project_not_found') return reply.code(404).send({ error: 'not_found' });
      if (result.status === 'idempotency_conflict') {
        return reply.code(409).send({ error: 'idempotency_conflict' });
      }
      return reply.code(result.created ? 201 : 200).send({ run: result.run, created: result.created });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/agent/projects/:id/brief-versions',
    { preHandler: agent },
    async (request, reply) => {
      if (!isProjectUuid(request.params.id)) return reply.code(404).send({ error: 'not_found' });
      const parsed = parseSubmitBriefInput(request.body);
      if (!parsed.ok) return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
      const key = readIdempotencyKey(request, reply);
      if (key === null) return;
      const requestId = readRequestId(request, reply);
      if (requestId === null) return;
      const actor = request.currentAgent;
      if (actor === null) return reply.code(401).send({ error: 'agent_not_authenticated' });

      const result = await appendBriefVersion(deps.pool, {
        projectId: request.params.id,
        ...parsed.value,
        agentId: actor.id,
        tokenId: actor.tokenId,
        requestId,
        idempotencyKey: key,
        requestHash: requestHash({ projectId: request.params.id, ...parsed.value }),
      });

      if (result.status === 'project_not_found' || result.status === 'base_not_found') {
        return reply.code(404).send({ error: 'not_found' });
      }
      if (result.status === 'run_not_found') {
        return reply.code(409).send({ error: 'run_required' });
      }
      if (result.status === 'idempotency_conflict') {
        return reply.code(409).send({ error: 'idempotency_conflict' });
      }
      return reply.code(result.created ? 201 : 200).send({
        brief: result.brief,
        created: result.created,
      });
    },
  );
}
