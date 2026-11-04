import { scrypt as scryptCallback } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  SCRYPT_PARAMS,
  hashPassword,
  isUsableParams,
  needsRehash,
  parsePasswordHash,
  safeEqual,
  scryptMaxmemFor,
  validatePassword,
  verifyPassword,
} from '../../src/auth/password';

// 不用真實密碼：測試自己產生，不進 repo。
const PASSWORD = 'correct horse battery staple';

/**
 * N=2^17 的 scrypt 一次要 128 MiB 加約 0.4 秒，這幾條測試一次跑 3 至 8 次。
 * 全套 43 個檔案並行時，單一條最重的測試會撞穿 vitest 預設的 5 秒上限而超時 ——
 * 那是機器爭用，不是行為出錯。所以逐條宣告寬鬆一點的時限。
 * 斷言一條都沒有改，config 的 timeout 也沒有動。
 */
const SLOW_MS = 60_000;

/** OpenSSL 的 scrypt 實際需要的記憶體：128 × r × (N + p + 2)。 */
function requiredMem({ N, r, p }: { N: number; r: number; p: number }): number {
  return 128 * r * (N + p + 2);
}

/**
 * 用指定參數造一個雜湊 —— 刻意不經 hashPassword，
 * 否則就是拿實作去驗證實作，證明不到「舊字串仍然讀得懂」。
 */
function buildHashWith(
  password: string,
  params: { N: number; r: number; p: number; keylen?: number },
  salt: Buffer,
  maxmem: number,
): Promise<string> {
  const keylen = params.keylen ?? 64;

  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keylen,
      { N: params.N, r: params.r, p: params.p, maxmem },
      (error, derived) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(
          [
            'scrypt',
            params.N,
            params.r,
            params.p,
            salt.toString('base64url'),
            derived.toString('base64url'),
          ].join('$'),
        );
      },
    );
  });
}

const OLD_PARAMS = { N: 16384, r: 8, p: 1 };
const OLD_SALT = Buffer.alloc(16, 0x11);

async function oldHash(password = PASSWORD): Promise<string> {
  return buildHashWith(password, OLD_PARAMS, OLD_SALT, requiredMem(OLD_PARAMS) + 1024 * 1024);
}

describe('scrypt 參數（issue #66）', () => {
  it('新雜湊用 N=131072、r=8、p=1', async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);

    const parts = parsePasswordHash(hash);
    expect(parts.N).toBe(131072);
    expect(parts.r).toBe(8);
    expect(parts.p).toBe(1);
  }, SLOW_MS);

  it('maxmem 明確設定，而且真的夠 OpenSSL 用', () => {
    // 這條是這次的主角：issue 原本寫 134217728（=128×N×r），
    // 但 OpenSSL 實際要 128×r×(N+p+2)，差 3 KiB 就整個 scrypt 拋錯。
    expect(SCRYPT_PARAMS.maxmem).toBeGreaterThanOrEqual(requiredMem(SCRYPT_PARAMS));
    expect(SCRYPT_PARAMS.maxmem).toBeGreaterThan(128 * SCRYPT_PARAMS.N * SCRYPT_PARAMS.r);
    // 驗收標準：至少 128 MiB。
    expect(SCRYPT_PARAMS.maxmem).toBeGreaterThanOrEqual(128 * 1024 * 1024);
  });

  it('keylen 是 64，salt 是 16 bytes', async () => {
    const parts = parsePasswordHash(await hashPassword(PASSWORD));

    expect(SCRYPT_PARAMS.keylen).toBe(64);
    expect(parts.hash).toHaveLength(64);
    expect(parts.salt).toHaveLength(16);
  }, SLOW_MS);

  it('參數只在 password.ts 一處定義，其他地方不得 hardcode', () => {
    const root = join(process.cwd(), 'apps', 'platform', 'src');
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);

        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }

        if (!entry.endsWith('.ts')) {
          continue;
        }

        const text = readFileSync(full, 'utf8');

        if (text.includes('131072') && !full.endsWith(join('auth', 'password.ts'))) {
          offenders.push(full);
        }
      }
    };

    walk(root);
    expect(offenders).toEqual([]);
  });
});

