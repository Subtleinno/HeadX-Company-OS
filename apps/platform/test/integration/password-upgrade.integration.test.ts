import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { updatePasswordHash } from '../../src/auth/store';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * issue #66：舊參數（N=16384）密碼雜湊的相容與登入時自動升級。
 *
 * 正式庫 users=0，本機沒有真實帳戶可以升，所以這裡在臨時資料庫直接插入
 * 一筆舊參數雜湊，再走一次真的登入流程。正式資料庫由頭到尾不插任何列。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

const TEST_KEY = 'test-only-login-hash-key-0123456789abcdef';
const OLD_PARAMS = { N: 16384, r: 8, p: 1 };

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

function requiredMem({ N, r, p }: { N: number; r: number; p: number }): number {
  return 128 * r * (N + p + 2);
}

/** 造一筆舊參數雜湊，刻意不經 hashPassword（那支已經是新參數了）。 */
function buildOldHash(password: string, salt: Buffer = randomBytes(16)): Promise<string> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      64,
      { ...OLD_PARAMS, maxmem: requiredMem(OLD_PARAMS) + 1024 * 1024 },
      (error, derived) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(
          [
            'scrypt',
            OLD_PARAMS.N,
            OLD_PARAMS.r,
            OLD_PARAMS.p,
            salt.toString('base64url'),
            derived.toString('base64url'),
          ].join('$'),
        );
      },
    );
  });
}

