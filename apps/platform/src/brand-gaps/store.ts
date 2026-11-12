import type { Pool, PoolClient } from 'pg';
import { composePages } from '../brand-pages/store.js';
import { deriveState, type NeedState } from '../needs/schema.js';

/**
 * 品牌缺口與 Need 的連結（issue #58）。
 *
 * 缺什麼由**文件**講（`document.gaps`）；這一支只補三件事：
 *   1. 這一個缺口是否已經交了給人跟（`brand_gap` ＋ `need`）。
 *   2. 那個 Need 現在去到哪（狀態由四個時間戳推導，沿用 C06）。
 *   3. 一鍵建立 Need，重複按不會開第二張工單。
 *
 * 為什麼關閉狀態不另存：Need 驗收之後缺口就關閉。存一個 `closed` 欄位，
 * 就會出現「Need 已驗收、缺口仍開着」這種兩個真相。所以關閉是算出來的。
 */

export type GapView = {
  pageKey: string;
  pageName: string;
  item: string;
  what: string;
  type: 'file' | 'judgement';
  ruleId: string | null;
  needId: string | null;
  needCode: string | null;
  needState: NeedState | null;
  assigneeName: string | null;
};

export type GapCounts = { total: number; file: number; judgement: number; open: number };

type GapRow = {
  page_key: string;
  item: string;
  need_id: string;
  need_code: string;
  claimed_at: Date | null;
  uploaded_at: Date | null;
  absorbed_at: Date | null;
  accepted_at: Date | null;
  assignee_name: string | null;
};

/**
 * 這個品牌的全部缺口。
 *
 * **兩個來源合併**：文件的缺口（現行版本有哪幾個）＋ 已建立的 Need（誰在跟）。
 * 一個缺口建立了 Need 之後，文件那邊不會消失 —— 它是同一件事的兩面，不是
 * 兩筆資料。
 */
export async function listGaps(db: Pool, brandId: string): Promise<GapView[]> {
  const pages = await composePages(db, brandId);

  const registered = await db.query<GapRow>(
    `select p.key as page_key, g.item, n.id as need_id, n.code as need_code,
            n.claimed_at, n.uploaded_at, n.absorbed_at, n.accepted_at,
            u.display_name as assignee_name
       from brand_gap g
       join brand_page p on p.id = g.page_id
       join need n on n.id = g.need_id
       left join app_user u on u.id = n.assignee_id
      where g.brand_id = $1`,
    [brandId],
  );

  const byKey = new Map<string, GapRow>();

  for (const row of registered.rows) {
    byKey.set(`${row.page_key}\u0000${row.item}`, row);
  }

  const items: GapView[] = [];

  for (const page of pages) {
    for (const gap of page.document.gaps) {
      const row = byKey.get(`${page.key}\u0000${gap.item}`);
      const state =
        row === undefined
          ? null
          : deriveState({
              claimedAt: row.claimed_at,
              uploadedAt: row.uploaded_at,
              absorbedAt: row.absorbed_at,
              acceptedAt: row.accepted_at,
            });

      items.push({
        pageKey: page.key,
        pageName: page.name,
        item: gap.item,
        what: gap.what,
        type: gap.type,
        ruleId: gap.ruleId ?? null,
        needId: row?.need_id ?? null,
        needCode: row?.need_code ?? null,
        needState: state,
        assigneeName: row?.assignee_name ?? null,
      });
    }
  }

  return items;
}

export function countGaps(items: readonly GapView[]): GapCounts {
  return {
    total: items.length,
    file: items.filter((item) => item.type === 'file').length,
    judgement: items.filter((item) => item.type === 'judgement').length,
    open: items.filter((item) => item.needState === null || item.needState !== 'closed').length,
  };
}

/**
 * 建立一個 Need 的編號。
 *
 * 格式由資料庫的 check 約束（`COS-<安裝>-###`）。安裝代碼用公司設定裡的
 * `edition`（`intl` → `INTL`）：這是安裝層級的東西，不是品牌層級 ——
 * 兩個品牌各自由 001 開始，人就會見到兩個 `COS-HK-001`。
 *
 * 撞號就試下一個：`need_code_idx` 是唯一索引，寧願多試一次，也不要回一個
 * 「建立失敗」給剛剛按了一鍵的人。
 */
async function nextNeedCode(client: PoolClient): Promise<string> {
  const edition = await client.query<{ value: string }>(
    "select value #>> '{}' as value from company_setting where key = 'edition'",
  );

  const raw = (edition.rows[0]?.value ?? 'hx').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const install = raw.slice(0, 8) === '' ? 'HX' : raw.slice(0, 8);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const count = await client.query<{ n: number }>('select count(*)::int as n from need');
    const seq = String((count.rows[0]?.n ?? 0) + 1 + attempt).padStart(3, '0');
    const code = `COS-${install}-${seq}`;
    const taken = await client.query('select 1 from need where code = $1', [code]);

    if (taken.rowCount === 0) {
      return code;
    }
  }

  throw new Error('連續 50 個 Need 編號都被佔用');
}

export type CreateGapNeedInput = {
  brandId: string;
  pageKey: string;
  item: string;
  actorId: string;
  isOwner: boolean;
};

