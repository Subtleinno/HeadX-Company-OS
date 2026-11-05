import { describe, expect, it } from 'vitest';
import {
  parseListQuery,
  parseModifyInput,
  parseRejectInput,
  parseRequestInput,
  parseRevokeInput,
  parseTransitionInput,
} from '../../src/grants/schema';

/**
 * 授權 API 的輸入驗證（issue #83）。
 *
 * 兩個原則：
 *   1. 未知欄位一律拒絕 —— 打錯字的人以為自己改了一樣東西，比收到 422 更危險。
 *   2. 範圍不可以「省略當全部」：#82 的契約裡 all 要明寫，這裡也一樣。
 */

describe('parseRequestInput', () => {
  const valid = {
    userId: '11111111-1111-1111-1111-111111111111',
    appId: 'sales',
    role: 'member',
    scope: { kind: 'units', unitIds: ['22222222-2222-2222-2222-222222222222'] },
  };

  it('接受完整的合法輸入', () => {
    const parsed = parseRequestInput(valid);

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual(valid);
  });

  it('未知欄位要拒絕（不是靜靜忽略）', () => {
    const parsed = parseRequestInput({ ...valid, state: 'active' });

    expect(parsed.errors.some((error) => error.includes('state'))).toBe(true);
    expect(parsed.value).toBeUndefined();
  });

  it('缺 scope 要拒絕 —— 未給範圍不代表全部', () => {
    const parsed = parseRequestInput({ userId: valid.userId, appId: 'sales', role: 'member' });

    expect(parsed.errors.some((error) => error.includes('scope'))).toBe(true);
  });

  it('scope.kind 只可以是 all、units、subtree', () => {
    const parsed = parseRequestInput({ ...valid, scope: { kind: 'everything' } });

    expect(parsed.errors.some((error) => error.includes('scope.kind'))).toBe(true);
  });

  it('units／subtree 一定要有至少一個單位', () => {
    const parsed = parseRequestInput({ ...valid, scope: { kind: 'units', unitIds: [] } });

    expect(parsed.errors.some((error) => error.includes('至少一個'))).toBe(true);
  });

  it('all 不可以夾帶單位（那代表填的人搞錯了）', () => {
    const parsed = parseRequestInput({ ...valid, scope: { kind: 'all', unitIds: ['x'] } });

    expect(parsed.errors.some((error) => error.includes('all'))).toBe(true);
  });

  it('重複的單位 id 會去重，不是報錯', () => {
    const parsed = parseRequestInput({
      ...valid,
      scope: { kind: 'units', unitIds: ['b', 'a', 'b'] },
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value?.scope).toEqual({ kind: 'units', unitIds: ['a', 'b'] });
  });

  it('role 只可以是 member 或 app_admin', () => {
    const parsed = parseRequestInput({ ...valid, role: 'owner' });

    expect(parsed.errors.some((error) => error.includes('role'))).toBe(true);
  });

  it('appId 格式要合法（小寫字母開頭）', () => {
    const parsed = parseRequestInput({ ...valid, appId: '../etc/passwd' });

    expect(parsed.errors.some((error) => error.includes('appId'))).toBe(true);
  });
});

describe('parseTransitionInput', () => {
  it('要有正整數 version', () => {
    expect(parseTransitionInput({ version: 3 })).toEqual({ errors: [], value: { version: 3 } });
  });

  it('沒有 version 要拒絕', () => {
    expect(parseTransitionInput({}).errors.length).toBeGreaterThan(0);
  });

  it('version 是 0 或負數要拒絕', () => {
    expect(parseTransitionInput({ version: 0 }).errors.length).toBeGreaterThan(0);
    expect(parseTransitionInput({ version: -1 }).errors.length).toBeGreaterThan(0);
  });

  it('小數要拒絕', () => {
    expect(parseTransitionInput({ version: 1.5 }).errors.length).toBeGreaterThan(0);
  });
});

describe('parseRejectInput', () => {
  it('要有 version 與理由', () => {
    expect(parseRejectInput({ version: 1, reason: '範圍不對' })).toEqual({
      errors: [],
      value: { version: 1, reason: '範圍不對' },
    });
  });

  it('理由空白要拒絕（拒絕要說得出為甚麼）', () => {
    expect(parseRejectInput({ version: 1, reason: '   ' }).errors.length).toBeGreaterThan(0);
  });

  it('理由太長要拒絕', () => {
    expect(parseRejectInput({ version: 1, reason: 'x'.repeat(201) }).errors.length).toBeGreaterThan(0);
  });
});

describe('parseRevokeInput', () => {
  it('理由可以省略', () => {
    expect(parseRevokeInput({ version: 2 })).toEqual({ errors: [], value: { version: 2 } });
  });

  it('有理由就會保留', () => {
    expect(parseRevokeInput({ version: 2, reason: '離職' }).value).toEqual({
      version: 2,
      reason: '離職',
    });
  });
});

describe('parseModifyInput', () => {
  it('要有 version，而且要改至少一樣東西', () => {
    expect(parseModifyInput({ version: 1 }).errors.length).toBeGreaterThan(0);
  });

  it('可以只改範圍', () => {
    const parsed = parseModifyInput({ version: 1, scope: { kind: 'all' } });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual({ version: 1, scope: { kind: 'all' } });
  });

  it('可以只改角色', () => {
    expect(parseModifyInput({ version: 1, role: 'app_admin' }).value).toEqual({
      version: 1,
      role: 'app_admin',
    });
  });

  it('未知欄位要拒絕', () => {
    expect(parseModifyInput({ version: 1, role: 'member', state: 'active' }).errors.length).toBeGreaterThan(0);
  });
});

describe('parseListQuery', () => {
  it('預設分頁是 20 筆、由第 0 筆開始', () => {
    expect(parseListQuery({})).toEqual({ errors: [], value: { limit: 20, offset: 0 } });
  });

  it('limit 上限 100（不可以一次拉全表）', () => {
    expect(parseListQuery({ limit: '500' }).errors.length).toBeGreaterThan(0);
  });

  it('limit 要是正整數', () => {
    expect(parseListQuery({ limit: '0' }).errors.length).toBeGreaterThan(0);
    expect(parseListQuery({ limit: 'abc' }).errors.length).toBeGreaterThan(0);
  });

  it('offset 可以省略，但不可以是負數', () => {
    expect(parseListQuery({ offset: '-1' }).errors.length).toBeGreaterThan(0);
  });

  it('state 只可以是五種狀態之一', () => {
    expect(parseListQuery({ state: 'active' }).value?.state).toBe('active');
    expect(parseListQuery({ state: 'deleted' }).errors.length).toBeGreaterThan(0);
  });

  it('未知的查詢參數要拒絕', () => {
    expect(parseListQuery({ sort: 'userId' }).errors.length).toBeGreaterThan(0);
  });
});
