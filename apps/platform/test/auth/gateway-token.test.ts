import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GATEWAY_TOKEN_ENV,
  GATEWAY_TOKEN_HEADER,
  GATEWAY_TOKEN_MIN_BYTES,
  GATEWAY_TOKEN_PATTERN_SOURCE,
  digestOf,
  matchesGatewayToken,
  readGatewayToken,
} from '../../src/auth/gateway-token';

/**
 * 容器之間的入口憑證（issue #87 第 2、3 條）。
 *
 * 這一組是純函數：不讀 env、不連資料庫。重點有三個 ——
 *
 * 1. 格式只有一個真相。`GATEWAY_TOKEN_PATTERN_SOURCE` 同時被 gateway 的啟動守門
 *    腳本使用，下面有一條測試直接讀那支腳本核對，防止兩邊各自寫一份然後漂移。
 * 2. 比較要定長。長度不同也要走同一條比較路徑，否則「幾時回得慢」會透露長度。
 * 3. 錯誤訊息不可以寫出期望值。訊息會被貼進 issue、日誌、CI 輸出。
 */

const repoRoot = resolve(process.cwd());

/** 32 bytes 的 hex，剛好等於下限。 */
const VALID = 'a'.repeat(64);

function hexOf(bytes: number): string {
  return 'b'.repeat(bytes * 2);
}

describe('gateway token 格式', () => {
  it('32 bytes（64 個 hex 字元）是最低下限，剛好合格', () => {
    expect(GATEWAY_TOKEN_MIN_BYTES).toBe(32);
    expect(readGatewayToken(VALID)).toBe(VALID);
  });

  it('長過下限一樣合格（只要仍然是 hex）', () => {
    const longer = hexOf(48);
    expect(readGatewayToken(longer)).toBe(longer);
  });

  it('大寫 hex 也接受，但回傳原字串，不會靜靜改成小寫', () => {
    const upper = 'A'.repeat(64);
    expect(readGatewayToken(upper)).toBe(upper);
  });

  it('少一個 hex 字元就不合格（31.5 bytes 不是 32 bytes）', () => {
    expect(() => readGatewayToken('a'.repeat(63))).toThrow(/64/);
  });

  it.each(['', ' ', '   ', 'a'.repeat(63), 'z'.repeat(64), `${'a'.repeat(63)}-`, 'not-a-token'])(
    '%j 一律拒絕',
    (value) => {
      expect(() => readGatewayToken(value)).toThrow();
    },
  );

  it('未設定（undefined）拒絕，而且訊息講得出變數名，不給預設值', () => {
    expect(() => readGatewayToken(undefined)).toThrow(GATEWAY_TOKEN_ENV);
    expect(() => readGatewayToken(undefined)).toThrow(/未設定|沒有設定/);
  });

  it('錯誤訊息不含任何看起來像憑證的值', () => {
    const sample = 'c'.repeat(70);
    let message = '';

    try {
      readGatewayToken(`${sample}!`);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(sample);
    expect(message).not.toMatch(/c{16}/);
  });

  it('環境變數名稱與標頭名稱是固定常數', () => {
    expect(GATEWAY_TOKEN_ENV).toBe('INTERNAL_GATEWAY_TOKEN');
    expect(GATEWAY_TOKEN_HEADER).toBe('x-company-os-gateway-token');
  });
});

describe('gateway token 比較', () => {
  const digest = digestOf(VALID);

  it('正確的值通過', () => {
    expect(matchesGatewayToken(VALID, digest)).toBe(true);
  });

  it('錯一個字元就不通過', () => {
    expect(matchesGatewayToken(`${'a'.repeat(63)}b`, digest)).toBe(false);
  });

  it('長度不同也不通過（而且不是靠長度判斷，是先摘要再定長比較）', () => {
    expect(matchesGatewayToken('a', digest)).toBe(false);
    expect(matchesGatewayToken('a'.repeat(4096), digest)).toBe(false);
  });

  it('空字串與空白不通過', () => {
    expect(matchesGatewayToken('', digest)).toBe(false);
    expect(matchesGatewayToken('   ', digest)).toBe(false);
  });

  it('digest 是 SHA-256（32 bytes），同一輸入穩定', () => {
    expect(digest.length).toBe(32);
    expect(digestOf(VALID).equals(digest)).toBe(true);
  });
});

describe('gateway 啟動守門腳本與平台用同一條規則', () => {
  const scriptPath = 'apps/web/docker-entrypoint.d/10-require-gateway-token.sh';

  it('腳本存在，而且用 grep -E 檢查格式（不是只看空字串）', () => {
    const script = readFileSync(resolve(repoRoot, scriptPath), 'utf8');

    expect(script).toContain('INTERNAL_GATEWAY_TOKEN');
    expect(script).toMatch(/grep\s+-E/);
  });

  it('腳本內的正則與平台常數逐字相同 —— 兩邊各寫一份就會漂移', () => {
    const script = readFileSync(resolve(repoRoot, scriptPath), 'utf8');

    expect(script).toContain(GATEWAY_TOKEN_PATTERN_SOURCE);
  });

  it('平台的正則把腳本那個模式當成同一件事：合格樣本全部合格', () => {
    const pattern = new RegExp(GATEWAY_TOKEN_PATTERN_SOURCE);

    expect(pattern.test(hexOf(32))).toBe(true);
    expect(pattern.test(hexOf(64))).toBe(true);
    expect(pattern.test(hexOf(31))).toBe(false);
    expect(pattern.test(`${hexOf(32)}g`)).toBe(false);
  });
});