export type CreateGapNeedResult =
  | { status: 'ok'; needId: string; needCode: string; created: boolean }
  | { status: 'page_missing' }
  | { status: 'not_a_gap' }
  /** 判斷型缺口只有老闆可以開單（外判／設計師要交給老闆決定）。 */
  | { status: 'owner_only' };

/**
 * 一鍵建立 Need。
 *
 * 三個拒絕各自有原因，不可合併成一個「不可以」：
 * 頁不存在、這不是文件裡的缺口、判斷型要由老闆開。合併之後，人只會知道
 * 「系統不讓我建立」，然後去試另一個方法。
 */
export async function createGapNeed(db: Pool, input: CreateGapNeedInput): Promise<CreateGapNeedResult> {
  const pages = await composePages(db, input.brandId);
  const page = pages.find((item) => item.key === input.pageKey);

  if (page === undefined) {
    return { status: 'page_missing' };
  }

  const gap = page.document.gaps.find((item) => item.item === input.item);

  // 缺口一定要存在於現行文件：否則這一條路可以開任意工單，而畫面沒有對應
  // 的「缺」可以關閉。
  if (gap === undefined) {
    return { status: 'not_a_gap' };
  }

  if (gap.type === 'judgement' && !input.isOwner) {
    return { status: 'owner_only' };
  }

  const existing = await db.query<{ need_id: string; code: string }>(
    `select g.need_id, n.code
       from brand_gap g
       join need n on n.id = g.need_id
       join brand_page p on p.id = g.page_id
      where p.brand_id = $1 and p.key = $2 and g.item = $3`,
    [input.brandId, input.pageKey, input.item],
  );

  const found = existing.rows[0];

  if (found !== undefined) {
    return { status: 'ok', needId: found.need_id, needCode: found.code, created: false };
  }

  const client = await db.connect();

  try {
    await client.query('begin');

    const owner = await client.query<{ id: string }>(
      "select id from app_user where role = 'owner' order by created_at limit 1",
    );
    const ownerId = owner.rows[0]?.id ?? null;

    const code = await nextNeedCode(client);

    const title = `${page.name}：${gap.what}`.slice(0, 200);
    const detail = [
      `品牌頁「${page.name}」的 ${gap.item} 缺「${gap.what}」。`,
      gap.type === 'file' ? '這一項可以由外判交付檔案。' : '這一項要品牌自己決定，只有老闆可以關閉。',
      gap.ruleId === undefined ? '' : `對應策略規則：${gap.ruleId}。`,
      gap.reason === undefined ? '' : `為咩是缺口：${gap.reason}`,
    ]
      .filter((line) => line !== '')
      .join('\n');

    // 判斷型預設指派老闆（#58 第 2 點）：一張「等老闆決定」的工單，指派給
    // 外判只會令它永遠停在 open。
    const assignee = gap.type === 'judgement' ? ownerId : null;

    const need = await client.query<{ id: string }>(
      `insert into need (code, title, detail, kind, assignee_id, claimed_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        code,
        title,
        detail,
        gap.type === 'file' ? 'deliverable' : 'decision',
        assignee,
        assignee === null ? null : new Date(),
      ],
    );

    const needId = need.rows[0]?.id;

    if (needId === undefined) {
      throw new Error('建立 Need 之後沒有回傳 id');
    }

    await client.query(
      `insert into brand_gap (brand_id, page_id, item, what, type, rule_id, need_id, created_by)
       select $1, p.id, $3, $4, $5, $6, $7, $8
         from brand_page p
        where p.brand_id = $1 and p.key = $2 and p.deleted_at is null`,
      [
        input.brandId,
        input.pageKey,
        gap.item,
        gap.what,
        gap.type,
        gap.ruleId ?? null,
        needId,
        input.actorId,
      ],
    );

    await client.query('commit');

    return { status: 'ok', needId, needCode: code, created: true };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);

    // 23505：同一個位置已經有 Need（兩個請求同時按）。讀返那一張，當成成功 ——
    // 使用者的意思是「建立一個」，不是「建立第二個」。
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505') {
      const again = await db.query<{ need_id: string; code: string }>(
        `select g.need_id, n.code
           from brand_gap g
           join need n on n.id = g.need_id
           join brand_page p on p.id = g.page_id
          where p.brand_id = $1 and p.key = $2 and g.item = $3`,
        [input.brandId, input.pageKey, input.item],
      );

      const row = again.rows[0];

      if (row !== undefined) {
        return { status: 'ok', needId: row.need_id, needCode: row.code, created: false };
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

/** 給輸出用：文件缺口 ＋ 已建立 Need 的狀態（prompt 的缺口段落要講得返）。 */
export async function gapsForOutput(
  db: Pool,
  brandId: string,
): Promise<{ pageKey: string; pageName: string; item: string; what: string; type: 'file' | 'judgement'; ruleId: string | null; needStatus: 'none' | 'open' | 'delivered' | 'accepted' | 'rejected' }[]> {
  const items = await listGaps(db, brandId);

  return items.map((item) => ({
    pageKey: item.pageKey,
    pageName: item.pageName,
    item: item.item,
    what: item.what,
    type: item.type,
    ruleId: item.ruleId,
    needStatus:
      item.needState === null
        ? 'none'
        : item.needState === 'closed'
          ? 'accepted'
          : item.needState === 'uploaded'
            ? 'delivered'
            : 'open',
  }));
}
