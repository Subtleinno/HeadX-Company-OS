import { describe, expect, it } from 'vitest';
import { digestOf, GATEWAY_TOKEN_HEADER } from '../../src/auth/gateway-token';
import {
  ENTRY_HEADER,
  readTrustedEntry,
  trustedEntryOf,
  UNTRUSTED_ENTRY_ERROR,
} from '../../src/auth/trusted-entry';

/**
 * 由標頭判斷「這次請求由哪個入口進來」（issue #87 第 1、4 條）。
 *
 * 這一組刻意只餵標頭，不經 HTTP：所有「唔可以信」的情況都要在同一層攔住。
 * 判斷結果只有兩種 —— 已驗證的 `internal`，或者 `null`。沒有第三種，
 * 也沒有「大概係 internal」。
 */

const TOKEN = 'a'.repeat(64);
const digest = digestOf(TOKEN);

type FakeRequest = { headers: Record<string, string | string[] | undefined> };

function request(headers: Record<string, string | string[] | undefined>): FakeRequest {
  return { headers };
}

/** 一個完全合法的請求：帶齊兩個標頭。 */
function good(over: Record<string, string | string[] | undefined> = {}): FakeRequest {
  return request({
    [ENTRY_HEADER]: 'internal',
    [GATEWAY_TOKEN_HEADER]: TOKEN,
    ...over,
  });
}

describe('可信入口：接受的情況', () => {
  it('合法 token + entry=internal → internal', () => {
    expect(readTrustedEntry(good(), digest)).toBe('internal');
  });

  it('標頭名大小寫不影響（HTTP 標頭本身不分大小寫，Fastify 已轉小寫）', () => {
    expect(
      readTrustedEntry(
        request({
          [ENTRY_HEADER]: 'internal',
          [GATEWAY_TOKEN_HEADER]: TOKEN,
          host: 'localhost:4420',
        }),
        digest,
      ),
    ).toBe('internal');
  });
});

describe('可信入口：拒絕的情況', () => {
  it('兩個標頭都沒有 → null（直接呼叫 platform）', () => {
    expect(readTrustedEntry(request({}), digest)).toBeNull();
  });

  it('只有偽造的 entry 標頭 → null（客戶端自填不算）', () => {
    expect(readTrustedEntry(request({ [ENTRY_HEADER]: 'internal' }), digest)).toBeNull();
  });

  it('只有 token、沒有 entry → null（入口與憑證要成對）', () => {
    expect(readTrustedEntry(request({ [GATEWAY_TOKEN_HEADER]: TOKEN }), digest)).toBeNull();
  });

  it('token 錯 → null', () => {
    expect(readTrustedEntry(good({ [GATEWAY_TOKEN_HEADER]: 'b'.repeat(64) }), digest)).toBeNull();
  });

  it('token 對但入口是 partner／customer／未知值 → null（本張只接受 internal）', () => {
    for (const entry of ['partner', 'customer', 'INTERNAL', ' internal', 'internal ', 'unknown', '']) {
      expect(readTrustedEntry(good({ [ENTRY_HEADER]: entry }), digest), entry).toBeNull();
    }
  });

  it('重複的 entry 標頭（Node 會用逗號合併）→ null，不取第一個', () => {
    expect(readTrustedEntry(good({ [ENTRY_HEADER]: 'internal, internal' }), digest)).toBeNull();
    expect(readTrustedEntry(good({ [ENTRY_HEADER]: 'customer, internal' }), digest)).toBeNull();
  });

  it('重複的 token 標頭 → null，不取第一個', () => {
    expect(readTrustedEntry(good({ [GATEWAY_TOKEN_HEADER]: `${TOKEN}, ${TOKEN}` }), digest)).toBeNull();
  });

  it('Fastify 把重複標頭交成陣列時 → null', () => {
    expect(readTrustedEntry(good({ [ENTRY_HEADER]: ['internal', 'internal'] }), digest)).toBeNull();
    expect(readTrustedEntry(good({ [GATEWAY_TOKEN_HEADER]: [TOKEN, TOKEN] }), digest)).toBeNull();
  });

  it('長度差很遠的值不會拋錯，只會回 null（不可以靠拋錯告訴對方期望什麼）', () => {
    expect(readTrustedEntry(good({ [GATEWAY_TOKEN_HEADER]: '' }), digest)).toBeNull();
    expect(readTrustedEntry(good({ [GATEWAY_TOKEN_HEADER]: 'x'.repeat(10_000) }), digest)).toBeNull();
  });

  it('來自 loopback、Docker 網段、Host 或 X-Forwarded-For 不會令請求變成可信', () => {
    expect(
      readTrustedEntry(
        request({
          host: '127.0.0.1:4420',
          'x-forwarded-for': '172.18.0.1',
          'x-real-ip': '127.0.0.1',
          'x-forwarded-proto': 'http',
        }),
        digest,
      ),
    ).toBeNull();
  });
});

describe('錯誤代碼', () => {
  it('對外只有一個通用代碼，不含任何期望值', () => {
    expect(UNTRUSTED_ENTRY_ERROR).toBe('untrusted_entry');
    expect(UNTRUSTED_ENTRY_ERROR).not.toMatch(/token|secret|internal_gateway/i);
  });
});

describe('trustedEntryOf：只讀服務端放進去的事實', () => {
  it('守衛未執行時回 null，不會自動當成 internal', () => {
    expect(trustedEntryOf({})).toBeNull();
  });

  it('守衛放進去之後照原值回傳', () => {
    expect(trustedEntryOf({ trustedEntry: 'internal' })).toBe('internal');
  });
});