describe('雜湊本身', () => {
  it('正確密碼通過，錯誤密碼不通過', async () => {
    const hash = await hashPassword(PASSWORD);

    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true);
    await expect(verifyPassword(`${PASSWORD}唔同`, hash)).resolves.toBe(false);
  }, SLOW_MS);

  it('同一個密碼每次 salt 不同，兩個雜湊都仍然有效', async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first).not.toBe(second);
    expect(parsePasswordHash(first).salt).not.toEqual(parsePasswordHash(second).salt);
    await expect(verifyPassword(PASSWORD, first)).resolves.toBe(true);
    await expect(verifyPassword(PASSWORD, second)).resolves.toBe(true);
  }, SLOW_MS);

  it('雜湊字串裡沒有明文密碼', async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).not.toContain(PASSWORD);
  }, SLOW_MS);
});

describe('舊參數（N=16384）仍然可用', () => {
  it('舊雜湊用正確密碼驗得過', async () => {
    await expect(verifyPassword(PASSWORD, await oldHash())).resolves.toBe(true);
  });

  it('舊雜湊用錯誤密碼驗不過', async () => {
    await expect(verifyPassword(PASSWORD + '!x', await oldHash())).resolves.toBe(false);
  });

  it('驗證不會改寫傳入的字串', async () => {
    const hash = await oldHash();

    await verifyPassword(PASSWORD, hash);
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
  });
});

