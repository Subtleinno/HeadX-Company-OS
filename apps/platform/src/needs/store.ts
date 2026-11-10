import type { Pool } from 'pg';
import {
  deriveState,
  isOverdue,
  type NeedKind,
  type NeedListQuery,
  type NeedState,
} from './schema.js';

/**
 * Needs 的 SQL 層（issue 184）。
 *
 * 一個原則：狀態同逾期都唔存。SELECT 的時候由時間戳算，所以清單、右側欄、
 * 計數三邊永遠講同一件事 —— 唔會出現「清單話 3 件，計數話 4 件」。
 */

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export type NeedRow = {
  id: string;
  code: string;
  title: string;
  detail: string | null;
  kind: NeedKind;
  app_id: string | null;
  page_key: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  due_at: Date | null;
  claimed_at: Date | null;
  uploaded_at: Date | null;
  absorbed_at: Date | null;
  accepted_at: Date | null;
  created_at: Date;
};

export type NeedView = {
  id: string;
  code: string;
  title: string;
  detail: string | null;
  kind: NeedKind;
  state: NeedState;
  appId: string | null;
  pageKey: string | null;
  assignee: { id: string; name: string } | null;
  dueAt: string | null;
  overdue: boolean;
  createdAt: string;
};

export type NeedCounts = {
  /** 未關閉的總數（清單上「全部」的數字）。 */
  open: number;
  claimed: number;
  uploaded: number;
  absorbed: number;
  closed: number;
  overdue: number;
  total: number;
};

/**
 * 狀態推導。與 `deriveState` 一字不差，唔可以有一邊改咗另一邊唔改 ——
 * 所以有測試拿同一組時間戳兩邊比對。
 */
const STATE_SQL = `case
    when n.accepted_at is not null then 'closed'
    when n.absorbed_at is not null then 'absorbed'
    when n.uploaded_at is not null then 'uploaded'
    when n.claimed_at is not null then 'claimed'
    else 'open'
  end`;

/**
 * 「而家」這個參數由呼叫端指定位置，唔可以寫死 `$1`。
 *
 * 之前寫死 `$1`，結果 `findNeed` 用 `$1` 傳 id，SQL 就變成拿 uuid 同 timestamptz 比較，
 * 認領完讀回新列時直接 500（`operator does not exist: uuid = timestamp with time zone`）。
 * 所有查詢都排成 $1 = now，其他參數由 $2 起，唔再靠「啱好排第一」。
 */
function overdueSql(nowParam: string): string {
  return `(n.due_at is not null and n.due_at < ${nowParam}::timestamptz and n.accepted_at is null)`;
}

function selectSql(nowParam: string): string {
  return `
  select
    n.id, n.code, n.title, n.detail, n.kind, n.app_id, n.page_key,
    n.assignee_id, u.display_name as assignee_name,
    n.due_at, n.claimed_at, n.uploaded_at, n.absorbed_at, n.accepted_at, n.created_at,
    ${STATE_SQL} as state,
    ${overdueSql(nowParam)} as overdue
  from need n
  left join app_user u on u.id = n.assignee_id
`;
}

const SELECT_SQL = selectSql('$1');

/** 來源篩選：全部／只要未綁 app 的公司層／指定 app。 */
const SCOPE_SQL = `(
  $2 = 'all'
  or ($2 = 'company' and n.app_id is null)
  or ($2 = 'app' and n.app_id = $3)
)`;

function scopeParams(appId: string | null | undefined): [string, string | null] {
  if (appId === undefined) {
    return ['all', null];
  }

  if (appId === null) {
    return ['company', null];
  }

  return ['app', appId];
}

function filterSql(filter: NeedListQuery['filter']): string {
  switch (filter) {
    case 'all':
      return 'state <> \'closed\'';
    case 'closed':
      return 'state = \'closed\'';
    case 'overdue':
      return 'overdue and state <> \'closed\'';
    default:
      return `state = '${filter}'`;
  }
}

