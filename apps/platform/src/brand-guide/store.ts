import type { Pool } from 'pg';

/**
 * 品牌引導（brand guide）：選項庫與用家答案的讀寫。
 *
 * 引導任何人由零建立品牌（選項＋答案）。
 *
 * 選項庫（brand_guide_option）是參考資料：行業帶規管 flag、牌照提醒、語氣，
 * 讓一個不懂品牌的人也能揀到「對」的方向。答案（brand_guide_answer）是可反覆
 * 改的 —— 引導是對話，不是一次過填表。
 */

export type GuideOption = {
  stage: string;
  dimension: string;
  optId: string;
  zh: string;
  description?: string;
  groupName?: string;
  sortOrder: number;
  regFlag?: string;
  licence?: string;
  tone?: string;
  extra?: Record<string, unknown>;
};

type OptionRow = {
  stage: string;
  dimension: string;
  opt_id: string;
  zh: string;
  description: string;
  group_name: string;
  sort_order: number;
  reg_flag: string | null;
  licence: string | null;
  tone: string | null;
  extra: unknown;
};

/**
 * 未設定的欄位一律省略（方案 A）：不回 null、不回空字串，只回有意義的值，
 * 防止下游 Agent 見到空值自己腦補。
 */
function toOption(row: OptionRow): GuideOption {
  const option: GuideOption = {
    stage: row.stage,
    dimension: row.dimension,
    optId: row.opt_id,
    zh: row.zh,
    sortOrder: row.sort_order,
  };

  if (row.description !== '') {
    option.description = row.description;
  }

  if (row.group_name !== '') {
    option.groupName = row.group_name;
  }

  if (row.reg_flag !== null) {
    option.regFlag = row.reg_flag;
  }

  if (row.licence !== null) {
    option.licence = row.licence;
  }

  if (row.tone !== null) {
    option.tone = row.tone;
  }

  if (typeof row.extra === 'object' && row.extra !== null) {
    option.extra = row.extra as Record<string, unknown>;
  }

  return option;
}

/**
 * 讀一個 stage 的選項，可按維度過濾。
 *
 * progressive disclosure：Agent 引導時逐個維度攞，不用一次過收成個 stage。
 * 不給 `dimension` 時回全部（仍按 stage → dimension → sort_order 排）。
 */
export async function listGuideOptions(
  db: Pool,
  stage: string,
  dimension?: string,
): Promise<GuideOption[]> {
  if (dimension === undefined) {
    const result = await db.query<OptionRow>(
      `select stage, dimension, opt_id, zh, description, group_name, sort_order,
              reg_flag, licence, tone, extra
         from brand_guide_option
        where stage = $1
        order by dimension, sort_order, opt_id`,
      [stage],
    );

    return result.rows.map(toOption);
  }

  const result = await db.query<OptionRow>(
    `select stage, dimension, opt_id, zh, description, group_name, sort_order,
            reg_flag, licence, tone, extra
       from brand_guide_option
      where stage = $1 and dimension = $2
      order by sort_order, opt_id`,
    [stage, dimension],
  );

  return result.rows.map(toOption);
}

export type GuideAnswer = {
  stage: string;
  dimension: string;
  picked?: string[];
  textValue?: string;
  updatedAt: string;
};

/**
 * Layer 1 — 品牌維度地圖（progressive disclosure 的最輕一層）。
 *
 * 一行 = 一個維度，講「有幾多選項、已答幾多」。**不含選項內容** —— Agent
 * 一嚟先攞呢層知道「要傾咩、傾到邊」，再按需要逐維度深入攞選項。
 */
export type GuideMapDimension = {
  stage: string;
  dimension: string;
  groupName: string;
  /** 這個維度在選項庫裡有幾多條選項。 */
  total: number;
  /** 已答（有答案行，且 picked 或 textValue 非空）就是 true。 */
  answered: boolean;
};

type MapRow = {
  stage: string;
  dimension: string;
  group_name: string;
  total: number;
  has_answer: boolean;
};

/**
 * 讀一個品牌的完整維度地圖（跨所有 stage）。
 *
 * 由選項庫左連答案：冇選項的維度不出（選項庫就是「要諗咩」的清單），
 * 有答案行但內容空仍算未答（空答案沒有意義）。
 */
