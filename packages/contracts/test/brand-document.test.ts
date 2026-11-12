import { describe, expect, it } from 'vitest';
import {
  changedPaths,
  emptyBrandDocument,
  parseBrandDocument,
  readPath,
  writePath,
  type BrandDocument,
} from '../src/brand/index.ts';

/**
 * 外殼（issue #57）。
 *
 * 這一組測試只證明一件事：**一份文件要講得出為咩。** 所以「沒有理由的區塊」
 * 是紅的、「未知區塊種類」是紅的、「schema 不是 2」是紅的 —— 而不是「有
 * payload 就收貨」。
 */

function validDocument(): BrandDocument {
  return {
    ...emptyBrandDocument({
      blocks: [{ kind: 'stance', reason: '立場是這一頁唯一的重點。' }],
    }),
    stance: '先白，後墨，再藍。',
    payload: { stance: '先白，後墨，再藍。' },
  };
}

describe('品牌文件外殼', () => {
  it('收一份完整的文件', () => {
    const parsed = parseBrandDocument(validDocument());

    expect(parsed.ok).toBe(true);
  });

  it('沒有 schema 2 就不收：舊版要經轉換，不可以冒充', () => {
    const parsed = parseBrandDocument({ ...validDocument(), schema: 1 });

    expect(parsed.ok).toBe(false);
  });

  it('區塊沒有寫理由就不收', () => {
    const parsed = parseBrandDocument({
      ...validDocument(),
      layout: { blocks: [{ kind: 'stance', reason: '  ' }] },
    });

    expect(parsed.ok).toBe(false);

    if (!parsed.ok) {
      expect(parsed.errors.join()).toContain('沒有寫理由');
    }
  });

  it('未知的區塊種類不收：詞彙是封閉的', () => {
    const parsed = parseBrandDocument({
      ...validDocument(),
      layout: { blocks: [{ kind: 'carousel', reason: '好看' }] },
    });

    expect(parsed.ok).toBe(false);
  });

  it('缺口要講明是哪一型', () => {
    const parsed = parseBrandDocument({
      ...validDocument(),
      gaps: [{ item: 'roles.surface', what: '深色底色', type: 'unknown' }],
    });

    expect(parsed.ok).toBe(false);
  });

  it('一次回全部錯誤，不是遇到第一個就停', () => {
    const parsed = parseBrandDocument({
      schema: 1,
      payload: 'not-an-object',
      layout: { blocks: [] },
    });

    expect(parsed.ok).toBe(false);

    if (!parsed.ok) {
      expect(parsed.errors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('空白的立場句當作 null，不當作一句空話', () => {
    const parsed = parseBrandDocument({ ...validDocument(), stance: '   ' });

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.value.stance).toBeNull();
    }
  });
});

describe('讀寫路徑', () => {
  it('讀得到巢狀與陣列', () => {
    const payload = { roles: [{ id: 'ink', hex: '#111111' }], order: { text: '先紙後墨' } };

    expect(readPath(payload, 'roles.0.hex')).toBe('#111111');
    expect(readPath(payload, 'order.text')).toBe('先紙後墨');
  });

  it('讀不到回 undefined，不拋錯', () => {
    expect(readPath({}, 'roles.0.hex')).toBeUndefined();
  });

  it('寫入不改原來那份', () => {
    const before = { roles: [{ hex: 'a' }] };
    const after = writePath(before, 'roles.0.hex', 'b');

    expect(readPath(before, 'roles.0.hex')).toBe('a');
    expect(readPath(after, 'roles.0.hex')).toBe('b');
  });

  it('差異只講改了哪個欄位', () => {
    const before = { roles: [{ id: 'ink', hex: 'a' }], order: { text: 'x' } };
    const after = { roles: [{ id: 'ink', hex: 'b' }], order: { text: 'x' } };

    expect(changedPaths(before, after)).toEqual(['roles.0.hex']);
  });
});