export function toNeedView(row: NeedRow): NeedView {
  const state = deriveState({
    claimedAt: row.claimed_at,
    uploadedAt: row.uploaded_at,
    absorbedAt: row.absorbed_at,
    acceptedAt: row.accepted_at,
  });

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    detail: row.detail,
    kind: row.kind,
    state,
    appId: row.app_id,
    pageKey: row.page_key,
    assignee:
      row.assignee_id === null
        ? null
        : { id: row.assignee_id, name: row.assignee_name ?? '' },
    dueAt: row.due_at === null ? null : row.due_at.toISOString(),
    overdue: isOverdue(row.due_at, state, new Date()),
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * 清單。排序＝逾期先、然後最快到期、最後最新開立。
 * 這個排序就是「唔好漏」的具體做法：最容易爛掉的排最前。
 */
export async function listNeeds(
  db: Queryable,
  query: NeedListQuery,
  now: Date,
): Promise<NeedView[]> {
  const [scopeMode, scopeValue] = scopeParams(query.appId);

  const result = await db.query(
    `with n as (${SELECT_SQL} where ${SCOPE_SQL})
     select * from n
     where ${filterSql(query.filter)}
     order by overdue desc, due_at asc nulls last, created_at desc
     limit $4`,
    [now.toISOString(), scopeMode, scopeValue, query.limit],
  );

  return (result.rows as NeedRow[]).map(toNeedView);
}

/**
 * 計數。一次過回五個狀態加逾期，唔係前端自己加總 ——
 * 前端加總就會出現「清單只載 50 筆，計數就跟住錯」。
 */
export async function summarizeNeeds(
  db: Queryable,
  appId: string | null | undefined,
  now: Date,
): Promise<NeedCounts> {
  const [scopeMode, scopeValue] = scopeParams(appId);

  const result = await db.query(
    `with n as (${SELECT_SQL} where ${SCOPE_SQL})
     select
       count(*) filter (where state = 'open')::int as open,
       count(*) filter (where state = 'claimed')::int as claimed,
       count(*) filter (where state = 'uploaded')::int as uploaded,
       count(*) filter (where state = 'absorbed')::int as absorbed,
       count(*) filter (where state = 'closed')::int as closed,
       count(*) filter (where overdue and state <> 'closed')::int as overdue,
       count(*)::int as total
     from n`,
    [now.toISOString(), scopeMode, scopeValue],
  );

  const row = (result.rows as NeedCounts[])[0];

  // count(*) 一定有一列；冇列代表 SQL 壞咗，唔可以靜靜回零。
  if (row === undefined) {
    throw new Error('needs 計數查詢冇回任何一列');
  }

  return row;
}

/**
 * 單筆。參數次序同其他查詢一致：`$1` 係「而家」，`$2` 係 id。
 */
export async function findNeed(db: Queryable, id: string, now: Date): Promise<NeedView | null> {
  const result = await db.query(`${selectSql('$1')} where n.id = $2`, [now.toISOString(), id]);
  const row = (result.rows as NeedRow[])[0];

  return row === undefined ? null : toNeedView(row);
}

/**
 * 認領。只有「未關閉而且未有人認領」才認領得到。
 *
 * 用一個 UPDATE 的 WHERE 條件做併發控制：兩個人同時按，只有一個會拿到列，
 * 另一個拿到零列就回 409。唔做「先查再寫」—— 兩個並發請求都會查得到空，
 * 然後兩個都寫得入去。
 */
export async function claimNeed(db: Queryable, id: string, userId: string): Promise<boolean> {
  const result = await db.query(
    `update need
       set assignee_id = $2, claimed_at = now()
     where id = $1 and accepted_at is null and claimed_at is null
     returning id`,
    [id, userId],
  );

  return result.rows.length > 0;
}

/** 型別用：畀呼叫端知道要傳真 Pool 都得。 */
export type NeedDb = Pool;
