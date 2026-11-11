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
  parseDepartmentInput,
  parsePageQuery,
  parseResetPasswordInput,
} from './schema.js';
import {
  createStaffAccount,
  disableStaffAccount,
  enableStaffAccount,
  listStaffAccounts,
  resetStaffPassword,
  setStaffDepartment,
  toStaffView,
  type StaffHooks,
} from './store.js';
import type { ModuleRegistry } from '../modules/registry/index.js';

/**
 * 員工帳戶管理 API（issue #84）。只有已驗證的人類老闆可以用。
 *
 * 這一組路由刻意很窄：建立、列表、停用、恢復、重設密碼、指派部門。
 * 仍然沒有改角色、沒有改 email、沒有刪除 —— 每一樣都可以之後再加，但一旦
 * 現在有了，就會有人用它繞過「不可以建立第二個 owner」這條線。
 *
 * 停用與恢復（issue #30）是一對，兩者都不動授權列：授權是歷史，
 * 能不能用是身份問題，兩件事不應該互相刪除。
 */

export type StaffDeps = {
  pool: Pool;
  /** 與 auth 共用的同一個雜湊限制器。 */
  hashRun: HashRun;
  /**
   * 部門清單的唯一來源（issue #12）。不另設一份部門常數：
   * 多一份清單，就多一個「改了 manifest 但這裡沒有改」的機會。
   */
  registry: ModuleRegistry;
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

    // 部門 key 要存在於 registry（manifest 是唯一來源，同 PATCH 那條）。
    // 放在雜湊之前：一個打錯的部門名不應該先燒一次 scrypt 才知道錯。
    if (input.department !== null && !deps.registry.departmentKeys().includes(input.department)) {
      return reply.code(400).send({ error: 'unknown_department' });
    }

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
      department: input.department,
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

  /**
   * 指派員工部門（issue #12）。
   *
   * 三步檢查，次序有意義：
   *   1. 形狀（422）：body 只有 department，值是字串或 null。
   *   2. 存在（400 unknown_department）：值必須是 registry 現有的部門。
   *      這樣「打錯字」與「未指派的 null」在回應上分得開，畫面才講得出真話。
   *   3. 目標（404／400 owner_protected）：由 store 在同一個交易內判斷。
   */
  app.patch<{ Params: { id: string } }>(
    '/staff/:id/department',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const parsed = parseDepartmentInput(request.body);

      if (parsed.errors.length > 0 || parsed.value === undefined) {
        return reply.code(422).send({ error: 'invalid_input', reasons: parsed.errors });
      }

      const department = parsed.value.department;

      if (department !== null && !deps.registry.departmentKeys().includes(department)) {
        return reply.code(400).send({ error: 'unknown_department', department });
      }

      const actor = request.currentUser;

      if (actor === null) {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      const result = await setStaffDepartment(deps.pool, {
        id: request.params.id,
        department,
        actorId: actor.id,
      });

      if (result.status === 'not_found') {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (result.status === 'owner_protected') {
        return reply.code(400).send({ error: 'owner_protected' });
      }

      return { staff: result.staff };
    },
  );

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
   * 恢復被停用的員工（issue #30）。
   *
   * 這是 `POST /staff/:id/disable` 的逆操作，刻意同樣窄：不接受任何 body，
   * 不可以順便改部門或密碼。老闆要恢復一個人，就是「讓他可以再用原本的密碼
   * 登入」這一件事；順便做的每一件事都會令審計紀錄講不清是誰做的。
   *
   * 不用 404 假裝不存在、也不用 409 講「狀態不對」以外的東西 —— 三種失敗
   * 各有自己的原因，畫面才講得出真話。
   */
  app.post<{ Params: { id: string } }>(
    '/staff/:id/enable',
    { preHandler: app.requireOwner },
    async (request, reply) => {
      if (!isValidUuid(request.params.id)) {
        return reply.code(422).send({ error: 'invalid_input', field: 'id' });
      }

      const actor = request.currentUser;

      if (actor === null) {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      const result = await enableStaffAccount(deps.pool, {
        id: request.params.id,
        actorId: actor.id,
      });

      if (result.status === 'not_found') {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (result.status === 'owner_protected') {
        return reply.code(409).send({ error: 'owner_protected' });
      }

      if (result.status === 'not_disabled') {
        return reply.code(409).send({ error: 'not_disabled' });
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
