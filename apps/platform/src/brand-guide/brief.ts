import type { Pool } from 'pg';
import { listGuideBriefs } from './store.js';
import { loadStageEngine, type StageEngine } from './engine/index.js';

/**
 * 引擎的 brief 計算：品牌層、品牌集、公司層三種 scope 共用一份。
 *
 * 原本這三個函數住在 `routes.ts` 裡面（只有品牌路由用）。2026-11-17 加了
 * 公司層 04F（Boss Portal › Marketing）之後，兩邊都要算同一份 brief ——
 * 如果各寫一份，「缺幾項」在兩個畫面就會出現兩個數，而用戶一眼就見到。
 */

/** stage 的建立次序（用嚟計「前 stage」）。 */
export const STAGE_ORDER: readonly string[] = [
  'stage0',
  'stage1',
  'stage2',
  'stage3',
  'stage4a',
  'stage4b',
  'stage4c',
  'stage4d',
  'stage4e',
  'stage4f',
  'stage4g',
  'stage4h',
];

/**
 * 補齊 state 到 reference core.js 期望的完整形狀。
 *
 * core.js 的 completeness／buildBrief／prompt 都假設 state 完整（每個
 * category key 都有空陣列）。前端 mergeState 會補齊，但後端讀回的原始
 * state（或外部 agent 直接 PUT 的 state）可能缺 key，導致 `s[k].length`
 * 拋 TypeError。用 engine.emptyState() 作 base 補齊缺的 key。
 *
 * 注意：只補齊「category 陣列」key（CAT_KEYS／MAT_KEYS），唔好碰 s0/s1/...
 * （前 stage 匯入欄位，初始 null）或 rules／dials／sit（物件）。
 */
export function normalizeState(
  engine: StageEngine,
  state: Record<string, unknown>,
): Record<string, unknown> {
  const base = engine.emptyState();
  const merged: Record<string, unknown> = { ...base, ...state };
  merged.pick = { ...(base.pick as Record<string, unknown>), ...((state.pick as Record<string, unknown>) ?? {}) };
  merged.text = { ...(base.text as Record<string, unknown>), ...((state.text as Record<string, unknown>) ?? {}) };
  merged.custom = { ...(base.custom as Record<string, unknown>), ...((state.custom as Record<string, unknown>) ?? {}) };

  // category 陣列 key：只補齊「空陣列」那些（base 裡已是陣列的 key），
  // 唔好把 null（s0/s1/...）或物件（rules/dials/sit）改成 []。
  for (const key of Object.keys(base)) {
    if (key === 'pick' || key === 'text' || key === 'custom') {
      continue;
    }
    const baseValue = base[key];
    // 只有 base 本身是陣列（category key）先補；base 是 null／物件就唔好郁。
    if (Array.isArray(baseValue)) {
      if (!Array.isArray(merged[key])) {
        merged[key] = [];
      }
    }
    const custom = merged.custom as Record<string, string[]>;
    if (Array.isArray(baseValue) && custom[key] !== undefined && !Array.isArray(custom[key])) {
      custom[key] = [];
    }
  }
  return merged;
}

/**
 * 用引擎計算一個 stage 的 brief。
 *
 * 跨 stage 連繫：把前面所有 stage 的 brief 注入 state 的 s0/s1/... 欄位
 * （模擬 reference 的 autoImport），再呼叫 buildBrief。咁樣下游 stage 的
 * cross-check／下游建議／prefill／agent context 先會真正讀到前 stage 資料。
 *
 * 引擎 load 失敗或 state 空時，回一個最小的空 brief（不讓整個寫入失敗）。
 */
export function buildStageBrief(
  stage: string,
  state: Record<string, unknown>,
  priorBriefs: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  try {
    const engine = loadStageEngine(stage);
    const normalized = normalizeState(engine, state);
    const linked = engine.importPrior(normalized, priorBriefs);
    return engine.buildBrief(linked);
  } catch {
    // 引擎 load 失敗（例如缺檔案）：回空 brief，state 仍會存。
    return { schema: `brand/${stage}`, status: 'incomplete', completeness: 0, missing: [] };
  }
}

/**
 * 讀這個 scope 全部 stage 的 brief，只回「前於 stage」的（連繫用）。
 *
 * `brandId` 傳 null 就是公司層（04F 行銷內容）。
 */
export async function priorBriefs(
  pool: Pool,
  brandId: string | null,
  stage: string,
  brandSetId: string | null = null,
): Promise<Record<string, Record<string, unknown>>> {
  const idx = STAGE_ORDER.indexOf(stage);
  const all = await listGuideBriefs(pool, brandId, brandSetId);
  const out: Record<string, Record<string, unknown>> = {};

  for (const prior of STAGE_ORDER.slice(0, idx)) {
    if (all[prior] !== undefined) {
      out[prior] = all[prior];
    }
  }

  return out;
}
