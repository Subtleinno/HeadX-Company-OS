import { describe, expect, it } from 'vitest';
import {
  createGraph,
  createSettingResolver,
  resolveSetting,
  unitOrder,
  unitOrderDetailed,
  wouldCreateCycle,
  type UnitEdge,
} from '../../src/org/graph.js';

/**
 * 組織圖與設定繼承（issue #81）。
 *
 * 這裡全部是純函數：只吃「未刪除的單位」與邊，不碰資料庫，也不看時鐘。
 * 繼承的次序是這張 issue 最容易寫錯的地方，所以每一條規則都有一個案例釘住它。
 */

/** 邊的簡寫：`edge('child', 'parent', 0)`。 */
function edge(childId: string, parentId: string, position = 0): UnitEdge {
  return { childId, parentId, position };
}

function graph(units: string[], edges: UnitEdge[]) {
  return createGraph({ units, edges });
}

describe('unitOrder：由近到遠', () => {
  it('單鏈：自己、父、祖父', () => {
    //   公司 ← 品牌 ← 分店
    const g = graph(['company', 'brand', 'store'], [
      edge('brand', 'company'),
      edge('store', 'brand'),
    ]);

    expect(unitOrder(g, 'store')).toEqual(['store', 'brand', 'company']);
    expect(unitOrder(g, 'brand')).toEqual(['brand', 'company']);
    expect(unitOrder(g, 'company')).toEqual(['company']);
  });

  it('同一層按路徑上各 position 由小到大比較（不是只看最後一段）', () => {
    //        D
    //     1/ \2
    //     B    C
    //   5/      \0
    //   E        F
    // D→B 的 position 是 1，D→C 是 2，所以 E（經 B，路徑 [1,5]）排在 F（經 C，路徑 [2,0]）之前，
    // 即使 E 那一段的 position 5 比 F 的 0 大。比較的是整條路徑的次序。
    const g = graph(['D', 'B', 'C', 'E', 'F'], [
      edge('D', 'B', 1),
      edge('D', 'C', 2),
      edge('B', 'E', 5),
      edge('C', 'F', 0),
    ]);

    expect(unitOrder(g, 'D')).toEqual(['D', 'B', 'C', 'E', 'F']);
    expect(unitOrderDetailed(g, 'D').map((entry) => [entry.unitId, entry.path])).toEqual([
      ['D', []],
      ['B', [1]],
      ['C', [2]],
      ['E', [1, 5]],
      ['F', [2, 0]],
    ]);
  });

  it('菱形：同一個祖先經兩條路都到得了，只出現一次', () => {
    //      D
    //    1/ \2
    //    B   C
    //     \ /
    //      A
    const g = graph(['D', 'B', 'C', 'A'], [
      edge('D', 'B', 1),
      edge('D', 'C', 2),
      edge('B', 'A', 0),
      edge('C', 'A', 0),
    ]);

    expect(unitOrder(g, 'D')).toEqual(['D', 'B', 'C', 'A']);
  });

  it('較遠的祖先不會插在較近的祖先之前（廣度優先，不是一直往上衝）', () => {
    //   D → B → A（A 在第三層），同時 D → C（第二層）
    const g = graph(['D', 'B', 'C', 'A'], [
      edge('D', 'B', 0),
      edge('D', 'C', 0),
      edge('B', 'A', 0),
    ]);

    expect(unitOrder(g, 'D')).toEqual(['D', 'B', 'C', 'A']);
  });

  it('不在圖上的單位：空陣列（呼叫者應該先回 404，不應該拿到半套答案）', () => {
    const g = graph(['company'], []);

    expect(unitOrder(g, 'unknown')).toEqual([]);
    expect(unitOrderDetailed(g, 'unknown')).toEqual([]);
  });

  it('沒有上級的孤島單位只有自己', () => {
    const g = graph(['company', 'lonely'], []);

    expect(unitOrder(g, 'lonely')).toEqual(['lonely']);
  });
});

