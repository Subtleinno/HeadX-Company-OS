/**
 * 組織圖與設定繼承（issue #81／決策 C18）。
 *
 * 公司在資料裡表達品牌、國家分部、法人；一個單位可以有多個上級（菱形是正常形狀，
 * 不是例外）。這個檔只有純函數：吃「未刪除的單位」與邊，吐出次序與有效值。
 * 不查資料庫、不看時鐘 —— 呼叫者決定要讀哪些列。
 *
 * 次序的規則是這張 issue 的核心：
 *   1. 先看自己，再一層一層往外（廣度優先，近的一定先於遠的）。
 *   2. 同一層之內，比較「由起點走到該單位的路徑上，每一段邊的 position」，
 *      由小到大（字典序），不是只比最後一段。
 *      D→B(1)→E(5) 與 D→C(2)→F(0)：路徑是 [1,5] 與 [2,0]，所以 E 先於 F ——
 *      即使 5 > 0。比的是整條路徑的次序，不是單一段。
 *   3. position 完全相同時用單位 id 決勝，保證同一個圖永遠得出同一個答案
 *      （不依賴資料庫回來的列次序）。
 */

export type UnitEdge = {
  parentId: string;
  childId: string;
  position: number;
};

export type OrgGraph = {
  /** 圖上有哪些單位（呼叫者只應該放未刪除的）。 */
  readonly units: ReadonlySet<string>;
  /** 子單位 → 上級清單（已按 position、parentId 排好）。 */
  readonly parentsOf: ReadonlyMap<string, readonly { parentId: string; position: number }[]>;
};

export type OrderEntry = {
  unitId: string;
  depth: number;
  /** 由起點到這個單位的每一段 position。 */
  path: number[];
};

export function createGraph(input: {
  units: readonly string[];
  edges: readonly UnitEdge[];
}): OrgGraph {
  const units = new Set(input.units);
  const parents = new Map<string, { parentId: string; position: number }[]>();

  for (const edge of input.edges) {
    // 兩端都要在圖上：一端被刪除的邊不再算數（軟刪除的單位不參與繼承）。
    if (!units.has(edge.childId) || !units.has(edge.parentId)) {
      continue;
    }

    const list = parents.get(edge.childId) ?? [];
    list.push({ parentId: edge.parentId, position: edge.position });
    parents.set(edge.childId, list);
  }

  for (const list of parents.values()) {
    list.sort((left, right) =>
      left.position === right.position
        ? left.parentId.localeCompare(right.parentId)
        : left.position - right.position,
    );
  }

  return { units, parentsOf: parents };
}

/** 路徑的字典序比較；短的前（同一層不會出現，但保持定義完整）。 */
function comparePath(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const a = left[index] as number;
    const b = right[index] as number;

    if (a !== b) {
      return a - b;
    }
  }

  return left.length - right.length;
}

/** 由近到遠的比較：先層次，再路徑，最後用 id 決勝（同一個圖永遠同一個答案）。 */
function compareEntries(left: OrderEntry, right: OrderEntry): number {
  if (left.depth !== right.depth) {
    return left.depth - right.depth;
  }

  const byPath = comparePath(left.path, right.path);

  if (byPath !== 0) {
    return byPath;
  }

  return left.unitId.localeCompare(right.unitId);
}

/**
 * 由近到遠的完整次序，連 depth 與路徑都交出來（測試與除錯用）。
 * 不在圖上的單位回空陣列：呼叫者應該先 404，不應該拿到半套答案。
 */
