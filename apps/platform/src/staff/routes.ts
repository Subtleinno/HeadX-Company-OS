import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { hashPassword } from '../auth/password.js';
import { HashBusyError, type HashRun } from '../auth/hash-limits.js';
import {
  isValidUuid,
  parseCreateStaffInput,
  parsePageQuery,
} from './schema.js';
import {
  createStaffAccount,
  disableStaffAccount,
  listStaffAccounts,
  toStaffView,
} from './store.js';

/**
 * 員工帳戶管理 API（issue #84）。只有已驗證的人類老闆可以用。
 *
 * 這一組路由刻意很窄：建立、列表、停用。沒有改角色、沒有改 email、沒有搬部門、
 * 沒有刪除 —— 每一樣都可以之後再加，但一旦現在有了，就會有人用它繞過
 * 「不可以建立第二個 owner」這條線。
 */

export type StaffDeps = {
  pool: Pool;
  /** 與 auth 共用的同一個雜湊限制器。 */
  hashRun: HashRun;
  now?: () => Date;
};

function sendBusy(reply: FastifyReply, error: HashBusyError): FastifyReply {
  reply.header('retry-after', String(error.retryAfterSeconds));
  return reply.code(503).send({ error: 'service_busy' });
}

export function registerStaff(app: FastifyInstance, deps: StaffDeps): void {
  const now = deps.now ?? ((): Date => new Date());

  app.post('/staff', { preHandler: app.requireOwner }, async (request, reply) => {
    const parsed = parseCreateStaffInput(request.body);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
    }

    const input = parsed.value;
    let passwordHash: string;

    try {
      passwordHash = await deps.hashRun(() => hashPassword(input.initialPassword));
    } catch (error) {
      if (error instanceof HashBusyError) {
        return sendBusy(reply, error);
      }

      throw error;
    }

    const actor = request.currentUser;

    if (actor === null) {
      // preHandler 已經擋過；這一句只是令型別說得通，不會真的走到。
      return reply.code(401).send({ error: 'not_signed_in' });
    }

    const result = await createStaffAccount(deps.pool, {
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      actorId: actor.id,
    });

    if (result.status === 'duplicate_email') {
      return reply.code(409).send({ error: 'duplicate_email' });
    }

    return reply.code(201).send({ staff: result.staff });
  });

  app.get('/staff', { preHandler: app.requireOwner }, async (request, reply) => {
    const parsed = parsePageQuery(request.query);

    if (parsed.errors.length > 0 || parsed.value === undefined) {
      return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
    }

    const { rows, total } = await listStaffAccounts(deps.pool, parsed.value);

    return { staff: rows.map(toStaffView), total };
  });

  app.post<{ Params: { id: string } }>(
    '/staff/:id/disable',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const actor = request.currentUser;

      if (actor === null) {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      const result = await disableStaffAccount(deps.pool, {
        id: request.params.id,
        actorId: actor.id,
        now: now(),
      });

      if (result.status === 'not_found') {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (result.status === 'owner_protected') {
        return reply.code(409).send({ error: 'owner_protected' });
      }

      if (result.status === 'already_disabled') {
        return reply.code(409).send({ error: 'already_disabled' });
      }

      return { staff: result.staff };
    },
  );
}
