import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  hashPassword,
  parsePasswordHash,
  validatePassword,
  verifyPassword,
} from '../../src/auth/password';

// 不用真實密碼：測試自己產生，不進 repo。
const PASSWORD = 'correct horse battery staple';

describe('密碼雜湊', () => {
  it('格式是 scrypt$N$r$p$salt$hash，參數寫在字串裡', async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
  });

  it('正確密碼通過，錯誤密碼不通過', async () => {
    const hash = await hashPassword(PASSWORD);

    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true);
    await expect(verifyPassword(`${PASSWORD}唔同`, hash)).resolves.toBe(false);
  });

  it('同一個密碼每次 salt 不同，兩個雜湊都仍然有效', async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first).not.toBe(second);
    await expect(verifyPassword(PASSWORD, first)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, second)).resolves.toBe(true);
  });

  it('解析得到參數、16 bytes salt、64 bytes 雜湊', async () => {
    const parts = parsePasswordHash(await hashPassword(PASSWORD));

    expect(parts.N).toBe(16384);
    expect(parts.r).toBe(8);
    expect(parts.p).toBe(1);
    expect(parts.salt).toHaveLength(16);
    expect(parts.hash).toHaveLength(64);
  });

  it.each([
    'plain-text',
    'scrypt$16384$8$1$只有五段',
    'scrypt$abc$8$1$c2FsdA$aGFzaA',
    'scrypt$16384$8$1$$',
    'bcrypt$16384$8$1$c2FsdA$aGFzaA',
  ])('格式不對就擲錯：%s', (stored) => {
    expect(() => parsePasswordHash(stored)).toThrow(/雜湊格式/);
  });

  it('資料庫裡的雜湊壞掉時回 false，不會 500', async () => {
    await expect(verifyPassword(PASSWORD, 'not-a-hash')).resolves.toBe(false);
  });

  it(`少於 ${PASSWORD_MIN_LENGTH} 個字元要拒絕，剛好 ${PASSWORD_MIN_LENGTH} 個可以`, () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('too_short');
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });
});
