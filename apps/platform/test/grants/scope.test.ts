import { describe, expect, it } from 'vitest';
import {
  buildScopeGraph,
  coverScope,
  isSubsetOf,
  normalizeScope,
  sameScope,
} from '../../src/grants/scope';

/**
 * 組織範圍的集合運算（issue #83）。
 *
 * #82 的引擎答「這個身份在不在這個單位的範圍內」（成員判斷）；
 * 這裡答「我想授予的範圍有沒有超出我可以管理的範圍」（包含判斷）。
 * 兩條問題不同，所以不是同一段程式碼的複製品：
 * 一個問 x ∈ S，一個問 T ⊆ S。
 */

const graph = buildScopeGraph({
  units: ['root', 'hk', 'jp', 'shop_hk', 'shop_jp', 'warehouse'],
  edges: [
    { parentId: 'root', childId: 'hk' },
    { parentId: 'root', childId: 'jp' },
    { parentId: 'hk', childId: 'shop_hk' },
    { parentId: 'jp', childId: 'shop_jp' },
    // 菱形：倉庫同時屬於香港與日本，兩個上級。
    { parentId: 'hk', childId: 'warehouse' },
    { parentId: 'jp', childId: 'warehouse' },
  ],
});

describe('coverScope：一個範圍實際覆蓋哪些單位', () => {
  it('all 覆蓋全部未刪除的單位', () => {
    expect([...coverScope({ kind: 'all' }, graph)].sort()).toEqual([
      'hk',
      'jp',
      'root',
      'shop_hk',
      'shop_jp',
      'warehouse',
    ]);
  });

  it('units 只覆蓋列出的單位，不含後代', () => {
    expect([...coverScope({ kind: 'units', unitIds: ['hk'] }, graph)]).toEqual(['hk']);
  });

  it('subtree 覆蓋自己與所有後代', () => {
    expect([...coverScope({ kind: 'subtree', unitIds: ['hk'] }, graph)].sort()).toEqual([
      'hk',
      'shop_hk',
      'warehouse',
    ]);
  });

  it('菱形圖裡同一個單位只算一次', () => {
    const cover = coverScope({ kind: 'subtree', unitIds: ['hk', 'jp'] }, graph);

    expect(cover.size).toBe(5);
    expect(cover.has('warehouse')).toBe(true);
  });

  it('列了不存在的單位不會被當成存在', () => {
    expect([...coverScope({ kind: 'units', unitIds: ['ghost', 'hk'] }, graph)]).toEqual(['hk']);
  });

  it('圖上有環也不會無限遞迴', () => {
    const broken = buildScopeGraph({
      units: ['a', 'b'],
      edges: [
        { parentId: 'a', childId: 'b' },
        { parentId: 'b', childId: 'a' },
      ],
    });

    expect([...coverScope({ kind: 'subtree', unitIds: ['a'] }, broken)].sort()).toEqual(['a', 'b']);
  });
});

describe('isSubsetOf：可授予的範圍有沒有超出自己可管理的範圍', () => {
  it('子集回 true', () => {
    expect(isSubsetOf(new Set(['hk']), new Set(['hk', 'jp']))).toBe(true);
  });

  it('多了一個就回 false', () => {
    expect(isSubsetOf(new Set(['hk', 'jp']), new Set(['hk']))).toBe(false);
  });

  it('空集合是任何集合的子集', () => {
    expect(isSubsetOf(new Set(), new Set(['hk']))).toBe(true);
  });

  it('相等回 true', () => {
    expect(isSubsetOf(new Set(['hk']), new Set(['hk']))).toBe(true);
  });
});

describe('sameScope：兩個範圍是不是同一個範圍', () => {
  it('unitIds 次序不同但集合相同 → 同一個範圍', () => {
    expect(
      sameScope({ kind: 'subtree', unitIds: ['jp', 'hk'] }, { kind: 'subtree', unitIds: ['hk', 'jp'] }),
    ).toBe(true);
  });

  it('kind 不同 → 不同範圍（就算集合一樣）', () => {
    expect(sameScope({ kind: 'units', unitIds: ['hk'] }, { kind: 'subtree', unitIds: ['hk'] })).toBe(
      false,
    );
  });

  it('重複的 id 不影響判斷', () => {
    expect(
      sameScope({ kind: 'units', unitIds: ['hk', 'hk'] }, { kind: 'units', unitIds: ['hk'] }),
    ).toBe(true);
  });
});

describe('normalizeScope：入庫前的正規化', () => {
  it('排序、去重，令同一個集合永遠同一串', () => {
    expect(normalizeScope({ kind: 'units', unitIds: ['shop_hk', 'hk', 'shop_hk', 'jp'] })).toEqual({
      kind: 'units',
      unitIds: ['hk', 'jp', 'shop_hk'],
    });
  });

  it('all 不帶 unitIds', () => {
    expect(normalizeScope({ kind: 'all' })).toEqual({ kind: 'all' });
  });

  it('空集合保持空（由呼叫者當成不合法），不會偷偷變成全部', () => {
    expect(normalizeScope({ kind: 'units', unitIds: [] })).toEqual({ kind: 'units', unitIds: [] });
  });
});
