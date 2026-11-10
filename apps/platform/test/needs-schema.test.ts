import { describe, expect, it } from 'vitest';
import {
  deriveState,
  isOverdue,
  MAX_LIST_LIMIT,
  parseListQuery,
} from '../src/needs/schema.js';

/**
 * Needs 的純函數測試（issue 184）。
 *
 * 呢兩個函數（狀態推導、逾期判斷）係整個功能的地基：清單、右側欄、計數三邊
 * 都靠它們講同一件事。所以先把它們釘死，唔靠人手在畫面上望。
 */

const NONE = {
  claimedAt: null,
  uploadedAt: null,
  absorbedAt: null,
  acceptedAt: null,
};

describe('deriveState', () => {
  it('四個時間戳都冇 → open（等認領）', () => {
    expect(deriveState(NONE)).toBe('open');
  });

  it('只有認領時間 → claimed', () => {
    expect(deriveState({ ...NONE, claimedAt: new Date('2026-11-01T00:00:00Z') })).toBe('claimed');
  });

  it('交了貨 → uploaded，就算未吸收', () => {
    expect(
      deriveState({
        ...NONE,
        claimedAt: new Date('2026-11-01T00:00:00Z'),
        uploadedAt: new Date('2026-11-02T00:00:00Z'),
      }),
    ).toBe('uploaded');
  });

  it('吸收了 → absorbed', () => {
    expect(
      deriveState({
        ...NONE,
        claimedAt: new Date('2026-11-01T00:00:00Z'),
        uploadedAt: new Date('2026-11-02T00:00:00Z'),
        absorbedAt: new Date('2026-11-03T00:00:00Z'),
      }),
    ).toBe('absorbed');
  });

  it('驗收之後一律 closed，中間做過幾多步都唔重要', () => {
    expect(
      deriveState({
        claimedAt: new Date('2026-11-01T00:00:00Z'),
        uploadedAt: new Date('2026-11-02T00:00:00Z'),
        absorbedAt: new Date('2026-11-03T00:00:00Z'),
        acceptedAt: new Date('2026-11-04T00:00:00Z'),
      }),
    ).toBe('closed');
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  it('冇到期日就唔會逾期（未定唔等於今日到期）', () => {
    expect(isOverdue(null, 'open', now)).toBe(false);
  });

  it('過了期而且未驗收 → 逾期', () => {
    expect(isOverdue(new Date('2026-11-09T12:00:00Z'), 'claimed', now)).toBe(true);
  });

  it('過了期但已驗收 → 唔再計逾期', () => {
    expect(isOverdue(new Date('2026-11-09T12:00:00Z'), 'closed', now)).toBe(false);
  });

  it('未到期 → 唔逾期', () => {
    expect(isOverdue(new Date('2026-11-11T12:00:00Z'), 'open', now)).toBe(false);
  });
});

describe('parseListQuery', () => {
  it('冇 query 就係全部、預設上限', () => {
    const parsed = parseListQuery({});

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value).toEqual({ filter: 'all', appId: undefined, limit: 50 });
  });

  it('appId=company 代表「只要公司層」，與唔傳不同', () => {
    const company = parseListQuery({ appId: 'company' });
    const all = parseListQuery({});

    expect(company.ok && company.value.appId).toBeNull();
    expect(all.ok && all.value.appId).toBeUndefined();
  });

  it('狀態打錯字要 400，唔可以靜靜當成全部', () => {
    const parsed = parseListQuery({ status: 'pendng' });

    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.errors[0]).toContain('status');
  });

  it('limit 超出上限要拒絕', () => {
    const parsed = parseListQuery({ limit: String(MAX_LIST_LIMIT + 1) });

    expect(parsed.ok).toBe(false);
  });

  it('limit 不是整數要拒絕', () => {
    expect(parseListQuery({ limit: '10.5' }).ok).toBe(false);
  });
});
