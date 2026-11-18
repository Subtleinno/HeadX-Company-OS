import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { writeAudit } from '../audit.js';
import { brandExists, canEditBrand } from './auth.js';
import { buildStageBrief, normalizeState, priorBriefs } from './brief.js';
import { registerBrandGuideBlocks } from './block-routes.js';
import { registerBrandGuideApproval } from './approval-routes.js';
import { registerBrandGuideLayers } from './layer-routes.js';
import {
  attachOptionImages,
  loadOptionImages,
  registerBrandOptionImages,
} from './option-images.js';
import { registerBrandGuidePrompts } from './prompt-routes.js';
import { SET_STAGES, resolveSetRef, resolveSetScope } from './set-scope.js';
import { loadStageEngine, loadStageSchema } from './engine/index.js';
import { GUIDE_STAGES, isUuid, parseGuideAnswers } from './schema.js';
import {
  getGuideBrief,
  getGuideState,
  listGuideAnswers,
  listGuideBriefs,
  listGuideMap,
  listGuideOptions,
  saveGuideAnswer,
  saveGuideState,
} from './store.js';

/**
 * 品牌引導 API。
 *
 * 兩組路：
 *   GET  /brands/:brandId/guide/:stage/options   選項庫（任何登入者）
 *   GET  /brands/:brandId/guide/:stage/answers   答案（任何登入者）
 *   PUT  /brands/:brandId/guide/:stage/answers   寫入一批答案（要品牌編輯權）
 *   GET  /brands/:brandId/guide-map              品牌維度地圖（任何登入者）
 *
 * 選項庫是參考資料，人人可讀；答案寫入要品牌編輯權（同 brand-pages 一致）。
 * 跨品牌一律當作不存在（404），不回 403。
 *
 * progressive disclosure：`options` 與 `answers` 都收 `?dimension=` 過濾，
 * Agent 逐個維度深入攞，不用一次過載晒成個 stage。維度地圖是最輕一層，
 * 只回「有幾多選項、已答幾多」，不帶選項內容。
 *
 * 未設定的欄位一律省略（方案 A）：回 JSON 時不出 key，防止 Agent 見到
 * 空值自己腦補。
 */

export type BrandGuideDeps = { pool: Pool };

type GuideParams = { brandId: string; stage: string };

const DIMENSION_RE = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;

/** `?setId=` 是品牌集的 scope（04A–04H）；沒有就是品牌層。 */
function querySetId(query: unknown): unknown {
  return typeof query === 'object' && query !== null ? (query as Record<string, unknown>).setId : undefined;
}