export function unitOrderDetailed(graph: OrgGraph, unitId: string): OrderEntry[] {
  if (!graph.units.has(unitId)) {
    return [];
  }

  const result: OrderEntry[] = [];
  const visited = new Set<string>();
  const frontier: OrderEntry[] = [{ unitId, depth: 0, path: [] }];

  while (frontier.length > 0) {
    // 每次取現時最靠近的那一個。
    let bestIndex = 0;

    for (let index = 1; index < frontier.length; index += 1) {
      if (compareEntries(frontier[index] as OrderEntry, frontier[bestIndex] as OrderEntry) < 0) {
        bestIndex = index;
      }
    }

    const entry = frontier.splice(bestIndex, 1)[0] as OrderEntry;

    // 同一個單位可能經兩條路都到得了：走到它最靠近的那條路就已經定案，其餘的副本丟掉。
    if (visited.has(entry.unitId)) {
      continue;
    }

    visited.add(entry.unitId);
    result.push(entry);

    for (const parent of graph.parentsOf.get(entry.unitId) ?? []) {
      if (!visited.has(parent.parentId)) {
        frontier.push({
          unitId: parent.parentId,
          depth: entry.depth + 1,
          path: [...entry.path, parent.position],
        });
      }
    }
  }

  return result;
}

/** 由近到遠的單位 id（含自己）。 */
export function unitOrder(graph: OrgGraph, unitId: string): string[] {
  return unitOrderDetailed(graph, unitId).map((entry) => entry.unitId);
}

/**
 * 加一條「child 的上級是 parent」的邊會不會成環。
 *
 * 這是 API 的前置檢查，用來回一個講得清楚的 409；**權威仍然是資料庫的 trigger**，
 * 因為兩個人同時加邊時，先檢查後寫入之間一定有窗口。
 */
export function wouldCreateCycle(
  edges: readonly UnitEdge[],
  childId: string,
  parentId: string,
): boolean {
  if (childId === parentId) {
    return true;
  }

  const parents = new Map<string, string[]>();

  for (const edge of edges) {
    const list = parents.get(edge.childId) ?? [];
    list.push(edge.parentId);
    parents.set(edge.childId, list);
  }

  // 由 parent 一直往上走；走到 child 就代表 child 已經是 parent 的祖先。
  const seen = new Set<string>();
  const stack = [parentId];

  while (stack.length > 0) {
    const current = stack.pop() as string;

    if (current === childId) {
      return true;
    }

    if (seen.has(current)) {
      continue;
    }

    seen.add(current);
    stack.push(...(parents.get(current) ?? []));
  }

  return false;
}

export type UnitSettingRow = {
  unitId: string;
  key: string;
  value: unknown;
};

export type ResolverInput = {
  graph: OrgGraph;
  unitSettings: readonly UnitSettingRow[];
  /** 整間公司的值（company_setting）。最上層的回退。 */
  companySettings: Readonly<Record<string, unknown>>;
};

export type SettingSource = { kind: 'company' } | { kind: 'unit'; unitId: string };

export type ResolvedSetting = {
  value: unknown;
  source: SettingSource;
};

/**
 * 建一個「查一個 key 的有效值」的解析器。
 * 同一個請求要查四個 key 時用這個，不必每次重建索引。
 *
 * 回傳 null 代表「單位與公司都沒有這個 key」——不是空字串、也不是任何預設值。
 * 假裝有一個值比誠實說「沒有」更危險：下游會拿它去做決定。
 */
export function createSettingResolver(
  input: ResolverInput,
): (unitId: string, key: string) => ResolvedSetting | null {
  const byUnit = new Map<string, Map<string, unknown>>();

  for (const row of input.unitSettings) {
    const map = byUnit.get(row.unitId) ?? new Map<string, unknown>();
    map.set(row.key, row.value);
    byUnit.set(row.unitId, map);
  }

  return (unitId, key) => {
    for (const candidate of unitOrder(input.graph, unitId)) {
      const map = byUnit.get(candidate);

      if (map?.has(key) === true) {
        return { value: map.get(key), source: { kind: 'unit', unitId: candidate } };
      }
    }

    if (Object.prototype.hasOwnProperty.call(input.companySettings, key)) {
      return { value: input.companySettings[key], source: { kind: 'company' } };
    }

    return null;
  };
}

/** 只查一個 key 的簡便版本。 */
export function resolveSetting(
  input: ResolverInput,
  unitId: string,
  key: string,
): ResolvedSetting | null {
  return createSettingResolver(input)(unitId, key);
}