describe('resolveSetting：繼承與來源', () => {
  const g = graph(['company', 'brand', 'store'], [
    edge('brand', 'company'),
    edge('store', 'brand'),
  ]);

  const companySettings = { company_locale: 'zh-HK', overdue_grace_hours: 0 };

  function resolver(unitSettings: { unitId: string; key: string; value: unknown }[]) {
    return createSettingResolver({ graph: g, unitSettings, companySettings });
  }

  it('完全沒有覆寫：回退 company_setting，來源標明 company', () => {
    const resolve = resolver([]);

    expect(resolve('store', 'company_locale')).toEqual({
      value: 'zh-HK',
      source: { kind: 'company' },
    });
  });

  it('自己沒有、父有：用父的值，來源是父', () => {
    const resolve = resolver([{ unitId: 'brand', key: 'overdue_grace_hours', value: 24 }]);

    expect(resolve('store', 'overdue_grace_hours')).toEqual({
      value: 24,
      source: { kind: 'unit', unitId: 'brand' },
    });
  });

  it('自己、父、祖父都有：自己勝', () => {
    const resolve = resolver([
      { unitId: 'store', key: 'overdue_grace_hours', value: 1 },
      { unitId: 'brand', key: 'overdue_grace_hours', value: 2 },
      { unitId: 'company', key: 'overdue_grace_hours', value: 3 },
    ]);

    expect(resolve('store', 'overdue_grace_hours')).toEqual({
      value: 1,
      source: { kind: 'unit', unitId: 'store' },
    });
  });

  it('較近的祖先勝過較遠的祖先', () => {
    const resolve = resolver([
      { unitId: 'brand', key: 'acceptance_rule', value: 'dept_head' },
      { unitId: 'company', key: 'acceptance_rule', value: 'owner' },
    ]);

    expect(resolve('store', 'acceptance_rule')?.source).toEqual({
      kind: 'unit',
      unitId: 'brand',
    });
  });

  it('菱形：兩個上級都有值，position 小的先', () => {
    //        D
    //     2/ \1        B 的 position 2，C 的 position 1 → C 先
    //     B   C
    //      \ /
    //       A
    const diamond = createGraph({
      units: ['A', 'B', 'C', 'D'],
      edges: [edge('D', 'B', 2), edge('D', 'C', 1), edge('B', 'A', 0), edge('C', 'A', 0)],
    });

    const resolve = createSettingResolver({
      graph: diamond,
      unitSettings: [
        { unitId: 'B', key: 'overdue_grace_hours', value: 10 },
        { unitId: 'C', key: 'overdue_grace_hours', value: 20 },
      ],
      companySettings: { overdue_grace_hours: 0 },
    });

    expect(resolve('D', 'overdue_grace_hours')).toEqual({
      value: 20,
      source: { kind: 'unit', unitId: 'C' },
    });
  });

  it('菱形：position 相同時仍然固定（用單位 id 決勝，結果不依賴輸入次序）', () => {
    const diamond = createGraph({
      units: ['A', 'B', 'C', 'D'],
      edges: [edge('D', 'B', 0), edge('D', 'C', 0), edge('B', 'A', 0), edge('C', 'A', 0)],
    });

    const forward = createSettingResolver({
      graph: diamond,
      unitSettings: [
        { unitId: 'B', key: 'overdue_grace_hours', value: 10 },
        { unitId: 'C', key: 'overdue_grace_hours', value: 20 },
      ],
      companySettings: { overdue_grace_hours: 0 },
    });

    const reversed = createSettingResolver({
      graph: diamond,
      unitSettings: [
        { unitId: 'C', key: 'overdue_grace_hours', value: 20 },
        { unitId: 'B', key: 'overdue_grace_hours', value: 10 },
      ],
      companySettings: { overdue_grace_hours: 0 },
    });

    expect(forward('D', 'overdue_grace_hours')).toEqual(reversed('D', 'overdue_grace_hours'));
  });

  it('已刪除的單位不在圖上：它的覆寫不會被採用', () => {
    // 圖是由「未刪除的單位」建出來的；store 只剩自己一條路。
    const onlyStore = createGraph({ units: ['company', 'store'], edges: [] });

    const resolve = createSettingResolver({
      graph: onlyStore,
      unitSettings: [
        { unitId: 'brand', key: 'overdue_grace_hours', value: 24 },
        { unitId: 'store', key: 'company_locale', value: 'zh-CN' },
      ],
      companySettings: { company_locale: 'zh-HK', overdue_grace_hours: 0 },
    });

    expect(resolve('store', 'overdue_grace_hours')).toEqual({
      value: 0,
      source: { kind: 'company' },
    });
  });

  it('兩邊都沒有這個 key：null（不是「空字串」也不是預設值）', () => {
    const resolve = resolver([]);

    expect(resolve('store', 'install_code')).toBeNull();
  });

  it('一shot 版本與預先建好的解析器結果一致', () => {
    const unitSettings = [{ unitId: 'brand', key: 'company_locale', value: 'zh-CN' }];

    expect(resolveSetting({ graph: g, unitSettings, companySettings }, 'store', 'company_locale')).toEqual(
      resolver(unitSettings)('store', 'company_locale'),
    );
  });
});

describe('wouldCreateCycle：API 先擋一次（真正的權威是資料庫 trigger）', () => {
  // 參數次序是（子, 父）：wouldCreateCycle(edges, childId, parentId) 問「加了這條邊會不會成環」。
  // 現有：B 的上級是 A（B→A）、C 的上級是 B（C→B）。
  const edges = [edge('B', 'A'), edge('C', 'B')];

  it('自指：一定拒絕', () => {
    expect(wouldCreateCycle(edges, 'A', 'A')).toBe(true);
  });

  it('C→B→A 之後再加 A→C 會成環', () => {
    // 加「A 的上級是 C」＝ A→C，而 C 已經可以沿上級走到 A。
    expect(wouldCreateCycle(edges, 'A', 'C')).toBe(true);
  });

  it('正常往上加（D 的上級是 A）不會成環', () => {
    expect(wouldCreateCycle(edges, 'D', 'A')).toBe(false);
  });

  it('重複的邊不算成環（重複由 409 duplicate_edge 負責）', () => {
    expect(wouldCreateCycle(edges, 'B', 'A')).toBe(false);
  });
});
