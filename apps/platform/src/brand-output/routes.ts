import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { isUuid } from '../brand-pages/schema.js';
import { composeBrand, htmlOf, promptOf, tokensOf } from './compose.js';

/**
 * 品牌輸出（issue #57）：HTML、tokens.json、品牌 prompt 包、A4 印刷版。
 *
 * 四條路，全部只讀：
 *   GET /brands/:brandId/output/html        整本品牌書（可以 ?page=color）
 *   GET /brands/:brandId/output/print       A4 印刷版（同一份標記，加印刷 CSS）
 *   GET /brands/:brandId/output/tokens.json
 *   GET /brands/:brandId/output/prompt.md
 *
 * **為什麼在後端出，而不是前端砌：** 這四份是交付物 —— 要貼給外判、要交給
 * agent、要印出來。由後端出一份，四者就是同一份資料的同一次計算；由前端砌，
 * 第一個 copy 到 HTML 的人就會得到一個跟 tokens 不同的品牌。
 *
 * **讀取權限跟品牌頁一樣：** 任何登入者可以讀（C98：只讀是看得到、改不了）。
 * 這裡沒有一條寫入路徑，所以不需要 `canEditBrand`。
 */

export type BrandOutputDeps = { pool: Pool };

type Params = { brandId: string };

export function registerBrandOutput(app: FastifyInstance, deps: BrandOutputDeps): void {
  async function load(brandId: string) {
    if (!isUuid(brandId)) {
      return null;
    }

    return composeBrand(deps.pool, brandId);
  }

  app.get('/brands/:brandId/output/tokens.json', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;
    const composed = await load(brandId);

    if (composed === null) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const file = tokensOf(composed);

    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `inline; filename="${file.filename}"`)
      .send(file.body);
  });

  app.get('/brands/:brandId/output/prompt.md', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;
    const composed = await load(brandId);

    if (composed === null) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const file = promptOf(composed);

    return reply
      .header('content-type', 'text/markdown; charset=utf-8')
      .header('content-disposition', `inline; filename="${file.filename}"`)
      .send(file.body);
  });

  app.get('/brands/:brandId/output/html', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;
    const composed = await load(brandId);

    if (composed === null) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const query = request.query as { page?: string };

    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .send(htmlOf(composed, { pageKey: typeof query.page === 'string' ? query.page : null }));
  });

  app.get('/brands/:brandId/output/print', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;
    const composed = await load(brandId);

    if (composed === null) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .send(htmlOf(composed, { print: true }));
  });
}
