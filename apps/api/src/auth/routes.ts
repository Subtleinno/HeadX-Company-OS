import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { getSignedInUser } from './current-user.js';
import { isValidEmail, normalizeEmail } from './email.js';
import { hashPassword, validatePassword, verifyPassword } from './password.js';
import { evaluateLockout, loginWindowStart } from './rate-limit.js';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  readSessionToken,
  SESSION_TTL_MS,
} from './session-cookie.js';
import { createSessionToken, hashSessionToken } from './token.js';
import {
  countFailedAttempts,
  createOwnerWithSession,
  findUserByEmail,
  hasOwner,
  insertSession,
  revokeSession,
  toPublicUser,
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
  const now = deps.now ?? ((): Date => new Date());
  const cookieSecure = deps.cookieSecure ?? false;
  const sessionTtlMs = deps.sessionTtlMs ?? SESSION_TTL_MS;

  function sessionExpiry(at: Date): Date {
    return new Date(at.getTime() + sessionTtlMs);
  }

  async function currentUser(request: FastifyRequest): Promise<UserRow | null> {
    return getSignedInUser(deps.pool, request, now());
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
    const passwordHash = await hashPassword(password);
    const token = createSessionToken();

    const result = await createOwnerWithSession(
      deps.pool,
      {
        email,
        displayName,
        passwordHash,
        tokenHash: hashSessionToken(token),
        expiresAt: sessionExpiry(at),
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

    // 先看鎖：鎖定期間連正確密碼都拒絕，回應時間也一致。
    const attempts = await countFailedAttempts(deps.pool, email, loginWindowStart(at));
    const lockout = evaluateLockout(attempts, at);

    if (lockout.locked) {
      reply.header('retry-after', String(lockout.retryAfterSeconds));
      return reply.code(429).send({ error: 'too_many_attempts' });
    }

    const user = await findUserByEmail(deps.pool, email);

    // 不存在的 email 照樣跑一次 scrypt，回應時間與錯密碼相近。
    const matches = await verifyPassword(password, user?.password_hash ?? (await dummyPasswordHash()));

    if (user === null || !matches || user.disabled_at !== null) {
      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: 'anonymous',
        action: 'auth.login_failed',
        target: email,
        detail: { reason: 'invalid_credentials' },
      });

      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const token = createSessionToken();

    await insertSession(deps.pool, {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: sessionExpiry(at),
    });

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

  app.get('/me', async (request, reply) => {
    const user = await currentUser(request);

    if (user === null) {
      return reply.code(401).send({ error: 'not_signed_in' });
    }

    return { user: toPublicUser(user) };
  });

  app.decorateRequest('currentUser', null);

  app.decorate(
    'requireUser',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const user = await currentUser(request);

      if (denyIfNotSignedIn(reply, user)) {
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

      if (user?.role !== 'owner') {
        reply.code(403).send({ error: 'forbidden' });
        return;
      }

      request.currentUser = user;
    },
  );
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
