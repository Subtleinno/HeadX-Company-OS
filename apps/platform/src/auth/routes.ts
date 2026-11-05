import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TrustedEntry } from '@company-os/contracts';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { getSignedInUser } from './current-user.js';
import { entryOfRequest, UNTRUSTED_ENTRY_ERROR } from './trusted-entry.js';
import { isValidEmail, normalizeEmail } from './email.js';
import { HashBusyError, type HashRun } from './hash-limits.js';
import { loginFailureTarget, readLoginHashKey } from './login-hash.js';
import {
  hashPassword,
  needsRehash,
  parsePasswordHash,
  validatePassword,
  verifyPassword,
} from './password.js';
import {
  checkPasswordThrottle,
  PASSWORD_FAILURE_ACTIONS,
  recordPasswordFailure,
} from './password-throttle.js';
import { evaluateLockout, loginWindowStart } from './rate-limit.js';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  readSessionToken,
  SESSION_TTL_MS,
} from './session-cookie.js';
import { createSessionToken, hashSessionToken } from './token.js';
import {
  changePasswordWithSession,
  countFailedAttempts,
  createOwnerWithSession,
  findUserByEmail,
  hasOwner,
  insertSessionForEnabledUser,
  revokeSession,
  toPublicUser,
  updatePasswordHash,
  type SetupHooks,
  type UserRow,
} from './store.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** 任何已登入的人：未登入 401。 */
    requireUser: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 只准老闆通過：未登入 401，角色不夠 403。 */
    requireOwner: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    /** requireUser／requireOwner 通過後才會有值。 */
    currentUser: UserRow | null;
  }
}

export type AuthDeps = {
  pool: Pool;
  /** 注入時鐘：審計表的紀錄改不了，測試靠這個推過 15 分鐘窗口。 */
  now?: () => Date;
  /** 經 HTTPS 入口時設 true。 */
  cookieSecure?: boolean;
  sessionTtlMs?: number;
  /** 測試專用：讓兩個併發 setup 真的重疊，正式路徑不傳。 */
  setupHooks?: SetupHooks;
  /**
   * 登入失敗審計用的 HMAC key（issue #65）。
   * 沒有它就只能把使用者輸入的 email 明文寫進只准追加的 audit_log，
   * 所以這裡刻意不給預設值：未設定就拋錯，服務不會啟動。
   */
  loginHashKey: string;
  /**
   * 密碼雜湊的有界資源限制（issue #84）。
   * 所有用到 scrypt 的流程都要經這一個函數，所以佢由外面注入：auth、staff、
   * agents 三個模組收到同一個實例，才叫做「同一個資源限制」。
   */
  hashRun?: HashRun;
  /**
   * 這次請求由哪個入口進來（issue #87）。
   *
   * 預設讀入口守衛放進請求的值。測試可以注入固定值（例如 `() => 'internal'`），
   * 但正式接線永遠不傳 —— 沒有「自動當成 internal」這條後路。
   */
  resolveEntry?: (request: FastifyRequest) => TrustedEntry | null;
};

/**
 * 不存在的 email 也要跑一次真的 scrypt，否則回應時間會透露帳戶是否存在。
 * 這個雜湊只為計時而存在，不對應任何帳戶，也不必每次重算。
 */
let timingHash: Promise<string> | undefined;

function dummyPasswordHash(): Promise<string> {
  timingHash ??= hashPassword('timing-equaliser-not-a-real-password');
  return timingHash;
}

