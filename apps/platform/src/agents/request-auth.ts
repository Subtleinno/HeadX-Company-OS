import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { findAgentByHttpToken, type AgentRequestIdentity } from './store.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** 只接受有效 agent Bearer token；不會退化成 cookie 或 body 自報身份。 */
    requireAgent: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    currentAgent: AgentRequestIdentity | null;
  }
}

export function bearerToken(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || value.includes(',')) return null;
  const matched = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  return matched?.[1] ?? null;
}

export function registerAgentRequestAuth(
  app: FastifyInstance,
  deps: { pool: Pool; now: () => Date },
): void {
  app.decorateRequest('currentAgent', null);

  app.decorate(
    'requireAgent',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const token = bearerToken(request);
      const agent = token === null ? null : await findAgentByHttpToken(deps.pool, token, deps.now());

      if (agent === null) {
        await reply.code(401).send({ error: 'agent_not_authenticated' });
        return;
      }

      request.currentAgent = agent;
    },
  );
}
