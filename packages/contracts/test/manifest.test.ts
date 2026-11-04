import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPOSURE, validateManifest, validateManifests } from '../src/index';

/**
 * contracts 只放型別與驗證。這一組刻意把**錯誤訊息文字**釘死：
 * 這些訊息是 #74 已經對外的行為（platform 啟動時印給人看的），
 * 從 platform 搬到 contracts 時一個字都不可以變。
 */

const valid = {
  id: 'sales',
  title: '業務',
  kind: 'department',
  department: 'sales',
  order: 40,
  available: false,
  route: '/sales',
  exposure: 'internal',
  sensitive: false,
} as const;

function validate(record: Record<string, unknown>, folder = 'sales') {
  return validateManifest(folder, record);
}

/** 拿走一個欄位，用來測「未填」的情形。 */
function without(field: keyof typeof valid): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...valid };
  delete copy[field];
  return copy;
}

describe('validateManifest：合格', () => {
  it('九個欄位齊全時回傳 manifest，沒有錯誤', () => {
    const result = validate({ ...valid });

    expect(result.errors).toEqual([]);
    expect(result.manifest).toEqual(valid);
  });

  it('省略 exposure 時當作 internal', () => {
    const result = validate(without('exposure'));

    expect(result.errors).toEqual([]);
    expect(result.manifest?.exposure).toBe(DEFAULT_EXPOSURE);
  });
});

describe('validateManifest：每個錯誤訊息都與 #74 一致', () => {
  it('未知欄位', () => {
    const result = validate({ ...valid, extra: 1 });

    expect(result.errors).toEqual([
      `apps/sales/manifest.json：未知欄位 extra（只可以有 id、title、kind、department、order、available、route、exposure、sensitive）`,
    ]);
  });

  it('id 格式不對', () => {
    const result = validate({ ...valid, id: 'Sales' });

    expect(result.errors.join('\n')).toContain('id 格式不對（Sales）');
  });

  it('id 不等於資料夾名', () => {
    const result = validate({ ...valid, id: 'other' }, 'sales');

    expect(result.errors.join('\n')).toContain('id 必須等於資料夾名（id=other，資料夾=sales）');
  });

  it('kind 不是 console 或 department', () => {
    const result = validate({ ...valid, kind: 'team' });

    expect(result.errors.join('\n')).toContain('kind 必須是 console 或 department');
  });

  it('kind 是 console 但 department 不是 null', () => {
    const result = validate({ ...valid, kind: 'console', department: 'sales' });

    expect(result.errors.join('\n')).toContain('kind 是 console 時 department 必須是 null');
  });

  it('order 不是整數', () => {
    const result = validate({ ...valid, order: 1.5 });

    expect(result.errors.join('\n')).toContain('order 必須是整數');
  });

  it('available 不是布林值', () => {
    const result = validate({ ...valid, available: 'yes' });

    expect(result.errors.join('\n')).toContain('available 必須是 true 或 false');
  });

  it('route 沒有以 / 開頭', () => {
    const result = validate({ ...valid, route: 'sales' });

    expect(result.errors.join('\n')).toContain('route 必須以 / 開頭');
  });

  it('exposure 填了不認識的值', () => {
    const result = validate({ ...valid, exposure: 'public' });

    expect(result.errors.join('\n')).toContain('exposure 必須是 internal、partner、customer 其中之一');
  });

  it('sensitive 沒有填（未講不可以當成不敏感）', () => {
    const result = validate(without('sensitive'));

    expect(result.errors.join('\n')).toContain('sensitive 必須是 true 或 false');
  });

  it('一次過報齊所有問題，不是只報第一個', () => {
    const result = validate({ ...valid, title: '', order: 'x', sensitive: 1 });

    expect(result.errors.length).toBe(3);
    expect(result.manifest).toBeUndefined();
  });
});

describe('validateManifests：跨 manifest 的檢查', () => {
  it('id 重複、department 重複、route 重複、多過一個 console 都會報', () => {
    const errors = validateManifests([
      // 一個正常的 console。
      { folder: 'boss', record: { ...valid, id: 'boss', kind: 'console', department: null, route: '/boss' } },
      // id 與 route 都與 boss 撞。
      { folder: 'sales', record: { ...valid, id: 'boss', route: '/boss' } },
      // 第二個 console。
      { folder: 'hr', record: { ...valid, id: 'hr', kind: 'console', department: null, route: '/hr' } },
      // department 與 sales 撞。
      { folder: 'design', record: { ...valid, id: 'design', route: '/design' } },
    ]);

    const text = errors.join('\n');
    expect(text).toContain('id boss 與 apps/boss 重複');
    expect(text).toContain('department sales 與 apps/sales 重複');
    expect(text).toContain('route /boss 與 apps/boss 重複');
    expect(text).toContain('只能有一個 console 模組，現在有 2 個：boss、hr');
  });

  it('正常的一組回空陣列', () => {
    expect(validateManifests([{ folder: 'sales', record: { ...valid } }])).toEqual([]);
  });
});