describe('密碼雜湊升級（issue #66）', () => {
  let db: TempDatabase;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, { pool: db.pool, loginHashKey: TEST_KEY, resolveEntry: () => 'internal' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function insertUser(email: string, passwordHash: string): Promise<string> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash)
       values ($1, '員工', 'staff', 'design', $2)
       returning id`,
      [email, passwordHash],
    );

    return inserted.rows[0]?.id ?? '';
  }

  async function storedHashOf(userId: string): Promise<string> {
    const row = await db.pool.query<{ password_hash: string }>(
      'select password_hash from app_user where id = $1',
      [userId],
    );

    return row.rows[0]?.password_hash ?? '';
  }

  function login(email: string, password: string): Promise<{ statusCode: number; body: string }> {
    return app
      .inject({ method: 'POST', url: '/auth/login', payload: { email, password } })
      .then((response) => ({ statusCode: response.statusCode, body: response.body }));
  }

  it('POST /auth/setup 寫入的是 N=131072 的雜湊', async () => {
    const password = randomPassword();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'owner@example.com', password },
    });

    expect(response.statusCode).toBe(201);

    const row = await db.pool.query<{ password_hash: string }>(
      "select password_hash from app_user where role = 'owner'",
    );
    const stored = row.rows[0]?.password_hash ?? '';

    expect(stored.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(stored).not.toContain(password);
  });

  it('舊參數使用者登入成功後，雜湊自動升級，salt 也換新', async () => {
    const password = randomPassword();
    const oldSalt = randomBytes(16);
    const oldHash = await buildOldHash(password, oldSalt);
    const userId = await insertUser('legacy@example.com', oldHash);

    const first = await login('legacy@example.com', password);
    expect(first.statusCode).toBe(200);

    const upgraded = await storedHashOf(userId);
    expect(upgraded.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(upgraded).not.toBe(oldHash);

    const oldSaltText = oldSalt.toString('base64url');
    expect(upgraded).not.toContain(oldSaltText);

    // 升級之後同一個密碼仍然登入得入。
    const second = await login('legacy@example.com', password);
    expect(second.statusCode).toBe(200);
  });

  it('已經是 N=131072 的使用者再登入，不會重新雜湊', async () => {
    const password = randomPassword();
    const userId = await insertUser('current@example.com', await hashPassword(password));

    const before = await storedHashOf(userId);

    expect((await login('current@example.com', password)).statusCode).toBe(200);
    expect(await storedHashOf(userId)).toBe(before);

    expect((await login('current@example.com', password)).statusCode).toBe(200);
    expect(await storedHashOf(userId)).toBe(before);
  });

  it('升級失敗不阻止登入，並留下結構化錯誤紀錄', async () => {
    const password = randomPassword();
    const oldHash = await buildOldHash(password);
    const userId = await insertUser('blocked@example.com', oldHash);

    // 模擬「寫不進去」：只攔 password_hash 的 UPDATE，其他照常。
    await db.pool.query(`
      create function co_test_block_password_update() returns trigger
      language plpgsql as $$
      begin
        raise exception 'simulated write failure' using errcode = '42501';
      end;
      $$;
    `);
    await db.pool.query(`
      create trigger co_test_block_password_update
        before update of password_hash on app_user
        for each row execute function co_test_block_password_update();
    `);

    const response = await login('blocked@example.com', password);
    expect(response.statusCode).toBe(200);

    // 舊雜湊沒有被改壞。
    expect(await storedHashOf(userId)).toBe(oldHash);

    const audit = await db.pool.query<{ action: string; detail: Record<string, unknown> }>(
      "select action, detail from audit_log where action = 'auth.password_upgrade_failed'",
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.detail.reason).toBe('update_failed');
    // 不外洩 SQL 訊息、密碼或雜湊。
    const serialised = JSON.stringify(audit.rows[0]?.detail);
    expect(serialised).not.toContain(password);
    expect(serialised).not.toContain('scrypt$');
    expect(serialised).not.toContain('simulated write failure');
  });

  it('資料庫裡的雜湊被截短：登入回 401，不是 500', async () => {
    const password = randomPassword();
    const full = await hashPassword(password);

    await insertUser('truncated@example.com', full.slice(0, Math.floor(full.length / 2)));

    const response = await login('truncated@example.com', password);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: 'invalid_credentials' });
  });

  it('資料庫裡的雜湊參數非法：登入回 401，不是 500', async () => {
    await insertUser('broken@example.com', 'scrypt$3$8$1$c2FsdHNhbHRzYWx0c2E$aGFzaGhhc2hoYXNoaGFzaA');

    const response = await login('broken@example.com', randomPassword());

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: 'invalid_credentials' });
  });

  it('錯密碼與不存在的 email：狀態與內容完全相同', async () => {
    const password = randomPassword();
    await insertUser('known@example.com', await hashPassword(password));

    const wrong = await login('known@example.com', `${password}-wrong`);
    const absent = await login('nobody@example.com', password);

    expect(wrong.statusCode).toBe(401);
    expect(absent.statusCode).toBe(401);
    expect(wrong.body).toBe(absent.body);
  });

  it('登入回應不會帶出雜湊、salt 或密碼', async () => {
    const password = randomPassword();

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'owner@example.com', password },
    });

    expect(setup.statusCode).toBe(201);
    expect(setup.body).not.toContain('scrypt');
    expect(setup.body).not.toContain(password);

    const loggedIn = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'owner@example.com', password },
    });

    expect(loggedIn.statusCode).toBe(200);
    expect(loggedIn.body).not.toContain('scrypt');
    expect(loggedIn.body).not.toContain(password);
  });

  /**
   * 升級是「條件更新」：只有資料庫裡仍然是登入時讀到的那一串才寫。
   * 這一組直接咬住 WHERE 條件 —— 拿掉條件的話上面所有測試都仍然會綠。
   */
  describe('updatePasswordHash 的條件更新', () => {
    it('expectedHash 正確：寫入並回 true', async () => {
      const original = await hashPassword(randomPassword());
      const userId = await insertUser('conditional@example.com', original);
      const replacement = await hashPassword(randomPassword());

      const updated = await updatePasswordHash(db.pool, {
        userId,
        expectedHash: original,
        passwordHash: replacement,
      });

      expect(updated).toBe(true);
      expect(await storedHashOf(userId)).toBe(replacement);
    });

    it('expectedHash 過期（有人剛改過密碼）：回 false，不覆蓋', async () => {
      const original = await hashPassword(randomPassword());
      const userId = await insertUser('stale@example.com', original);

      // 期間另一個人改了密碼。
      const someoneElse = await hashPassword(randomPassword());
      await db.pool.query('update app_user set password_hash = $1 where id = $2', [
        someoneElse,
        userId,
      ]);

      const updated = await updatePasswordHash(db.pool, {
        userId,
        expectedHash: original,
        passwordHash: await hashPassword(randomPassword()),
      });

      expect(updated).toBe(false);
      expect(await storedHashOf(userId)).toBe(someoneElse);
    });
  });
});
