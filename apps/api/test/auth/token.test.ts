import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';

describe('session token', () => {
  it('32 bytes 隨機，base64url 43 個字元', () => {
    expect(createSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('每次都不同', () => {
    expect(createSessionToken()).not.toBe(createSessionToken());
  });

  it('資料庫只存 SHA-256，不是 token 本身', () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(hash).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
  });
});
