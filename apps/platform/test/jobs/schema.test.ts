import { describe, expect, it } from 'vitest';
import {
  PAYLOAD_MAX_BYTES,
  PAYLOAD_MAX_DEPTH,
  parseEnqueueInput,
  parseIdempotencyKey,
  parseJobType,
  parseMaxAttempts,
  parsePayload,
  parseRunAt,
} from '../../src/jobs/schema';

/**
 * 入隊輸入的驗證（issue #85「資料與介面」）。
 *
 * payload 是唯一可以由呼叫者帶進隊列的內容，所以它是這一張最大的攻擊面：
 * 太大、太深、不是 JSON、或者夾帶機密，都必須在寫入資料庫之前被拒。
 * 拒絕要一次過講齊所有問題 —— 改呼叫端的人不用逐個試。
 */

const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('payload 形狀', () => {
  it('接受普通的 JSON 物件', () => {
    const parsed = parsePayload({ a: 1, b: ['x', true, null], c: { d: 'e' } });

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual({ a: 1, b: ['x', true, null], c: { d: 'e' } });
  });

  it('頂層一定要是物件：陣列、字串、數字、null 都不接受', () => {
    for (const input of [[1, 2], 'x', 42, null, true, undefined]) {
      const parsed = parsePayload(input);

      expect(parsed.value).toBeUndefined();
      expect(parsed.errors.join(' ')).toContain('物件');
    }
  });

  it('undefined、函數與非有限數字都不接受（否則 JSON 會靜靜改變內容）', () => {
    expect(parsePayload({ a: undefined }).errors).not.toEqual([]);
    expect(parsePayload({ a: () => 1 }).errors).not.toEqual([]);
    expect(parsePayload({ a: Number.NaN }).errors).not.toEqual([]);
    expect(parsePayload({ a: Number.POSITIVE_INFINITY }).errors).not.toEqual([]);
    expect(parsePayload({ a: 10n }).errors).not.toEqual([]);
  });

  it(`嵌套超過 ${PAYLOAD_MAX_DEPTH} 層會被拒（避免用 payload 做出奇怪的結構）`, () => {
    const deep = (depth: number): Record<string, unknown> => {
      let node: Record<string, unknown> = { leaf: true };
      for (let index = 0; index < depth; index += 1) {
        node = { child: node };
      }
      return node;
    };

    expect(parsePayload(deep(PAYLOAD_MAX_DEPTH)).errors).toEqual([]);
    expect(parsePayload(deep(PAYLOAD_MAX_DEPTH + 1)).errors.join(' ')).toContain('層');
  });

  it(`超過 ${PAYLOAD_MAX_BYTES} bytes 會被拒，訊息講出實際大小`, () => {
    const tooBig = parsePayload({ blob: 'x'.repeat(PAYLOAD_MAX_BYTES) });

    expect(tooBig.value).toBeUndefined();
    expect(tooBig.errors.join(' ')).toContain('65536');

    const justUnder = parsePayload({ blob: 'x'.repeat(PAYLOAD_MAX_BYTES - 100) });

    expect(justUnder.errors).toEqual([]);
  });

  it('欄位名太長會被拒', () => {
    const parsed = parsePayload({ ['k'.repeat(101)]: 1 });

    expect(parsed.errors.join(' ')).toContain('欄位名');
  });

  it('看起來是機密的欄位名一律拒絕，任何深度都一樣', () => {
    const secretKeys = [
      'password',
      'passwd',
      'secret',
      'clientSecret',
      'client_secret',
      'token',
      'access_token',
      'apiKey',
      'api_key',
      'private_key',
      'credentials',
      'authorization',
    ];

    for (const key of secretKeys) {
      expect(parsePayload({ [key]: 'x' }).errors.join(' ')).toContain('機密');
      expect(parsePayload({ outer: { [key]: 'x' } }).errors.join(' ')).toContain('機密');
    }

    // 名字相近但不是機密的不受影響：唔好用 substring 亂殺。
    expect(parsePayload({ tokenCount: 3, passwordHint: 'x' }).errors).toEqual([]);
  });

  it('回傳的是 JSON 正規化之後的副本，入隊與之後讀回的內容一致', () => {
    const parsed = parsePayload({ a: 1, b: { c: null } });

    expect(JSON.parse(JSON.stringify(parsed.value))).toEqual(parsed.value);
  });
});

