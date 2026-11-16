import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Storage, StoredObject, StoredRange, ByteRange } from '../../src/storage/index';
import type { CompositionView, KnowledgeDocView, ProjectCreativeWorkspace, ProjectDetail } from '@company-os/contracts';
import { createHarness, signUpOwner, type Actor, type Harness } from './identity-harness';

class MemoryStorage implements Storage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  async put(key: string, body: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void> { this.objects.set(key, { body: Buffer.from(body), contentType: options?.contentType ?? 'application/octet-stream' }); }
  async get(key: string): Promise<StoredObject> { const value = this.objects.get(key); if (value === undefined) throw new Error('not found'); return { body: value.body, contentType: value.contentType, size: value.body.length }; }
  async getRange(key: string, range: ByteRange): Promise<StoredRange> { const object = await this.get(key); return { body: object.body.subarray(range.start, range.end + 1), total: object.size, contentType: object.contentType }; }
  async exists(key: string): Promise<boolean> { return this.objects.has(key); }
  async remove(key: string): Promise<void> { this.objects.delete(key); }
  async removePrefix(prefix: string): Promise<number> { let count = 0; for (const key of this.objects.keys()) if (key.startsWith(prefix)) { this.objects.delete(key); count += 1; } return count; }
  async ping(): Promise<void> {}
  async isEmpty(): Promise<boolean> { return this.objects.size === 0; }
}

