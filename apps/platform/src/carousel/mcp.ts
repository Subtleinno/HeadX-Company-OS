import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CAROUSEL_TEMPLATES, parseProjectBriefDocument, validateCarouselSlides, type ProjectBriefDocument } from '@company-os/contracts';
import type { TrustedEntry } from '@company-os/contracts';
import { createDesignAccess } from '../projects/access.js';
import { appendBriefVersion, claimAgentRun, getProjectDetail } from '../projects/store.js';
import { listBrands } from '../directory/store.js';
import { renderCarousel } from './render.js';
import { createComposition, findKnowledge, getRenderJob, getWorkspace, listKnowledge, listMaterials } from './store.js';
import { HYPERFRAMES_VERSION } from './hyperframes.js';
import type { CarouselDeps } from './routes.js';

function payload(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}
function requestKey(value: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,100}$/.test(value)) throw new Error('idempotencyKey 格式無效');
  return value;
}

const CREATE_GUIDE = `HeadX Creative Director — IG Carousel
1. create_map 找品牌與能力；brand_get_rules 讀目前品牌規則。
2. project_get 看原始要求與 Brief；需要接手時呼叫 project_claim。
3. asset_search 先看素材卡；kb_search／kb_get 選實際知識段落；template_list 看三件套。
4. composition_submit 提交 3–10 頁：第一頁 cover、最後 cta，每個 body 頁引用真 KnowledgeRef。
5. job_submit(type=hyperframes) 會跑官方 check＋逐頁 snapshot；job_status 查結果。
6. 輸出可下載 PNG／ZIP；發布仍由人自行處理。不要虛構品牌、素材、知識或成功狀態。`;
const HF_GUIDE = `HeadX HyperFrames ${HYPERFRAMES_VERSION}
正式 renderer 使用固定 CLI。Composition 是 HTML＋brand tokens；每頁是獨立 timed scene。
系統自動做：離線素材嵌入、明確 1080×1350 根尺寸、單一 paused GSAP timeline、hyperframes check、每頁 snapshot。
Agent 不需要也不應提交任意執行碼；只提交 typed slides、素材與知識引用。失敗時用 job_status 讀實際錯誤。`;

