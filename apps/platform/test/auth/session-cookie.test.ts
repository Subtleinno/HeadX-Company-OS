import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  buildClearSessionCookie,
  buildSessionCookie,
  readSessionToken,
} from '../../src/auth/session-cookie';

describe('session cookie', () => {
  it('名字是 co_session，有效期 14 天固定', () => {
    expect(SESSION_COOKIE_NAME).toBe('co_session');
    expect(SESSION_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('HttpOnly、SameSite=Lax、Path=/，不會被 JavaScript 讀到', () => {
    const cookie = buildSessionCookie('abc', { secure: false });

    expect(cookie).toContain('co_session=abc');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
  });

  it('本機 http 預設不加 Secure；COOKIE_SECURE 打開才加', () => {
    expect(buildSessionCookie('abc', { secure: false })).not.toContain('Secure');
    expect(buildSessionCookie('abc', { secure: true })).toContain('Secure');
  });

  it('登出用的 cookie 是 Max-Age=0', () => {
    const cookie = buildClearSessionCookie({ secure: false });

    expect(cookie).toContain('co_session=');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });

  it('由 Cookie 標頭取出 token，忽略其他 cookie', () => {
    expect(readSessionToken('a=1; co_session=xyz; b=2')).toBe('xyz');
  });

  it('沒有 cookie 或值為空時回 null', () => {
    expect(readSessionToken(undefined)).toBeNull();
    expect(readSessionToken('')).toBeNull();
    expect(readSessionToken('co_session=')).toBeNull();
    expect(readSessionToken('other=1')).toBeNull();
  });
});
