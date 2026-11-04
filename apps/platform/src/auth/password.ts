import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

/**
 * 密碼雜湊：node:crypto 的 scrypt，不引入新套件。
 *
 * 格式 scrypt$N$r$p$salt$hash（salt 與 hash 用 base64url），參數寫在字串裡，
 * 所以調高 N／r／p 不會令舊雜湊失效 —— 驗證時用該筆自己記錄的參數。
 * 每個密碼獨立 16 bytes 隨機 salt；比較用 timingSafeEqual。
 */

export const PREFIX = 'scrypt';

export const PASSWORD_MIN_LENGTH = 12;

export const SALT_BYTES = 16;

/**
 * 新密碼的 scrypt 參數。這是全 repo 唯一一處定義（有 gate 測試把關）。
 *
 * N = 131072（2^17）、r = 8、p = 1：Node 預設的 2^14 對老闆帳戶偏低。
 *
 * maxmem 為甚麼是 138412032（132 MiB）而不是 134217728（128 MiB）：
 * `128 × N × r = 134217728` 只是資料本身的大小。OpenSSL 的 scrypt 另外要
 * `128 × r × (N + p + 2) = 134220800` 做內部計數，比 128 MiB 多 3 KiB。
 * 用 134217728 會在**第一個密碼**就拋 ERR_CRYPTO_INVALID_SCRYPT_PARAMS
 * （已實測 Node 22 與 26 都是），即整個密碼功能起不來。
 * 132 MiB 保留 4 MiB 餘裕，同時滿足「至少 128 MiB」，而且不降低 N。
 */
export const SCRYPT_PARAMS = {
  N: 131072,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 138412032,
} as const;

/**
 * 驗證時可接受的記憶體上限（256 MiB）。
 * 沒有這個上限，一筆壞掉的資料列（例如 N=2^24）就會令登入嘗試配置十幾 GB。
 */
export const MAX_VERIFY_MEMORY = 256 * 1024 * 1024;

/** 給 OpenSSL 前後版本差異的餘裕。 */
const MEMORY_HEADROOM = 1024 * 1024;

/** N 的上限：再大就不合理地貴，而且不值得為一筆資料列冒記憶體風險。 */
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type PasswordHashParts = {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
};

export type ScryptParams = {
  N: number;
  r: number;
  p: number;
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

/**
 * 這組參數跑得起要幾多 maxmem。OpenSSL 的公式是 128 × r × (N + p + 2)，
 * 不是 128 × N × r —— 兩者相差 128 × r × (p + 2)，正是 issue 原本踩到的 3 KiB。
 */
export function scryptMaxmemFor({ N, r, p }: ScryptParams): number {
  return 128 * r * (N + p + 2) + MEMORY_HEADROOM;
}

function parseInteger(value: string | undefined, field: string): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`密碼雜湊格式不正確：${field} 不是整數`);
  }

  return Number(value);
}

function isPowerOfTwo(value: number): boolean {
  return value > 1 && (value & (value - 1)) === 0;
}

/**
 * 參數是否安全可用。壞掉的資料列要在**配置任何記憶體之前**被擋住，
 * 不是在 scrypt 裡面失敗。
 *
 * 公開出來是為了可以被測試直接咬住：只靠「驗證結果係 false」分不出
 * 「被這裡擋住」與「scrypt 自己拋錯」。
 */
export function isUsableParams({ N, r, p }: ScryptParams): boolean {
  if (!isPowerOfTwo(N) || N > MAX_N) {
    return false;
  }

  if (!Number.isInteger(r) || r < 1 || r > MAX_R) {
    return false;
  }

  if (!Number.isInteger(p) || p < 1 || p > MAX_P) {
    return false;
  }

  return scryptMaxmemFor({ N, r, p }) <= MAX_VERIFY_MEMORY;
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

/**
 * 比較兩段 digest。長度不同直接回 false —— timingSafeEqual 在長度不同時會擲錯，
 * 而「擲錯」本身就是一種可觀察的差異。
 */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/** 用目前的目標參數雜湊一個新密碼。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });

  return [
    PREFIX,
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

/**
 * 驗證密碼。資料庫裡的雜湊壞掉時回 false，不擲錯：登入端點不應該因為一筆壞紀錄回 500。
 *
 * 兩個關鍵點：
 * 1. 用該筆雜湊自己記錄的 N／r／p 驗證，所以舊參數仍然登入得入。
 * 2. 派生長度固定用目標 keylen，**不是**用字串裡 hash 的長度。
 *    scrypt 的輸出是前綴穩定的：若用 hash.length 當 keylen，一把被剪短的雜湊
 *    派生出的前 N bytes 剛好等於原本 digest 的前 N bytes，於是「截短」反而驗得過。
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  let parts: PasswordHashParts;

  try {
    parts = parsePasswordHash(stored);
  } catch {
    return false;
  }

  if (!isUsableParams(parts)) {
    return false;
  }

  if (parts.hash.length !== SCRYPT_PARAMS.keylen) {
    return false;
  }

  let derivedKey: Buffer;

  try {
    derivedKey = await scryptAsync(password, parts.salt, SCRYPT_PARAMS.keylen, {
      N: parts.N,
      r: parts.r,
      p: parts.p,
      maxmem: scryptMaxmemFor(parts),
    });
  } catch {
    return false;
  }

  return safeEqual(derivedKey, parts.hash);
}

/**
 * 這筆雜湊是否低於目前的目標參數（任何一個維度低於目標就要升級）。
 * 已經等於或強過目標的不會降級，所以新參數使用者不會每次登入都重新雜湊。
 */
export function needsRehash(parts: PasswordHashParts): boolean {
  return (
    parts.N < SCRYPT_PARAMS.N ||
    parts.r < SCRYPT_PARAMS.r ||
    parts.p < SCRYPT_PARAMS.p ||
    parts.hash.length < SCRYPT_PARAMS.keylen
  );
}

/** 只檢查最短長度；沒有其他組成規則（issue 明文如此）。 */
export function validatePassword(password: string): 'too_short' | null {
  return password.length < PASSWORD_MIN_LENGTH ? 'too_short' : null;
}
