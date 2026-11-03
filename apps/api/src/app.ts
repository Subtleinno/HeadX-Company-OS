import Fastify, { type FastifyInstance } from 'fastify';

export type DbCheck = () => Promise<void>;

export type ServerOptions = {
  checkDb: DbCheck;
  logger?: boolean;
};

/**
 * 建立 API 實例。db 檢查以參數注入，測試可以模擬 db 通與不通。
 */
export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  // 只代表 process 仍然活著，不檢查任何依賴。
  app.get('/livez', async () => ({ status: 'ok' }));

  app.get('/health', async (_request, reply) => {
    try {
      await options.checkDb();
      return { status: 'ok', checks: { db: 'ok' } };
    } catch {
      // 不把底層錯誤內容回給外面，避免洩漏連線資訊。
      reply.code(503);
      return { status: 'error', checks: { db: 'error' } };
    }
  });

  return app;
}
