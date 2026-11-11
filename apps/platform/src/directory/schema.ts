/**
 * 品牌同據點的輸入規則（Boss Portal 據點目錄、Frame 品牌 selector）。
 *
 * 純函數、唔碰資料庫：同一個規則同時用於驗證請求同測試，唔會出現
 * 「測試過得、真請求唔過」或者相反。
 *
 * 呢一支刻意唔處理「邊個有權」——權限係路由的事，唔應該藏喺驗證裡面。
 */

export const SITE_STATUSES = ['pending', 'registered', 'revoked'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

/** 一次性邀請憑證有效期。設計稿（frame-07）寫 72 小時。 */
export const INVITE_TTL_HOURS = 72;

/** 據點代碼：三段，例如 HK-HQ-01、CN-SZ-01。 */
const SITE_CODE = /^[A-Z0-9]{1,8}-[A-Z0-9]{1,8}-[A-Z0-9]{1,4}$/;
const BRAND_CODE = /^[a-z0-9][a-z0-9-]{1,15}$/;

/** Postgres 的 uuid 型別接受的字面格式。版本位唔檢查：要唔要存在由資料庫講。 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BrandInput = { code: string; name: string };

export type BrandFocusInput = { brandId: string };

export type SiteInput = {
  code: string;
  name: string;
  companyLabel: string | null;
  city: string | null;
};

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown): string | null {
  const trimmed = text(value);

  return trimmed.length === 0 ? null : trimmed;
}

export function parseBrandInput(body: unknown): Validation<BrandInput> {
  const source = (body ?? {}) as Record<string, unknown>;
  const code = text(source.code).toLowerCase();
  const name = text(source.name);

  if (!BRAND_CODE.test(code)) {
    return { ok: false, reason: '品牌代碼只可以用小寫英文字母、數字同連字號（2 至 16 個字）' };
  }

  if (name.length === 0 || name.length > 60) {
    return { ok: false, reason: '品牌名要 1 至 60 個字' };
  }

  return { ok: true, value: { code, name } };
}

/**
 * 「我而家做緊邊個品牌」（issue #15）。
 *
 * 只驗證形狀，唔驗證存在：一個格式正確但已經唔存在的品牌，
 * 應該由資料庫回「寫唔到」，而唔係由正則表達式假裝知道。
 * body 唔接受 user id —— 寫邊個人嘅 focus 由 session 決定，
 * 唔可以由請求自己講。
 */
export function parseBrandFocusInput(body: unknown): Validation<BrandFocusInput> {
  const source = (body ?? {}) as Record<string, unknown>;
  const brandId = text(source.brandId);

  if (!UUID.test(brandId)) {
    return { ok: false, reason: 'brandId 要係一個 uuid' };
  }

  return { ok: true, value: { brandId: brandId.toLowerCase() } };
}

/**
 * 據點代碼一律轉大寫：HK-hq-01 同 HK-HQ-01 係同一台機，
 * 唔應該因為大小寫而變成兩個目錄項。
 */
export function parseSiteInput(body: unknown): Validation<SiteInput> {
  const source = (body ?? {}) as Record<string, unknown>;
  const code = text(source.code).toUpperCase();
  const name = text(source.name);
  const companyLabel = optionalText(source.companyLabel);
  const city = optionalText(source.city);

  if (!SITE_CODE.test(code)) {
    return { ok: false, reason: '據點代碼要三段，例如 HK-HQ-01' };
  }

  if (name.length === 0 || name.length > 80) {
    return { ok: false, reason: '據點名要 1 至 80 個字' };
  }

  if (companyLabel !== null && companyLabel.length > 80) {
    return { ok: false, reason: '公司名唔可以超過 80 個字' };
  }

  if (city !== null && city.length > 40) {
    return { ok: false, reason: '城市名唔可以超過 40 個字' };
  }

  return { ok: true, value: { code, name, companyLabel, city } };
}

/** 憑證指紋在畫面上只顯示頭尾：全長 64 個十六進位字元冇人讀得入腦。 */
export function shortenFingerprint(fingerprint: string | null): string | null {
  if (fingerprint === null) {
    return null;
  }

  const compact = fingerprint.replace(/[^0-9a-fA-F]/g, '').toUpperCase();

  if (compact.length < 8) {
    return null;
  }

  return `${compact.slice(0, 2)}:${compact.slice(2, 4)}…${compact.slice(-2)}`;
}
