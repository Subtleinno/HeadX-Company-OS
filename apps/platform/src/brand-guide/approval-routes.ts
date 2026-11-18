import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { brandExists, canEditBrand } from './auth.js';
import { getApproval, saveApproval, type ApprovalStatus } from './approval.js';
import { GUIDE_STAGES, isUuid } from './schema.js';
import { resolveSetScope } from './set-scope.js';

/**
 * 品牌引導「stage 級核准狀態」的路由。
 *
 * 與 block 的 decision／rationale 不同：這是整份 stage 的核准（草稿／審核中／
 * 已核准／需修訂），由人寫入，令匯出的 design.md／token 檔講得出「這段是
 * 草稿還是已核准、誰核准、哪個版本」。
 *
 * 權限與其他 brand-guide 寫入一致：讀要登入，寫要品牌編輯權。
 */

export type BrandGuideApprovalDeps = { pool: Pool };

type ApprovalParams = { brandId: string; stage: string };

const KNOWN_STATUS: readonly ApprovalStatus[] = ['draft', 'in_review', 'approved', 'needs_revision'];

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function setIdOf(query: unknown): unknown {
  return typeof query === 'object' && query !== null ? (query as Record<string, unknown>).setId : undefined;
}

export function registerBrandGuideApproval(app: FastifyInstance, deps: BrandGuideApprovalDeps): void {
  type Resolved = { ok: true; brandSetId: string | null } | { ok: false; status: number; body: Record<string, unknown> };

  async function resolveStage(brandId: string, stage: string, setId: unknown): Promise<Resolved> {
    if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
      return { ok: false, status: 404, body: { error: 'brand_not_found', brandId } };
    }

    if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
      return { ok: false, status: 404, body: { error: 'stage_not_found', stage } };
    }

    const scope = await resolveSetScope(deps.pool, brandId, stage, setId);

    if (!scope.ok) {
      return scope;
    }

    return { ok: true, brandSetId: scope.brandSetId };
  }

  app.get(
    '/brands/:brandId/guide/:stage/approval',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as ApprovalParams;
      const target = await resolveStage(brandId, stage, setIdOf(request.query));

      if (!target.ok) {
        return reply.code(target.status).send(target.body);
      }

      const approval = await getApproval(deps.pool, brandId, stage, target.brandSetId);

      return { stage, approval };
    },
  );

  app.put(
    '/brands/:brandId/guide/:stage/approval',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as ApprovalParams;
      const target = await resolveStage(brandId, stage, setIdOf(request.query));

      if (!target.ok) {
        return reply.code(target.status).send(target.body);
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide approval 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
      }

      const body = request.body as Record<string, unknown>;
      const status = textField(body.status);

      if (!KNOWN_STATUS.includes(status as ApprovalStatus)) {
        return reply.code(400).send({ error: 'invalid_approval_status', status });
      }

      const version = textField(body.version).trim();
      const note = textField(body.note).trim();
      const rationale = textField(body.rationale);

      if (version.length > 40) {
        return reply.code(400).send({ error: 'version_too_long', max: 40 });
      }

      if (note.length > 4000) {
        return reply.code(400).send({ error: 'note_too_long', max: 4000 });
      }

      if (rationale.length > 12000) {
        return reply.code(400).send({ error: 'rationale_too_long', max: 12000 });
      }

      // approved 一定要有核准者；其餘狀態 approver 可空（approverId 用寫入者身份，
      // 核准是「由人按下核准」，寫入者就是核准者）。
      const approverId = status === 'approved' ? user.id : null;

      const approval = await saveApproval(deps.pool, {
        brandId,
        stage,
        brandSetId: target.brandSetId,
        status: status as ApprovalStatus,
        approverId,
        version,
        note,
        rationale,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.approval.save',
        target: brandId,
        detail: { stage, status, version },
      });

      return { stage, approval };
    },
  );
}
