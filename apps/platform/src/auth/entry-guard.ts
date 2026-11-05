import type { FastifyInstance } from 'fastify';
import { digestOf, readGatewayToken } from './gateway-token.js';
import { readTrustedEntry, UNTRUSTED_ENTRY_ERROR } from './trusted-entry.js';

/**
 * 入口守衛（issue #87 第 6 條）。
 *
 * 掛一個 `onRequest` 鈎子，令**所有**路由都要通過入口驗證，
 * 只有容器探針 `/livez`、`/health` 例外。
 *
 * ## 為甚麼是「所有路由」而不是逐條路由加
 *
 * 逐條加就一定有人漏。這一張之後，任何人新增一條業務路由都不用記得補守衛 ——
 * 預設是要驗證的，想豁免反而要改這個檔案，那就會被人看見。
 *
 * ## 為甚麼用 `resolver` 而不是散在各處
 *
 * 驗證結果放在 `request.trustedEntry`。session 建立、session 比對、
 * policy 判斷三處都只讀這一個值，不會有哪一處自己再看一次標頭 ——
 * 看第二次就等於第二個真相，早晚會有一處看得寬鬆。
 */

export type EntryGuardOptions = {
  /**
   * 啟動時已經驗證過的憑證原文。
   * 守衛自己再驗一次格式：呼叫者傳錯（例如傳了空字串）就不會靜靜變成
   * 「所有請求都 403」這種難查的狀態，而是接線時就大聲失敗。
   */
  token: string;
  /** 測試可以傳入現成摘要，省一次 hash。 */
  tokenDigest?: Buffer;
};

/**
 * 免入口驗證的路由。
 *
 * 只有容器探針。**豁免不會傳遞**：`/health/storage` 這類診斷路由仍然要憑證 ——
 * 它以 `503` 加內部錯誤碼描述儲存問題，本身已經是情報。
 */
export const ENTRY_EXEMPT_ROUTES: readonly string[] = ['/livez', '/health'];

export function registerEntryGuard(app: FastifyInstance, options: EntryGuardOptions): void {
  const token = readGatewayToken(options.token);
  const expectedDigest = options.tokenDigest ?? digestOf(token);

  // `null` 而不是 `undefined`：守衛未執行與「守衛執行了但拒絕」對呼叫者一樣，
  // 都讀不到入口。
  app.decorateRequest('trustedEntry', null);

  app.addHook('onRequest', async (request, reply) => {
    const route = request.routeOptions.url ?? '';

    if (ENTRY_EXEMPT_ROUTES.includes(route)) {
      return;
    }

    const entry = readTrustedEntry(request, expectedDigest);

    if (entry === null) {
      // 通用訊息：不講是缺 token、錯 token，還是入口不對。
      // 講清楚等於免費幫對方試錯。
      await reply.code(403).send({
        error: UNTRUSTED_ENTRY_ERROR,
        message: '這個請求不是經由可信的內部入口轉發過來，一律拒絕',
      });
      return;
    }

    request.trustedEntry = entry;
  });
}
