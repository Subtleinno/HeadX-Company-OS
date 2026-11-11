import type { Pool, PoolClient } from 'pg';

/**
 * 品牌頁與頁版本的讀寫（issue #33，決策 C97）。
 *
 * 三個不變量，全部靠資料庫而不是靠呼叫者記得：
 *   1. **現行＝這一頁最新、未被刪除的版本**，用 `max(version_no)` 算出來。
 *      沒有 `is_current` 欄位，所以不會出現兩個現行，也不會刪完之後沒有現行。
 *   2. **版本只加不改。** 唯一的 UPDATE 是軟刪除，migration 0013 的 trigger
 *      擋住其餘一切改寫；這裡也不提供任何改內容的函式。
 *   3. **被成品釘住的版本不可以刪。** 檢查與刪除在同一個交易、同一把頁鎖之內，
 *      所以不會出現「查到沒釘、刪的一刻有人釘上」。
 *
 * 版號逐頁計，由 1 起。取得新號碼之前先 `select ... for update` 鎖住那一頁：
 * 兩個請求同時儲存，第二個會排隊等到第一個提交，然後拿到下一個號碼 ——
 * 而不是兩個都算到同一個 `max + 1`，再由唯一索引其中一個失敗。
 */

export type PageKind = 'fixed' | 'custom';

export type VersionSummary = {
  id: string;
  versionNo: number;
  createdAt: string;
  note: string | null;
  /** 頭 160 個字元；列表要顯示「這一版大概是什麼」，不要為了預覽搬整個文件。 */
  preview: string;
};

export type VersionDetail = VersionSummary & { content: string };

export type BrandPageView = {
  id: string;
  brandId: string;
  kind: PageKind;
  key: string;
  name: string;
  brief: string | null;
  sortOrder: number;
  current: VersionSummary | null;
};

type PageRow = {
  id: string;
  brand_id: string;
  kind: PageKind;
  key: string;
  name: string;
  brief: string | null;
  sort_order: number;
};

type VersionRow = {
  id: string;
  version_no: number;
  created_at: Date;
  note: string | null;
  preview?: string;
  content?: string;
};

/**
 * 五個固定頁。鍵與次序都是對外承諾（網址 `/design/brand/<key>`）：
 * 改一個字就會令所有舊書籤 404。次序用 10 的倍數，自定義頁接在後面。
 */
export const FIXED_PAGES: readonly { key: string; name: string; order: number }[] = [
  { key: 'home', name: '品牌主頁', order: 10 },
  { key: 'logo', name: '標誌', order: 20 },
  { key: 'color', name: '色彩', order: 30 },
  { key: 'type', name: '字體', order: 40 },
  { key: 'tone', name: '語氣', order: 50 },
];

function toSummary(row: VersionRow): VersionSummary {
  return {
    id: row.id,
    versionNo: row.version_no,
    createdAt: row.created_at.toISOString(),
    note: row.note,
    preview: row.preview ?? '',
  };
}

function toDetail(row: VersionRow): VersionDetail {
  return { ...toSummary(row), content: row.content ?? '' };
}

