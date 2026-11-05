import { describe, expect, it } from 'vitest';
import {
  UNIT_NAME_MAX_LENGTH,
  UNIT_TYPE_MAX_LENGTH,
  parseEdgeInput,
  parseUnitInput,
} from '../../src/org/units.js';
import { OVERRIDABLE_KEYS, isOverridableKey } from '../../src/settings/schema.js';

/**
 * 組織單位的輸入驗證（issue #81）。
 *
 * 驗證與寫入分開：這裡只回答「這份輸入有沒有意義」，不查資料庫、不知道誰在呼叫。
 * 同一個 unit 由 API 建立或由種子建立時，走的是同一份規則 —— 否則總有一天
 * 「種子建得出來的單位、API 卻拒絕」。
 */

const UNIT_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';

describe('parseUnitInput：合法輸入', () => {
  it('齊全的輸入原樣保留（可選欄位給了就有）', () => {
    const parsed = parseUnitInput({
      name: '滿月堂',
      type: 'brand',
      country: 'HK',
      currency: 'HKD',
      timezone: 'Asia/Hong_Kong',
      parentIds: [PARENT_ID],
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual({
      name: '滿月堂',
      type: 'brand',
      country: 'HK',
      currency: 'HKD',
      timezone: 'Asia/Hong_Kong',
      parentIds: [PARENT_ID],
    });
  });

  it('可選欄位不給就是 null，不是空字串', () => {
    const parsed = parseUnitInput({ name: '公司', type: 'company', parentIds: [PARENT_ID] });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toMatchObject({ country: null, currency: null, timezone: null });
  });

  it('名稱前後的空白會被去掉（存進去的值就是顯示的值）', () => {
    const parsed = parseUnitInput({ name: '  銅鑼灣店  ', type: 'store', parentIds: [PARENT_ID] });

    expect(parsed.value.name).toBe('銅鑼灣店');
  });

  it('UTC 是合法的時區，多個上級都保留原次序', () => {
    const parsed = parseUnitInput({
      name: 'Store',
      type: 'store',
      timezone: 'UTC',
      parentIds: [PARENT_ID, UNIT_ID],
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value.parentIds).toEqual([PARENT_ID, UNIT_ID]);
  });
});

describe('parseUnitInput：拒絕的輸入', () => {
  const base = { name: '店', type: 'store', parentIds: [PARENT_ID] };

  it('name 不可以是空的或只有空白', () => {
    for (const name of ['', '   ', undefined]) {
      const parsed = parseUnitInput({ ...base, name });

      expect(parsed.errors.join('／')).toContain('name');
    }
  });

  it(`name 不可以超過 ${UNIT_NAME_MAX_LENGTH} 字`, () => {
    const parsed = parseUnitInput({ ...base, name: 'x'.repeat(UNIT_NAME_MAX_LENGTH + 1) });

    expect(parsed.errors.join('／')).toContain('name');
  });

  it('name 剛好等於上限就合格（邊界要真的量）', () => {
    const parsed = parseUnitInput({ ...base, name: 'x'.repeat(UNIT_NAME_MAX_LENGTH) });

    expect(parsed.errors).toEqual([]);
  });

  it(`type 不可以超過 ${UNIT_TYPE_MAX_LENGTH} 字，也不可以空`, () => {
    expect(parseUnitInput({ ...base, type: 'x'.repeat(UNIT_TYPE_MAX_LENGTH + 1) }).errors.length).toBeGreaterThan(0);
    expect(parseUnitInput({ ...base, type: '' }).errors.length).toBeGreaterThan(0);
    expect(parseUnitInput({ ...base, type: undefined }).errors.length).toBeGreaterThan(0);
  });

  it('country 只能是兩個大寫字母（ISO 3166-1）', () => {
    expect(parseUnitInput({ ...base, country: 'hk' }).errors.join('／')).toContain('country');
    expect(parseUnitInput({ ...base, country: 'HKG' }).errors.join('／')).toContain('country');
    expect(parseUnitInput({ ...base, country: '' }).errors.join('／')).toContain('country');
  });

  it('currency 只能是三個大寫字母（ISO 4217）', () => {
    expect(parseUnitInput({ ...base, currency: 'HK' }).errors.join('／')).toContain('currency');
    expect(parseUnitInput({ ...base, currency: 'hkd' }).errors.join('／')).toContain('currency');
  });

  it('timezone 必須是真的 IANA 時區名稱', () => {
    expect(parseUnitInput({ ...base, timezone: 'Mars/Olympus' }).errors.join('／')).toContain('timezone');
    expect(parseUnitInput({ ...base, timezone: 'Asia/Hong_Kong' }).errors).toEqual([]);
  });

  it('非根單位建立時必須帶至少一個上級', () => {
    expect(parseUnitInput({ name: '店', type: 'store' }).errors.join('／')).toContain('parentIds');
    expect(parseUnitInput({ name: '店', type: 'store', parentIds: [] }).errors.join('／')).toContain('parentIds');
  });

  it('上級必須是 UUID（形狀不對就一定不存在，不要丟給 Postgres 換一個 500）', () => {
    expect(parseUnitInput({ ...base, parentIds: ['not-a-uuid'] }).errors.join('／')).toContain('parentIds');
  });

  it('同一個上級寫兩次：拒絕（重複的邊是資料錯誤，不是「多加一次」）', () => {
    expect(parseUnitInput({ ...base, parentIds: [PARENT_ID, PARENT_ID] }).errors.join('／')).toContain('parentIds');
  });

  it('未知欄位一律拒絕（包括想偷渡 is_root 或 id）', () => {
    expect(parseUnitInput({ ...base, isRoot: true }).errors.join('／')).toContain('isRoot');
    expect(parseUnitInput({ ...base, id: UNIT_ID }).errors.join('／')).toContain('id');
  });

  it('不是物件：直接拒絕', () => {
    expect(parseUnitInput(null).errors.length).toBeGreaterThan(0);
    expect(parseUnitInput([]).errors.length).toBeGreaterThan(0);
    expect(parseUnitInput('x').errors.length).toBeGreaterThan(0);
  });
});

describe('parseUnitInput：PATCH 只驗有出現的欄位', () => {
  it('只給 name：不要求 parentIds', () => {
    const parsed = parseUnitInput({ name: '新名' }, { partial: true });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual({ name: '新名' });
  });

  it('空的 patch：沒有錯誤，但 value 是空物件（由路由決定要不要 422）', () => {
    const parsed = parseUnitInput({}, { partial: true });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual({});
  });

  it('PATCH 不可以改 parentIds（邊要經 /parents 增減，才會逐條寫審計）', () => {
    const parsed = parseUnitInput({ parentIds: [PARENT_ID] }, { partial: true });

    expect(parsed.errors.join('／')).toContain('parentIds');
  });

  it('PATCH 給 null 可以把可選欄位清空', () => {
    const parsed = parseUnitInput({ country: null, currency: null, timezone: null }, { partial: true });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual({ country: null, currency: null, timezone: null });
  });
});

describe('parseEdgeInput', () => {
  it('parentId 必填、position 預設 0', () => {
    expect(parseEdgeInput({ parentId: PARENT_ID })).toEqual({
      errors: [],
      value: { parentId: PARENT_ID, position: 0 },
    });
  });

  it('position 給了就用，可以是負數（只要求整數）', () => {
    expect(parseEdgeInput({ parentId: PARENT_ID, position: -5 }).value).toEqual({
      parentId: PARENT_ID,
      position: -5,
    });
  });

  it('parentId 不是 UUID、position 不是整數：都拒絕', () => {
    expect(parseEdgeInput({ parentId: 'x' }).errors.join('／')).toContain('parentId');
    expect(parseEdgeInput({ parentId: PARENT_ID, position: 1.5 }).errors.join('／')).toContain('position');
  });

  it('未知欄位拒絕', () => {
    expect(parseEdgeInput({ parentId: PARENT_ID, childId: UNIT_ID }).errors.join('／')).toContain('childId');
  });
});

describe('可覆寫的設定 key 只有四個', () => {
  it('四個可覆寫', () => {
    expect(OVERRIDABLE_KEYS).toEqual([
      'company_locale',
      'notification_channels',
      'overdue_grace_hours',
      'acceptance_rule',
    ]);
    expect(OVERRIDABLE_KEYS.every(isOverridableKey)).toBe(true);
  });

  it('edition、install_code、department_isolation 不可以由單位覆寫', () => {
    expect(isOverridableKey('edition')).toBe(false);
    expect(isOverridableKey('install_code')).toBe(false);
    expect(isOverridableKey('department_isolation')).toBe(false);
  });
});
