import type { Pool, PoolClient } from 'pg';
import {
  BRAND_FIXED_PAGES,
  changedPaths,
  documentFromStored,
  parseBrandDocument,
  schemaForPage,
  type BrandDocument,
  type BrandSlot,
} from '@company-os/contracts';
import { currentPolicyVersion, slotForPageKey } from '../brand-policy/store.js';

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
  /**
   * 這一版當時用的是第幾版策略（issue #34）。
   *
   * null＝未記錄：策略功能之前建立的版本（示範資料）沒有這個資訊。硬填一個
   * 號碼就是虛構，所以畫面講「未記錄」，而不是講第 1 版。
   */
  policyVersionNo: number | null;
  /**
   * 相對**上一版**改了哪幾個欄位（issue #62）。路徑由 payload 出發，例如
   * `roles.ink.hex`；陣列位置會換成身份（角色名、`fg on bg`），因為 `roles.0`
   * 對人沒有意思。
   *
   * 第一版沒有上一版可以比，所以是空陣列 —— 不是「改了零項」。
   */
  changed: string[];
};

export type VersionDetail = VersionSummary & {
  content: string;
  /**
   * v2 文件（issue #57）。舊版內容（自由文字／舊形狀 JSON）在讀取時單向轉換，
   * 所以每一個呼叫者都拿到同一個形狀，不必自己判斷「這一版是新是舊」。
   */
  document: BrandDocument;
};

export type BrandPageView = {
  id: string;
  brandId: string;
  kind: PageKind;
  key: string;
  name: string;
  brief: string | null;
  sortOrder: number;
  /**
   * 左側欄的分組（issue #60）：品牌主頁、識別、品牌專屬、應用。
   *
   * 由 `BRAND_FIXED_PAGES` 派生，不由前端寫死一份次序 —— 前後端各寫一份，
   * 早晚會有一邊多一頁。自定義頁一律 `custom`。
   */
  group: 'home' | 'identity' | 'custom' | 'apply';
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
  document?: unknown;
  page_key?: string;
  page_kind?: PageKind;
  policy_version_no?: number | null;
};

/**
 * 八個固定頁（C112）。鍵與次序都是對外承諾（網址 `/design/brand/<key>`）：
 * 改一個字就會令所有舊書籤 404。次序用 10 的倍數，自定義頁接在後面。
 *
 * 名單住在 `@company-os/contracts`：前端左側欄、renderer、prompt 包都要用
 * 同一份，寫兩次就會有一日不同步。
 */
export const FIXED_PAGES: readonly { key: string; name: string; order: number; slot: BrandSlot }[] =
  BRAND_FIXED_PAGES.map((page) => ({
    key: page.key,
    name: page.name,
    order: page.order,
    slot: page.slot,
  }));

/**
 * 版本列表的一行字。
 *
 * v2 的 `content` 是一份 JSON，直接截 160 字元等於叫人讀程式碼。所以有新格式
 * 就由文件抽一句（立場／決定／標誌邏輯），抽不到才退回舊的截字。
 */
function previewOf(document: BrandDocument | null, fallback: string): string {
  if (document === null) {
    return fallback;
  }

  const payload = document.payload;
  const candidates = [
    document.stance,
    typeof payload['decided'] === 'string' ? payload['decided'] : '',
    typeof payload['logic_line'] === 'string' ? payload['logic_line'] : '',
    typeof payload['philosophy'] === 'string' ? payload['philosophy'] : '',
    typeof payload['who'] === 'string' ? payload['who'] : '',
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.slice(0, 160);
    }
  }

  return fallback;
}

function documentOf(row: {
  document?: unknown;
  page_key?: string;
  page_kind?: PageKind;
  content?: string;
  content_null?: never;
}): BrandDocument {
  if (row.document !== undefined && row.document !== null) {
    const parsed = parseBrandDocument(row.document);

    // 資料庫裡的文件應該一定合格（寫入前驗證過）。真的不合格時退回舊版轉換，
    // 把原文讀得返 —— 總好過整頁 500。
    if (parsed.ok) {
      return parsed.value;
    }
  }

  return documentFromStored(row.page_key ?? '', row.page_kind ?? 'fixed', row.content ?? '');
}

