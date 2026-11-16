import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { TrustedEntry } from '@company-os/contracts';
import { canAccessApp } from '@company-os/policy';
import type { AppGrant, GrantStatus } from '@company-os/contracts';
import type { ModuleRegistry } from '../modules/registry/index.js';
import { parsePageQuery } from '../pagination.js';
import {
  isValidUuid,
  parseAgentGrantInput,
  parseCreateAgentInput,
  parseRevokeInput,
} from './schema.js';
import {
  activeGrantsForAgent,
  createActiveAgentGrant,
  createAgentAccount,
  disableAgentAccount,
  findAgent,
  issueAgentHttpToken,
  listAgentGrants,
  listAgentHttpTokens,
  listAgents,
  revokeAgentGrant,
  revokeAgentHttpToken,
  toAgentView,
} from './store.js';
import { registerAgentRequestAuth } from './request-auth.js';
import { toGrantView } from '../grants/store.js';

/**
 * agent 身份與 agent 授權 API（issue #84）。全部只有已驗證的人類老闆可以用。
 *
 * 這裡的人類管理路由只有老闆可用。外部 agent 的業務入口則用 request-scoped
 * Bearer token；明文只在簽發時回一次，資料庫只存 hash，agent 永遠沒有密碼。
 *
 * 存取判斷一定經 #82 的引擎，不在這裡另寫一套 —— 停用、未啟用 app、
 * 入口不符等情況都由引擎回答，這一層只負責把快照讀齊。
 */

export type AgentsDeps = {
  pool: Pool;
  registry: ModuleRegistry;
  /** 由可信 adapter 判定入口；返回 null 代表無法確認。 */
  resolveEntry: (request: unknown) => TrustedEntry | null;
  now?: () => Date;
};

/** #83 的狀態對應 #82 契約的 GrantStatus。approved 未生效，所以是 pending。 */
function toGrantStatus(state: string): GrantStatus {
  if (state === 'active') {
    return 'active';
  }

  if (state === 'requested' || state === 'approved') {
    return 'pending';
  }

  if (state === 'revoked') {
    return 'revoked';
  }

  return 'expired';
}

function parseExpiryHours(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>).expiresInHours;
  if (value === undefined) return 720;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8760
    ? value
    : null;
}

