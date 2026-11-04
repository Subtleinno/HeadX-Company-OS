import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

/**
 * 密碼雜湊：node:crypto 的 scrypt，不引入新套件。
 *
 * 格式 scrypt$N$r$p$salt$hash（salt 與 hash 用 base64url），參數寫在字串裡，
 * 將來調高 N／r／p 不會令舊雜湊失效 —— 驗證時用該筆自己記錄的參數。
 * 每個密碼獨立 16 bytes 隨機 salt；比較用 timingSafeEqual。
 */

export const PREFIX = 'scrypt';

export const PASSWORD_MIN_LENGTH = 12;

export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type PasswordHashParts = {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
};

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function parseInteger(value: string | undefined, field: string): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`密碼雜湊格式不正確：${field} 不是整數`);
  }

  return Number(value);
}

/**
 * 解析資料庫裡的雜湊字串。格式不對就擲錯 —— 呼叫者要自己決定是回 false 還是報錯。
 */
export function parsePasswordHash(stored: string): PasswordHashParts {
  const parts = stored.split('$');

  if (parts.length !== 6 || parts[0] !== PREFIX) {
    throw new Error('密碼雜湊格式不正確：要 scrypt$N$r$p$salt$hash');
  }

  const N = parseInteger(parts[1], 'N');
  const r = parseInteger(parts[2], 'r');
  const p = parseInteger(parts[3], 'p');
  const saltText = parts[4] ?? '';
  const hashText = parts[5] ?? '';

  if (!BASE64URL.test(saltText) || !BASE64URL.test(hashText)) {
    throw new Error('密碼雜湊格式不正確：salt 與 hash 必須是 base64url');
  }

  const salt = Buffer.from(saltText, 'base64url');
  const hash = Buffer.from(hashText, 'base64url');

  if (salt.length === 0 || hash.length === 0) {
    throw new Error('密碼雜湊格式不正確：salt 與 hash 不可以是空的');
  }

  return { N, r, p, salt, hash };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

/**
 * 驗證密碼。資料庫裡的雜湊壞掉時回 false，不擲錯：登入端點不應該因為一筆壞紀錄回 500。
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  let parts: PasswordHashParts;

  try {
    parts = parsePasswordHash(stored);
  } catch {
    return false;
  }

  let derivedKey: Buffer;

  try {
    derivedKey = await scryptAsync(password, parts.salt, parts.hash.length, {
      N: parts.N,
      r: parts.r,
      p: parts.p,
    });
  } catch {
    return false;
  }

  if (derivedKey.length !== parts.hash.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, parts.hash);
}

/** 只檢查最短長度；沒有其他組成規則（issue 明文如此）。 */
export function validatePassword(password: string): 'too_short' | null {
  return password.length < PASSWORD_MIN_LENGTH ? 'too_short' : null;
}
