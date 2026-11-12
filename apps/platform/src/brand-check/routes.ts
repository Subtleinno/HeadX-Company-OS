import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { parseBrandDocument } from '@company-os/contracts';
import { composePages } from '../brand-pages/store.js';
import { brandExists } from '../brand-pages/store.js';
import { isUuid } from '../brand-pages/schema.js';
import { runChecks, type CheckPage } from './checks.js';

/**
 * 驗證規則 API（issue #59）。
 *
 *   POST /brands/:brandId/check   檢查這一頁（或整個品牌）
 *
 * **為什麼是 POST 而不是 GET：** 同一個路可以檢查一份**未儲存的 payload**
 * （agent 交回來的成品、編輯器當下的草稿）。GET 帶一份文件在 body 是講不通的，
 * 而開第二條路（`/check/draft`）會令兩條路的結果有一日不同步。
 *
 * body：
 *   `{ pageKey?: string }`              檢查現行版本
 *   `{ pageKey: string, document: {...} }`  檢查一份未儲存的文件（不會寫入）
 *
 * 只讀：這一支不寫任何東西，包括審計。檢查是看，不是做。
 */

export type BrandCheckDeps = { pool: Pool };

type Params = { brandId: string };

export function registerBrandCheck(app: FastifyInstance, deps: BrandCheckDeps): void {
  app.post('/brands/:brandId/check', { preHandler: app.requireUser }, async (request, reply) => {
    const { brandId } = request.params as Params;

    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return reply.code(404).send({ error: 'brand_not_found', brandId });
    }

    const body = (request.body ?? {}) as { pageKey?: unknown; document?: unknown };
    const pageKey = typeof body.pageKey === 'string' && body.pageKey !== '' ? body.pageKey : undefined;

    const pages = await composePages(deps.pool, brandId);

    if (pageKey !== undefined && !pages.some((page) => page.key === pageKey)) {
      return reply.code(404).send({ error: 'page_not_found', pageKey });
    }

    let candidate: CheckPage[] = pages.map((page) => ({
      key: page.key,
      name: page.name,
      kind: page.kind,
      versionNo: page.versionNo,
      document: { payload: page.document.payload },
    }));

    if (body.document !== undefined) {
      const parsed = parseBrandDocument(body.document);

      if (!parsed.ok) {
        return reply.code(400).send({ error: 'invalid_document', reasons: parsed.errors });
      }

      if (pageKey === undefined) {
        return reply.code(400).send({ error: 'invalid_check', reason: '檢查一份文件時要一併講是哪一頁（pageKey）' });
      }

      candidate = candidate.map((page) =>
        page.key === pageKey
          ? { ...page, versionNo: page.versionNo === 0 ? 1 : page.versionNo, document: { payload: parsed.value.payload } }
          : page,
      );
    }

    const report = runChecks(candidate, pageKey);

    return { ...report, pageKey: pageKey ?? null };
  });
}