function toSummary(row: VersionRow): VersionSummary {
  const document = row.document === undefined || row.document === null ? null : documentOf(row);

  return {
    id: row.id,
    versionNo: row.version_no,
    createdAt: row.created_at.toISOString(),
    note: row.note,
    preview: previewOf(document, row.preview ?? ''),
    policyVersionNo: row.policy_version_no ?? null,
    changed: [],
  };
}

/**
 * 陣列位置換成身份，令 `roles.0.hex` 變成 `roles.ink.hex`。
 *
 * 為甚麼要在伺服器做：文件在這裡，索引對得上；畫面只有一串路徑，`roles.0`
 * 到底是哪一個角色，它查不到（列表不搬整份文件）。
 */
function identityOf(item: unknown): string {
  if (typeof item !== 'object' || item === null) {
    return '';
  }

  const record = item as Record<string, unknown>;
  const id = typeof record['id'] === 'string' ? record['id'].trim() : '';

  if (id !== '') {
    return id;
  }

  const name = typeof record['name'] === 'string' ? record['name'].trim() : '';

  if (name !== '') {
    return name;
  }

  const fg = typeof record['fg'] === 'string' ? record['fg'].trim() : '';
  const bg = typeof record['bg'] === 'string' ? record['bg'].trim() : '';

  return fg !== '' && bg !== '' ? `${fg} on ${bg}` : '';
}

/** 把 `changedPaths` 出來的位置換成人讀得明的路徑。 */
export function humanPaths(document: BrandDocument, paths: readonly string[]): string[] {
  const root: unknown = document.payload;

  return paths.map((path) => {
    const parts = path.split('.');
    const out: string[] = [];
    let node: unknown = root;

    for (const part of parts) {
      if (Array.isArray(node) && /^\d+$/.test(part)) {
        const item: unknown = node[Number(part)];
        const identity = identityOf(item);

        out.push(identity === '' ? part : identity);
        node = item;
        continue;
      }

      out.push(part);
      node =
        typeof node === 'object' && node !== null && !Array.isArray(node)
          ? (node as Record<string, unknown>)[part]
          : undefined;
    }

    return out.join('.');
  });
}

function toDetail(row: VersionRow): VersionDetail {
  return { ...toSummary(row), content: row.content ?? '', document: documentOf(row) };
}

