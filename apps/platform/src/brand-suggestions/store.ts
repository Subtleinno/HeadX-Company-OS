import type { Pool } from 'pg';
import { createPage, type BrandPageView } from '../brand-pages/store.js';

/**
 * 品牌專屬系統建議（issue #60）。
 *
 * 建議由 agent 提出：它在標誌、色彩、字體、語氣之外找到一個品牌專屬的系統
 * （例：天空漸層）。**三項判斷皆是**才會出現 —— 獨有、重複使用、其他頁放
 * 不下。三缺一就不是一個系統，只是一件可以塞進既有頁的事。
 *
 * 三個誠實位：
 *   1. 三項判斷的**理由**一併存。老闆決定接受與否，靠的是理由，不是勾。
 *   2. 略過是決定，不是取消：簽名留在歷史裡，同一份內容不再提。內容明顯
 *      變化＝簽名改變，才可以是新的一次建議。
 *   3. 其實屬於既有頁 → 不開新頁，記 `belongs_to`，在那一頁頂部講一句。
 */

export type SuggestionState = 'pending' | 'dismissed' | 'accepted';

export type SuggestionView = {
  id: string;
  signature: string;
  name: string;
  slug: string;
  brief: string;
  checks: { unique: string; repeated: string; noRoom: string };
  refs: string[];
  belongsTo: string | null;
  state: SuggestionState;
  createdAt: string;
};

type SuggestionRow = {
  id: string;
  signature: string;
  name: string;
  slug: string;
  brief: string;
  reasons: unknown;
  refs: unknown;
  belongs_to: string | null;
  state: SuggestionState;
  created_at: Date;
};

/** 讀 `reasons`／`refs` 時不假設形狀：舊資料可能是 null 或者缺鍵。 */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
}

function reasonsOf(value: unknown): { unique: string; repeated: string; noRoom: string } {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const read = (key: string): string => (typeof record[key] === 'string' ? record[key] : '');

  return { unique: read('unique'), repeated: read('repeated'), noRoom: read('noRoom') };
}

function view(row: SuggestionRow): SuggestionView {
  return {
    id: row.id,
    signature: row.signature,
    name: row.name,
    slug: row.slug,
    brief: row.brief,
    checks: reasonsOf(row.reasons),
    refs: strings(row.refs),
    belongsTo: row.belongs_to,
    state: row.state,
    createdAt: row.created_at.toISOString(),
  };
}

/** 等決定的建議，新的在前。全部品牌的歷史不在此列。 */
export async function listSuggestions(db: Pool, brandId: string): Promise<SuggestionView[]> {
  const result = await db.query<SuggestionRow>(
    `select id, signature, name, slug, brief, reasons, refs, belongs_to, state, created_at
       from brand_page_suggestion
      where brand_id = $1 and state = 'pending'
      order by created_at desc`,
    [brandId],
  );

  return result.rows.map(view);
}

export type RecordInput = {
  brandId: string;
  signature: string;
  name: string;
  slug: string;
  brief: string;
  unique: { ok: boolean; reason: string };
  repeated: { ok: boolean; reason: string };
  noRoom: { ok: boolean; reason: string };
  refs: string[];
  belongsTo: string | null;
  createdBy: string | null;
};

export type RecordResult =
  | { status: 'ok'; suggestion: SuggestionView; created: boolean }
  | { status: 'not_eligible'; missing: string[] }
  | { status: 'duplicate_signature' };

/**
 * 記一個建議。
 *
 * 「三項皆是」在這裡擋一次，DB 的 `three_checks` 再擋一次：應用層擋是為了
 * 回一句人看得懂的錯，DB 擋是因為日後一定會有第二條寫入路徑。
 *
 * 重複提出同一個簽名而它已經等決定：回 `duplicate_signature`，不開第二張。
 * 已經被略過的同一簽名**可以**再寫一筆 pending —— 那是「內容真的變了」的
 * 訊號，agent 會給一個新簽名；同一個簽名代表內容沒變，所以仍然是重複。
 */
