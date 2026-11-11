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