export async function brandExists(db: Pool, brandId: string): Promise<boolean> {
  const result = await db.query('select 1 from brand where id = $1', [brandId]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * 建立八個固定頁（如果還沒有）。
 *
 * 為什麼是「有就跳過」而不是在開品牌時一併建：品牌可以早在這個功能之前
 * 存在（#19 已經可以開品牌）。與其寫一次 backfill，不如每次讀之前確保 ——
 * 沒有那一列就建，有的話 `on conflict do nothing`，成本是一個 index lookup。
 *
 * **它補不到舊品牌的次序。** `do nothing` 令它永遠不會改已寫死的 `sort_order`；
 * 由五頁變八頁那一次（0017）漏了 backfill，舊品牌因此停在舊次序（logo 20／
 * tone 50），與新環境不一致。補次序的是 `0020_brand_fixed_pages_backfill.sql`，
 * 只在 migration 跑一次 —— 這裡仍然保持唯讀語意，不要改成 `do update`。
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

/** 一頁屬於哪一組（issue #60）。自定義頁自己一組；其餘由固定頁表派生。 */
export function groupOf(key: string, kind: PageKind): 'home' | 'identity' | 'custom' | 'apply' {
  if (kind === 'custom') {
    return 'custom';
  }

  return BRAND_FIXED_PAGES.find((page) => page.key === key)?.group ?? 'identity';
}

export async function listPages(db: Pool, brandId: string): Promise<BrandPageView[]> {
  const result = await db.query<PageRow & { version_id: string | null; version_no: number | null; version_created_at: Date | null; version_note: string | null; version_preview: string | null; version_policy_no: number | null }>(
    `select p.id, p.brand_id, p.kind, p.key, p.name, p.brief, p.sort_order,
            v.id as version_id, v.version_no, v.created_at as version_created_at,
            v.note as version_note, v.preview as version_preview,
            v.policy_version_no as version_policy_no
       from brand_page p
       left join lateral (
         select vv.id, vv.version_no, vv.created_at, vv.note,
                left(vv.content, 160) as preview,
                vv.document,
                p.key as page_key,
                p.kind as page_kind,
                pv.version_no as policy_version_no
           from brand_page_version vv
           left join brand_policy_version pv on pv.id = vv.policy_version_id
          where vv.page_id = p.id and vv.deleted_at is null
          order by vv.version_no desc
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
    group: groupOf(row.key, row.kind),
    current:
      row.version_id === null || row.version_no === null || row.version_created_at === null
        ? null
        : {
            id: row.version_id,
            versionNo: row.version_no,
            createdAt: row.version_created_at.toISOString(),
            note: row.version_note,
            preview: row.version_preview ?? '',
            policyVersionNo: row.version_policy_no,
            // 頁清單不算差異（要打開那一頁才逐版比）。空陣列＝未計算。
            changed: [],
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
  const result = await db.query<VersionRow & { content_hint: string }>(
    // `content_hint`：舊版（`document` 是 null）要拿全文才讀得返那份文件，
    // 新版只要 160 字元做預覽。全部版本都搬全文會令每一次開頁都背著整段歷史，
    // 全部只搬 160 字元就令舊版算不出差異 —— 所以按需要拿。
    `select v.id, v.version_no, v.created_at, v.note, left(v.content, 160) as preview,
            case when v.document is null then v.content else left(v.content, 160) end as content_hint,
            v.document, p.key as page_key, p.kind as page_kind,
            pv.version_no as policy_version_no
       from brand_page_version v
       join brand_page p on p.id = v.page_id
       left join brand_policy_version pv on pv.id = v.policy_version_id
      where v.page_id = $1 and v.deleted_at is null
      order by v.version_no desc`,
    [pageId],
  );

  const rows = result.rows.map(toSummary);
  const documents = result.rows.map((row) => documentOf({ ...row, content: row.content_hint }));

  // 版本新的在前，所以「上一版」是 next(索引 +1)。第一版沒有得比。
  return rows.map((row, index) => {
    const previous = documents[index + 1] ?? null;

    if (previous === null) {
      return row;
    }

    const paths = changedPaths(previous.payload, documents[index]?.payload ?? {});

    return { ...row, changed: humanPaths(documents[index] ?? previous, paths) };
  });
}

export async function findCurrentVersion(
  db: Pool,
  pageId: string,
): Promise<VersionDetail | null> {
  const result = await db.query<VersionRow>(
    `select v.id, v.version_no, v.created_at, v.note, left(v.content, 160) as preview,
            v.content, v.document, p.key as page_key, p.kind as page_kind,
            pv.version_no as policy_version_no
       from brand_page_version v
       join brand_page p on p.id = v.page_id
       left join brand_policy_version pv on pv.id = v.policy_version_id
      where v.page_id = $1 and v.deleted_at is null
      order by v.version_no desc
      limit 1`,
    [pageId],
  );

  const row = result.rows[0];
  return row === undefined ? null : toDetail(row);
}

/**
 * 鎖住這一頁並取回它的鍵。
 *
 * 鍵用來找對應的策略槽（第 6 個是自定義頁通用），所以同一個鎖要一併交回，
 * 不要為了拿鍵再查一次 —— 兩次查詢之間有人改頁的鍵，就會記錯槽。
 */
/**
 * 鎖住這一頁並取回它的鍵與品牌。
 *
 * 鍵用來找對應的策略槽（自定義頁用通用槽）；品牌用來在同一個交易內寫一列
 * `brand_release`（品牌版本＝當時每一頁的版號）。同一個鎖一併交回，不要為了
 * 拿品牌再查一次 —— 兩次查詢之間有人搬家，release 就會記錯品牌。
 */
async function lockPage(
  client: PoolClient,
  pageId: string,
): Promise<{ key: string; brandId: string; kind: PageKind } | null> {
  const result = await client.query<{ key: string; brand_id: string; kind: PageKind }>(
    'select key, brand_id, kind from brand_page where id = $1 for update',
    [pageId],
  );

  const row = result.rows[0];

  return row === undefined ? null : { key: row.key, brandId: row.brand_id, kind: row.kind };
}

/**
 * 追加一個品牌版本。
 *
 * `pages` 是「此刻每一頁的現行版號」的快照。容許跳號、不容許重複：號碼由
 * 品牌級鎖之後的 `max + 1` 計，而 `brand_release` 沒有 unique 約束 —— 兩個
 * 並行儲存寧願出 13 缺號，也不要其中一個失敗（失敗的那一下是使用者按的
 * 儲存）。
 */
async function appendRelease(
  client: PoolClient,
  input: { brandId: string; actorId: string },
): Promise<number> {
  const snapshot = await client.query<{ pages: { key: string; versionNo: number }[] }>(
    `select coalesce(
              jsonb_agg(
                jsonb_build_object('key', p.key, 'versionNo', v.version_no)
                order by p.sort_order, p.key
              ),
              '[]'::jsonb
            ) as pages
       from brand_page p
       join lateral (
         select max(vv.version_no) as version_no
           from brand_page_version vv
          where vv.page_id = p.id and vv.deleted_at is null
       ) v on v.version_no is not null
      where p.brand_id = $1 and p.deleted_at is null`,
    [input.brandId],
  );

  const next = await client.query<{ next: number }>(
    'select coalesce(max(release_no), 0) + 1 as next from brand_release where brand_id = $1',
    [input.brandId],
  );

  const releaseNo = next.rows[0]?.next ?? 1;

  await client.query(
    'insert into brand_release (brand_id, release_no, pages, created_by) values ($1, $2, $3::jsonb, $4)',
    [input.brandId, releaseNo, JSON.stringify(snapshot.rows[0]?.pages ?? []), input.actorId],
  );

  return releaseNo;
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
  /** v2 文件。有新格式時 `content` 由它產生，呼叫者不必自己序列化。 */
  document: BrandDocument | null;
  /** 舊格式的原文（只有在沒有文件時使用）。 */
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

    const locked = await lockPage(client, input.pageId);

    if (locked === null) {
      await client.query('rollback');
      throw new Error(`頁不存在：${input.pageId}`);
    }

    const versionNo = await nextVersionNo(client, input.pageId);

    // 記住這一版是照第幾版策略做的（#34）。策略之後改了，這一版仍然指著
    // 當時那一版 —— 已經做好的頁不會被靜靜重寫。
    const policy = await currentPolicyVersion(client, slotForPageKey(locked.key));

    const content = input.document === null ? input.content : JSON.stringify(input.document);

    const inserted = await client.query<VersionRow>(
      `insert into brand_page_version
         (page_id, version_no, content, document, note, created_by, policy_version_id)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7)
       returning id, version_no, created_at, note, left(content, 160) as preview, content, document`,
      [
        input.pageId,
        versionNo,
        content,
        input.document === null ? null : JSON.stringify(input.document),
        input.note,
        input.actorId,
        policy?.id ?? null,
      ],
    );

    await appendRelease(client, { brandId: locked.brandId, actorId: input.actorId });

    await client.query('commit');

    const row = inserted.rows[0];

    if (row === undefined) {
      throw new Error('新增版本之後沒有回傳列');
    }

    return toDetail({
      ...row,
      page_key: locked.key,
      page_kind: locked.kind,
      policy_version_no: policy?.versionNo ?? null,
    });
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

    const locked = await lockPage(client, input.pageId);

    if (locked === null) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    const source = await client.query<{
      version_no: number;
      content: string;
      document: unknown;
      policy_version_id: string | null;
      policy_version_no: number | null;
    }>(
      `select v.version_no, v.content, v.document, v.policy_version_id, pv.version_no as policy_version_no
         from brand_page_version v
         left join brand_policy_version pv on pv.id = v.policy_version_id
        where v.id = $1 and v.page_id = $2 and v.deleted_at is null`,
      [input.sourceVersionId, input.pageId],
    );

    const row = source.rows[0];

    if (row === undefined) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    const versionNo = await nextVersionNo(client, input.pageId);

    // 內容來自那一版，所以策略引用也照抄那一版：這一版畫面上寫「用回第 N 版」，
    // 就不應該同時聲稱自己用的是今天的策略。
    const inserted = await client.query<VersionRow>(
      `insert into brand_page_version
         (page_id, version_no, content, document, note, created_by, policy_version_id)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7)
       returning id, version_no, created_at, note, left(content, 160) as preview, content, document`,
      [
        input.pageId,
        versionNo,
        row.content,
        row.document === null || row.document === undefined ? null : JSON.stringify(row.document),
        `用回第 ${row.version_no} 版`,
        input.actorId,
        row.policy_version_id,
      ],
    );

    await appendRelease(client, { brandId: locked.brandId, actorId: input.actorId });

    await client.query('commit');

    const created = inserted.rows[0];

    if (created === undefined) {
      throw new Error('用回舊版之後沒有回傳列');
    }

    return {
      status: 'ok',
      version: toDetail({
        ...created,
        page_key: locked.key,
        page_kind: locked.kind,
        policy_version_no: row.policy_version_no,
      }),
    };
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

    if ((await lockPage(client, input.pageId)) === null) {
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

/* ── 自定義頁的建立／改名／刪除（issue #32） ───────────────────── */

export type CreatePageResult =
  | { status: 'ok'; page: BrandPageView }
  | { status: 'fixed_key'; key: string }
  | { status: 'conflict'; key: string; name: string };

/**
 * 建立一張自定義頁。
 *
 * 三樣一次過要齊（顯示名、slug、brief）：缺 brief 的頁等於沒有方向，建了只會
 * 在主頁多一個永遠寫「未完成」的入口（C101）。驗證在 schema.ts 做；這裡只負責
 * 「撞名要講明撞了哪一張」—— 不是靜靜改成另一個名，因為設計師會以為自己成功。
 */
export async function createPage(
  db: Pool,
  input: { brandId: string; name: string; slug: string; brief: string },
): Promise<CreatePageResult> {
  const client = await db.connect();

  try {
    await client.query('begin');

    // 自定義頁不可以用五個固定鍵（0013 的 check 會擋），先在這裡講清楚。
    const fixed = await client.query<{ name: string }>(
      `select name from brand_page
        where brand_id = $1 and key = $2 and deleted_at is null`,
      [input.brandId, input.slug],
    );

    if (fixed.rowCount !== null && fixed.rowCount > 0) {
      await client.query('rollback');
      return {
        status: 'conflict',
        key: input.slug,
        name: fixed.rows[0]?.name ?? input.slug,
      };
    }

    const sort = await client.query<{ next: number }>(
      'select coalesce(max(sort_order), 50) + 10 as next from brand_page where brand_id = $1',
      [input.brandId],
    );

    const inserted = await client.query<{ id: string }>(
      `insert into brand_page (brand_id, kind, key, name, brief, sort_order)
       values ($1, 'custom', $2, $3, $4, $5)
       returning id`,
      [input.brandId, input.slug, input.name, input.brief, sort.rows[0]?.next ?? 60],
    );

    await client.query('commit');

    const id = inserted.rows[0]?.id;

    if (id === undefined) {
      throw new Error('建立自定義頁之後沒有回傳 id');
    }

    const page = await findPageById(db, input.brandId, id);

    if (page === null) {
      throw new Error('建立自定義頁之後讀唔返');
    }

    return { status: 'ok', page };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);

    // 23505：同品牌已有一張未刪的頁用同一個鍵（0013 的部分唯一索引）。
    if (isUniqueViolation(error)) {
      const clash = await db.query<{ name: string }>(
        `select name from brand_page
          where brand_id = $1 and key = $2 and deleted_at is null`,
        [input.brandId, input.slug],
      );

      return {
        status: 'conflict',
        key: input.slug,
        name: clash.rows[0]?.name ?? input.slug,
      };
    }

    // 23514：check 約束 —— 用固定鍵做自定義頁的 slug。
    if (isCheckViolation(error)) {
      return { status: 'fixed_key', key: input.slug };
    }

    throw error;
  } finally {
    client.release();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: string }).code === '23505';
}

function isCheckViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: string }).code === '23514';
}

async function findPageById(db: Pool, brandId: string, id: string): Promise<BrandPageView | null> {
  const pages = await listPages(db, brandId);
  return pages.find((page) => page.id === id) ?? null;
}

/**
 * 改顯示名。slug 不在參數裡 —— 改 slug 等於另一張頁，舊連結會斷（C101）。
 */
export async function renamePage(
  db: Pool,
  input: { brandId: string; key: string; name: string },
): Promise<BrandPageView | null> {
  const result = await db.query<{ id: string }>(
    `update brand_page set name = $3
      where brand_id = $1 and key = $2 and deleted_at is null
      returning id`,
    [input.brandId, input.key, input.name],
  );

  const id = result.rows[0]?.id;
  return id === undefined ? null : findPageById(db, input.brandId, id);
}

export type DeletePageResult =
  | { status: 'deleted'; key: string; name: string; versions: number }
  | { status: 'not_found' }
  /** 固定頁是網址的一部分，不可以刪（#32）。 */
  | { status: 'fixed'; key: string; name: string }
  /** 任何一版被已出街成品釘住：講明釘在哪一件（#32 第 10 點）。 */
  | { status: 'pinned'; key: string; name: string; labels: string[] };

/**
 * 軟刪除一張自定義頁：頁本身、它的全部版本，一併寫 `deleted_at`。
 *
 * 為咩連版本一齊軟刪除：留著只會被 `listVersions` 之外的查詢撿到，而同一個鍵
 * 之後可以再建立 —— 新舊兩張頁的版本會混在同一條查詢裡。資料不刪，審計留著，
 * 但畫面上不再有一條指向已刪頁的版本鏈。
 *
 * 檢查與寫入在同一個交易、同一把頁鎖之內，所以不會「查到沒釘、刪的一刻有人釘上」。
 */
export async function deletePage(
  db: Pool,
  input: { brandId: string; key: string },
): Promise<DeletePageResult> {
  const client = await db.connect();

  try {
    await client.query('begin');

    const found = await client.query<{ id: string; kind: PageKind; name: string }>(
      `select id, kind, name from brand_page
        where brand_id = $1 and key = $2 and deleted_at is null
        for update`,
      [input.brandId, input.key],
    );

    const row = found.rows[0];

    if (row === undefined) {
      await client.query('rollback');
      return { status: 'not_found' };
    }

    if (row.kind === 'fixed') {
      await client.query('rollback');
      return { status: 'fixed', key: input.key, name: row.name };
    }

    const pins = await client.query<{ ref_label: string }>(
      `select pin.ref_label
         from brand_page_version_pin pin
         join brand_page_version v on v.id = pin.version_id
        where v.page_id = $1
        order by pin.created_at`,
      [row.id],
    );

    if (pins.rowCount !== null && pins.rowCount > 0) {
      await client.query('rollback');
      return {
        status: 'pinned',
        key: input.key,
        name: row.name,
        labels: pins.rows.map((pin) => pin.ref_label),
      };
    }

    const versionCount = await client.query<{ n: number }>(
      'select count(*)::int as n from brand_page_version where page_id = $1 and deleted_at is null',
      [row.id],
    );

    await client.query(
      'update brand_page_version set deleted_at = now() where page_id = $1 and deleted_at is null',
      [row.id],
    );
    await client.query('update brand_page set deleted_at = now() where id = $1', [row.id]);

    await client.query('commit');

    return {
      status: 'deleted',
      key: input.key,
      name: row.name,
      versions: versionCount.rows[0]?.n ?? 0,
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/* ── 品牌編輯權（issue #32） ─────────────────────────────────── */

export type BrandEditorView = {
  userId: string;
  displayName: string;
  email: string;
  grantedAt: string;
};

export async function listEditors(db: Pool, brandId: string): Promise<BrandEditorView[]> {
  const result = await db.query<{
    user_id: string;
    display_name: string;
    email: string;
    created_at: Date;
  }>(
    `select e.user_id, u.display_name, u.email, e.created_at
       from brand_editor e
       join app_user u on u.id = e.user_id
      where e.brand_id = $1
      order by u.display_name`,
    [brandId],
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    grantedAt: row.created_at.toISOString(),
  }));
}

/** 授予或收回。回傳 false＝那個帳戶不存在（不是品牌不存在：品牌由路由先驗）。 */
export async function setEditor(
  db: Pool,
  input: { brandId: string; userId: string; grantedBy: string; granted: boolean },
): Promise<boolean> {
  if (!input.granted) {
    await db.query('delete from brand_editor where brand_id = $1 and user_id = $2', [
      input.brandId,
      input.userId,
    ]);

    return true;
  }

  const result = await db.query(
    `insert into brand_editor (brand_id, user_id, granted_by)
     select $1, u.id, $3 from app_user u where u.id = $2
     on conflict (brand_id, user_id) do nothing`,
    [input.brandId, input.userId, input.grantedBy],
  );

  return result.rowCount !== null;
}

/* ── 組成（issue #57 的四種輸出用） ───────────────────────────── */

/**
 * 這個品牌每一頁的現行版本（連文件），左側次序。
 *
 * **沒有版本的頁也會回**（`versionNo: 0`、空白文件）：輸出要知道「這一頁
 * 存在但未做」，才可以講「缺」。只回有版本的頁，主頁就會看起來很完整。
 */
export async function composePages(db: Pool, brandId: string): Promise<
  {
    key: string;
    name: string;
    kind: PageKind;
    versionNo: number;
    policyVersionNo: number | null;
    document: BrandDocument;
  }[]
> {
  const result = await db.query<{
    key: string;
    name: string;
    kind: PageKind;
    version_no: number | null;
    content: string | null;
    document: unknown;
    policy_version_no: number | null;
  }>(
    `select p.key, p.name, p.kind,
            v.version_no, v.content, v.document, pv.version_no as policy_version_no
       from brand_page p
       left join lateral (
         select vv.version_no, vv.content, vv.document, vv.policy_version_id
           from brand_page_version vv
          where vv.page_id = p.id and vv.deleted_at is null
          order by vv.version_no desc
          limit 1
       ) v on true
       left join brand_policy_version pv on pv.id = v.policy_version_id
      where p.brand_id = $1 and p.deleted_at is null
      order by p.sort_order, p.key`,
    [brandId],
  );

  return result.rows.map((row) => {
    const base = {
      key: row.key,
      name: row.name,
      kind: row.kind,
      versionNo: row.version_no ?? 0,
      policyVersionNo: row.policy_version_no,
    };

    if (row.version_no === null) {
      const schema = schemaForPage(row.key, row.kind);
      const empty = schema.normalize({});

      return {
        ...base,
        document: {
          schema: 2 as const,
          stance: null,
          payload: empty,
          layout: schema.layout(empty),
          rationale: {},
          // 未有一版的頁一樣有缺口：缺口是「這個品牌的這一頁還未有甚麼」，
          // 不是「這一版漏了甚麼」。留空就會出現「Needs 0，但畫面說缺 6 項」
          // 這種兩個真相 —— 而 0 是錯的那一個。
          gaps: schema.gaps(empty),
          refs: [],
        },
      };
    }

    return { ...base, document: documentOf({ ...row, page_key: row.key, page_kind: row.kind, content: row.content ?? '' }) };
  });
}

/** 品牌代碼、名、最新版本號。輸出檔的標題與 folio 用。 */
export async function brandHeader(
  db: Pool,
  brandId: string,
): Promise<{ code: string; name: string; releaseNo: number } | null> {
  const result = await db.query<{ code: string; name: string; release_no: number | null }>(
    `select b.code, b.name, r.release_no
       from brand b
       left join lateral (
         select release_no from brand_release where brand_id = b.id order by release_no desc limit 1
       ) r on true
      where b.id = $1`,
    [brandId],
  );

  const row = result.rows[0];

  return row === undefined ? null : { code: row.code, name: row.name, releaseNo: row.release_no ?? 0 };
}

/** 頁現行版本的文件；沒有版本回 `null`（不是空白文件：呼叫者要分得出）。 */
export async function currentDocument(
  db: Pool,
  brandId: string,
  pageKey: string,
): Promise<BrandDocument | null> {
  const page = await findPage(db, brandId, pageKey);

  if (page === null) {
    return null;
  }

  const version = await findCurrentVersion(db, page.id);

  return version === null ? null : version.document;
}
