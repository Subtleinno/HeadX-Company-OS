import { GATEWAY_TOKEN_HEADER } from './auth/gateway-token.js';

/**
 * 日誌遮罩（issue #87「部署與秘密遮罩」）。
 *
 * Fastify 預設會把整個 `req.headers` 寫入日誌。也就是說，加了入口憑證而
 * 不遮罩，等於**每個請求**都把憑證原文寫進 stdout，之後被蒐集成 log 再輪替、
 * 再備份、再貼進 issue。這種外洩不會有任何錯誤訊息，只會在某天被搜出來。
 *
 * 所以遮罩不是「記得設定」而是預設：`buildServer` 會把這組設定強制併入
 * 呼叫者傳來的 logger 選項，關不掉（見 app.ts 的 `withRedaction`）。
 *
 * 一併遮罩 cookie 與 authorization：同一個日誌行裡，session cookie 與
 * 入口憑證是同一個等級的 bearer 憑證。只遮一個是自欺。
 */

/** 遮罩之後留下的字串。看得出「這裡本來有東西」，但讀不到內容。 */
export const LOG_CENSOR = '[已遮蔽]';

/** pino 的路徑語法。標頭名有連字號，所以用括號寫法。 */
export const LOG_REDACT_PATHS: readonly string[] = [
  `req.headers["${GATEWAY_TOKEN_HEADER}"]`,
  'req.headers.cookie',
  'req.headers.authorization',
];

/**
 * 把必要的遮罩併入任意 logger 設定。
 *
 * 使用者的 `redact` 會被保留並合併（不是覆蓋）—— 應用程式可以再加自己的，
 * 但不可以減掉這幾條。
 */
export function withRedaction(
  options: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const existing = options?.redact;

  const extraPaths =
    typeof existing === 'object' && existing !== null && Array.isArray((existing as { paths?: unknown }).paths)
      ? ((existing as { paths: string[] }).paths)
      : [];

  const existingCensor =
    typeof existing === 'object' && existing !== null && typeof (existing as { censor?: unknown }).censor === 'string'
      ? (existing as { censor: string }).censor
      : LOG_CENSOR;

  return {
    ...(options ?? {}),
    redact: {
      paths: [...new Set([...LOG_REDACT_PATHS, ...extraPaths])],
      censor: existingCensor,
    },
  };
}
