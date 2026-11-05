import type { UnitScope } from '@company-os/contracts';

/**
 * 組織範圍的集合運算（issue #83）。
 *
 * 為甚麼不是重用 #82 的引擎：`packages/policy` 答的是「這個身份在不在這個單位的範圍內」
 * （x ∈ S，成員判斷）；這裡答的是「我想授予的範圍有沒有超出我可以管理的範圍」
 * （T ⊆ S，包含判斷）。兩條問題不同 —— 一個人在 A 單位有權，不代表他可以把
 * 「A 及其所有下級」當成自己的範圍再轉授予人。
 *
 * 純函數：吃一份組織圖與一個範圍，吐一個集合。不查資料庫。
 */

export type ScopeEdge = {
  parentId: string;
  childId: string;
};

export type ScopeGraph = {
  /** 全部未刪除的單位。 */
  readonly units: ReadonlySet<string>;
  /** 由上級找下級（展開 subtree 用）。 */
  readonly childrenOf: ReadonlyMap<string, readonly string[]>;
  /** 由下級找上級（給呼叫者組 #82 的 OrgSnapshot 用，這裡不展開）。 */
  readonly parentsOf: ReadonlyMap<string, readonly string[]>;
};

export function buildScopeGraph(input: {
  units: readonly string[];
  edges: readonly ScopeEdge[];
}): ScopeGraph {
  const units = new Set(input.units);
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const edge of input.edges) {
    // 兩端都要在圖上：一端已刪除的邊不算數（與 #81 的繼承規則一致）。
    if (!units.has(edge.parentId) || !units.has(edge.childId)) {
      continue;
    }

    const childList = children.get(edge.parentId) ?? [];
    childList.push(edge.childId);
    children.set(edge.parentId, childList);

    const parentList = parents.get(edge.childId) ?? [];
    parentList.push(edge.parentId);
    parents.set(edge.childId, parentList);
  }

  return { units, childrenOf: children, parentsOf: parents };
}

/**
 * 這個範圍實際覆蓋哪些單位。
 *
 *   all      → 全部未刪除的單位
 *   units    → 只覆蓋列出的單位，不含下級
 *   subtree  → 列出的單位與它們的全部下級
 *
 * 列了不存在（或已刪除）的單位不會被當成存在 —— 呼叫者應該另外回一個 422，
 * 這裡只負責算集合。圖上有環也不會無限遞迴（用 visited 去重）。
 */
export function coverScope(scope: UnitScope, graph: ScopeGraph): Set<string> {
  if (scope.kind === 'all') {
    return new Set(graph.units);
  }

  const cover = new Set<string>();

  for (const unitId of scope.unitIds) {
    if (!graph.units.has(unitId)) {
      continue;
    }

    cover.add(unitId);
  }

  if (scope.kind === 'units') {
    return cover;
  }

  const queue = [...cover];

  while (queue.length > 0) {
    const current = queue.shift() as string;

    for (const child of graph.childrenOf.get(current) ?? []) {
      if (cover.has(child)) {
        continue;
      }

      cover.add(child);
      queue.push(child);
    }
  }

  return cover;
}

/** T ⊆ S。空集合是任何集合的子集。 */
export function isSubsetOf(subset: ReadonlySet<string>, superset: ReadonlySet<string>): boolean {
  for (const item of subset) {
    if (!superset.has(item)) {
      return false;
    }
  }

  return true;
}

/** 排序、去重。入庫前的正規化：同一個集合永遠同一串，唯一索引才擋得住重複。 */
export function normalizeScope(scope: UnitScope): UnitScope {
  if (scope.kind === 'all') {
    return { kind: 'all' };
  }

  const unitIds = [...new Set(scope.unitIds)].sort((left, right) => left.localeCompare(right));

  return { kind: scope.kind, unitIds };
}

/** 兩個範圍是不是同一個範圍（次序與重複不影響）。 */
export function sameScope(left: UnitScope, right: UnitScope): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  // kind 已經相同，所以兩邊一齊是 all 或者一齊不是；寫成 OR 令型別也收窄得到。
  if (left.kind === 'all' || right.kind === 'all') {
    return true;
  }

  const a = [...new Set(left.unitIds)].sort((x, y) => x.localeCompare(y));
  const b = [...new Set(right.unitIds)].sort((x, y) => x.localeCompare(y));

  return a.length === b.length && a.every((unitId, index) => unitId === b[index]);
}
