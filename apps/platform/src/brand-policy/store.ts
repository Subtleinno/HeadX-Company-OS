import type { Pool, PoolClient } from 'pg';

/**
 * 品牌頁策略的讀寫（issue #34，決策 C102）。
 *
 * 三個決定：
 *   1. **一份策略，九個槽。** 不是逐品牌一份 —— 同一類專業標準不會因為換品牌
 *      而變成另一套；品牌之間的分別住在各品牌自己的頁。
 *   2. **只加不改。** 沒有軟刪除、沒有回滾：已經出街的成品可能引用某一版，
 *      那一版要永遠讀得返。migration 0014 的 trigger 擋住 UPDATE 與 DELETE。
 *   3. **現行＝該槽最大版號**，用 `max(version_no)` 算，不存旗標（同 C97）。
 *
 * 版號逐槽計。寫入前用 advisory lock 把同一個槽串行化：兩個請求同時儲存，
 * 第二個會排隊，然後拿到下一個號碼 —— 而不是兩個都算到同一個 max + 1，
 * 再由唯一索引其中一個失敗。
 */

/**
 * 九個槽（#56，C112）。**槽名不改**：`tone` 就是語氣，不改成 `voice` ——
 * `brand_policy_version` 有 trigger 擋 UPDATE，改名只會留下一個讀不到的舊槽，
 * 或者兩個「現行」。
 *
 * 次序就是畫面上的次序（`09-strategy-boss-portal.md`）：識別五頁、語氣、
 * 品牌主頁、應用、自定義頁通用。
 */
export type PolicySlot =
  | 'platform'
  | 'color'
  | 'type'
  | 'logo'
  | 'image'
  | 'tone'
  | 'home'
  | 'apply'
  | 'custom';

export const POLICY_SLOTS: readonly PolicySlot[] = [
  'platform',
  'color',
  'type',
  'logo',
  'image',
  'tone',
  'home',
  'apply',
  'custom',
];

export function isPolicySlot(value: string): value is PolicySlot {
  return (POLICY_SLOTS as readonly string[]).includes(value);
}

/**
 * 一頁屬於哪一個槽。
 *
 * 固定頁用自己的鍵（平台、色彩、字體、標誌、圖像、語氣、主頁、應用）；
 * 自定義頁一律用 `custom`（#34 的「自定義頁通用」）。這裡不看 kind，只看鍵：
 * 固定頁的鍵就是槽名，其餘必然是 slug。
 */
export function slotForPageKey(pageKey: string): PolicySlot {
  return isPolicySlot(pageKey) && pageKey !== 'custom' ? pageKey : 'custom';
}

export type PolicyVersionSummary = {
  id: string;
  versionNo: number;
  createdAt: string;
  note: string | null;
  /** 頭 160 個字元。列表要講「這一版大概是什麼」，不要為了預覽搬整個文件。 */
  preview: string;
};

export type PolicyVersionDetail = PolicyVersionSummary & { content: string };

export type PolicySlotView = {
  slot: PolicySlot;
  /** 未有版本就是 null —— 畫面要如實講缺，不是畫一個空的第 1 版。 */
  current: PolicyVersionDetail | null;
  versions: PolicyVersionSummary[];
  /**
   * 現行那一版正在支撐哪些頁（最多五個）。
   *
   * 只算「頁的現行版本指著這個策略版本」的頁：改策略之後，舊頁仍然指著舊版，
   * 這裡就不再列出它 —— 那正是要看見的事（有幾頁未跟上）。
   */
  usedBy: { brand: string; page: string; versionNo: number }[];
};

type VersionRow = {
  id: string;
  slot: string;
  version_no: number;
  created_at: Date;
  note: string | null;
  preview?: string;
  content?: string;
};

function toSummary(row: VersionRow): PolicyVersionSummary {
  return {
    id: row.id,
    versionNo: row.version_no,
    createdAt: row.created_at.toISOString(),
    note: row.note,
    preview: row.preview ?? '',
  };
}

/**
 * 九個槽連現行版本與版本列表，一次讀完。
 *
 * 分兩條查詢而不是逐槽查六次：槽的數目寫死在 `POLICY_SLOTS`，畫面一次要全部
 * 九個。現行那條只搬 content（九份），列表那條只搬 preview —— 版本多了之後，
 * 列表不應該跟著搬整份文件。
 */
