import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandGuide } from '../../src/brand-guide/index';
import { registerBrandSets } from '../../src/brand-sets/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 品牌集（04B–04E、04H）：資料夾、複製、搬移、安全刪除。
 *
 * 2026-11-17 晚改：04A 核心識別與 04G 治理搬回品牌層、04F 行銷內容搬去公司層，
 * 所以這裡的例子改用 04B。
 *
 * 這裡要證明四件容易寫錯的事：
 *   1. 兩個品牌集各自一份答案 —— 同一個 stage 同一格唔會互相覆蓋；
 *   2. 複製會抄「現況」（決策、選擇）但唔抄歷史；
 *   3. 刪除是軟刪：列表唔見，但資料仍然在，可以還原；
 *   4. 品牌集只裝 04B–04E、04H；01–03、04A、04G 帶住 setId 會被擋。
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

type SetBody = { id: string; name: string; folderId: string | null; filled: number };
type TreeBody = { folders: { id: string; name: string }[]; sets: SetBody[]; deleted: SetBody[] };

describe('品牌集', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let cookie = '';
  let brandId = '';

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
    registerBrandSets(app, { pool: db.pool });
    await app.ready();

    const password = randomBytes(24).toString('base64url');
    const setup = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { displayName: '老闆', email: 'boss@example.com', password },
    });
    cookie = cookieHeader(setup).cookie;

    const brand = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('moonic', 'Moonic') returning id",
    );
    brandId = brand.rows[0]?.id ?? '';
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function tree(): Promise<TreeBody> {
    const response = await app.inject({ method: 'GET', url: `/brands/${brandId}/sets`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    return response.json() as TreeBody;
  }

  async function createSet(name: string, folderId: string | null = null): Promise<SetBody> {
    const response = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/sets`,
      headers: { cookie },
      payload: { name, folderId },
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
    return response.json() as SetBody;
  }

  async function saveDecision(setId: string, decision: string): Promise<void> {
    const response = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage4b/blocks/set:arch/decision?setId=${setId}`,
      headers: { cookie },
      payload: { code: '04B.1', title: '圖形表面', decision },
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
  }

  async function blocks(setId: string): Promise<{ blockId: string; decision: string; revisions: unknown[] }[]> {
    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage4b/blocks?setId=${setId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as { blocks: { blockId: string; decision: string; revisions: unknown[] }[] }).blocks;
  }

  it('兩個品牌集各自一份答案，互不覆蓋', async () => {
    const summer = await createSet('2026 夏季');
    const winter = await createSet('2026 冬季');

    await saveDecision(summer.id, '夏季：明亮日光');
    await saveDecision(winter.id, '冬季：暖色室內');

    const summerBlocks = await blocks(summer.id);
    const winterBlocks = await blocks(winter.id);

    expect(summerBlocks[0]?.decision).toBe('夏季：明亮日光');
    expect(winterBlocks[0]?.decision).toBe('冬季：暖色室內');

    // 品牌層完全不應該被寫入。
    const brandLevel = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage4b/blocks`,
      headers: { cookie },
    });
    expect((brandLevel.json() as { blocks: unknown[] }).blocks).toHaveLength(0);
  });

  it('側欄的已填數反映每個品牌集自己的進度', async () => {
    const summer = await createSet('2026 夏季');
    await createSet('2026 冬季');
    await saveDecision(summer.id, '夏季：明亮日光');

    const listed = await tree();
    const filled = listed.sets.find((item) => item.id === summer.id)?.filled;

    expect(filled).toBe(1);
    expect(listed.sets.find((item) => item.id !== summer.id)?.filled).toBe(0);
  });

  it('複製：抄現況同選擇，但唔抄歷史', async () => {
    const summer = await createSet('2026 夏季');
    await saveDecision(summer.id, '第一版');
    await saveDecision(summer.id, '第二版');
    await saveDecision(summer.id, '第三版');

    const copy = await app.inject({
      method: 'POST',
      url: `/brand-sets/${summer.id}/duplicate`,
      headers: { cookie },
      payload: {},
    });
    expect(copy.statusCode).toBe(200);

    const copied = copy.json() as SetBody;
    const copiedBlocks = await blocks(copied.id);

    expect(copied.name).toBe('2026 夏季（副本）');
    expect(copiedBlocks[0]?.decision).toBe('第三版');
    // 歷史留在原集：複製品由這一個現況開始。
    expect(copiedBlocks[0]?.revisions).toHaveLength(0);
  });

  it('搬資料夾：同一個品牌集可以自由移動，未分類＝null', async () => {
    const folder = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/set-folders`,
      headers: { cookie },
      payload: { name: '2026' },
    });
    const folderId = (folder.json() as { id: string }).id;

    const set = await createSet('2026 夏季');
    expect(set.folderId).toBeNull();

    const moved = await app.inject({
      method: 'PATCH',
      url: `/brand-sets/${set.id}`,
      headers: { cookie },
      payload: { folderId },
    });
    expect(moved.statusCode).toBe(200);

    const afterMove = await tree();
    expect(afterMove.sets.find((item) => item.id === set.id)?.folderId).toBe(folderId);
    expect(afterMove.folders[0]?.name).toBe('2026');

    // 移返未分類
    await app.inject({
      method: 'PATCH',
      url: `/brand-sets/${set.id}`,
      headers: { cookie },
      payload: { folderId: null },
    });
    expect((await tree()).sets[0]?.folderId).toBeNull();
  });

  it('刪資料夾唔會刪品牌集：裡面的回到未分類', async () => {
    const folder = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/set-folders`,
      headers: { cookie },
      payload: { name: '2026' },
    });
    const folderId = (folder.json() as { id: string }).id;
    const set = await createSet('2026 夏季', folderId);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/brand-set-folders/${folderId}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(200);

    const after = await tree();
    expect(after.folders).toHaveLength(0);
    expect(after.sets.find((item) => item.id === set.id)?.folderId).toBeNull();
  });

  it('安全刪除：列表唔見、資料仍在、可以還原', async () => {
    const set = await createSet('2026 夏季');
    await saveDecision(set.id, '唔想唔見');

    const removed = await app.inject({
      method: 'DELETE',
      url: `/brand-sets/${set.id}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(200);

    const afterDelete = await tree();
    expect(afterDelete.sets).toHaveLength(0);
    expect(afterDelete.deleted.map((item) => item.id)).toEqual([set.id]);

    // 已刪除的不可以再寫入：畫面要見到「已刪除」，不是靜靜寫入一個隱形集。
    const blocked = await app.inject({
      method: 'PUT',
      url: `/brands/${brandId}/guide/stage4b/blocks/set:arch/decision?setId=${set.id}`,
      headers: { cookie },
      payload: { code: '04A.1', title: '識別任務', decision: '寫入已刪除的集' },
    });
    expect(blocked.statusCode).toBe(409);

    const restored = await app.inject({
      method: 'POST',
      url: `/brand-sets/${set.id}/restore`,
      headers: { cookie },
    });
    expect(restored.statusCode).toBe(200);

    const afterRestore = await tree();
    expect(afterRestore.deleted).toHaveLength(0);
    expect(afterRestore.sets.map((item) => item.id)).toEqual([set.id]);
    // 決策仍然在。
    expect((await blocks(set.id))[0]?.decision).toBe('唔想唔見');
  });

  it('品牌集只裝 04B–04E、04H：01–03、04A、04G 帶 setId 都會被拒', async () => {
    const set = await createSet('2026 夏季');

    // 01–03 是品牌層；04A／04G 由 2026-11-17 晚起也搬回品牌層；
    // 04F 更不在品牌集（它在公司層）。任何一個帶 setId 都要 400，
    // 不可以靜靜寫入一個沒有人讀到的位置。
    for (const stage of ['stage1', 'stage4a', 'stage4f', 'stage4g']) {
      const response = await app.inject({
        method: 'GET',
        url: `/brands/${brandId}/guide/${stage}/blocks?setId=${set.id}`,
        headers: { cookie },
      });

      expect(response.statusCode, stage).toBe(400);
      expect((response.json() as { error: string }).error).toBe('set_stage_mismatch');
    }
  });

  it('別人的品牌集改唔到：setId 唔屬於這個品牌就 404', async () => {
    const other = await db.pool.query<{ id: string }>(
      "insert into brand (code, name) values ('other', 'Other') returning id",
    );
    const otherId = other.rows[0]?.id ?? '';
    const foreign = await db.pool.query<{ id: string }>(
      "insert into brand_set (brand_id, name) values ($1, '別人的集') returning id",
      [otherId],
    );
    const foreignId = foreign.rows[0]?.id ?? '';

    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/guide/stage4b/blocks?setId=${foreignId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
  });
});
