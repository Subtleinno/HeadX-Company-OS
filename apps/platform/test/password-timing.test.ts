import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, parsePasswordHash, verifyPassword } from '../src/auth/password.js';

/**
 * 舊參數驗證的補時（issue #84 實測發現的側信道）。
 *
 * 量到的事實：N=2^14 的舊雜湊驗證 75 ms，目標參數 2^17 要 637 ms —— 相差 8 倍。
 * 單憑回應時間，攻擊者就分辨得出「這個 email 存在，而且仍然用舊雜湊」。
 * 補時之後兩條路徑應該接近。
 *
 * 為甚麼用「比例」而不是絕對毫秒：絕對毫秒綁死這部機的速度，換一部機就會假失敗。
 * 這裡的界線（慢過一半）與未修正時的 0.12 倍相差很遠，所以不是靠機器快慢過關。
 */

const password = 'timing-test-password-0123456789';

function legacyHash(value: string): string {
  const salt = Buffer.from('0123456789abcdef');
  const derived = scryptSync(value, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function ms(task: () => Promise<unknown>): Promise<number> {
  const started = process.hrtime.bigint();
  await task();
  return Number(process.hrtime.bigint() - started) / 1e6;
}

describe('舊參數驗證要補時', () => {
  it('舊參數與現行參數的驗證時間同一個量級（不再相差 8 倍）', async () => {
    const current = await hashPassword(password);
    const legacy = legacyHash(password);

    // 前提：這一筆舊雜湊真的會被判定為需要升級，否則下面量的是同一條路徑。
    expect(needsRehash(parsePasswordHash(legacy))).toBe(true);
    expect(needsRehash(parsePasswordHash(current))).toBe(false);

    const currentMs = await ms(() => verifyPassword(password, current));
    const legacyMs = await ms(() => verifyPassword(password, legacy));

    expect(await verifyPassword(password, legacy)).toBe(true);

    // 未補時實測是 0.12 倍；補時之後應該貼近 1。一半是很寬的界線。
    expect(legacyMs).toBeGreaterThan(currentMs * 0.5);
  }, 30_000);

  it('舊參數的錯密碼一樣要補時（錯的一邊不可以更快返回）', async () => {
    const legacy = legacyHash(password);
    const current = await hashPassword(password);

    const currentMs = await ms(() => verifyPassword('wrong-password-0123456789', current));
    const legacyMs = await ms(() => verifyPassword('wrong-password-0123456789', legacy));

    expect(await verifyPassword('wrong-password-0123456789', legacy)).toBe(false);
    expect(legacyMs).toBeGreaterThan(currentMs * 0.5);
  }, 30_000);
});
