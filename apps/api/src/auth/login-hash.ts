import { createHmac } from 'node:crypto';
import { normalizeEmail } from './email.js';

/**
 * 登入失敗審計的識別碼。
 *
 * audit_log 只准追加：任何人在登入畫面打一次字，那個字就永遠留在資料庫 ——
 * 包括打錯的、不存在的、第三方的 email。所以 target 只寫一個用伺服器端 key
 * 算出來的識別碼。
 *
 * 為甚麼是 HMAC 而不是 SHA-256(email + 固定字串)：固定 salt 寫在程式裡等於公開，
 * 任何人都可以拿幾億個 email 預先算好表來比對。HMAC 的 key 不在 repo 內，
 * 沒有 key 就算不出表。
 *
 * 穩定性是限流的必要條件：同一個正規化 email 一定要對應同一個碼，
 * 否則 countFailedAttempts 每次都會查到 0 次，鎖不起來。
 */

export const LOGIN_HASH_KEY_ENV = 'LOGIN_FAILURE_HASH_KEY';

/** 建議長度。短過這個仍然可以用，但會出聲 —— 太短的 key 可以被逐字猜出來。 */
export const MIN_KEY_BYTES = 32;

/** 前綴讓審計表的讀者一眼看出這不是 email，而是識別碼。 */
const TARGET_PREFIX = 'email_hmac:';

/**
 * 正規化之後再算 HMAC。
 * 這裡也做一次正規化是刻意的：呼叫者忘了先 normalizeEmail 也不會令同一個 email
 * 分裂成兩個識別碼。
 */
export function loginFailureTarget(email: string, key: string): string {
  const digest = createHmac('sha256', key).update(normalizeEmail(email), 'utf8').digest('hex');

  return `${TARGET_PREFIX}${digest}`;
}

/**
 * 讀 key。未設定就拋錯：靜靜用空字串當 key，等於沒有 key，而這件事不應該
 * 在資料庫出現第一批失敗紀錄之後才被人發現。
 */
export function readLoginHashKey(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      `${LOGIN_HASH_KEY_ENV} 未設定，API 不會啟動。登入失敗審計需要用它在寫入前把 email ` +
        '換成不可逆的識別碼；沒有 key 就只能寫明文，或者用可以預先計算的固定 salt。\n' +
        '請在 .env 設定一個隨機字串，例如：\n' +
        `  node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"\n` +
        `把它貼到 ${LOGIN_HASH_KEY_ENV}= 之後，再重新啟動。`,
    );
  }

  // 原樣返回：任何轉換（trim、lowercase）都會令重啟後識別碼漂移，
  // 限流窗期內的計數會無聲失效。
  return raw;
}

/**
 * 短 key 的警告。不阻止啟動（issue 只要求未設定時拒絕），但要說出來：
 * 一個 6 個字的 key 可以被逐字猜出，那與固定 salt 沒有分別。
 * 警告不含 key 的值。
 */
export function loginHashKeyWarning(key: string): string | null {
  const bytes = Buffer.byteLength(key, 'utf8');

  if (bytes >= MIN_KEY_BYTES) {
    return null;
  }

  return (
    `${LOGIN_HASH_KEY_ENV} 只有 ${bytes} bytes，建議至少 ${MIN_KEY_BYTES} bytes。` +
    '太短的 key 可以被逐字猜出，識別碼就等於可以被還原。'
  );
}
