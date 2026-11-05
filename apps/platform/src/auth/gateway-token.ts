import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * 容器之間的入口憑證（issue #87）。
 *
 * ## 為甚麼要有這條憑證
 *
 * gateway 覆寫 `X-Company-OS-Entry: internal` 只證明「這條標頭經過 nginx」，
 * 不證明「請求真的經過 nginx」。任何人只要能連到 platform 的埠，就可以自己填
 * 這條標頭。所以 gateway 另外寫一條只有它與 platform 知道的憑證 ——
 * 標頭講「我聲稱我是內網」，憑證講「而且我真的是那個轉發器」。
 *
 * ## 格式只有一個真相
 *
 * `GATEWAY_TOKEN_PATTERN_SOURCE` 這一條正則同時被三處使用：
 *   1. 平台啟動時驗證 env（`readGatewayToken`）；
 *   2. 每次請求比較標頭之前不需要再驗格式（摘要比較已足夠）；
 *   3. gateway 的啟動守門腳本（`apps/web/docker-entrypoint.d/10-require-gateway-token.sh`）。
 *
 * 第 3 點是文字上的複製，所以 `test/auth/gateway-token.test.ts` 有一條測試
 * 直接讀那支腳本、核對它含的正則同這裡逐字相同。兩邊各寫一份而沒有這條測試，
 * 早晚會漂移成「平台收、gateway 拒」或者相反。
 *
 * 為甚麼是 hex：nginx 的 `proxy_set_header` 會把值原樣寫進設定檔，任何
 * 引號、`$`、分號、換行都可能變成設定注入。純 hex 沒有這個問題。
 */

/** 環境變數名稱。只注入 gateway-internal 與 platform 兩個容器。 */
export const GATEWAY_TOKEN_ENV = 'INTERNAL_GATEWAY_TOKEN';

/** 請求標頭名稱（Node／Fastify 一律轉小寫）。 */
export const GATEWAY_TOKEN_HEADER = 'x-company-os-gateway-token';

/** 最少 32 bytes。128 位元不夠阻擋離線暴力，256 位元是現在的合理下限。 */
export const GATEWAY_TOKEN_MIN_BYTES = 32;

/**
 * 「至少 32 bytes 的 hex」。
 * `{64,}` 就是 `GATEWAY_TOKEN_MIN_BYTES * 2` 個起 —— 寫成算式而不是寫死 64，
 * 免得日後改了下限卻忘了改正則。
 */
export const GATEWAY_TOKEN_PATTERN_SOURCE = `^[0-9a-fA-F]{${GATEWAY_TOKEN_MIN_BYTES * 2},}$`;

const GATEWAY_TOKEN_PATTERN = new RegExp(GATEWAY_TOKEN_PATTERN_SOURCE);

/**
 * 讀取並驗證憑證。
 *
 * 未設定或格式不合格就拋錯 —— 呼叫者在啟動階段接住並結束程序。
 * **不提供預設值**：一個「大家都一樣」的預設憑證等於沒有憑證。
 *
 * 錯誤訊息刻意不提任何看起來像憑證的東西（連長度都不講），因為這些訊息
 * 會出現在啟動日誌、issue 與 CI 輸出裡。
 */
export function readGatewayToken(raw: string | undefined): string {
  if (raw === undefined || raw === '') {
    throw new Error(
      `${GATEWAY_TOKEN_ENV} 未設定。這是 gateway 與 platform 之間的入口憑證，` +
        '沒有它兩邊都不會啟動。產生方法見 .env.example。',
    );
  }

  if (!GATEWAY_TOKEN_PATTERN.test(raw)) {
    throw new Error(
      `${GATEWAY_TOKEN_ENV} 格式不正確：需要至少 ${GATEWAY_TOKEN_MIN_BYTES} bytes 的 hex ` +
        `（即 ${GATEWAY_TOKEN_MIN_BYTES * 2} 個以上的 0-9 a-f 字元）。` +
        '產生方法見 .env.example。',
    );
  }

  return raw;
}

/**
 * 把憑證壓成定長摘要（SHA-256）。
 *
 * 比較之前先摘要，令「長度不同」與「內容不同」走同一條路徑：
 * 直接對原文用 timingSafeEqual 要先檢查長度，那個檢查本身就會因為長度而
 * 提早返回。摘要之後兩邊永遠是 32 bytes。
 */
export function digestOf(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * 比較請求帶來的憑證與啟動時算好的摘要。
 *
 * 任何輸入（空字串、超長、亂碼）都只回 false，不拋錯 —— 拋錯等於用
 * 錯誤類型告訴對方「你差幾遠」。
 */
export function matchesGatewayToken(candidate: string, expected: Buffer): boolean {
  // 空字串、空白、超長、亂碼都走同一句：先摘要再定長比較，
  // 所以「沒有帶」與「帶錯」的回應時間一致，也沒有提早返回的分支。
  return timingSafeEqual(digestOf(candidate), expected);
}