export async function recordSuggestion(db: Pool, input: RecordInput): Promise<RecordResult> {
  const missing: string[] = [];

  if (!input.unique.ok) {
    missing.push('unique');
  }

  if (!input.repeated.ok) {
    missing.push('repeated');
  }

  if (!input.noRoom.ok) {
    missing.push('noRoom');
  }

  if (missing.length > 0) {
    return { status: 'not_eligible', missing };
  }

  const dismissed = await db.query<{ n: number }>(
    `select count(*)::int as n
       from brand_page_suggestion
      where brand_id = $1 and signature = $2 and state = 'dismissed'`,
    [input.brandId, input.signature],
  );

  if ((dismissed.rows[0]?.n ?? 0) > 0) {
    // 同一個簽名被略過之後不再出現（issue #60 驗收）。內容變了＝新簽名。
    return { status: 'duplicate_signature' };
  }

  try {
    const inserted = await db.query<SuggestionRow>(
      `insert into brand_page_suggestion
         (brand_id, signature, name, slug, brief, unique_ok, repeated_ok, no_room_ok,
          reasons, refs, belongs_to, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)
       on conflict do nothing
       returning id, signature, name, slug, brief, reasons, refs, belongs_to, state, created_at`,
      [
        input.brandId,
        input.signature,
        input.name,
        input.slug,
        input.brief,
        input.unique.ok,
        input.repeated.ok,
        input.noRoom.ok,
        JSON.stringify({ unique: input.unique.reason, repeated: input.repeated.reason, noRoom: input.noRoom.reason }),
        JSON.stringify(input.refs),
        input.belongsTo,
        input.createdBy,
      ],
    );

    const row = inserted.rows[0];

    if (row === undefined) {
      return { status: 'duplicate_signature' };
    }

    return { status: 'ok', suggestion: view(row), created: true };
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === '23505') {
      return { status: 'duplicate_signature' };
    }

    throw error;
  }
}

export type DecisionResult =
  | { status: 'ok'; page: BrandPageView | null; suggestion: SuggestionView }
  | { status: 'not_found' }
  | { status: 'already_decided'; state: SuggestionState }
  | { status: 'slug_taken'; slug: string; pageName: string };

async function load(db: Pool, brandId: string, id: string): Promise<SuggestionRow | null> {
  const result = await db.query<SuggestionRow>(
    `select id, signature, name, slug, brief, reasons, refs, belongs_to, state, created_at
       from brand_page_suggestion
      where brand_id = $1 and id = $2`,
    [brandId, id],
  );

  return result.rows[0] ?? null;
}

/** 接受：建立自定義頁並寫入 brief。頁是結果，建議是來源 —— 兩者都留著。 */
export async function acceptSuggestion(
  db: Pool,
  input: { brandId: string; suggestionId: string; brief?: string; decidedBy: string | null },
): Promise<DecisionResult> {
  const row = await load(db, input.brandId, input.suggestionId);

  if (row === null) {
    return { status: 'not_found' };
  }

  if (row.state !== 'pending') {
    return { status: 'already_decided', state: row.state };
  }

  const brief = (input.brief ?? row.brief).trim();
  const created = await createPage(db, {
    brandId: input.brandId,
    name: row.name,
    slug: row.slug,
    brief: brief === '' ? row.brief : brief,
  });

  if (created.status === 'conflict') {
    return { status: 'slug_taken', slug: created.key, pageName: created.name };
  }

  if (created.status === 'fixed_key') {
    return { status: 'slug_taken', slug: created.key, pageName: created.key };
  }

  const updated = await db.query<SuggestionRow>(
    `update brand_page_suggestion
        set state = 'accepted', decided_at = now(), decided_by = $3
      where brand_id = $1 and id = $2 and state = 'pending'
      returning id, signature, name, slug, brief, reasons, refs, belongs_to, state, created_at`,
    [input.brandId, input.suggestionId, input.decidedBy],
  );

  const decided = updated.rows[0];

  return decided === undefined
    ? { status: 'already_decided', state: 'accepted' }
    : { status: 'ok', page: created.page, suggestion: view(decided) };
}

/** 略過的結果：不會建立頁，所以沒有 `slug_taken` 這一種。 */
export type DismissResult =
  | { status: 'ok'; page: null; suggestion: SuggestionView }
  | { status: 'not_found' }
  | { status: 'already_decided'; state: SuggestionState };

/** 略過：留下簽名，同一份內容不再提。不是刪除。 */
export async function dismissSuggestion(
  db: Pool,
  input: { brandId: string; suggestionId: string; decidedBy: string | null },
): Promise<DismissResult> {
  const row = await load(db, input.brandId, input.suggestionId);

  if (row === null) {
    return { status: 'not_found' };
  }

  if (row.state !== 'pending') {
    return { status: 'already_decided', state: row.state };
  }

  const updated = await db.query<SuggestionRow>(
    `update brand_page_suggestion
        set state = 'dismissed', decided_at = now(), decided_by = $3
      where brand_id = $1 and id = $2 and state = 'pending'
      returning id, signature, name, slug, brief, reasons, refs, belongs_to, state, created_at`,
    [input.brandId, input.suggestionId, input.decidedBy],
  );

  const decided = updated.rows[0];

  return decided === undefined
    ? { status: 'already_decided', state: 'dismissed' }
    : { status: 'ok', page: null, suggestion: view(decided) };
}