export async function listGuideMap(db: Pool, brandId: string): Promise<GuideMapDimension[]> {
  const result = await db.query<MapRow>(
    `with opts as (
       select stage, dimension, group_name, count(*) as total
         from brand_guide_option
        group by stage, dimension, group_name
     ), ans as (
       select stage, dimension,
              (picked <> '{}' or btrim(text_value) <> '') as has_answer
         from brand_guide_answer
        where brand_id = $1
     )
     select o.stage, o.dimension, o.group_name, o.total,
            coalesce(a.has_answer, false) as has_answer
       from opts o
       left join ans a
         on a.stage = o.stage and a.dimension = o.dimension
      order by o.stage, o.dimension`,
    [brandId],
  );

  return result.rows.map((row) => ({
    stage: row.stage,
    dimension: row.dimension,
    groupName: row.group_name,
    total: Number(row.total),
    answered: row.has_answer,
  }));
}

type AnswerRow = {
  stage: string;
  dimension: string;
  picked: string[];
  text_value: string;
  updated_at: Date;
};

/**
 * 讀一個品牌在某 stage 的全部答案。
 *
 * 未答的維度不會回 —— 答案不存在就是「未答」，不畫一個假的空行。
 * 揀了的選項與自由文字如果係空，一樣省略 key（方案 A）。
 */
export async function listGuideAnswers(db: Pool, brandId: string, stage: string): Promise<GuideAnswer[]> {
  const result = await db.query<AnswerRow>(
    `select stage, dimension, picked, text_value, updated_at
       from brand_guide_answer
      where brand_id = $1 and stage = $2
      order by dimension`,
    [brandId, stage],
  );

  return result.rows.map((row) => {
    const answer: GuideAnswer = {
      stage: row.stage,
      dimension: row.dimension,
      updatedAt: row.updated_at.toISOString(),
    };

    if ((row.picked ?? []).length > 0) {
      answer.picked = row.picked;
    }

    if (row.text_value !== '') {
      answer.textValue = row.text_value;
    }

    return answer;
  });
}

/**
 * 寫一組答案（upsert，逐個維度）。
 *
 * 用 on conflict (brand_id, stage, dimension) do update —— 改答案就是更新，
 * 不是新增。揀了的選項存 opt_id 陣列，自由文字存 text_value。
 */
export async function saveGuideAnswer(
  db: Pool,
  input: {
    brandId: string;
    stage: string;
    dimension: string;
    picked: string[];
    textValue: string;
  },
): Promise<void> {
  await db.query(
    `insert into brand_guide_answer (brand_id, stage, dimension, picked, text_value, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (brand_id, stage, dimension)
     do update set picked = excluded.picked, text_value = excluded.text_value, updated_at = now()`,
    [input.brandId, input.stage, input.dimension, input.picked, input.textValue],
  );
}

/* ── 每 stage 完整 state + brief（v2，JSONB） ─────────────────── */

/**
 * 讀一個品牌在某 stage 的完整 state（category 多選、dim 單選、dial 刻度、
 * text 文字、calc 數字、自訂項）。沒有就是空物件（等於未開始）。
 *
 * `brandSetId` 有值＝讀某個品牌集（04A–04H）那一份；null＝品牌層
 * （00–03）。同一個 stage 在兩個品牌集各有自己一份答案，所以兩者不可以
 * 共用同一個查詢條件。
 */
export async function getGuideState(
  db: Pool,
  brandId: string | null,
  stage: string,
  brandSetId: string | null = null,
): Promise<Record<string, unknown>> {
  const result = await db.query<{ state: unknown }>(
    `select state from brand_guide_state
      where brand_id is not distinct from $1 and stage = $2
        and brand_set_id is not distinct from $3`,
    [brandId, stage, brandSetId],
  );

  if (result.rowCount === 0) {
    return {};
  }

  const state = result.rows[0]?.state;

  return typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
}

/**
 * 寫一個品牌在某 stage 的完整 state（整份覆蓋，upsert）。
 *
 * state 是 reference 的完整狀態（emptyState 之後 s 對象），一 stage 一份。
 * brief 是 buildBrief(s) 的輸出（completeness/checks/hints/approval/agent_rules），
 * 由引擎計算後一併存，供下游 stage autoImport 與創作時攞。
 */
