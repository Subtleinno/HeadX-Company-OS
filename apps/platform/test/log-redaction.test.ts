import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app';
import { LOG_CENSOR, LOG_REDACT_PATHS, withRedaction } from '../src/logging';
import { GATEWAY_TOKEN_HEADER } from '../src/auth/gateway-token';

/** pino 是 fastify 自己用的同一個 logger（transitive 依賴，但同一個實例）。 */

/**
 * 日誌遮罩（issue #87「部署與秘密遮罩」）。
 *
 * 兩件事要分清楚：
 *
 * 1. Fastify 預設的請求序列化器**只**寫 method／url／host／remoteAddress，
 *    不含標頭。所以今天不會因為這條憑證而外洩 —— 這一條測試順便釘住它。
 * 2. 但只要有任何人日後加了自訂序列化器、或者把整個 request 丟進 log，
 *    標頭就會跟著出去。所以遮罩是預設而不是「記得設定」：
 *    `buildServer` 會把遮罩併入呼叫者傳來的 logger 選項，關不掉。
 *
 * 第 2 點不可以只靠讀設定檔證明 —— 下面直接寫一條會經過 `req.headers` 的
 * 日誌，睇下憑證有冇被遮。
 */

const ok = async (): Promise<void> => undefined;

function sink(): { lines: string[]; write: (chunk: string) => void } {
  const lines: string[] = [];

  return {
    lines,
    write: (chunk: string): void => {
      lines.push(chunk);
    },
  };
}

const TOKEN = 'f'.repeat(64);
const COOKIE = 'co_session=top-secret-session-token';

describe('日誌遮罩', () => {
  it('把帶標頭的物件寫入日誌時，憑證與 cookie 都會被遮，其他標頭照常保留', () => {
    const out = sink();

    // 直接用同一組遮罩設定開一個 pino（Fastify 用的就是它）。
    // 不經 Fastify 是因為它的請求序列化器本身會丟掉標頭 —— 那樣測不到遮罩，
    // 會變成「測試全綠但遮罩其實沒生效」。
    // pino 的 stream 要作為第二個參數傳（放進 options 會被忽略，然後寫去 stdout）。
    // Fastify 那邊 `logger: { stream }` 是它自己處理的，所以 buildServer 不用改。
    const logger = pino(withRedaction({ level: 'info' }), out);

    logger.info(
      {
        req: {
          method: 'GET',
          url: '/auth/me',
          headers: {
            [GATEWAY_TOKEN_HEADER]: TOKEN,
            cookie: COOKIE,
            'user-agent': 'vitest',
          },
        },
      },
      '探測：這一行刻意帶標頭',
    );

    const text = out.lines.join('');

    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('top-secret-session-token');
    expect(text).toContain(LOG_CENSOR);
    expect(text).toContain('vitest');
  });

  it('遮罩路徑包含入口憑證、cookie 與 authorization', () => {
    expect(LOG_REDACT_PATHS).toContain(`req.headers["${GATEWAY_TOKEN_HEADER}"]`);
    expect(LOG_REDACT_PATHS).toContain('req.headers.cookie');
    expect(LOG_REDACT_PATHS).toContain('req.headers.authorization');
  });

  it('真實請求的日誌不會出現憑證（Fastify 預設不寫標頭）', async () => {
    const out = sink();

    const app = buildServer({
      checkDb: ok,
      checkStorage: ok,
      logger: { level: 'info', stream: out },
    });

    await app.inject({
      method: 'GET',
      url: '/livez',
      headers: { [GATEWAY_TOKEN_HEADER]: TOKEN, cookie: COOKIE },
    });

    await app.close();

    const text = out.lines.join('');

    expect(text).toContain('incoming request');
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('top-secret-session-token');
  });

  it('回應不會把憑證回顯給呼叫者', async () => {
    const app = buildServer({ checkDb: ok, checkStorage: ok });

    const response = await app.inject({
      method: 'GET',
      url: '/livez',
      headers: { [GATEWAY_TOKEN_HEADER]: TOKEN },
    });

    await app.close();

    expect(JSON.stringify(response.headers)).not.toContain(TOKEN);
    expect(response.body).not.toContain(TOKEN);
  });
});
