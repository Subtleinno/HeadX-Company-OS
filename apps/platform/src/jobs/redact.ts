import type { JobFailure } from './types.js';

/**
 * 失敗留痕（issue #85「安全與失敗可見性」）。
 *
 * 為甚麼要遮罩：audit_log 只准追加，寫進去的東西永遠拿不走。一條包含
 * `postgres://user:password@host` 的錯誤訊息，會令一次普通的連線失敗變成
 * 一個永久外洩的憑證。所以在寫入之前就抹掉，而不是「小心不要寫」。
 *
 * 這不是完備的偵測（訊息裡一句「我的密碼是 hunter2」看不出來），
 * 而是把最常見、最容易漏的幾種形狀擋住：連線字串、key=value、長串金鑰。
 */

export const FAILURE_SUMMARY_MAX_LENGTH = 200;

const EMPTY_SUMMARY = 'handler 失敗，沒有訊息';

/**
 * 這些名字一律當機密；`[-_]?` 是為了同時認得 `api_key` 與 `apiKey`
 * （單字之間可能有底線或連字號，或者完全相連）。
 */
const SECRET_KEY_PATTERN = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'client[-_]?secret',
  'token',
  'access[-_]?token',
  'refresh[-_]?token',
  'id[-_]?token',
  'api[-_]?key',
  'private[-_]?key',
  'credential',
  'credentials',
  'authorization',
  'cookie',
  'session[-_]?token',
].join('|');

/** `postgres://user:pass@host` → `postgres://***@host` */
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi;

/**
 * `password=hunter2`、`"password": "hunter2"`、`token: abc` 之類。
 * key 前後可能有引號，值可能是引號字串、`Bearer xxx` 或者一個不含空白的字。
 */
const KEY_VALUE = new RegExp(
  `(["']?(?:${SECRET_KEY_PATTERN})["']?\\s*[=:]\\s*)("[^"]*"|'[^']*'|bearer\\s+[^\\s,;]+|[^\\s,;]+)`,
  'gi',
);

/** 32 個字元以上的十六進位（看起來是金鑰或簽章）。 */
const LONG_HEX = /\b[0-9a-f]{32,}\b/gi;

/** 32 個字元以上的 base64 字元集；是否真的是金鑰由 `looksLikeSecret` 再判斷。 */
const LONG_BASE64 = /\b[A-Za-z0-9+/]{32,}={0,2}/g;

/**
 * 純英文字母的長字（例如 `a`.repeat(1000)）不一定是金鑰，
 * 所以要求同時有大寫、小寫與數字才遮。真正的 base64 金鑰幾乎一定有。
 */
function looksLikeSecret(token: string): boolean {
  return /[A-Z]/.test(token) && /[a-z]/.test(token) && /[0-9]/.test(token);
}

/** 把一段錯誤訊息變成可以永久保存的摘要。 */
export function redactErrorSummary(message: string): string {
  let text = typeof message === 'string' ? message : String(message ?? '');

  text = text.replace(URL_CREDENTIALS, '$1***@');
  text = text.replace(KEY_VALUE, '$1***');
  text = text.replace(LONG_HEX, '***');
  text = text.replace(LONG_BASE64, (token) => (looksLikeSecret(token) ? '***' : token));

  // 壓成一行：stack 的形狀（每行 `at ...`）本身已經沒有意義，而且很長。
  text = text.replace(/\s+/g, ' ').trim();

  if (text === '') {
    return EMPTY_SUMMARY;
  }

  if (text.length > FAILURE_SUMMARY_MAX_LENGTH) {
    return `${text.slice(0, FAILURE_SUMMARY_MAX_LENGTH - 1)}…`;
  }

  return text;
}

/**
 * 一個可以寫入 `last_error_code` 的代碼。
 *
 * 普通 exception 一律 `handler_error`：訊息不可以當代碼，否則等於把
 * 未遮罩的內容寫入一個沒有遮罩的欄位。Postgres 的 SQLSTATE（5 位英數）
 * 變成 `db_23505`，這樣查得到原因，又不會洩漏訊息。
 */
export function errorCodeFrom(error: unknown): string {
  if (isJobFailure(error)) {
    return error.code;
  }

  const code = (error as { code?: unknown } | null | undefined)?.code;

  if (typeof code === 'string') {
    // SQLSTATE：5 位大寫英數，例如 23505、57P01。
    if (/^[0-9A-Z]{5}$/.test(code)) {
      return `db_${code.toLowerCase()}`;
    }

    // Node 的系統錯誤碼，例如 ECONNREFUSED、ETIMEDOUT。
    // 統一小寫：資料庫的 check 約束要求小寫，而「同一個代碼兩種寫法」等於兩個事實。
    if (/^[A-Z][A-Z0-9_]{2,40}$/.test(code)) {
      return code.toLowerCase();
    }
  }

  return 'handler_error';
}

/**
 * 不用 `instanceof` 直接判斷：這樣測試與其他呼叫端不需要真的建立一個
 * JobFailure 類別的實例（例如由另一個 realm 傳進來的錯誤）。
 */
function isJobFailure(error: unknown): error is JobFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { permanent?: unknown }).permanent === 'boolean' &&
    (error as { name?: unknown }).name === 'JobFailure'
  );
}

export { isJobFailure };
