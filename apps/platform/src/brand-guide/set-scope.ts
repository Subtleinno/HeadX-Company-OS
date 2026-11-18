import type { Pool } from 'pg';
import { findBrandSet } from '../brand-sets/store.js';
import { isUuid } from './schema.js';

/**
 * 「這一份答案屬於邊個品牌集？」——04 的 scope 判斷。
 *
 * 01–03 只有一份，寫在品牌層（`brand_set_id is null`）。04B–04E、04H 屬於
 * 品牌集：同一個 brand 可以同時有 2026 夏季、2026 冬季兩套，答案互不相干。
 *
 * 2026-11-17 晚老闆再收窄：三個 stage 不再住品牌集 ——
 *   04A 核心識別、04G 治理   → 品牌層（跟品牌走，不常改；住在品牌模組左欄）
 *   04F 行銷內容            → 公司層（`brand_id is null`，只有老闆看到，見 marketing）
 * 理由同老闆講的一樣：核心識別與治理是「這個品牌是誰」，不是「這批東西點做」；
 * 行銷策略是全公司共用而且要保密。把它們留在品牌集，使用者每開一套新做法就要
 * 重填一次核心識別，而且四份答案會慢慢分叉。
 *
 * 為什麼用 query string `?setId=` 而不是另開一整組 `/brand-sets/:id/...`：
 * 兩組路由會變成兩份一模一樣的處理器（驗權限、驗 blockId、寫審計），
 * 日後改一邊忘一邊就會出現「人寫得、agent 寫唔得」這種鬼故事。同一條路由
 * 多一個 scope 參數，只有一處判斷。
 *
 * 三種情況分清楚：
 *   - 冇 setId：品牌層。04A／04G 以及舊資料都是這樣讀寫。
 *   - setId 有值但唔屬於這個品牌：404，不讓「知道 uuid 就改得到別人品牌」。
 *   - setId 有值但 stage 唔係品牌集的 stage：400，講明品牌集只裝哪幾個。
 */

/** 只有這五個 stage 屬於品牌集。 */
export const SET_STAGES: readonly string[] = [
  'stage4b',
  'stage4c',
  'stage4d',
  'stage4e',
  'stage4h',
];

/**
 * 只有這一個 stage 屬於公司層（沒有品牌）。
 *
 * 行銷策略是全公司共用、由老闆自己定：寫在 `brand_id is null` 那一列，
 * 任何品牌都讀同一份。要加第二個公司層 stage 就加在這裡，路由／權限已經通用。
 */
export const COMPANY_STAGES: readonly string[] = ['stage4f'];

export type SetScope =
  | { ok: true; brandSetId: string | null }
  | { ok: false; status: number; body: Record<string, unknown> };

export type SetRef =
  | { ok: true; brandSetId: string | null }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * 只驗「這個品牌集是不是這個品牌的」，不驗 stage。
 *
 * 用於沒有 stage 的端點（例如「這套品牌集 04A–04H 的進度」）。
 */
export async function resolveSetRef(pool: Pool, brandId: string, raw: unknown): Promise<SetRef> {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, brandSetId: null };
  }

  if (typeof raw !== 'string' || !isUuid(raw)) {
    return { ok: false, status: 400, body: { error: 'invalid_set_id', setId: raw } };
  }

  const set = await findBrandSet(pool, raw);

  if (set === null || set.brandId !== brandId) {
    return { ok: false, status: 404, body: { error: 'brand_set_not_found', setId: raw } };
  }

  if (set.deletedAt !== null) {
    return { ok: false, status: 409, body: { error: 'brand_set_deleted', setId: raw } };
  }

  return { ok: true, brandSetId: raw };
}

export async function resolveSetScope(
  pool: Pool,
  brandId: string,
  stage: string,
  raw: unknown,
): Promise<SetScope> {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, brandSetId: null };
  }

  if (typeof raw !== 'string' || !isUuid(raw)) {
    return { ok: false, status: 400, body: { error: 'invalid_set_id', setId: raw } };
  }

  const set = await findBrandSet(pool, raw);

  if (set === null || set.brandId !== brandId) {
    return { ok: false, status: 404, body: { error: 'brand_set_not_found', setId: raw } };
  }

  if (set.deletedAt !== null) {
    return { ok: false, status: 409, body: { error: 'brand_set_deleted', setId: raw } };
  }

  if (!SET_STAGES.includes(stage)) {
    return {
      ok: false,
      status: 400,
      body: { error: 'set_stage_mismatch', setId: raw, stage },
    };
  }

  return { ok: true, brandSetId: raw };
}