export async function listPolicy(db: Pool): Promise<PolicySlotView[]> {
  const current = await db.query<VersionRow>(
    `select distinct on (slot) id, slot, version_no, created_at, note, content
       from brand_policy_version
      order by slot, version_no desc`,
  );

  const summaries = await db.query<VersionRow>(
    `select slot, id, version_no, created_at, note, left(content, 160) as preview
       from brand_policy_version
      order by slot, version_no desc`,
  );

  const currentBySlot = new Map<string, VersionRow>();

  for (const row of current.rows) {
    currentBySlot.set(row.slot, row);
  }

  // 哪一頁的現行版本用了哪一版策略。一條查詢讀完，不在這裡逐頁問。
  const usage = await db.query<{
    slot: string;
    version_no: number;
    name: string;
    brand_name: string;
    page_version_no: number;
  }>(
    `select policy.slot, policy.version_no, page.name,
            brand.name as brand_name, pv.version_no as page_version_no
       from brand_page_version pv
       join brand_page page on page.id = pv.page_id and page.deleted_at is null
       join brand brand on brand.id = page.brand_id
       join brand_policy_version policy on policy.id = pv.policy_version_id
      where pv.deleted_at is null
        and pv.version_no = (
          select max(latest.version_no)
            from brand_page_version latest
           where latest.page_id = pv.page_id and latest.deleted_at is null
        )
      order by pv.created_at desc`,
  );

  return POLICY_SLOTS.map((slot) => {
    const row = currentBySlot.get(slot);
    const usedBy = usage.rows
      .filter((item) => item.slot === slot && item.version_no === row?.version_no)
      .map((item) => ({
        brand: item.brand_name,
        page: item.name,
        versionNo: item.page_version_no,
      }))
      .filter(
        (item, index, all) =>
          all.findIndex((other) => other.brand === item.brand && other.page === item.page) === index,
      )
      .slice(0, 5);

    return {
      slot,
      current:
        row === undefined ? null : { ...toSummary(row), content: row.content ?? '' },
      versions: summaries.rows.filter((item) => item.slot === slot).map(toSummary),
      usedBy,
    };
  });
}

/** 某一個槽現在的版本（給頁版本記錄用）。沒有就 null。 */
export async function currentPolicyVersion(
  db: Pool | PoolClient,
  slot: PolicySlot,
): Promise<{ id: string; versionNo: number } | null> {
  const result = await db.query<{ id: string; version_no: number }>(
    `select id, version_no
       from brand_policy_version
      where slot = $1
      order by version_no desc
      limit 1`,
    [slot],
  );

  const row = result.rows[0];
  return row === undefined ? null : { id: row.id, versionNo: row.version_no };
}

export type NewPolicyVersion = {
  slot: PolicySlot;
  content: string;
  note: string | null;
  actorId: string;
};

/**
 * 新增一版，成為該槽的現行。
 *
 * advisory lock 放寬了「同一刻只有一個寫入者」的範圍到整個槽：撞鎖的請求排隊
 * 而不是失敗。用兩參數形式（classid, objid），classid 是本模組的固定編號，
 * 不與其他模組的 advisory lock 撞。
 */
export async function createPolicyVersion(
  db: Pool,
  input: NewPolicyVersion,
): Promise<PolicyVersionDetail> {
  const client = await db.connect();

  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1, hashtext($2))', [
      9134,
      `brand_policy:${input.slot}`,
    ]);

    const next = await client.query<{ next: number }>(
      `select coalesce(max(version_no), 0) + 1 as next
         from brand_policy_version
        where slot = $1`,
      [input.slot],
    );

    const versionNo = next.rows[0]?.next;

    if (versionNo === undefined) {
      throw new Error('計不出下一個策略版號');
    }

    const inserted = await client.query<VersionRow>(
      `insert into brand_policy_version (slot, version_no, content, note, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, slot, version_no, created_at, note,
                 left(content, 160) as preview, content`,
      [input.slot, versionNo, input.content, input.note, input.actorId],
    );

    await client.query('commit');

    const row = inserted.rows[0];

    if (row === undefined) {
      throw new Error('新增策略版本之後沒有回傳列');
    }

    return {
      id: row.id,
      versionNo: row.version_no,
      createdAt: row.created_at.toISOString(),
      note: row.note,
      preview: row.preview ?? '',
      content: row.content ?? '',
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
