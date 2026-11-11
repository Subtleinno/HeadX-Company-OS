/**
 * 品牌頁版本的輸入驗證（issue #33）。
 *
 * 這一層只做「形狀」：是不是字串、長度、是不是空的。它不判斷版本是否現行、
 * 是否被成品釘住 —— 那些要讀資料庫，屬 store 的事。分開的原因是同一個
 * 理由在兩個地方各寫一次，早晚會有一邊忘記。
 */

/** 與 migration 0013 的 content check 一致；程式先擋，錯誤訊息才講得清楚。 */
export const MAX_CONTENT_LENGTH = 200_000;
export const MAX_NOTE_LENGTH = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 路徑參數是不是 uuid。
 *
 * 先驗才查資料庫：`where id = $1` 收到一個不是 uuid 的字串，Postgres 會擲
 * 一個語法錯誤，API 就會回 500 —— 但用戶只是打錯網址，應該是 404。
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export type VersionInput = {
  content: string;
  note: string | null;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * 版本內容。
 *
 * 空內容一定拒絕：一個空白版本會成為現行，然後每一個讀這一頁的人都會見到
 * 一張空頁，而系統會說「這一頁有內容」。寧願當場講「沒有內容」。
 *
 * 內容本身不 trim：HTML 的前後空白有意義，去掉之後版面對不上。
 */
export function parseVersionInput(body: unknown): ParseResult<VersionInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'body 必須是物件' };
  }

  const record = body as Record<string, unknown>;
  const content = record.content;

  if (typeof content !== 'string') {
    return { ok: false, reason: 'content 必須是字串' };
  }

  if (content.trim() === '') {
    return { ok: false, reason: 'content 不可以是空白' };
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return { ok: false, reason: `content 不可以超過 ${MAX_CONTENT_LENGTH} 個字元` };
  }

  const rawNote = record.note;

  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
    return { ok: false, reason: 'note 必須是字串' };
  }

  const note = typeof rawNote === 'string' ? rawNote.trim() : '';

  if (note.length > MAX_NOTE_LENGTH) {
    return { ok: false, reason: `note 不可以超過 ${MAX_NOTE_LENGTH} 個字元` };
  }

  return { ok: true, value: { content, note: note === '' ? null : note } };
}

/* ── 自定義頁（issue #32） ───────────────────────────────────── */

/** 與 0013 的 check 約束一致。程式先擋，錯誤訊息才講得清楚。 */
export const MAX_PAGE_NAME_LENGTH = 60;
export const MAX_BRIEF_LENGTH = 400;

const SLUG = /^[a-z][a-z0-9-]{0,39}$/;

/** 五個固定頁的鍵。自定義頁不准用（0013 有 check，這裡先講得清楚）。 */
export const FIXED_PAGE_KEYS: readonly string[] = ['home', 'logo', 'color', 'type', 'tone'];

export type CreatePageInput = {
  name: string;
  slug: string;
  brief: string;
};

/**
 * 建立自定義頁的輸入。
 *
 * 三樣一次過要齊：顯示名、slug、brief。缺 brief 一定拒絕 —— 沒有方向的頁建了
 * 只會在主頁多一個永遠寫「未完成」的入口（C101）。`slug` 不 trim：大小寫與
 * 空白都會令網址出現意料之外的東西，直接要求小寫連字號。
 */
export function parseCreatePageInput(body: unknown): ParseResult<CreatePageInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'body 必須是物件' };
  }

  const record = body as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const slug = typeof record.slug === 'string' ? record.slug : '';
  const brief = typeof record.brief === 'string' ? record.brief.trim() : '';

  if (name === '') {
    return { ok: false, reason: '顯示名不可以空白' };
  }

  if (name.length > MAX_PAGE_NAME_LENGTH) {
    return { ok: false, reason: `顯示名不可以超過 ${MAX_PAGE_NAME_LENGTH} 個字` };
  }

  if (!SLUG.test(slug)) {
    return { ok: false, reason: 'slug 只可以用小寫英文字母、數字與連字號，並且以字母開頭' };
  }

  if (FIXED_PAGE_KEYS.includes(slug)) {
    return { ok: false, reason: `${slug} 是固定頁的鍵，不可以用來做自定義頁` };
  }

  if (brief === '') {
    return { ok: false, reason: '要寫一句「這一頁要決定什麼」' };
  }

  if (brief.length > MAX_BRIEF_LENGTH) {
    return { ok: false, reason: `brief 不可以超過 ${MAX_BRIEF_LENGTH} 個字` };
  }

  return { ok: true, value: { name, slug, brief } };
}

/**
 * 改名的輸入。**沒有 slug** —— 改 slug 等於另一張頁，舊連結會斷（C101）。
 */
export function parseRenameInput(body: unknown): ParseResult<{ name: string }> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'body 必須是物件' };
  }

  const record = body as Record<string, unknown>;

  if ('slug' in record) {
    return { ok: false, reason: 'slug 建立之後不可以改；要搬就新建一張再刪舊那張' };
  }

  const name = typeof record.name === 'string' ? record.name.trim() : '';

  if (name === '') {
    return { ok: false, reason: '顯示名不可以空白' };
  }

  if (name.length > MAX_PAGE_NAME_LENGTH) {
    return { ok: false, reason: `顯示名不可以超過 ${MAX_PAGE_NAME_LENGTH} 個字` };
  }

  return { ok: true, value: { name } };
}