export function registerBrandGuide(app: FastifyInstance, deps: BrandGuideDeps): void {
  app.get(
    '/brands/:brandId/guide/:stage/options',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      const query = request.query as { dimension?: string };

      if (query.dimension !== undefined && !DIMENSION_RE.test(query.dimension)) {
        return reply.code(400).send({ error: 'invalid_dimension', dimension: query.dimension });
      }

      const items = await listGuideOptions(deps.pool, stage, query.dimension);

      return {
        items,
        ...(query.dimension !== undefined ? { dimension: query.dimension } : {}),
      };
    },
  );

  app.get(
    '/brands/:brandId/guide/:stage/answers',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      const query = request.query as { dimension?: string };

      if (query.dimension !== undefined && !DIMENSION_RE.test(query.dimension)) {
        return reply.code(400).send({ error: 'invalid_dimension', dimension: query.dimension });
      }

      const items = await listGuideAnswers(deps.pool, brandId, stage);

      const filtered = query.dimension === undefined
        ? items
        : items.filter((answer) => answer.dimension === query.dimension);

      return {
        items: filtered,
        ...(query.dimension !== undefined ? { dimension: query.dimension } : {}),
      };
    },
  );

  app.get(
    '/brands/:brandId/guide-map',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId } = request.params as { brandId: string };

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      return { dimensions: await listGuideMap(deps.pool, brandId) };
    },
  );

  app.put(
    '/brands/:brandId/guide/:stage/answers',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
      }

      const parsed = parseGuideAnswers(request.body);

      if (!parsed.ok) {
        return reply.code(400).send({ error: 'invalid_answers', reason: parsed.reason });
      }

      for (const answer of parsed.value.answers) {
        await saveGuideAnswer(deps.pool, {
          brandId,
          stage: parsed.value.stage,
          dimension: answer.dimension,
          picked: answer.picked,
          textValue: answer.textValue,
        });
      }

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.answers.save',
        target: brandId,
        detail: { stage: parsed.value.stage, dimensions: parsed.value.answers.map((a) => a.dimension) },
      });

      return { items: await listGuideAnswers(deps.pool, brandId, parsed.value.stage) };
    },
  );

  /* ── 引擎（v2）：每 stage 完整 state + brief + prompt ─────────── */

  // 讀一個 stage 的完整 state（category/dim/dial/text/custom）。
  app.get(
    '/brands/:brandId/guide/:stage/state',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      const scope = await resolveSetScope(deps.pool, brandId, stage, querySetId(request.query));

      if (!scope.ok) {
        return reply.code(scope.status).send(scope.body);
      }

      const state = await getGuideState(deps.pool, brandId, stage, scope.brandSetId);

      return { stage, state };
    },
  );

  // 寫一個 stage 的完整 state（整份覆蓋）。引擎會計算 brief 一併存。
  app.put(
    '/brands/:brandId/guide/:stage/state',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      const user = request.currentUser;

      if (user === null) {
        throw new Error('brand-guide 路由缺少 requireUser：request.currentUser 是空的');
      }

      if (!(await canEditBrand(deps.pool, brandId, user))) {
        return reply.code(403).send({ error: 'not_brand_editor' });
      }

      const body = request.body as Record<string, unknown>;

      if (typeof body !== 'object' || body === null || typeof body.state !== 'object' || body.state === null) {
        return reply.code(400).send({ error: 'invalid_state', reason: 'state 必須是物件' });
      }

      const scope = await resolveSetScope(deps.pool, brandId, stage, querySetId(request.query));

      if (!scope.ok) {
        return reply.code(scope.status).send(scope.body);
      }

      const state = body.state as Record<string, unknown>;
      const prior = await priorBriefs(deps.pool, brandId, stage, scope.brandSetId);
      const brief = buildStageBrief(stage, state, prior);

      await saveGuideState(deps.pool, {
        brandId,
        stage,
        state,
        brief,
        brandSetId: scope.brandSetId,
      });

      await writeAudit(deps.pool, {
        actorType: 'human',
        actorId: user.id,
        action: 'brand.guide.state.save',
        target: brandId,
        detail: { stage, brandSetId: scope.brandSetId },
      });

      return { stage, brief };
    },
  );

  // 讀一個 stage 的 brief（buildBrief 輸出，含 completeness/checks/hints）。
  app.get(
    '/brands/:brandId/guide/:stage/brief',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      const scope = await resolveSetScope(deps.pool, brandId, stage, querySetId(request.query));

      if (!scope.ok) {
        return reply.code(scope.status).send(scope.body);
      }

      const stored = await getGuideBrief(deps.pool, brandId, stage, scope.brandSetId);

      if (stored !== null) {
        return { stage, brief: stored };
      }

      // 未儲存過的 stage 仍然要有 brief：AI Agent 同檢視頁都要讀它。
      // 用目前的 state 即時計算一次，但唔寫入（GET 不應有副作用）。
      const state = await getGuideState(deps.pool, brandId, stage, scope.brandSetId);
      const prior = await priorBriefs(deps.pool, brandId, stage, scope.brandSetId);

      return { stage, brief: buildStageBrief(stage, state, prior) };
    },
  );

  // 生成一個維度的討論 prompt（貼給外部 AI Agent 用）。
  // 用目前的 state 作為背景；選項清單由引擎的 PROMPTS 生成。
  app.get(
    '/brands/:brandId/guide/:stage/prompt/:key',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams & { key: string };
      const key = (request.params as { key: string }).key;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      const engine = loadStageEngine(stage);
      const promptFn = engine.prompts[key];

      if (typeof promptFn !== 'function') {
        return reply.code(404).send({ error: 'prompt_not_found', key });
      }

      const state = await getGuideState(deps.pool, brandId, stage);
      const prior = await priorBriefs(deps.pool, brandId, stage);
      const linked = engine.importPrior(normalizeState(engine, state), prior);
      const prompt = promptFn(linked);

      return { stage, key, prompt };
    },
  );

  // 列出一個 stage 的所有 prompt key（前端 Agent mode 畫清單用）。
  app.get(
    '/brands/:brandId/guide/:stage/prompts',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      const engine = loadStageEngine(stage);

      return { stage, keys: Object.keys(engine.prompts) };
    },
  );

  // 讀一個 stage 的選項結構（CAT/SETS/DIMS/TEXTS/LINKS），前端 Edit 卡片用。
  // 由 reference 原封吐出，前端照著畫，不會同 DB 遷移有偏差。
  app.get(
    '/brands/:brandId/guide/:stage/schema',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId, stage } = request.params as GuideParams;

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      if (!(GUIDE_STAGES as readonly string[]).includes(stage)) {
        return reply.code(404).send({ error: 'stage_not_found', stage });
      }

      // 把已生成好的選項圖併進每個選項（`img`）。沒有圖的選項不出 key，
      // 前端就不畫圖框 —— 空框比沒有框更令人以為壞了。
      const images = await loadOptionImages(stage);

      return { stage, schema: attachOptionImages(loadStageSchema(stage), images) };
    },
  );

  // 讀全部 stage 的 brief（跨 stage 連繫：下游 stage autoImport 用）。
  app.get(
    '/brands/:brandId/guide-briefs',
    { preHandler: app.requireUser },
    async (request, reply) => {
      const { brandId } = request.params as { brandId: string };

      if (!isUuid(brandId) || !(await brandExists(deps.pool, brandId))) {
        return reply.code(404).send({ error: 'brand_not_found', brandId });
      }

      const scope = await resolveSetRef(deps.pool, brandId, querySetId(request.query));

      if (!scope.ok) {
        return reply.code(scope.status).send(scope.body);
      }

      const stored = await listGuideBriefs(deps.pool, brandId, scope.brandSetId);
      const briefs: Record<string, Record<string, unknown>> = { ...stored };

      // 未存過的 stage 即時補算：總覽要顯示「缺幾項」，AI Agent 也要讀得到。
      // 每 stage 約 8ms，12 個一齊算仍然在 100ms 內。
      // 品牌集只補 04A–04H：01–03 屬品牌層，上面 store 已合併入來。
      const scopedStages =
        scope.brandSetId === null ? GUIDE_STAGES : GUIDE_STAGES.filter((id) => SET_STAGES.includes(id));

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
        const state = await getGuideState(deps.pool, brandId, stage, scope.brandSetId);
        briefs[stage] = buildStageBrief(stage, state, prior);
      }

      return { briefs };
    },
  );

  // 區塊層：決策、歷史、附件。獨立一條路（見 block-routes.ts 的說明），
  // 但跟同一個註冊入口，呼叫端不用多記一層。
  registerBrandGuideBlocks(app, { pool: deps.pool });

  // 範圍層 prompt（品牌總覽／品牌集／04A／04G）的自訂版本。同一個入口，
  // 因為它與品牌引導是同一份權限、同一組審計。
  registerBrandGuidePrompts(app, { pool: deps.pool });

  // stage 級核准狀態（草稿／審核中／已核准／需修訂）＋ rationale。可寫入的事實，
  // 令匯出的 design.md／token 檔講得出這段是草稿還是已核准。
  registerBrandGuideApproval(app, { pool: deps.pool });

  // 五層投影（design.md／tokens／模板／範例／檢查／不入層）。層是投影，即時合成，
  // 不落表；讀要登入。design.md 層不收 ?setId=。
  registerBrandGuideLayers(app, { pool: deps.pool });

  // 選項圖：每個看得見的選項配一張實物示意圖（材質、工藝、表面…）。
  // 圖跟源碼走（apps/platform/assets/brand-options/），生成由 scripts/gen-option-images.mjs 負責。
  registerBrandOptionImages(app);
}
