import type { Pool } from 'pg';

/**
 * 範圍層 Prompt 的自訂版本（`brand_guide_prompt`）。
 *
 * 範圍（scope）不是 stage：
 *   - `brand`：品牌總覽（01–03 合計）
 *   - `set`：一套品牌集（04B–04E、04H）
 *   - `stage4a`／`stage4g`：單一固定模組（核心識別、治理）
 *
 * 空字串＝用自動版本（跟住決策即時更新）。讀回來是空字串就代表「未自訂」，
 * 不是「這份 prompt 沒有內容」—— 自動版本由前端即時砌，不需要存。
 */

/** 與 migration 0030 的 check constraint 一致。 */
export const MAX_SCOPE_PROMPT_LENGTH = 40_000;

export type ScopePromptRecord = {
  scope: string;
  prompt: string;
  updatedAt: string | null;
};

export async function getScopePrompt(
  db: Pool,
  input: { brandId: string; brandSetId: string | null; scope: string },
): Promise<ScopePromptRecord> {
  const result = await db.query<{ prompt_override: string; updated_at: Date }>(
    `select prompt_override, updated_at
       from brand_guide_prompt
      where brand_id is not distinct from $1
        and brand_set_id is not distinct from $2
        and scope = $3`,
    [input.brandId, input.brandSetId, input.scope],
  );

  const row = result.rows[0];

  return {
    scope: input.scope,
    prompt: row?.prompt_override ?? '',
    updatedAt: row === undefined ? null : row.updated_at.toISOString(),
  };
}

/**
 * 寫入／清空。
 *
 * `on conflict` 要對中同一條 partial index —— 三個 scope（公司層／品牌層／
 * 品牌集）各有一條，寫錯一條 Postgres 會報「對不上任何唯一約束」。
 * 這裡只有兩個 scope：品牌層與品牌集（公司層 04F 現時沒有範圍 prompt）。
 */
export async function saveScopePrompt(
  db: Pool,
  input: {
    brandId: string;
    brandSetId: string | null;
    scope: string;
    prompt: string;
    userId: string;
  },
): Promise<ScopePromptRecord> {
  if (input.brandSetId === null) {
    const result = await db.query<{ updated_at: Date }>(
      `insert into brand_guide_prompt (brand_id, scope, prompt_override, updated_by)
       values ($1, $2, $3, $4)
       on conflict (brand_id, scope) where brand_set_id is null
       do update set prompt_override = excluded.prompt_override,
                     updated_by = excluded.updated_by,
                     updated_at = now()
       returning updated_at`,
      [input.brandId, input.scope, input.prompt, input.userId],
    );

    return {
      scope: input.scope,
      prompt: input.prompt,
      updatedAt: result.rows[0]?.updated_at.toISOString() ?? null,
    };
  }

  const result = await db.query<{ updated_at: Date }>(
    `insert into brand_guide_prompt (brand_id, brand_set_id, scope, prompt_override, updated_by)
     values ($1, $2, $3, $4, $5)
     on conflict (brand_set_id, scope) where brand_set_id is not null
     do update set prompt_override = excluded.prompt_override,
                   updated_by = excluded.updated_by,
                   updated_at = now()
     returning updated_at`,
    [input.brandId, input.brandSetId, input.scope, input.prompt, input.userId],
  );

  return {
    scope: input.scope,
    prompt: input.prompt,
    updatedAt: result.rows[0]?.updated_at.toISOString() ?? null,
  };
}
