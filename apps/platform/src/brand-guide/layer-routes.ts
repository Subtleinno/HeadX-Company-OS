import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { brandExists } from './auth.js';
import { getApproval } from './approval.js';
import { listGuideBriefs } from './store.js';
import { buildStageBrief } from './brief.js';
import { getGuideState } from './store.js';
import { GUIDE_STAGES, isUuid } from './schema.js';
import { SET_STAGES, resolveSetRef } from './set-scope.js';
import { isLayerKind, projectLayer, type LayerKind } from './layer.js';

/**
 * 品牌引導「五層」投影的路由。
 *
 * 層是投影，不是第二份真相（見 docs/product/BRAND-LAYER-RESTRUCTURE.md §3）。
 * 每次讀取時由 stage 的 brief 即時合成（純函式 projectLayer），不落表。
 * 唯一持久化的例外是層的自訂 prompt（reuse 0030，見 prompt-routes.ts）。
 *
 * 權限：讀要登入（跟 brand-guide 其他讀取一致），不驗品牌編輯權 —— 層是
 * 「閱讀與匯出」的入口，任何能讀品牌的人都能看。
 */

export type BrandGuideLayerDeps = { pool: Pool };

type LayerParams = { brandId: string; kind: string };

function querySetId(query: unknown): unknown {
  return typeof query === 'object' && query !== null ? (query as Record<string, unknown>).setId : undefined;
}

/**
 * 讀一個 scope 全部 stage 的 brief（未存過的即時補算），再加 approval 地圖。
 */
async function loadLayerInput(
  pool: Pool,
  brandId: string,
  brandSetId: string | null,
): Promise<{
  briefs: Record<string, Record<string, unknown>>;
  approvals: Record<string, { state: string; approvedBy: string | null; rationale: string }>;
}> {
  const stored = await listGuideBriefs(pool, brandId, brandSetId);
  const briefs: Record<string, Record<string, unknown>> = { ...stored };

  // 未存過的 stage 即時補算（同 guide-briefs 的邏輯）。
  const scopedStages =
    brandSetId === null ? GUIDE_STAGES : GUIDE_STAGES.filter((id) => SET_STAGES.includes(id));

  for (const stage of scopedStages) {
    if (briefs[stage] !== undefined) {
      continue;
    }
    const prior: Record<string, Record<string, unknown>> = {};
    for (const id of GUIDE_STAGES) {
      if (id === stage) {
        break;
      }
      if (briefs[id] !== undefined) {
        prior[id] = briefs[id];
      }
    }
    const state = await getGuideState(pool, brandId, stage, brandSetId);
    briefs[stage] = buildStageBrief(stage, state, prior);
  }

  // approval 地圖：stage 級可寫入核准事實（brand_guide_approval 表）。
  const approvals: Record<string, { state: string; approvedBy: string | null; rationale: string }> = {};
  for (const stage of scopedStages) {
    const approval = await getApproval(pool, brandId, stage, brandSetId);
    if (approval !== null) {
      approvals[stage] = {
        state: approval.status,
        approvedBy: approval.approverName,
        rationale: approval.rationale,
      };
    }
  }

  return { briefs, approvals };
}

export function registerBrandGuideLayers(app: FastifyInstance, deps: BrandGuideLayerDeps): void {
  // 讀一個層的投影（合成視圖 + 成熟度 + 衝突）。
  app.get(
    '/brands/:brandId/layer/:kind',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, kind } = request.params as LayerParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!isLayerKind(kind)) {
        return reply.code(404).send({ error: 'layer_not_found', kind });
      }

      const scope = await resolveSetRef(deps.pool, brandId, querySetId(request.query));

      if (!scope.ok) {
        return reply.code(scope.status).send(scope.body);
      }

      // design.md 層不收 ?setId=（01–03、04A 方向都係品牌層，只有一份）。
      if (kind === 'design-doc' && scope.brandSetId !== null) {
        return reply.code(400).send({ error: 'layer_set_mismatch', kind, setId: scope.brandSetId });
      }

      const { briefs, approvals } = await loadLayerInput(deps.pool, brandId, scope.brandSetId);
      const projection = projectLayer(kind as LayerKind, briefs, approvals);

      return projection;
    },
  );

  // 匯出層的 .md 檔（可下載）。design.md／tokens 有真匯出；其餘層也有分組檢視的 markdown。
  app.get(
    '/brands/:brandId/layer/:kind.md',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, kind } = request.params as LayerParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!isLayerKind(kind)) {
        return reply.code(404).send({ error: 'layer_not_found', kind });
      }

      const scope = await resolveSetRef(deps.pool, brandId, querySetId(request.query));

      if (!scope.ok) {
        return reply.code(scope.status).send(scope.body);
      }

      if (kind === 'design-doc' && scope.brandSetId !== null) {
        return reply.code(400).send({ error: 'layer_set_mismatch', kind, setId: scope.brandSetId });
      }

      const { briefs, approvals } = await loadLayerInput(deps.pool, brandId, scope.brandSetId);
      const projection = projectLayer(kind as LayerKind, briefs, approvals);

      reply.header('Content-Type', 'text/markdown; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="${projection.exportName}.md"`,
      );

      return projection.exportText;
    },
  );
}
