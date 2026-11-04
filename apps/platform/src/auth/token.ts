import { createHash, randomBytes } from 'node:crypto';

/**
 * Session token：32 bytes 隨機，base64url。
 * 資料庫只存它的 SHA-256；token 本身只在 Set-Cookie 出現一次，之後由瀏覽器帶回。
 */

const TOKEN_BYTES = 32;

export function createSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
