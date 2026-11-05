import type { FastifyRequest } from 'fastify';
import type { TrustedEntry } from '@company-os/contracts';
import { GATEWAY_TOKEN_HEADER, matchesGatewayToken } from './gateway-token.js';

/**
 * 由標頭判斷「這次請求由哪個入口進來」（issue #87）。
 *
 * ## 兩個標頭，缺一不可
 *
 * - `X-Company-OS-Entry`：gateway 覆寫成 `internal`。它講的是「我聲稱我是內網」。
 * - `X-Company-OS-Gateway-Token`：gateway 同時覆寫的憑證。它講的是
 *   「而且我真的是那個轉發器」。
 *
 * 只有兩者同時成立、而且入口剛好是 `internal`，才回 `internal`。其餘一律 `null`。
 *
 * ## 不可以信的替代品
 *
 * 以下幾樣都**不是**信任依據，這裡一條都沒有用：
 * 來源 IP（Docker 網段、loopback 一樣可以來自任何容器）、`Host`、`Origin`、
 * `X-Forwarded-For`、開了 `trustProxy`、請求「看起來像內部」。
 * 這些要麼可以由呼叫者自己填，要麼只能證明「請求經過了某一層」。
 *
 * ## 重複標頭
 *
 * Node 對大部分重複標頭會用 `", "` 合併成一個字串，Fastify 亦可能給出陣列。
 * 兩種情況都不可以「取第一個」—— 那等於讓攻擊者用 `customer, internal` 這種寫法
 * 去賭實作順序。所以：值不是單一字串、或者字串內有逗號，一律當作歧義而拒絕。
 */

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * 只有通過入口守衛之後才會有值。
     * 型別上容許三種入口（policy 需要），但本張的守衛只會放 `internal` 進來。
     */
    trustedEntry: TrustedEntry | null;
  }
}

/** 入口標頭。沿用 #78 已經在用的名字。 */
export const ENTRY_HEADER = 'x-company-os-entry';

/** 對外的通用錯誤代碼。刻意不含 token／secret 之類的字。 */
export const UNTRUSTED_ENTRY_ERROR = 'untrusted_entry';

/** 本張唯一接受的入口。 */
const INTERNAL = 'internal' as const;

type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * 取出「單一、無歧義」的標頭值。
 * 陣列（重複標頭）與含逗號的值都回 `null`。
 */
function singleHeader(headers: HeaderBag, name: string): string | null {
  const value = headers[name];

  if (typeof value !== 'string') {
    // undefined（沒有帶）與 string[]（重複）走同一條：都不是可信的單一值。
    return null;
  }

  if (value.includes(',')) {
    return null;
  }

  return value;
}

/**
 * 讀出已驗證的入口。
 *
 * @param expectedDigest 啟動時由 `digestOf(readGatewayToken(env))` 算好的摘要。
 */
export function readTrustedEntry(
  request: { headers: HeaderBag },
  expectedDigest: Buffer,
): TrustedEntry | null {
  const entry = singleHeader(request.headers, ENTRY_HEADER);
  const token = singleHeader(request.headers, GATEWAY_TOKEN_HEADER);

  if (entry === null || token === null) {
    return null;
  }

  // 先比較比較便宜的那一個，但兩者都要成立；次序不影響結果。
  if (entry !== INTERNAL) {
    return null;
  }

  if (!matchesGatewayToken(token, expectedDigest)) {
    return null;
  }

  return INTERNAL;
}

/**
 * 讀出守衛放進請求的入口事實。
 *
 * 守衛未執行（例如未接線的 app）時回 `null` —— fail closed，不會自動當成 internal。
 */
export function trustedEntryOf(request: { trustedEntry?: TrustedEntry | null }): TrustedEntry | null {
  return request.trustedEntry ?? null;
}

/** 給路由用：把 `FastifyRequest` 收窄成上面那個形狀，避免各處重複 casting。 */
export function entryOfRequest(request: FastifyRequest): TrustedEntry | null {
  return trustedEntryOf(request);
}
