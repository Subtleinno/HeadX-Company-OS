import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { findSetting } from '../settings/store.js';
import { INVITE_TTL_HOURS, shortenFingerprint } from './schema.js';

/**
 * 品牌同據點的讀寫。
 *
 * 兩個寫入動作刻意唔用「先查再寫」：
 * - 建立據點靠唯一索引擋重複（兩個請求同時到，第二個會收到 409 而唔係兩行）。
 * - 批准靠 `where status = 'pending'`，所以同一個據點批兩次，第二次影響 0 行。
 * 單人用都一樣：錯係錯喺設計，唔係錯喺人多。
 */

export type BrandView = {
  id: string;
  code: string;
  name: string;
};

export type SiteView = {
  id: string;
  code: string;
  name: string;
  companyLabel: string | null;
  city: string | null;
  isLocal: boolean;
  status: string;
  /** 只顯示頭尾的指紋；冇交換過就係 null。 */
  fingerprint: string | null;
  entryUrl: string | null;
  lastCredentialAt: string | null;
  /** 有待用的一次性邀請憑證（未過期、未用過）。 */
  hasPendingInvite: boolean;
};

type BrandRow = { id: string; code: string; name: string };

type SiteRow = {
  id: string;
  code: string;
  name: string;
  company_label: string | null;
  city: string | null;
  is_local: boolean;
  status: string;
  fingerprint: string | null;
  entry_url: string | null;
  last_credential_at: Date | null;
  invite_token_hash: string | null;
  invite_expires_at: Date | null;
  invite_used_at: Date | null;
};

const SITE_COLUMNS = `
  id, code, name, company_label, city, is_local, status, fingerprint, entry_url,
  last_credential_at, invite_token_hash, invite_expires_at, invite_used_at
`;

export async function listBrands(db: Pool): Promise<BrandView[]> {
  const result = await db.query<BrandRow>(
    'select id, code, name from brand order by sort_order, name',
  );

  return result.rows;
}

export async function findBrandByCode(db: Pool, code: string): Promise<BrandView | null> {
  const result = await db.query<BrandRow>('select id, code, name from brand where code = $1', [
    code,
  ]);

  return result.rows[0] ?? null;
}

export async function createBrand(db: Pool, code: string, name: string): Promise<BrandView> {
  const result = await db.query<BrandRow>(
    `insert into brand (code, name, sort_order)
     values ($1, $2, coalesce((select max(sort_order) + 10 from brand), 0))
     returning id, code, name`,
    [code, name],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error('建立品牌之後讀唔返新列');
  }

  return row;
}

function toSiteView(row: SiteRow, now: Date): SiteView {
  const pendingInvite =
    row.invite_token_hash !== null &&
    row.invite_used_at === null &&
    row.invite_expires_at !== null &&
    row.invite_expires_at.getTime() > now.getTime();

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    companyLabel: row.company_label,
    city: row.city,
    isLocal: row.is_local,
    status: row.status,
    fingerprint: shortenFingerprint(row.fingerprint),
    entryUrl: row.entry_url,
    lastCredentialAt: row.last_credential_at?.toISOString() ?? null,
    hasPendingInvite: pendingInvite,
  };
}

/**
 * 本機據點一定要存在：目錄、頁尾、同「據點與機器」都靠它知道
 * 「我而家喺邊一台」。第一次讀就補上，之後靠部分唯一索引保證唔會多過一台。
 */