export async function saveGuideState(
  db: Pool,
  input: {
    /** null ＝ 公司層（04F 行銷內容，全公司共用）。 */
    brandId: string | null;
    stage: string;
    state: Record<string, unknown>;
    brief?: Record<string, unknown>;
    /** 有值＝寫進某個品牌集；null／undefined＝品牌層。 */
    brandSetId?: string | null;
  },
): Promise<void> {
  const brief = input.brief === undefined ? null : JSON.stringify(input.brief);

  // 由 0029 起有三個 scope，唯一鍵是三條 partial index：
  //   公司層 (stage) where brand_id is null
  //   品牌層 (brand_id, stage) where brand_set_id is null
  //   品牌集 (brand_set_id, stage) where brand_set_id is not null
  // upsert 一定要講中同一條，否則 Postgres 會報「對不上任何唯一約束」。
  if (input.brandId === null) {
    await db.query(
      `insert into brand_guide_state (brand_id, stage, state, brief, updated_at)
       values (null, $1, $2::jsonb, $3::jsonb, now())
       on conflict (stage) where brand_id is null
       do update set state = excluded.state, brief = excluded.brief, updated_at = now()`,
      [input.stage, JSON.stringify(input.state), brief],
    );

    return;
  }

  if (input.brandSetId === undefined || input.brandSetId === null) {
    await db.query(
      `insert into brand_guide_state (brand_id, stage, state, brief, updated_at)
       values ($1, $2, $3::jsonb, $4::jsonb, now())
       on conflict (brand_id, stage) where brand_set_id is null
       do update set state = excluded.state, brief = excluded.brief, updated_at = now()`,
      [input.brandId, input.stage, JSON.stringify(input.state), brief],
    );

    return;
  }

  await db.query(
    `insert into brand_guide_state (brand_id, brand_set_id, stage, state, brief, updated_at)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, now())
     on conflict (brand_set_id, stage) where brand_set_id is not null
     do update set state = excluded.state, brief = excluded.brief, updated_at = now()`,
    [input.brandId, input.brandSetId, input.stage, JSON.stringify(input.state), brief],
  );
}

/**
 * 讀一個品牌在某 stage 的 brief（buildBrief 輸出）。
 * 沒有就是 null（未計算過）。
 */
export async function getGuideBrief(
  db: Pool,
  brandId: string | null,
  stage: string,
  brandSetId: string | null = null,
): Promise<Record<string, unknown> | null> {
  const result = await db.query<{ brief: unknown }>(
    `select brief from brand_guide_state
      where brand_id is not distinct from $1 and stage = $2
        and brand_set_id is not distinct from $3`,
    [brandId, stage, brandSetId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const brief = result.rows[0]?.brief;

  return typeof brief === 'object' && brief !== null ? (brief as Record<string, unknown>) : null;
}

/**
 * 讀一個品牌所有 stage 的 brief（跨 stage 連繫用）。
 *
 * 下游 stage autoImport 時讀前面 stage 的 brief。回 stage -> brief 的 map，
 * 只回有 brief 的 stage（省略 key 原則：未計算的 stage 不出現）。
 *
 * 品牌集的 04A–04H 一定要連品牌層 00–03 的 brief 一齊讀：04 的內容
 * 是靠 01–03 定位才寫得出來。所以分兩次讀再合併，同名 stage 以品牌集的
 * 為準（品牌集自己不應該有 01–03 的 brief，但真的有人寫了就照它的）。
 */
export async function listGuideBriefs(
  db: Pool,
  brandId: string | null,
  brandSetId: string | null = null,
): Promise<Record<string, Record<string, unknown>>> {
  const result = await db.query<{ stage: string; brief: unknown }>(
    `select stage, brief
       from brand_guide_state
      where brand_id is not distinct from $1
        and brand_set_id is not distinct from $2
        and brief is not null
        and brief <> '{}'::jsonb
      order by stage`,
    [brandId, brandSetId],
  );

  const out: Record<string, Record<string, unknown>> = {};

  if (brandSetId !== null && brandId !== null) {
    const brandLevel = await listGuideBriefs(db, brandId, null);
    Object.assign(out, brandLevel);
  }

  for (const row of result.rows) {
    if (typeof row.brief === 'object' && row.brief !== null) {
      out[row.stage] = row.brief as Record<string, unknown>;
    }
  }

  return out;
}
