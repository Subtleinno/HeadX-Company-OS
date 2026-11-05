import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { HashBusyError, type HashRun } from '../auth/hash-limits.js';
import {
  checkPasswordThrottle,
  PASSWORD_FAILURE_ACTIONS,
  recordPasswordFailure,
} from '../auth/password-throttle.js';
import {
  isValidUuid,
  parseCreateStaffInput,
  parsePageQuery,
  parseResetPasswordInput,
} from './schema.js';
import {
  createStaffAccount,
  disableStaffAccount,
  listStaffAccounts,
  resetStaffPassword,
  toStaffView,
  type StaffHooks,
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
  /** 測試專用的併發鉤子；正式路徑不傳。 */
  hooks?: StaffHooks;
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

  /**
   * 老闆重設員工密碼（issue #86）。
   *
   * 這條路由是「帳戶救回」的唯一入口，所以有兩個不可以省的手續：
   *   1. 老闆要重新輸入自己的密碼 —— 一個被遺留在公共電腦上的 session
   *      不應該可以直接改掉另一個人的密碼。前端旗標不算，這裡真的驗。
   *   2. 目標一律設回 must_change_password = true，並且撤銷全部 session。
   *      臨時密碼只是「一次性入場券」，不是新密碼。
   *
   * 不會做的事：不開 session 給目標、不回傳臨時密碼、不自動寄出、
   * 不把停用的帳戶恢復。
   */
  app.post<{ Params: { id: string } }>(
    '/staff/:id/reset-password',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const parsed = parseResetPasswordInput(request.body);

      if (parsed.errors.length > 0 || parsed.value === undefined) {
        return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
      }

      const input = parsed.value;

      const actor = request.currentUser;

      if (actor === null) {
        // preHandler 已經擋過；這一句只是令型別說得通，不會真的走到。
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      const at = now();

      // 同一個「錯老闆密碼」的節流：這是可以在線猜的另一個入口。
      const throttle = await checkPasswordThrottle(
        deps.pool,
        PASSWORD_FAILURE_ACTIONS.reset,
        actor.id,
        at,
      );

      if (throttle.locked) {
        reply.header('retry-after', String(throttle.retryAfterSeconds));
        return reply.code(429).send({ error: 'too_many_attempts' });
      }

      let ownerMatches: boolean;

      try {
        ownerMatches = await deps.hashRun(() =>
          verifyPassword(input.ownerPassword, actor.password_hash),
        );
      } catch (error) {
        if (error instanceof HashBusyError) {
          return sendBusy(reply, error);
        }

        throw error;
      }

      if (!ownerMatches) {
        await recordPasswordFailure(deps.pool, PASSWORD_FAILURE_ACTIONS.reset, actor.id);

        // 通用錯誤：不講目標帳戶是否存在，也不講是哪一步不對。
        return reply.code(403).send({ error: 'invalid_owner_password' });
      }

      let passwordHash: string;

      try {
        passwordHash = await deps.hashRun(() =>
          hashPassword(input.newTemporaryPassword),
        );
      } catch (error) {
        if (error instanceof HashBusyError) {
          return sendBusy(reply, error);
        }

        throw error;
      }

      if (deps.hooks?.afterOwnerVerified !== undefined) {
        await deps.hooks.afterOwnerVerified();
      }

      const result = await resetStaffPassword(deps.pool, {
        id: request.params.id,
        actorId: actor.id,
        expectedOwnerHash: actor.password_hash,
        passwordHash,
        now: at,
      });

      if (result.status === 'actor_missing') {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      if (result.status === 'stale_credentials') {
        // 老闆在請求途中換了密碼：剛剛驗證的那一串已經不是現行憑證。
        return reply.code(409).send({ error: 'stale_credentials' });
      }

      if (result.status === 'not_found') {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (result.status === 'owner_protected') {
        return reply.code(409).send({ error: 'owner_protected' });
      }

      return { staff: result.staff };
    },
  );
}