describe('type', () => {
  it('接受小寫、可以用點分段的名字', () => {
    expect(parseJobType('demo.noop').value).toBe('demo.noop');
    expect(parseJobType('maintenance_cleanup').value).toBe('maintenance_cleanup');
  });

  it('大寫、空格、開頭是數字或點、太長都不接受', () => {
    for (const input of ['Demo.noop', 'demo noop', '1demo', '.demo', 'demo.', 'demo..x']) {
      expect(parseJobType(input).value).toBeUndefined();
    }

    expect(parseJobType('a'.repeat(101)).value).toBeUndefined();
    expect(parseJobType(undefined).value).toBeUndefined();
  });
});

describe('idempotencyKey', () => {
  it('可以省略，也可以是 1 至 200 個安全字元', () => {
    expect(parseIdempotencyKey(undefined)).toEqual({ errors: [], value: null });
    expect(parseIdempotencyKey('grant:approve:abc-123').value).toBe('grant:approve:abc-123');
    expect(parseIdempotencyKey('a'.repeat(200)).value).toHaveLength(200);
  });

  it('空白、控制字元、太長都不接受', () => {
    for (const input of ['', 'has space', 'line\nbreak', 'a'.repeat(201), 42]) {
      expect(parseIdempotencyKey(input).value).toBeUndefined();
    }
  });
});

describe('maxAttempts', () => {
  it('可以省略（用預設 5），亦可以指定 1 至 25', () => {
    expect(parseMaxAttempts(undefined)).toEqual({ errors: [], value: 5 });
    expect(parseMaxAttempts(1).value).toBe(1);
    expect(parseMaxAttempts(25).value).toBe(25);
  });

  it('0、26、小數與字串都不接受', () => {
    for (const input of [0, 26, 2.5, '3', -1]) {
      expect(parseMaxAttempts(input).value).toBeUndefined();
    }
  });
});

describe('runAt', () => {
  it('可以省略（即時），亦可以指定未來時間', () => {
    expect(parseRunAt(undefined, NOW).value).toEqual(NOW);

    const future = new Date('2026-01-01T00:05:00.000Z');

    expect(parseRunAt(future, NOW).value).toEqual(future);
  });

  it('過去的時間夾回現在：遲到的工作即刻可領取，不是錯誤', () => {
    const past = new Date('2025-12-31T23:00:00.000Z');

    expect(parseRunAt(past, NOW).value).toEqual(NOW);
  });

  it('不是 Date 或無效日期會被拒', () => {
    expect(parseRunAt('2026-01-01', NOW).value).toBeUndefined();
    expect(parseRunAt(new Date('nope'), NOW).value).toBeUndefined();
  });
});

describe('完整入隊輸入', () => {
  it('未提供的欄位用預設值填好', () => {
    const parsed = parseEnqueueInput({ type: 'demo.noop', payload: { a: 1 } }, NOW);

    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual({
      type: 'demo.noop',
      payload: { a: 1 },
      idempotencyKey: null,
      maxAttempts: 5,
      runAt: NOW,
    });
  });

  it('未知欄位一律拒絕（打錯字的人以為自己改了一樣東西）', () => {
    const parsed = parseEnqueueInput(
      { type: 'demo.noop', payload: {}, run_at: '2026-01-01' },
      NOW,
    );

    expect(parsed.value).toBeUndefined();
    expect(parsed.errors.join(' ')).toContain('run_at');
  });

  it('一次過報齊所有問題', () => {
    const parsed = parseEnqueueInput({ type: 'BAD', payload: [1], maxAttempts: 0 }, NOW);

    expect(parsed.value).toBeUndefined();
    expect(parsed.errors.length).toBeGreaterThanOrEqual(3);
  });
});