function readString(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null) {
    return '';
  }

  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function registerAuth(app: FastifyInstance, deps: AuthDeps): void {
  // 未設定就在接線時失敗，不要等到第一個登入失敗、audit_log 出現明文之後才發現。
  const loginHashKey = readLoginHashKey(deps.loginHashKey);

  const now = deps.now ?? ((): Date => new Date());
  const cookieSecure = deps.cookieSecure ?? false;
  const sessionTtlMs = deps.sessionTtlMs ?? SESSION_TTL_MS;
  // 未注入時直接執行：單元測試不需要限制器，但仍然只有一條呼叫路徑。
  const hashRun: HashRun = deps.hashRun ?? (<T>(task: () => Promise<T>): Promise<T> => task());

  /**
   * 這次請求的入口。守衛未通過（或者根本未接線）就係 `null`。
   * 入口係「session 要綁乜」與「policy 要憑乜」的同一個來源。
   */
  const resolveEntry =
    deps.resolveEntry ?? ((request: FastifyRequest): TrustedEntry | null => entryOfRequest(request));

  /** 沒有可信入口：與守衛同一個通用回應，不講差在哪裡。 */
  function untrustedEntry(reply: FastifyReply): FastifyReply {
    return reply.code(403).send({
      error: UNTRUSTED_ENTRY_ERROR,
      message: '這個請求不是經由可信的內部入口轉發過來，一律拒絕',
    });
  }

  /** 雜湊滿載：回通用的 503，不透露是哪一個帳戶令我們忙。 */
  function busy(reply: FastifyReply, error: HashBusyError): FastifyReply {
    reply.header('retry-after', String(error.retryAfterSeconds));
    return reply.code(503).send({ error: 'service_busy' });
  }

  function sessionExpiry(at: Date): Date {
    return new Date(at.getTime() + sessionTtlMs);
  }

  /** PostgreSQL 的 SQLSTATE（例如 42501）。不是訊息本文，不含任何敏感內容。 */
  function sqlStateOf(error: unknown): string | null {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }

  /**
   * 升級失敗要留痕，但「留痕」本身不可以令登入失敗。
   * 只記原因與 SQLSTATE，不記密碼、salt、雜湊或資料庫原始訊息。
   */
  async function recordUpgradeFailure(
    userId: string,
    reason: 'hash_failed' | 'update_failed',
    sqlState: string | null,
  ): Promise<void> {
    try {
      await writeAudit(deps.pool, {
        actorType: 'system',
        actorId: 'password-upgrade',
        action: 'auth.password_upgrade_failed',
        target: userId,
        detail: sqlState === null ? { reason } : { reason, sqlState },
      });
    } catch {
      // 連審計都寫不進去：至少令它在進程輸出裡看得見，但仍然不影響登入。
      console.error(
        JSON.stringify({ event: 'password_upgrade_failed', reason: 'audit_unavailable' }),
      );
    }
  }

  /**
   * 舊參數的密碼登入成功後，用新參數與**新 salt** 重新雜湊並寫回（issue #66）。
   *
   * 任何一步失敗都不阻止本次登入 —— 用戶剛剛證明自己是本人，不應該因為
   * 一次寫入失敗而被擋在門外。失敗會寫一列審計，下次登入再試。
   */
  async function upgradePasswordHash(user: UserRow, password: string): Promise<void> {
    let parts;

    try {
      parts = parsePasswordHash(user.password_hash);
    } catch {
      // 雜湊本身讀不懂：此刻它在 verifyPassword 已經回 false，走不到這裡。
      return;
    }

    if (!needsRehash(parts)) {
      return;
    }

    let passwordHash: string;

    try {
      passwordHash = await hashRun(() => hashPassword(password));
    } catch (error) {
      // 名額滿：放棄一次「升級雜湊」而已，用戶剛剛證明是本人，不要因此被擋。
      if (error instanceof HashBusyError) {
        return;
      }

      await recordUpgradeFailure(user.id, 'hash_failed', null);
      return;
    }

    try {
      // 條件更新：只有資料庫裡仍然是登入時讀到的那一串才會寫入。
      await updatePasswordHash(deps.pool, {
        userId: user.id,
        expectedHash: user.password_hash,
        passwordHash,
      });
    } catch (error) {
      await recordUpgradeFailure(user.id, 'update_failed', sqlStateOf(error));
    }
  }

  async function currentUser(request: FastifyRequest): Promise<UserRow | null> {
    const entry = resolveEntry(request);

    // 沒有可信入口就連查都不查：無入口的請求不應該有能力「順便」用到 session。
    if (entry === null) {
      return null;
    }

    return getSignedInUser(deps.pool, request, now(), entry);
  }

  app.get('/auth/state', async (request) => {
    const [setupRequired, user] = await Promise.all([
      hasOwner(deps.pool).then((owner) => !owner),
      currentUser(request),
    ]);

    if (user === null) {
      return { setupRequired, signedIn: false };
    }

    return { setupRequired, signedIn: true, user: toPublicUser(user) };
  });

  app.post('/auth/setup', async (request, reply) => {
    const displayName = readString(request.body, 'displayName').trim();
    const rawEmail = readString(request.body, 'email');
    const password = readString(request.body, 'password');

    if (displayName === '') {
      return reply.code(400).send({ error: 'invalid_input', field: 'displayName' });
    }

    if (!isValidEmail(rawEmail)) {
      return reply.code(400).send({ error: 'invalid_input', field: 'email' });
    }

    if (validatePassword(password) !== null) {
      return reply.code(400).send({ error: 'invalid_input', field: 'password' });
    }

    const email = normalizeEmail(rawEmail);
    const at = now();

    // 雜湊在交易之外做：scrypt 要幾十毫秒，不應該佔著首次開機的鎖。
    let passwordHash: string;

    try {
      passwordHash = await hashRun(() => hashPassword(password));
    } catch (error) {
      if (error instanceof HashBusyError) {
        return busy(reply, error);
      }

      throw error;
    }

    // 第一個 session 一樣要綁入口：可信入口是「由邊個轉發」的憑證，
    // 不是「你係邊個」。冇入口就冇 session，唔會開一個無主的。
    const entry = resolveEntry(request);

    if (entry === null) {
      return untrustedEntry(reply);
    }

    const token = createSessionToken();

    const result = await createOwnerWithSession(
      deps.pool,
      {
        email,
        displayName,
        passwordHash,
        tokenHash: hashSessionToken(token),
        expiresAt: sessionExpiry(at),
        entry,
      },
      deps.setupHooks,
    );

    if (result.status === 'already_set_up') {
      return reply.code(409).send({ error: 'already_set_up' });
    }

    reply.header('set-cookie', buildSessionCookie(token, { secure: cookieSecure }));

    return reply.code(201).send({ user: result.user });
  });

  app.post('/auth/login', async (request, reply) => {
    const rawEmail = readString(request.body, 'email');
    const password = readString(request.body, 'password');

    if (!isValidEmail(rawEmail) || password === '') {
      return reply.code(400).send({ error: 'invalid_input', field: 'email' });
    }

    const email = normalizeEmail(rawEmail);
    const at = now();

    // 失敗紀錄與限流都用這一個識別碼：同一個 email 穩定對應同一個碼，
    // 但由碼還原不出 email（audit_log 寫進去就永遠在）。
    const failureTarget = loginFailureTarget(email, loginHashKey);

    // 先看鎖：鎖定期間連正確密碼都拒絕，回應時間也一致。
    const attempts = await countFailedAttempts(deps.pool, failureTarget, loginWindowStart(at));
    const lockout = evaluateLockout(attempts, at);

    if (lockout.locked) {
      reply.header('retry-after', String(lockout.retryAfterSeconds));
      return reply.code(429).send({ error: 'too_many_attempts' });
    }

    const user = await findUserByEmail(deps.pool, email);

    // 不存在的 email 照樣跑一次 scrypt，回應時間與錯密碼相近。
    // 兩者都要經同一個資源限制：否則攻擊者可以用一堆不存在的 email 繞過上限。
    let matches: boolean;

    try {
      matches = await hashRun(async () =>
        verifyPassword(password, user?.password_hash ?? (await dummyPasswordHash())),
      );
    } catch (error) {
      if (error instanceof HashBusyError) {
        return busy(reply, error);
      }

      throw error;
    }

    if (user === null || !matches || user.disabled_at !== null) {
      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: 'anonymous',
        action: 'auth.login_failed',
        target: failureTarget,
        detail: { reason: 'invalid_credentials' },
      });

      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    // 舊參數的雜湊在這裡換成新參數。失敗照樣放行，只是留下審計紀錄。
    await upgradePasswordHash(user, password);

    const entry = resolveEntry(request);

    if (entry === null) {
      return untrustedEntry(reply);
    }

    const token = createSessionToken();

    // 條件寫入：如果這一句之前帳戶被停用，這裡會回 false（見 store 的註釋）。
    // 停用與登入並發時，這是「不會留下可用 session」的那一手。
    const issued = await insertSessionForEnabledUser(deps.pool, {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: sessionExpiry(at),
      entry,
    });

    if (!issued) {
      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: 'anonymous',
        action: 'auth.login_failed',
        target: failureTarget,
        detail: { reason: 'identity_disabled' },
      });

      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    await writeAudit(deps.pool, {
      actorType: 'human',
      actorId: user.id,
      action: 'auth.login',
      target: email,
    });

    reply.header('set-cookie', buildSessionCookie(token, { secure: cookieSecure }));

    return reply.code(200).send({ user: toPublicUser(user) });
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = readSessionToken(request.headers.cookie);

    if (token !== null) {
      const userId = await revokeSession(deps.pool, hashSessionToken(token), now());

      if (userId !== null) {
        await writeAudit(deps.pool, {
          actorType: 'human',
          actorId: userId,
          action: 'auth.logout',
        });
      }
    }

    reply.header('set-cookie', buildClearSessionCookie({ secure: cookieSecure }));

    return reply.code(204).send();
  });

  /**
   * 改密碼（issue #84 建立，issue #86 接上節流與正式路徑）。
   *
   * 首次登入被閘門擋住的人也可以呼叫這一個 ——
   * 否則就要另開一個「免閘門」的例外清單，而那清單總有一天會多一個不該有的路由。
   *
   * 路徑由 #86 定為 `/auth/change-password`：issue 的 API 契約寫的是這一個，
   * 而 #84 當時的 `/auth/password` 未有任何前端使用，所以直接改名，不留兩個入口。
   */
  app.post(
    '/auth/change-password',
    { config: { allowPendingPasswordChange: true } },
    async (request, reply) => {
      const user = await currentUser(request);

      if (user === null) {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      const body = request.body;

      if (typeof body === 'object' && body !== null) {
        const unknown = Object.keys(body).filter(
          (key) => key !== 'currentPassword' && key !== 'newPassword',
        );

        if (unknown.length > 0) {
          return reply.code(422).send({
            error: 'invalid_input',
            reasons: [`未知欄位 ${unknown.join('、')}（只可以有 currentPassword、newPassword）`],
          });
        }
      }

      const currentPassword = readString(body, 'currentPassword');
      const newPassword = readString(body, 'newPassword');

      if (currentPassword === '') {
        return reply
          .code(422)
          .send({ error: 'invalid_input', field: 'currentPassword', reason: 'missing' });
      }

      if (validatePassword(newPassword) !== null) {
        return reply
          .code(422)
          .send({ error: 'invalid_input', field: 'newPassword', reason: 'too_short' });
      }

      // 同一個密碼再「改」一次只是自欺：旗標會被清掉，但密碼其實沒有變。
      if (newPassword === currentPassword) {
        return reply
          .code(422)
          .send({ error: 'invalid_input', field: 'newPassword', reason: 'same_as_current' });
      }

      const at = now();

      // 名額用完就連正確密碼都拒絕：否則「錯舊密碼」這條路可以無限試。
      const throttle = await checkPasswordThrottle(
        deps.pool,
        PASSWORD_FAILURE_ACTIONS.change,
        user.id,
        at,
      );

      if (throttle.locked) {
        reply.header('retry-after', String(throttle.retryAfterSeconds));
        return reply.code(429).send({ error: 'too_many_attempts' });
      }

      let matches: boolean;

      try {
        matches = await hashRun(() => verifyPassword(currentPassword, user.password_hash));
      } catch (error) {
        if (error instanceof HashBusyError) {
          return busy(reply, error);
        }

        throw error;
      }

      if (!matches) {
        // 留痕是節流的資料來源，也是「有人在試」的唯一紀錄。
        await recordPasswordFailure(deps.pool, PASSWORD_FAILURE_ACTIONS.change, user.id);

        return reply.code(403).send({ error: 'invalid_current_password' });
      }

      let passwordHash: string;

      try {
        passwordHash = await hashRun(() => hashPassword(newPassword));
      } catch (error) {
        if (error instanceof HashBusyError) {
          return busy(reply, error);
        }

        throw error;
      }

      // currentUser 已經證明入口存在過，但入口本身要傳落去 ——
      // 輪替出來的新 session 必須綁同一個入口，否則改完密碼就等於降級。
      const entry = resolveEntry(request);

      if (entry === null) {
        return untrustedEntry(reply);
      }

      const token = createSessionToken();

      const result = await changePasswordWithSession(deps.pool, {
        userId: user.id,
        expectedHash: user.password_hash,
        passwordHash,
        tokenHash: hashSessionToken(token),
        expiresAt: sessionExpiry(at),
        entry,
        // 審計的分量不同：員工改自己的密碼是日常事，老闆改是另一件事。
        action: user.role === 'owner' ? 'auth.password_change' : 'staff.password_change',
        now: at,
      });

      if (result !== 'ok') {
        // 期間有人改過（或帳戶被停用）：不要覆蓋別人的新密碼。
        return reply.code(409).send({ error: 'password_changed_elsewhere' });
      }

      reply.header('set-cookie', buildSessionCookie(token, { secure: cookieSecure }));

      return { user: { ...toPublicUser(user), mustChangePassword: false } };
    },
  );

  app.get(
    '/me',
    { config: { allowPendingPasswordChange: true } },
    async (request, reply) => {
      const user = await currentUser(request);

      if (user === null) {
        return reply.code(401).send({ error: 'not_signed_in' });
      }

      return { user: toPublicUser(user) };
    },
  );

  app.decorateRequest('currentUser', null);

  app.decorate(
    'requireUser',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = await currentUser(request);

      if (denyIfNotSignedIn(reply, user)) {
        return;
      }

      if (denyIfPasswordChangePending(request, reply, user)) {
        return;
      }

      request.currentUser = user;
    },
  );

  app.decorate(
    'requireOwner',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = await currentUser(request);

      if (denyIfNotSignedIn(reply, user)) {
        return;
      }

      if (denyIfPasswordChangePending(request, reply, user)) {
        return;
      }

      if (user?.role !== 'owner') {
        reply.code(403).send({ error: 'forbidden' });
        return;
      }

      request.currentUser = user;
    },
  );
}