describe('雜湊字串異常：一律回 false，不拋錯', () => {
  it.each([
    ['截短到一半', (hash: string) => hash.slice(0, Math.floor(hash.length / 2))],
    ['截掉 hash 段', (hash: string) => hash.split('$').slice(0, 5).join('$')],
    ['尾段被剪掉幾個字', (hash: string) => hash.slice(0, -4)],
    ['多了一段', (hash: string) => `${hash}$多出嚟`],
  ])('%s', async (_label, mangle) => {
    const broken = mangle(await hashPassword(PASSWORD));

    await expect(verifyPassword(PASSWORD, broken)).resolves.toBe(false);
  }, SLOW_MS);

  it.each([
    ['純文字', 'plain-text'],
    ['前綴不對', 'bcrypt$16384$8$1$c2FsdA$aGFzaA'],
    ['欄位不足', 'scrypt$16384$8$1$c2FsdA'],
    ['salt 與 hash 是空的', 'scrypt$16384$8$1$$'],
    ['N 不是整數', 'scrypt$abc$8$1$c2FsdA$aGFzaA'],
    ['負數', 'scrypt$-16384$8$1$c2FsdA$aGFzaA'],
  ])('格式錯誤：%s', async (_label, stored) => {
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
  });

  it.each([
    ['N 不是 2 的次方', 'scrypt$3$8$1$c2FsdHNhbHRzYWx0c2E$aGFzaGhhc2hoYXNoaGFzaA'],
    ['N 是 0', 'scrypt$0$8$1$c2FsdHNhbHRzYWx0c2E$aGFzaGhhc2hoYXNoaGFzaA'],
    ['r 是 0', 'scrypt$16384$0$1$c2FsdHNhbHRzYWx0c2E$aGFzaGhhc2hoYXNoaGFzaA'],
    ['p 是 0', 'scrypt$16384$8$0$c2FsdHNhbHRzYWx0c2E$aGFzaGhhc2hoYXNoaGFzaA'],
    ['salt 太短', 'scrypt$16384$8$1$c2Fs$aGFzaGhhc2hoYXNoaGFzaA'],
  ])('參數非法：%s', async (_label, stored) => {
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
  });

  it('參數大到會吃掉幾 GB：直接拒絕，不會真的去配置記憶體', async () => {
    const started = Date.now();

    // N=2^24、r=8 → OpenSSL 想要約 17 GB。沒有上限的話這裡會嘗試配置。
    const huge = 'scrypt$16777216$8$1$c2FsdHNhbHRzYWx0c2E$aGFzaGhhc2hoYXNoaGFzaA';

    await expect(verifyPassword(PASSWORD, huge)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('parsePasswordHash 對壞字串擲錯（呼叫者自己決定怎樣處理）', () => {
    expect(() => parsePasswordHash('not-a-hash')).toThrow(/雜湊格式/);
    expect(() => parsePasswordHash('scrypt$16384$8$1$$')).toThrow(/雜湊格式/);
  });
});

describe('壞掉的參數在配置記憶體之前就被擋住', () => {
  it('目標參數與舊參數都可用', () => {
    expect(isUsableParams(SCRYPT_PARAMS)).toBe(true);
    expect(isUsableParams(OLD_PARAMS)).toBe(true);
  });

  it.each([
    ['N 不是 2 的次方', { N: 3, r: 8, p: 1 }],
    ['N 是 1', { N: 1, r: 8, p: 1 }],
    ['N 是 0', { N: 0, r: 8, p: 1 }],
    ['N 大到要 17 GB', { N: 2 ** 24, r: 8, p: 1 }],
    // 這一格是專為記憶體上限而設：2^20 是 2 的次方、未超過 MAX_N、r 合法，
    // 只有「128×r×(N+p+2) > 256 MiB」這一條擋得住它（要 1 GiB）。
    ['N 是 2^20（合法但超出記憶體上限）', { N: 2 ** 20, r: 8, p: 1 }],
    ['r 是 0', { N: 16384, r: 0, p: 1 }],
    ['r 大到要吃幾十 GB', { N: 16384, r: 4096, p: 1 }],
    ['p 是 0', { N: 16384, r: 8, p: 0 }],
  ])('%s：不可用', (_label, params) => {
    expect(isUsableParams(params)).toBe(false);
  });
});

describe('兩側 digest 長度不一致時不得呼叫 timingSafeEqual', () => {  it('長度不同回 false（timingSafeEqual 本身會拋錯，所以這條證明有先檢查）', () => {
    expect(safeEqual(Buffer.alloc(32, 1), Buffer.alloc(64, 1))).toBe(false);
    expect(safeEqual(Buffer.alloc(64, 1), Buffer.alloc(32, 1))).toBe(false);
    expect(safeEqual(Buffer.alloc(0), Buffer.alloc(0))).toBe(false);
  });

  it('長度相同才真的比較', () => {
    expect(safeEqual(Buffer.alloc(64, 7), Buffer.alloc(64, 7))).toBe(true);
    expect(safeEqual(Buffer.alloc(64, 7), Buffer.alloc(64, 8))).toBe(false);
  });
});

describe('升級判定', () => {
  it('舊參數要升級', async () => {
    expect(needsRehash(parsePasswordHash(await oldHash()))).toBe(true);
  });

  it('已經是新參數就不用升級', async () => {
    expect(needsRehash(parsePasswordHash(await hashPassword(PASSWORD)))).toBe(false);
  });

  it('比目標更強的不會降級', async () => {
    const stronger = await buildHashWith(
      PASSWORD,
      { N: 262144, r: 8, p: 1 },
      Buffer.alloc(16, 0x22),
      requiredMem({ N: 262144, r: 8, p: 1 }) + 1024 * 1024,
    );

    expect(needsRehash(parsePasswordHash(stronger))).toBe(false);
  }, SLOW_MS);

  it('digest 比 64 bytes 短也要升級', async () => {
    const shorter = await buildHashWith(
      PASSWORD,
      { N: SCRYPT_PARAMS.N, r: 8, p: 1, keylen: 32 },
      Buffer.alloc(16, 0x33),
      SCRYPT_PARAMS.maxmem,
    );

    expect(needsRehash(parsePasswordHash(shorter))).toBe(true);
  }, SLOW_MS);
});

describe('驗證用的 maxmem 由該筆雜湊自己算出來', () => {
  it('舊參數算出來比新參數小（不會無謂地要 132 MiB）', () => {
    expect(scryptMaxmemFor(OLD_PARAMS)).toBeLessThan(scryptMaxmemFor(SCRYPT_PARAMS));
  });

  it('兩種參數的 maxmem 都足夠自己用', () => {
    expect(scryptMaxmemFor(OLD_PARAMS)).toBeGreaterThanOrEqual(requiredMem(OLD_PARAMS));
    expect(scryptMaxmemFor(SCRYPT_PARAMS)).toBeGreaterThanOrEqual(requiredMem(SCRYPT_PARAMS));
  });
});

describe('密碼長度', () => {
  it(`少於 ${PASSWORD_MIN_LENGTH} 個字元要拒絕，剛好 ${PASSWORD_MIN_LENGTH} 個可以`, () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('too_short');
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });
});
