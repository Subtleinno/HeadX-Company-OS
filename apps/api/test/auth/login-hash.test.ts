import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import {
  LOGIN_HASH_KEY_ENV,
  loginFailureTarget,
  loginHashKeyWarning,
  MIN_KEY_BYTES,
  readLoginHashKey,
} from '../../src/auth/login-hash';
import { registerAuth } from '../../src/auth/routes';

/**
 * 登入失敗審計的識別碼。
 *
 * audit_log 只准追加：任何人在登入畫面打一次字，那個字就永遠留在資料庫。
 * 所以 target 只可以是一個用伺服器端 key 算出來的識別碼 —— 同一個 email 穩定對應
 * 同一個碼（限流要用），不同 email 對應不同碼，而且由碼還原不出 email。
 */

const KEY = 'a'.repeat(MIN_KEY_BYTES);
const OTHER_KEY = 'b'.repeat(MIN_KEY_BYTES);

describe('登入失敗審計：keyed hash 識別碼', () => {
  it('同一個 email 兩次失敗：識別碼相同（限流靠這一點）', () => {
    expect(loginFailureTarget('alice@example.com', KEY)).toBe(
      loginFailureTarget('alice@example.com', KEY),
    );
  });

  it('大小寫與前後空白的同一 email：識別碼相同', () => {
    const canonical = loginFailureTarget('alice.smith@company.com', KEY);

    expect(loginFailureTarget('ALICE.SMITH@Company.com', KEY)).toBe(canonical);
    expect(loginFailureTarget('  Alice.Smith@Company.COM  ', KEY)).toBe(canonical);
  });

  it('兩個不同 email：識別碼不同', () => {
    expect(loginFailureTarget('alice@example.com', KEY)).not.toBe(
      loginFailureTarget('bob@example.com', KEY),
    );
  });

  it('只有轉了小寫、域名不同之類的鄰近 email 也不會撞', () => {
    const base = loginFailureTarget('alice@example.com', KEY);

    expect(loginFailureTarget('alice@example.com.evil', KEY)).not.toBe(base);
    expect(loginFailureTarget('alice@sub.example.com', KEY)).not.toBe(base);
    expect(loginFailureTarget('alice+tag@example.com', KEY)).not.toBe(base);
  });

  it('識別碼不含 @，也不是明文 email，格式固定', () => {
    const target = loginFailureTarget('nobody@example.com', KEY);

    expect(target).not.toContain('@');
    expect(target).not.toContain('nobody');
    expect(target).not.toContain('example');
    expect(target).toMatch(/^email_hmac:[0-9a-f]{64}$/);
  });

  it('換 key 之後同一個 email 會變成不同識別碼（證明是 keyed，不是固定 salt）', () => {
    expect(loginFailureTarget('alice@example.com', KEY)).not.toBe(
      loginFailureTarget('alice@example.com', OTHER_KEY),
    );
  });
});

describe('登入失敗審計：key 未設定就不准啟動', () => {
  it('undefined 與空字串、純空白：一律拋錯，訊息講明是哪個變數', () => {
    for (const value of [undefined, '', '   ']) {
      expect(() => readLoginHashKey(value)).toThrowError(LOGIN_HASH_KEY_ENV);
      expect(() => readLoginHashKey(value)).toThrowError(/不會啟動/);
    }
  });

  it('不可以用空字串當 key 靜靜跑下去：訊息要講怎麼補救', () => {
    expect(() => readLoginHashKey(undefined)).toThrowError(/randomBytes/);
  });

  it('有設定就原樣返回（不做任何轉換，否則重啟後識別碼會漂移）', () => {
    expect(readLoginHashKey('  spaced-key-value  ')).toBe('  spaced-key-value  ');
  });

  it('registerAuth 拿到空 key 就拒絕接線：不會用空字串靜靜跑下去', () => {
    const app = buildServer({ checkDb: async () => undefined, checkStorage: async () => undefined });
    const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;

    expect(() => registerAuth(app, { pool, loginHashKey: '' })).toThrowError(LOGIN_HASH_KEY_ENV);
  });
});

describe('登入失敗審計：key 太短要出聲', () => {
  it(`短過 ${MIN_KEY_BYTES} bytes：有警告，但警告不可以提到 key 的值`, () => {
    const short = 'too-short-key';
    const warning = loginHashKeyWarning(short);

    expect(warning).not.toBeNull();
    expect(warning).toContain(LOGIN_HASH_KEY_ENV);
    expect(warning).not.toContain(short);
  });

  it('夠長的 key：沒有警告', () => {
    expect(loginHashKeyWarning(KEY)).toBeNull();
  });
});