/**
 * 首次登入未改密碼：除了標明 `allowPendingPasswordChange` 的路由，一律 403（issue #84）。
 *
 * 為甚麼要在裝飾器這一層擋，而不是每個路由自己記得：新加一條路由的人不會知道
 * 有這個旗標，而「不知道」的結果不可以是「可以讀公司資料」。所以預設是拒絕，
 * 例外要明寫在路由上 —— 錯的方向應該是「功能用不到」，不是「資料漏出去」。
 */
function denyIfPasswordChangePending(
  request: FastifyRequest,
  reply: FastifyReply,
  user: UserRow | null,
): boolean {
  if (user === null || !user.must_change_password) {
    return false;
  }

  const config = request.routeOptions?.config as { allowPendingPasswordChange?: boolean } | undefined;

  if (config?.allowPendingPasswordChange === true) {
    return false;
  }

  void reply.code(403).send({ error: 'password_change_required' });
  return true;
}

/**
 * 未登入一律同一個 401，兩個裝飾共用。
 * TS 的窄化在 closure 內幫不上忙，所以用回傳值表示「已經回應了」。
 */
function denyIfNotSignedIn(reply: FastifyReply, user: UserRow | null): boolean {
  if (user !== null) {
    return false;
  }

  void reply.code(401).send({ error: 'not_signed_in' });
  return true;
}
