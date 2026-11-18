import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandGuide, registerBrandGuideAgent } from '../../src/brand-guide/index';
import { registerAgentRequestAuth } from '../../src/agents/request-auth';
import { hashSessionToken } from '../../src/auth/token';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 品牌引導「區塊紀錄」：決策、歷史、附件。
 *
 * 這裡要證明的是三件容易被寫錯的事：
 *   1. 歷史是追加的 —— 同一個決策儲存兩次只留一版，改內容才加一版；
 *   2. 移除附件不是刪資料 —— 現況唔見，歷史仍然見得到；
 *   3. 權限與其他 brand-guide 寫入一致 —— 冇品牌編輯權就 403。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

function cookieHeader(response: { headers: Record<string, unknown> }): { cookie: string } {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    throw new Error('回應沒有 Set-Cookie');
  }
  return { cookie: value.split(';')[0] ?? '' };
}

type BlockBody = {
  block: {
    blockId: string;
    code: string;
    title: string;
    decision: string;
    decisionAt: string | null;
    decisionByName: string | null;
    decisionActorType: 'human' | 'agent';
    promptOverride: string;
    revisions: { id: string; decision: string; actorType: string; actorName: string }[];
    files: {
      id: string;
      name: string;
      originalName: string;
      uploadedByName: string;
      removedAt: string | null;
      removedByName: string | null;
    }[];
  };
};