describe('IG Carousel 真資料閉環與 MCP client', () => {
  let h: Harness;
  let owner: Actor;
  let brandId: string;
  let projectId: string;
  let storage: MemoryStorage;
  let materialId: string;
  let knowledgeId: string;

  beforeAll(async () => {
    storage = new MemoryStorage();
    h = await createHarness({ design: true, carouselStorage: storage });
    owner = await signUpOwner(h);
    const brand = await h.db.pool.query<{ id: string }>("insert into brand (code, name) values ('moonic', 'Moonic') returning id");
    brandId = brand.rows[0]?.id ?? '';
    const project = await h.app.inject({ method: 'POST', url: '/projects', headers: { cookie: owner.cookie, 'idempotency-key': 'carousel-project' }, payload: { brandId, title: '經期前日常照顧', request: '為 Moonic 做五頁 IG Carousel，使用真實素材和日常照顧知識。' } });
    expect(project.statusCode).toBe(201);
    projectId = (project.json() as { project: ProjectDetail }).project.id;
  });
  afterAll(async () => { await h.app.close(); await h.drop(); });

  it('素材、知識、品牌版本組成五頁，編輯只追加且引用可回溯', async () => {
    const image = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: '#D8C8BC' } }).png().toBuffer();
    const uploaded = await h.app.inject({ method: 'POST', url: `/materials?brandId=${brandId}`, headers: { cookie: owner.cookie, 'content-type': 'image/png', 'x-file-name': encodeURIComponent('香港日常.png'), 'x-material-description': encodeURIComponent('明亮日常場景'), 'x-material-tags': encodeURIComponent('香港,日常') }, payload: image });
    expect(uploaded.statusCode).toBe(201);
    materialId = (uploaded.json() as { material: { id: string } }).material.id;
    expect(storage.objects.size).toBe(2);

    const knowledge = await h.app.inject({ method: 'POST', url: '/knowledge', headers: { cookie: owner.cookie }, payload: {
      brandId, title: '經期前日常照顧', summary: '由日常觀察與休息需要出發。',
      bodyMd: '## 觀察身體訊號\n記錄每天的身體感受與生活節奏。\n## 安排休息\n按自己的需要預留休息和保暖時間。\n## 尋求專業意見\n持續或嚴重不適時，向合資格專業人士查詢。',
      sources: [{ title: '內部內容指引', url: 'https://example.com/guide', retrieved: '2026-11-16' }], jurisdiction: ['HK'], reviewBy: null,
    } });
    expect(knowledge.statusCode).toBe(201);
    knowledgeId = (knowledge.json() as { knowledge: KnowledgeDocView }).knowledge.id;

    const workspaceBefore = await h.app.inject({ method: 'GET', url: `/projects/${projectId}/creative`, headers: { cookie: owner.cookie } });
    expect(workspaceBefore.statusCode).toBe(200);
    const workspace = (workspaceBefore.json() as { workspace: ProjectCreativeWorkspace }).workspace;
    expect(workspace.materials[0]?.id).toBe(materialId);
    expect(workspace.knowledge[0]?.current?.chunks).toHaveLength(3);
    expect(workspace.templates.map((item) => item.role)).toEqual(['cover', 'body', 'cta']);

    const composed = await h.app.inject({ method: 'POST', url: `/projects/${projectId}/compositions`, headers: { cookie: owner.cookie, 'idempotency-key': 'composition-1' }, payload: { materialIds: [materialId], knowledgeIds: [knowledgeId] } });
    expect(composed.statusCode).toBe(201);
    const first = (composed.json() as { composition: CompositionView }).composition;
    expect(first.versionNo).toBe(1);
    expect(first.slides).toHaveLength(5);
    expect(first.slides[0]?.materialId).toBe(materialId);
    expect(first.slides.filter((slide) => slide.role === 'body').every((slide) => slide.knowledgeRefs.length > 0)).toBe(true);
    expect(first.brandReleaseId).not.toBeNull();

    const replay = await h.app.inject({ method: 'POST', url: `/projects/${projectId}/compositions`, headers: { cookie: owner.cookie, 'idempotency-key': 'composition-1' }, payload: { materialIds: [materialId], knowledgeIds: [knowledgeId] } });
    expect(replay.statusCode).toBe(200);
    expect((replay.json() as { composition: { id: string }; created: boolean })).toMatchObject({ composition: { id: first.id }, created: false });

    const editedSlides = first.slides.map((slide, index) => index === 1 ? { ...slide, headline: '先聽身體需要' } : slide);
    const edited = await h.app.inject({ method: 'POST', url: `/projects/${projectId}/compositions`, headers: { cookie: owner.cookie, 'idempotency-key': 'composition-2' }, payload: { slides: editedSlides, basedOnId: first.id } });
    expect(edited.statusCode).toBe(201);
    const second = (edited.json() as { composition: CompositionView }).composition;
    expect(second.versionNo).toBe(2);
    expect(second.basedOnId).toBe(first.id);
    await expect(h.db.pool.query('update design.composition set slides = $1 where id = $2', [JSON.stringify(editedSlides), first.id])).rejects.toMatchObject({ code: '42501' });

    const project = await h.app.inject({ method: 'GET', url: `/projects/${projectId}`, headers: { cookie: owner.cookie } });
    expect((project.json() as { project: ProjectDetail }).project.state).toBe('ready_to_render');
  });

  it('官方 MCP client 可 initialize、列 tools／resources 並讀同一個 Project', async () => {
    const agent = await h.app.inject({ method: 'POST', url: '/agents', headers: { cookie: owner.cookie }, payload: { name: 'Carousel MCP agent' } });
    const agentId = (agent.json() as { agent: { id: string } }).agent.id;
    const grant = await h.app.inject({ method: 'POST', url: `/agents/${agentId}/grants`, headers: { cookie: owner.cookie }, payload: { appId: 'design', role: 'member', scope: { kind: 'all' } } });
    expect(grant.statusCode).toBe(201);
    const issued = await h.app.inject({ method: 'POST', url: `/agents/${agentId}/http-tokens`, headers: { cookie: owner.cookie }, payload: {} });
    const token = (issued.json() as { token: string }).token;

    await h.app.listen({ host: '127.0.0.1', port: 0 });
    const address = h.app.server.address();
    if (address === null || typeof address === 'string') throw new Error('MCP 測試端口無效');
    const client = new Client({ name: 'headx-contract-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['create_map', 'brand_get_rules', 'asset_search', 'kb_search', 'composition_submit', 'job_submit']));
    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toEqual(expect.arrayContaining(['headx://create/guide', 'headx://hyperframes/guide']));
    const project = await client.callTool({ name: 'project_get', arguments: { projectId } });
    expect(project.isError).not.toBe(true);
    expect(JSON.stringify(project.content)).toContain(projectId);
    const guide = await client.readResource({ uri: 'headx://create/guide' });
    expect(JSON.stringify(guide.contents)).toContain('composition_submit');
    await client.close();
  });
});