export async function ensureLocalSite(db: Pool): Promise<SiteRow> {
  const existing = await db.query<SiteRow>(`select ${SITE_COLUMNS} from site where is_local`);

  if (existing.rows[0] !== undefined) {
    return existing.rows[0];
  }

  const installCode = await findSetting(db, 'install_code');
  const prefix = typeof installCode?.value === 'string' ? installCode.value : 'XX';

  // 本機都有自己的憑證指紋：佢就係「我呢一台」的身份證號碼。
  // 冇指紋但顯示「已登記」，睇落會似漏了一步。
  const fingerprint = createHash('sha256').update(randomBytes(32)).digest('hex');

  await db.query(
    `insert into site (code, name, is_local, status, fingerprint, last_credential_at)
     values ($1, $2, true, 'registered', $3, now())
     on conflict (is_local) where is_local do nothing`,
    [`${prefix.toUpperCase()}-HQ-01`, '本機', fingerprint],
  );

  const created = await db.query<SiteRow>(`select ${SITE_COLUMNS} from site where is_local`);
  const row = created.rows[0];

  if (row === undefined) {
    throw new Error('補本機據點之後仍然讀唔返');
  }

  return row;
}

export async function listSites(db: Pool, now: Date): Promise<SiteView[]> {
  await ensureLocalSite(db);

  const result = await db.query<SiteRow>(
    // 本機永遠第一，其餘按代號排（設計稿次序：總部 → 深圳 → 東京）
    `select ${SITE_COLUMNS} from site order by is_local desc, code`,
  );

  return result.rows.map((row) => toSiteView(row, now));
}

export async function findSite(db: Pool, id: string, now: Date): Promise<SiteView | null> {
  const result = await db.query<SiteRow>(`select ${SITE_COLUMNS} from site where id = $1`, [id]);

  const row = result.rows[0];

  return row === undefined ? null : toSiteView(row, now);
}

export type CreateSiteResult =
  | { ok: true; site: SiteView; inviteToken: string; inviteExpiresAt: string }
  | { ok: false; reason: 'duplicate_code' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * 建立據點：一開始一定係 `pending`，同時發一張一次性憑證。
 *
 * 明文憑證只在這裡回傳一次，之後資料庫只有 hash —— 所以「再顯示一次」係
 * 做唔到的，唔係我哋唔想做。畫面要講清楚呢一點，唔好留住一個假嘅「重看」。
 */
export async function createSite(
  db: Pool,
  input: { code: string; name: string; companyLabel: string | null; city: string | null },
  now: Date,
): Promise<CreateSiteResult> {
  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(now.getTime() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const result = await db.query<SiteRow>(
    `insert into site (code, name, company_label, city, status, invite_token_hash, invite_expires_at)
     values ($1, $2, $3, $4, 'pending', $5, $6)
     on conflict (code) do nothing
     returning ${SITE_COLUMNS}`,
    [input.code, input.name, input.companyLabel, input.city, hashToken(token), expiresAt],
  );

  const row = result.rows[0];

  if (row === undefined) {
    return { ok: false, reason: 'duplicate_code' };
  }

  return {
    ok: true,
    site: toSiteView(row, now),
    inviteToken: token,
    inviteExpiresAt: expiresAt.toISOString(),
  };
}

export type ApproveResult = 'approved' | 'not_pending' | 'missing';

/**
 * 批准：pending → registered，同時記下憑證指紋同交換時間。
 *
 * 指紋由我哋發出（等於呢個據點嘅身份證號碼），因為邀請憑證係我哋簽的；
 * 如果對方真係另一台機，佢回傳的確認碼會對上這一個 hash。
 */
export async function approveSite(db: Pool, id: string, now: Date): Promise<ApproveResult> {
  const fingerprint = createHash('sha256').update(randomBytes(32)).digest('hex');

  const result = await db.query(
    `update site
        set status = 'registered',
            fingerprint = $2,
            last_credential_at = $3,
            invite_used_at = coalesce(invite_used_at, $3)
      where id = $1 and status = 'pending'`,
    [id, fingerprint, now],
  );

  const affected = (result as { rowCount?: number | null }).rowCount ?? 0;

  if (affected > 0) {
    return 'approved';
  }

  const existing = await db.query('select 1 from site where id = $1', [id]);

  return existing.rowCount === 0 ? 'missing' : 'not_pending';
}
