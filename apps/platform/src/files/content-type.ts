/**
 * 上傳時的 content-type 是「檔案的類型」，不是請求的編碼方式。
 *
 * 收窄成 `type/subtype` 之後才存：參數（charset、q=…）一律丟掉，
 * 一來同一個類型只有一種寫法，二來用戶提供的字串不會原樣回到回應標頭裡。
 */

export const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** RFC 9110 的 token 字元；不含空白、引號、反斜線、控制字元，所以不可能注入標頭。 */
const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

const INLINE_SAFE_PREFIXES = ['image/', 'video/', 'audio/'];

const INLINE_SAFE_EXACT = new Set(['application/pdf', 'text/plain']);

/**
 * 回傳要存下來的類型；不是合法的 type/subtype 就回 null，由呼叫端回 400。
 * 完全沒有 content-type 時用 application/octet-stream（二進位檔就是這個）。
 */
export function normalizeContentType(raw: string | undefined): string | null {
  if (raw === undefined) {
    return DEFAULT_CONTENT_TYPE;
  }

  const mediaType = (raw.split(';')[0] ?? '').trim().toLowerCase();

  if (mediaType === '') {
    return DEFAULT_CONTENT_TYPE;
  }

  return MEDIA_TYPE.test(mediaType) ? mediaType : null;
}

/**
 * 可以在瀏覽器內顯示的類型才用 inline。
 * text/html 刻意不在名單內：那是可以執行腳本的內容，一定當附件下載。
 */
export function isInlineSafe(contentType: string): boolean {
  if (INLINE_SAFE_EXACT.has(contentType)) {
    return true;
  }

  return INLINE_SAFE_PREFIXES.some((prefix) => contentType.startsWith(prefix));
}