function buildMcpServer(deps: CarouselDeps, agentId: string, tokenId: string): McpServer {
  const server = new McpServer(
    { name: 'headx-creative', version: '1.0.0' },
    { instructions: CREATE_GUIDE },
  );
  const actor = { type: 'agent' as const, id: agentId };
  const newRequestId = () => `mcp-${crypto.randomUUID()}`;

  server.registerResource('create-guide', 'headx://create/guide', { title: 'HeadX Create 工作契約', description: 'IG Carousel agent 的完整工作次序' }, async (uri) => ({ contents: [{ uri: uri.href, text: CREATE_GUIDE }] }));
  server.registerResource('hyperframes-guide', 'headx://hyperframes/guide', { title: 'HyperFrames 生產契約', description: '目前固定 renderer 與安全邊界' }, async (uri) => ({ contents: [{ uri: uri.href, text: HF_GUIDE }] }));

  server.registerTool('create_map', { title: 'Create L0 地圖', description: '列出品牌、Carousel 模板與目前 MCP 能力；每項工作先讀。', inputSchema: {} }, async () => payload({ brands: await listBrands(deps.pool), templates: CAROUSEL_TEMPLATES, tools: ['brand_get_rules', 'asset_search', 'kb_search', 'project_get', 'project_claim', 'brief_submit', 'composition_submit', 'job_submit', 'job_status'] }));

  server.registerTool('brand_get_rules', { title: '讀品牌規則', description: '取得釘住目前版本的色票、字體、語氣、圖像方向與頁版本。', inputSchema: { brandId: z.string().uuid() } }, async ({ brandId }) => {
    const workspace = await import('./store.js').then(({ getBrandProfile }) => getBrandProfile(deps.pool, brandId));
    if (workspace === null) throw new Error('品牌不存在');
    return payload(workspace.profile);
  });

  server.registerTool('asset_search', { title: '搜尋素材 L1', description: '按品牌與關鍵字找真實相片；回傳描述、尺寸與 preview URL。', inputSchema: { brandId: z.string().uuid(), query: z.string().default(''), limit: z.number().int().min(1).max(30).default(12) } }, async ({ brandId, query, limit }) => payload({ assets: await listMaterials(deps.pool, brandId, query, limit, true) }));

  server.registerTool('kb_search', { title: '搜尋知識 L1', description: '回傳知識文件與摘要；需要內容時再用 kb_get 讀 chunks。', inputSchema: { brandId: z.string().uuid(), query: z.string().default('') } }, async ({ brandId, query }) => {
    const docs = await listKnowledge(deps.pool, brandId, query);
    return payload({ knowledge: docs.map((doc) => ({ id: doc.id, brandId: doc.brandId, title: doc.title, status: doc.status, summary: doc.current?.summary ?? '', versionId: doc.current?.id ?? null, versionNo: doc.current?.versionNo ?? null })) });
  });

  server.registerTool('kb_get', { title: '讀知識 L2', description: '讀一份知識的目前版本與逐段 chunk，供 Composition 精確引用。', inputSchema: { docId: z.string().uuid() } }, async ({ docId }) => {
    const doc = await findKnowledge(deps.pool, docId);
    if (doc === null) throw new Error('知識不存在');
    return payload({ knowledge: doc });
  });

  server.registerTool('template_list', { title: 'Carousel 模板', description: '封面、知識內頁、CTA 三件套的 slot 與版本。', inputSchema: {} }, async () => payload({ templates: CAROUSEL_TEMPLATES }));

  server.registerTool('project_get', { title: '讀 Project', description: '讀原始要求、Brief、目前 Composition 與 Outputs。', inputSchema: { projectId: z.string().uuid() } }, async ({ projectId }) => {
    const [project, workspace] = await Promise.all([getProjectDetail(deps.pool, projectId), getWorkspace(deps.pool, projectId)]);
    if (project === null || workspace === null) throw new Error('Project 不存在');
    return payload({ project, workspace });
  });

  server.registerTool('project_claim', { title: '接手 Project', description: '留下 append-only agent run；同一 idempotencyKey 重試安全。', inputSchema: { projectId: z.string().uuid(), idempotencyKey: z.string() } }, async ({ projectId, idempotencyKey }) => {
    const requestId = newRequestId();
    const result = await claimAgentRun(deps.pool, { projectId, agentId, tokenId, requestId, idempotencyKey: requestKey(idempotencyKey), requestHash: digest({ projectId }) });
    if (result.status === 'project_not_found') throw new Error('Project 不存在');
    if (result.status === 'idempotency_conflict') throw new Error('同一 idempotencyKey 已用於不同內容');
    return payload(result);
  });

  server.registerTool('brief_submit', { title: '提交 Brief 新版本', description: '提交目的、受眾、渠道、格式、語言、限制與期限；舊版保留。', inputSchema: {
    projectId: z.string().uuid(), runId: z.string().uuid(), document: z.record(z.string(), z.unknown()),
    note: z.string().max(200).nullable().default(null), basedOnBriefVersionId: z.string().uuid().nullable().default(null), idempotencyKey: z.string(),
  } }, async (input) => {
    const parsed = parseProjectBriefDocument(input.document);
    if (!parsed.ok) throw new Error(parsed.errors.join('；'));
    const result = await appendBriefVersion(deps.pool, {
      projectId: input.projectId, runId: input.runId, document: parsed.value as ProjectBriefDocument,
      note: input.note, basedOnBriefVersionId: input.basedOnBriefVersionId, agentId, tokenId,
      requestId: newRequestId(), idempotencyKey: requestKey(input.idempotencyKey), requestHash: digest(input),
    });
    if (result.status !== 'ok') throw new Error(`Brief 提交失敗：${result.status}`);
    return payload(result);
  });

  server.registerTool('composition_submit', { title: '提交 Carousel Composition', description: '提交 3–10 頁 typed slides；body 頁必須引用真知識 chunk。可 basedOnId 局部修訂。', inputSchema: {
    projectId: z.string().uuid(), slides: z.array(z.record(z.string(), z.unknown())).min(3).max(10),
    basedOnId: z.string().uuid().nullable().default(null), idempotencyKey: z.string(),
  } }, async (input) => {
    const parsed = validateCarouselSlides(input.slides);
    if (!parsed.ok) throw new Error(parsed.errors.join('；'));
    const result = await createComposition(deps.pool, {
      projectId: input.projectId, slides: parsed.value, basedOnId: input.basedOnId, actor,
      requestId: newRequestId(), idempotencyKey: requestKey(input.idempotencyKey), idempotencyHash: digest(input),
    });
    if (result.status !== 'ok') throw new Error(`Composition 提交失敗：${result.status}`);
    return payload(result);
  });

  server.registerTool('job_submit', { title: 'HyperFrames 產生 Carousel', description: 'type 目前固定 hyperframes；執行官方 check＋逐頁 PNG snapshot，輸出 ZIP。', inputSchema: {
    type: z.literal('hyperframes').default('hyperframes'), projectId: z.string().uuid(), compositionId: z.string().uuid(), idempotencyKey: z.string(),
  } }, async (input) => {
    const result = await renderCarousel(deps, { projectId: input.projectId, compositionId: input.compositionId, actor, requestId: newRequestId(), idempotencyKey: requestKey(input.idempotencyKey) });
    if (result.status !== 'ok') throw new Error(`Render 失敗：${result.status}`);
    return payload(result);
  });

  server.registerTool('job_status', { title: '查 Render 狀態', description: '讀實際 job 狀態、錯誤與 output。', inputSchema: { jobId: z.string().uuid() } }, async ({ jobId }) => payload({ job: await getRenderJob(deps.pool, jobId) }));

  server.registerTool('review_checklist', { title: '交付檢查清單', description: '回傳 Carousel 必查事項；不是假分數。', inputSchema: {} }, async () => payload({ checklist: ['3–10 頁且頁序正確', '每頁 1080×1350 PNG 真實存在', '封面／內頁／CTA 角色正確', '品牌 tokens 來自已保存頁版本', '每個內頁可回溯知識 chunk', '素材來自所選品牌', 'HyperFrames check 已通過', 'PNG 與 ZIP 可下載'] }));
  server.registerTool('tool_doctor', { title: '檢查創作工具', description: '回報 HyperFrames CLI 是否存在及固定版本。', inputSchema: {} }, async () => payload({ hyperframes: { available: existsSync(process.env.HYPERFRAMES_BIN ?? resolve(process.cwd(), 'node_modules/.bin/hyperframes')), version: HYPERFRAMES_VERSION }, storage: 'configured' }));
  return server;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function registerCarouselMcp(app: FastifyInstance, deps: Omit<CarouselDeps, 'resolveEntry'> & { resolveEntry: (request: FastifyRequest) => TrustedEntry | null }): void {
  const access = createDesignAccess(app, deps);
  app.post('/mcp', { preHandler: access.agent }, async (request, reply) => {
    const agent = request.currentAgent;
    if (agent === null) return reply.code(401).send({ error: 'agent_not_authenticated' });
    reply.hijack();
    const server = buildMcpServer(deps, agent.id, agent.tokenId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined as unknown as () => string, enableJsonResponse: true });
    await server.connect(transport);
    try {
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } finally {
      await server.close();
    }
  });
}