export function registerAgents(app: FastifyInstance, deps: AgentsDeps): void {
  const now = deps.now ?? ((): Date => new Date());
  registerAgentRequestAuth(app, { pool: deps.pool, now });

  app.post('/agents', { preHandler: app.requireOwner }, async (request, reply) => {
    const parsed = parseCreateAgentInput(request.body);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
    }

    const actor = request.currentUser;

    if (actor === null) {
      return reply.code(401).send({ error: 'not_signed_in' });
    }

    const result = await createAgentAccount(deps.pool, {
      name: parsed.value.name,
      actorId: actor.id,
    });

    if (result.status === 'duplicate_name') {
      return reply.code(409).send({ error: 'duplicate_name' });
    }

    return reply.code(201).send({ agent: result.agent });
  });

  app.get('/agents', { preHandler: app.requireOwner }, async (request, reply) => {
    const parsed = parsePageQuery(request.query);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
    }

    const { rows, total } = await listAgents(deps.pool, parsed.value);

    return { agents: rows.map(toAgentView), total };
  });

  app.post<{ Params: { id: string } }>(
    '/agents/:id/http-tokens',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const hours = parseExpiryHours(request.body);
      if (hours === null) {
        return reply.code(422).send({
          error: 'invalid_input',
          reasons: ['expiresInHours 必須是 1 至 8760 的整數'],
        });
      }

      const actor = request.currentUser;
      if (actor === null) return reply.code(401).send({ error: 'not_signed_in' });

      const at = now();
      const result = await issueAgentHttpToken(deps.pool, {
        agentId: request.params.id,
        actorId: actor.id,
        now: at,
        expiresAt: new Date(at.getTime() + hours * 60 * 60 * 1000),
      });

      if (result.status === 'agent_not_found') return reply.code(404).send({ error: 'not_found' });
      if (result.status === 'agent_disabled') return reply.code(409).send({ error: 'agent_disabled' });

      // 這是明文唯一一次離開伺服器的地方；list／audit 永不回 token 或 hash。
      return reply.code(201).send({ token: result.token, credential: result.credential });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/agents/:id/http-tokens',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const agent = await findAgent(deps.pool, request.params.id);
      if (agent === null) return reply.code(404).send({ error: 'not_found' });

      return { tokens: await listAgentHttpTokens(deps.pool, agent.id) };
    },
  );

  app.post<{ Params: { id: string; tokenId: string } }>(
    '/agents/:id/http-tokens/:tokenId/revoke',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id) || !isValidUuid(request.params.tokenId)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const actor = request.currentUser;
      if (actor === null) return reply.code(401).send({ error: 'not_signed_in' });

      const result = await revokeAgentHttpToken(deps.pool, {
        agentId: request.params.id,
        tokenId: request.params.tokenId,
        actorId: actor.id,
        now: now(),
      });

      if (result.status === 'not_found') return reply.code(404).send({ error: 'not_found' });
      if (result.status === 'already_revoked') {
        return reply.code(409).send({ error: 'already_revoked' });
      }

      return { credential: result.credential };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/agents/:id/disable',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const actor = request.currentUser;

      if (actor === null) {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      const result = await disableAgentAccount(deps.pool, {
        id: request.params.id,
        actorId: actor.id,
        now: now(),
      });

      if (result.status === 'not_found') {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (result.status === 'already_disabled') {
        return reply.code(409).send({ error: 'already_disabled' });
      }

      return { agent: result.agent };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/agents/:id/grants',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const parsed = parsePageQuery(request.query);

      if (parsed.errors.length > 0 || parsed.value === undefined) {
        return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
      }

      const agent = await findAgent(deps.pool, request.params.id);

      if (agent === null) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const { rows, total } = await listAgentGrants(deps.pool, {
        agentId: agent.id,
        ...parsed.value,
      });

      return { grants: rows.map(toGrantView), total };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/agents/:id/grants',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const parsed = parseAgentGrantInput(request.body);

      if (parsed.errors.length > 0 || parsed.value === undefined) {
        return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
      }

      const actor = request.currentUser;

      if (actor === null) {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      const manifest = deps.registry.listModules().find((item) => item.id === parsed.value?.appId);

      if (manifest === undefined) {
        return reply.code(422).send({ error: 'invalid_input', reasons: ['appId 不在 app 清單'] });
      }

      const result = await createActiveAgentGrant(deps.pool, {
        agentId: request.params.id,
        appId: parsed.value.appId,
        role: parsed.value.role,
        scope: parsed.value.scope,
        actorId: actor.id,
      });

      if (result.status === 'agent_not_found') {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (result.status === 'agent_disabled') {
        return reply.code(409).send({ error: 'agent_disabled' });
      }

      if (result.status === 'unknown_unit') {
        return reply.code(422).send({ error: 'invalid_input', reasons: ['scope 有單位不存在'] });
      }

      if (result.status === 'duplicate') {
        return reply.code(409).send({ error: 'duplicate_grant' });
      }

      return reply.code(201).send({ grant: result.grant });
    },
  );

  app.post<{ Params: { id: string; grantId: string } }>(
    '/agents/:id/grants/:grantId/revoke',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id) || !isValidUuid(request.params.grantId)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const parsed = parseRevokeInput(request.body);

      if (parsed.errors.length > 0 || parsed.value === undefined) {
        return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
      }

      const actor = request.currentUser;

      if (actor === null) {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      const result = await revokeAgentGrant(deps.pool, {
        agentId: request.params.id,
        grantId: request.params.grantId,
        version: parsed.value.version,
        ...(parsed.value.reason === undefined ? {} : { reason: parsed.value.reason }),
        actorId: actor.id,
      });

      if (result.status === 'not_found') {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (result.status === 'conflict') {
        return reply.code(409).send({ error: 'conflict' });
      }

      return { grant: result.grant };
    },
  );

  app.get<{ Params: { id: string; appId: string } }>(
    '/agents/:id/access/:appId',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const agent = await findAgent(deps.pool, request.params.id);

      if (agent === null) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const manifest = deps.registry
        .listModules()
        .find((item) => item.id === request.params.appId);

      if (manifest === undefined) {
        return reply.code(404).send({ error: 'app_not_found' });
      }

      const entry = deps.resolveEntry(request);

      if (entry === null) {
        // 入口不可信：不猜、不假設 internal。#82 的引擎會回 entry_invalid。
        return reply.code(403).send({ allowed: false, reason: 'entry_invalid' });
      }

      const rows = await activeGrantsForAgent(deps.pool, agent.id);

      const grants: AppGrant[] = rows.map((row) => ({
        appId: row.app_id,
        subjectId: agent.id,
        subjectKind: 'agent',
        status: toGrantStatus(row.state),
        unitScope: row.scope_kind === 'all' ? { kind: 'all' } : { kind: row.scope_kind, unitIds: row.scope_unit_ids },
      }));

      const decision = canAccessApp({
        identity: {
          kind: 'agent',
          id: agent.id,
          status: agent.disabled_at === null ? 'active' : 'disabled',
        },
        app: { id: manifest.id, exposure: manifest.exposure, enabled: manifest.available },
        entry,
        grants,
        capabilities: { externalEntry: true },
      });

      return decision.allowed
        ? { allowed: true, via: decision.via }
        : { allowed: false, reason: decision.reason };
    },
  );
}
