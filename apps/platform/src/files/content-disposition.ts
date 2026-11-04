import { isInlineSafe } from './content-type.js';

/**
 * Content-Disposition 是唯一會把用戶提供的字串放進回應標頭的地方。
 *
 * 兩個欄位：
 * - `filename="..."`：只含可列印 ASCII，給不看 RFC 5987 的舊客戶端。
 *   引號、反斜線、換行、控制字元一律換成 `_`，所以不可能提早結束引號或開新標頭。
 * - `filename*=UTF-8''...`：原檔名的百分號編碼（RFC 5987），現代瀏覽器用這一個。
 *
 * inline 只給安全類型；其餘一律 attachment，避免上傳的 HTML 在站內執行。
 */

const ATTR_CHAR = /[A-Za-z0-9!#$&+.^_`|~-]/;

/** 只保留可列印 ASCII，其餘逐個字元換成 `_`；結果不會是空字串。 */
function asciiFallback(originalName: string): string {
  let result = '';

  for (const character of originalName) {
    const code = character.codePointAt(0) ?? 0;
    const printable = code >= 0x20 && code <= 0x7e;
    const safe = printable && character !== '"' && character !== '\\';

    result += safe ? character : '_';
  }

  return result === '' ? '_' : result;
}

/** RFC 5987 的 ext-value：只留 attr-char，其餘逐個 UTF-8 位元組編碼。 */
export function encodeRfc5987(value: string): string {
  let result = '';

  for (const byte of Buffer.from(value, 'utf8')) {
    const character = String.fromCharCode(byte);

    if (byte < 0x80 && ATTR_CHAR.test(character)) {
      result += character;
      continue;
    }

    result += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  return result;
}

export function buildContentDisposition(originalName: string, contentType: string): string {
  const disposition = isInlineSafe(contentType) ? 'inline' : 'attachment';

  return `${disposition}; filename="${asciiFallback(originalName)}"; filename*=UTF-8''${encodeRfc5987(originalName)}`;
}