export async function brandExists(db: Pool, brandId: string): Promise<boolean> {
  const result = await db.query('select 1 from brand where id = $1', [brandId]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * 建立五個固定頁（如果還沒有）。
 *
 * 為什麼是「有就跳過」而不是在開品牌時一併建：品牌可以早在這個功能之前
 * 存在（#19 已經可以開品牌）。與其寫一次 backfill，不如每次讀之前確保 ——
 * 沒有那一列就建，有的話 `on conflict do nothing`，成本是一個 index lookup。
 *
 * `where deleted_at is null` 一定要寫：唯一索引是部分的，衝突推論要對上同一個
 * 條件，否則 Postgres 會說找不到可以推論的索引。
 */
export async function ensureFixedPages(db: Pool, brandId: string): Promise<void> {
  for (const page of FIXED_PAGES) {
    await db.query(
      `insert into brand_page (brand_id, kind, key, name, sort_order)
       values ($1, 'fixed', $2, $3, $4)
       on conflict (brand_id, key) where deleted_at is null do nothing`,
      [brandId, page.key, page.name, page.order],
    );
  }
}

export async function listPages(db: Pool, brandId: string): Promise<BrandPageView[]> {
  const result = await db.query<PageRow & { version_id: string | null; version_no: number | null; version_created_at: Date | null; version_note: string | null; version_preview: string | null }>(
    `select p.id, p.brand_id, p.kind, p.key, p.name, p.brief, p.sort_order,
            v.id as version_id, v.version_no, v.created_at as version_created_at,
            v.note as version_note, v.preview as version_preview
       from brand_page p
       left join lateral (
         select id, version_no, created_at, note, left(content, 160) as preview
           from brand_page_version
          where page_id = p.id and deleted_at is null
          order by version_no desc
          limit 1
       ) v on true
      where p.brand_id = $1 and p.deleted_at is null
      order by p.sort_order, p.key`,
    [brandId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    brandId: row.brand_id,
    kind: row.kind,
    key: row.key,
    name: row.name,
    brief: row.brief,
    sortOrder: row.sort_order,
    current:
      row.version_id === null || row.version_no === null || row.version_created_at === null
        ? null
        : {
            id: row.version_id,
            versionNo: row.version_no,
            createdAt: row.version_created_at.toISOString(),
            note: row.version_note,
            preview: row.version_preview ?? '',
          },
  }));
}

export async function findPage(
  db: Pool,
  brandId: string,
  key: string,
): Promise<BrandPageView | null> {
  const pages = await listPages(db, brandId);
  return pages.find((page) => page.key === key) ?? null;
}

/** 版本列表，新的在前。已刪除的不會出現（歷史仍在資料庫）。 */
export async function listVersions(db: Pool, pageId: string): Promise<VersionSummary[]> {
  const result = await db.query<VersionRow>(
    `select id, version_no, created_at, note, left(content, 160) as preview
       from brand_page_version
      where page_id = $1 and deleted_at is null
      order by version_no desc`,
    [pageId],
  );

  return result.rows.map(toSummary);
}

export async function findCurrentVersion(
  db: Pool,
  pageId: string,
): Promise<VersionDetail | null> {
  const result = await db.query<VersionRow>(
    `select id, version_no, created_at, note, left(content, 160) as preview, content
       from brand_page_version
      where page_id = $1 and deleted_at is null
      order by version_no desc
      limit 1`,
    [pageId],
  );

  const row = result.rows[0];
  return row === undefined ? null : toDetail(row);
}

async function lockPage(client: PoolClient, pageId: string): Promise<boolean> {
  const result = await client.query('select 1 from brand_page where id = $1 for update', [pageId]);
  return result.rowCount !== null && result.rowCount > 0;
}

async function nextVersionNo(client: PoolClient, pageId: string): Promise<number> {
  const result = await client.query<{ next: number }>(
    `select coalesce(max(version_no), 0) + 1 as next
       from brand_page_version
      where page_id = $1`,
    [pageId],
  );

  const next = result.rows[0]?.next;

  if (next === undefined) {
    throw new Error('計不出下一個版號');
  }

  return next;
}

export type NewVersion = {
  pageId: string;
  content: string;
  note: string | null;
  actorId: string;
};

/**
 * 新增一版，成為現行。
 *
 * 呼叫者必須先確認這一頁存在且屬於這個品牌（路由做）；這裡再回一次列是為了
 * 讓呼叫者拿到完整資料，不是為了授權。
 */
export async function createVersion(db: Pool, input: NewVersion): Promise<VersionDetail> {
  const client = await db.connect();

  try {
    await client.query('begin');

    if (!(await lockPage(client, input.pageId))) {
      await client.query('rollback');
      throw new Error(`頁不存在：${input.pageId}`);
    }

    const versionNo = await nextVersionNo(client, input.pageId);

    const inserted = await client.query<VersionRow>(
      `insert into brand_page_version (page_id, version_no, content, note, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, version_no, created_at, note, left(content, 160) as preview, content`,
      [input.pageId, versionNo, input.content, input.note, input.actorId],
    );

    await client.query('commit');

    const row = inserted.rows[0];

    if (row === undefined) {
      throw new Error('新增版本之後沒有回傳列');
    }

    return toDetail(row);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type RestoreResult =
  | { status: 'ok'; version: VersionDetail }
  | { status: 'not_found' };

/**
 * 用回舊版：以那一版的內容建立一個**新版本**（C97）。
 *
 * 不是把指針撥回去：歷史要留下「曾經用過這一版」。所以回滾之後版本列表會
 * 多一版，而不是少一版。
 */
export async function restoreVersion(
  db: Pool,
  input: { pageId: string; sourceVersionId: string; actorId: string },
): Promise<RestoreResult> {
  const client = await db.connect();

  try {
    await client.query('begin');

    if (!(await lockPage(client, input.pageId))) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    const source = await client.query<{ version_no: number; content: string }>(
      `select version_no, content
         from brand_page_version
        where id = $1 and page_id = $2 and deleted_at is null`,
      [input.sourceVersionId, input.pageId],
    );

    const row = source.rows[0];

    if (row === undefined) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    const versionNo = await nextVersionNo(client, input.pageId);

    const inserted = await client.query<VersionRow>(
      `insert into brand_page_version (page_id, version_no, content, note, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, version_no, created_at, note, left(content, 160) as preview, content`,
      [input.pageId, versionNo, row.content, `用回第 ${row.version_no} 版`, input.actorId],
    );

    await client.query('commit');

    const created = inserted.rows[0];

    if (created === undefined) {
      throw new Error('用回舊版之後沒有回傳列');
    }

    return { status: 'ok', version: toDetail(created) };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type DeleteResult =
  | { status: 'deleted'; versionNo: number }
  | { status: 'not_found' }
  /** 這是現行版本：要換現行才可以刪（C97）。 */
  | { status: 'current'; versionNo: number }
  /** 被已出街成品釘住：講明釘在哪一件。 */
  | { status: 'pinned'; versionNo: number; labels: string[] };

/**
 * 軟刪除一個舊版本。
 *
 * 三種拒絕各有自己的理由，不可以合併成一個「不可以刪」：
 * 現行要換、被成品釘住要改成品、找不到要講找不到。合併之後，人只會知道
 * 「系統不讓我刪」，然後去試另一個方法。
 */
export async function deleteVersion(
  db: Pool,
  input: { pageId: string; versionId: string },
): Promise<DeleteResult> {
  const client = await db.connect();

  try {
    await client.query('begin');

    if (!(await lockPage(client, input.pageId))) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    const found = await client.query<{ version_no: number; deleted_at: Date | null }>(
      'select version_no, deleted_at from brand_page_version where id = $1 and page_id = $2',
      [input.versionId, input.pageId],
    );

    const row = found.rows[0];

    // 已刪除的版本當作不存在：它不在任何列表上，再用同一個 id 來刪，
    // 回 404 比回「已經刪了」誠實 —— 用戶手上的畫面本來就沒有這一版。
    if (row === undefined || row.deleted_at !== null) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    const current = await client.query<{ version_no: number | null }>(
      `select max(version_no) as version_no
         from brand_page_version
        where page_id = $1 and deleted_at is null`,
      [input.pageId],
    );

    if (current.rows[0]?.version_no === row.version_no) {
      await client.query('rollback');
      return { status: 'current', versionNo: row.version_no };
    }

    const pins = await client.query<{ ref_label: string }>(
      'select ref_label from brand_page_version_pin where version_id = $1 order by created_at',
      [input.versionId],
    );

    if (pins.rowCount !== null && pins.rowCount > 0) {
      await client.query('rollback');
      return {
        status: 'pinned',
        versionNo: row.version_no,
        labels: pins.rows.map((pin) => pin.ref_label),
      };
    }

    await client.query('update brand_page_version set deleted_at = now() where id = $1', [
      input.versionId,
    ]);

    await client.query('commit');

    return { status: 'deleted', versionNo: row.version_no };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