describe('品牌引導區塊紀錄', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let password = '';
  let ownerCookie = '';
  let brandId = '';
  let ownerId = '';

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    app = buildServer({ checkDb: ok, checkStorage: ok });
    registerAuth(app, {
      pool: db.pool,
      loginHashKey: 'test-only-login-hash-key-0123456789abcdef',
      resolveEntry: () => 'internal',
    });
    registerBrandGuide(app, { pool: db.pool });
    // agent 的業務入口：Bearer token ＋ design 授權。
    registerAgentRequestAuth(app, { pool: db.pool, now: () => new Date() });
    registerBrandGuideAgent(app, { pool: db.pool });
    await app.ready();

    password = randomBytes(24).toString('base64url');

    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password },
    });
    expect(setup.statusCode).toBe(201);
    ownerCookie = cookieHeader(setup).cookie;

    const brand = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic') returning id",
    );
    brandId = brand.rows[0]?.id ?? '';

    const owner = await db.pool.query<{ id: string }>(
      "select id from app_user where role = 'owner' limit 1",
    );
    ownerId = owner.rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function saveDecision(
    blockId: string,
    decision: string,
    cookie = ownerCookie,
  ): Promise<{ statusCode: number; body: BlockBody }> {
    const response = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage0/blocks/${blockId}/decision`,
      headers: { cookie },
      payload: { code: '00.1', title: '業務狀態', decision },
    });

    return { statusCode: response.statusCode, body: response.json() as BlockBody };
  }

  async function createFile(name: string): Promise<string> {
    const result = await db.pool.query<{ id: string }>(
      `insert into stored_file (storage_key, original_name, content_type, size_bytes, sha256, created_by)
       values ($1, $2, 'application/pdf', 1024, repeat('a', 64), $3)
       returning id`,
      [`files/test/${randomBytes(8).toString('hex')}`, name, ownerId],
    );

    return result.rows[0]?.id ?? '';
  }

  it('第一次儲存留一版，內容冇變再儲存唔會加版', async () => {
    const first = await saveDecision('set:basic', '未開業，先做旺角小店。');
    expect(first.statusCode).toBe(200);
    expect(first.body.block.revisions).toHaveLength(1);
    expect(first.body.block.decisionByName).toBe('老闆');

    const again = await saveDecision('set:basic', '未開業，先做旺角小店。');
    expect(again.body.block.revisions).toHaveLength(1);

    const changed = await saveDecision('set:basic', '未開業，先做銅鑼灣小店，旺角留作 pop-up。');
    expect(changed.body.block.revisions).toHaveLength(2);
    // 新到舊：最上面係最後一次。
    expect(changed.body.block.revisions[0]?.decision).toContain('銅鑼灣');
  });

  it('清除決策唔會刪走歷史', async () => {
    await saveDecision('set:basic', '第一個決定');
    const cleared = await saveDecision('set:basic', '');

    expect(cleared.body.block.decision).toBe('');
    expect(cleared.body.block.revisions).toHaveLength(1);
    expect(cleared.body.block.decisionAt).not.toBeNull();
  });

  it('位置編號與名稱可以更新，決策與歷史不受影響', async () => {
    await saveDecision('set:basic', '保留呢句');

    const renamed = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage0/blocks/set:basic/decision`,
      headers: { cookie: ownerCookie },
      payload: { code: '00.2', title: '業務現況', decision: '保留呢句' },
    });

    const body = renamed.json() as BlockBody;
    expect(body.block.code).toBe('00.2');
    expect(body.block.title).toBe('業務現況');
    expect(body.block.revisions).toHaveLength(1);
  });

  it('附件：掛上、移除之後現況唔見但歷史仍然見到', async () => {
    const fileId = await createFile('brand-brief.pdf');

    const attached = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/guide/stage0/blocks/cat:pricing/files`,
      headers: { cookie: ownerCookie },
      payload: { code: '00.3', title: '定價策略', fileId },
    });

    expect(attached.statusCode).toBe(200);
    const afterAttach = attached.json() as BlockBody;
    expect(afterAttach.block.files).toHaveLength(1);
    const attachmentId = afterAttach.block.files[0]?.id ?? '';
    expect(afterAttach.block.files[0]?.name).toBe('brand-brief.pdf');
    // 畫面上要講得出「邊個幾時上載」，所以上載者名一定要出。
    expect(afterAttach.block.files[0]?.uploadedByName).toBe('老闆');

    const removed = await app.inject({
      method: 'DELETE',
      url: `/brands/${brandId}/guide/stage0/blocks/cat:pricing/files/${attachmentId}`,
      headers: { cookie: ownerCookie },
    });

    expect(removed.statusCode).toBe(200);
    const afterRemove = removed.json() as BlockBody;
    expect(afterRemove.block.files).toHaveLength(1);
    expect(afterRemove.block.files[0]?.removedAt).not.toBeNull();
    expect(afterRemove.block.files[0]?.removedByName).toBe('老闆');

    // 再讀一次：移除的附件仍然在列表（歷史要看得到），但 UI 用 removedAt 分辨。
    const blocks = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage0/blocks`,
      headers: { cookie: ownerCookie },
    });
    const listed = blocks.json() as { blocks: BlockBody['block'][] };
    const pricing = listed.blocks.find((block) => block.blockId === 'cat:pricing');
    expect(pricing?.files[0]?.removedAt).not.toBeNull();
  });

  it('掛唔存在的檔案會 404，唔會留低孤兒紀錄', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/guide/stage0/blocks/dims/files`,
      headers: { cookie: ownerCookie },
      payload: {
        code: '00.4',
        title: '設定項目',
        fileId: '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'file_not_found',
      fileId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('冇品牌編輯權的員工寫唔到（403），但讀得到（200）', async () => {
    await db.pool.query(
      `insert into app_user (email, display_name, role, department, password_hash)
       select 'staff@example.com', '同事', 'staff', 'design', password_hash
         from app_user where id = $1`,
      [ownerId],
    );

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'staff@example.com', password },
    });
    expect(login.statusCode).toBe(200);
    const staff = cookieHeader(login).cookie;

    const denied = await saveDecision('set:basic', '我想自己寫', staff);
    expect(denied.statusCode).toBe(403);

    const read = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage0/blocks`,
      headers: { cookie: staff },
    });
    expect(read.statusCode).toBe(200);
  });

  it('prompt 可以改，空白等於還原自動版本', async () => {
    const saved = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage0/blocks/set:basic/prompt`,
      headers: { cookie: ownerCookie },
      payload: { code: '00.1', title: '業務狀態', prompt: '你只需要答我三件事：…' },
    });

    expect(saved.statusCode).toBe(200);
    expect((saved.json() as BlockBody).block.promptOverride).toBe('你只需要答我三件事：…');

    // 決策與 prompt 是兩層：改 prompt 不應該動到決策與歷史。
    const withDecision = await saveDecision('set:basic', '保留決策');
    expect(withDecision.body.block.promptOverride).toBe('你只需要答我三件事：…');

    const reset = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage0/blocks/set:basic/prompt`,
      headers: { cookie: ownerCookie },
      payload: { code: '00.1', title: '業務狀態', prompt: '' },
    });

    expect((reset.json() as BlockBody).block.promptOverride).toBe('');
  });

  it('agent 經 MCP 寫入決策：留 agent 版本、講得出是誰寫', async () => {
    const agent = await db.pool.query<{ id: string }>(
      "insert into agent_identity (name, created_by) values ('brand-agent', $1) returning id",
      [ownerId],
    );
    const agentId = agent.rows[0]?.id ?? '';
    const token = randomBytes(32).toString('base64url');

    await db.pool.query(
      `insert into agent_http_token (agent_id, token_hash, created_by, expires_at)
       values ($1, $2, $3, now() + interval '1 hour')`,
      [agentId, hashSessionToken(token), ownerId],
    );
    await db.pool.query(
      `insert into app_grant (agent_id, app_id, role, scope_kind, state,
                             requested_by, approved_by, approved_at, activated_at)
       values ($1, 'design', 'member', 'all', 'active', $2, $2, now(), now())`,
      [agentId, ownerId],
    );

    // 先由人寫一版，agent 之後才接手。
    await saveDecision('cat:pricing', '中價位，主打套餐。');

    const written = await app.inject({
      method: 'PUT',
      url: `/agent/brand-guide/blocks/cat:pricing/decision`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        brandId,
        stage: 'stage0',
        decision: '維持中價位，但加一個 398 入門套餐試水溫。',
      },
    });

    expect(written.statusCode).toBe(200);
    const body = written.json() as BlockBody & { written: boolean };
    expect(body.written).toBe(true);
    expect(body.block.decisionByName).toBe('brand-agent');
    expect(body.block.decisionActorType).toBe('agent');
    // 編號與名稱沿用紀錄（上面人手儲存時寫的 00.1），
    // agent 不會無意間改掉位置標籤。
    expect(body.block.code).toBe('00.1');
    expect(body.block.revisions).toHaveLength(2);
    expect(body.block.revisions[0]?.actorType).toBe('agent');
    expect(body.block.revisions[0]?.actorName).toBe('brand-agent');
    expect(body.block.revisions[1]?.actorType).toBe('human');

    // 同一段再寫一次：沒有新版本，agent 要講得出「沒有改到」。
    const again = await app.inject({
      method: 'PUT',
      url: `/agent/brand-guide/blocks/cat:pricing/decision`,
      headers: { authorization: `Bearer ${token}` },
      payload: { brandId, stage: 'stage0', decision: '維持中價位，但加一個 398 入門套餐試水溫。' },
    });

    expect((again.json() as { written: boolean }).written).toBe(false);
  });

  it('agent 冇 design 授權就寫唔到，token 不對就 401', async () => {
    const agent = await db.pool.query<{ id: string }>(
      "insert into agent_identity (name, created_by) values ('no-grant-agent', $1) returning id",
      [ownerId],
    );
    const token = randomBytes(32).toString('base64url');

    await db.pool.query(
      `insert into agent_http_token (agent_id, token_hash, created_by, expires_at)
       values ($1, $2, $3, now() + interval '1 hour')`,
      [agent.rows[0]?.id ?? '', hashSessionToken(token), ownerId],
    );

    const denied = await app.inject({
      method: 'PUT',
      url: '/agent/brand-guide/blocks/set:basic/decision',
      headers: { authorization: `Bearer ${token}` },
      payload: { brandId, stage: 'stage0', decision: '偷偷寫' },
    });

    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: 'agent_not_granted', app: 'design' });

    const unauthenticated = await app.inject({
      method: 'GET',
      url: `/agent/brand-guide/blocks?brandId=${brandId}&stage=stage0`,
      headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` },
    });

    expect(unauthenticated.statusCode).toBe(401);
  });

  it('未登入寫唔到', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage0/blocks/set:basic/decision`,
      payload: { code: '00.1', title: '業務狀態', decision: '偷偷寫' },
    });

    expect(response.statusCode).toBe(401);
  });
});
