import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { registerAuth } from '../../src/auth/routes';
import { registerBrandGuide } from '../../src/brand-guide/index';
import { registerProjectLibrary } from '../../src/project-library/index';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * Project Library（Create）：格式、資料夾、專案集、專案三層收納。
 *
 * 這裡要證明幾件容易寫錯的事：
 *   1. 三層各有 CRUD，而且刪資料夾不會刪專案集（回到未分類）；
 *   2. 刪專案集是軟刪，可以還原；
 *   3. 專案可以複製（現況抄一份），可以自由搬到另一個專案集；
 *   4. 格式是資料，可以動態新增，而且專案列表可以按格式過濾。
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

type SetBody = { id: string; name: string; folderId: string | null; count: number };
type LibraryBody = {
  formats: { id: string; name: string; sortOrder: number }[];
  folders: { id: string; name: string; count: number }[];
  sets: SetBody[];
  deletedSets: SetBody[];
};
type ProjectBody = { id: string; title: string; formatId: string; setId: string | null; coverFileId: string | null };
type ProjectsBody = { projects: ProjectBody[] };

describe('Project Library', () => {
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
    registerProjectLibrary(app, { pool: db.pool });
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

  async function library(): Promise<LibraryBody> {
    const response = await app.inject({ method: 'GET', url: `/brands/${brandId}/library`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    return response.json() as LibraryBody;
  }

  async function createFolder(name: string): Promise<{ id: string }> {
    const response = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/folders`,
      headers: { cookie },
      payload: { name },
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
    return response.json() as { id: string };
  }

  async function createSet(name: string, folderId: string | null = null): Promise<SetBody> {
    const response = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/project-sets`,
      headers: { cookie },
      payload: { name, folderId },
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
    return response.json() as SetBody;
  }

  async function createProject(title: string, formatId: string, setId: string | null = null): Promise<ProjectBody> {
    const response = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/projects`,
      headers: { cookie },
      payload: { title, formatId, setId },
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(200);
    return (response.json() as { project: ProjectBody }).project;
  }

  async function listProjects(query = ''): Promise<ProjectsBody> {
    const response = await app.inject({
      method: 'GET',
      url: `/brands/${brandId}/projects${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as ProjectsBody;
  }

  it('種子格式（PPT／排版／Video）在列表出現', async () => {
    const lib = await library();
    const names = lib.formats.map((f) => f.name).sort();
    expect(names).toEqual(['PPT', 'Video', '排版'].sort());
  });

  it('三層 CRUD：資料夾 → 專案集 → 專案，刪資料夾令專案集回到未分類', async () => {
    const folder = await createFolder('2026');
    const set = await createSet('夏季', folder.id);
    const lib = await library();

    expect(lib.folders.find((f) => f.id === folder.id)?.count).toBe(1);

    // 刪資料夾：專案集不消失，folderId 回到 null（未分類）。
    const del = await app.inject({ method: 'DELETE', url: `/project-folders/${folder.id}`, headers: { cookie } });
    expect(del.statusCode).toBe(200);

    const after = await library();
    expect(after.folders).toHaveLength(0);
    expect(after.sets.find((s) => s.id === set.id)?.folderId).toBeNull();
  });

  it('刪專案集是軟刪，可以還原', async () => {
    const set = await createSet('夏季');

    const del = await app.inject({ method: 'DELETE', url: `/project-sets/${set.id}`, headers: { cookie } });
    expect(del.statusCode).toBe(200);

    const after = await library();
    expect(after.sets.find((s) => s.id === set.id)).toBeUndefined();
    expect(after.deletedSets.find((s) => s.id === set.id)).toBeDefined();

    const restore = await app.inject({
      method: 'POST',
      url: `/project-sets/${set.id}/restore`,
      headers: { cookie },
    });
    expect(restore.statusCode).toBe(200);

    const restored = await library();
    expect(restored.sets.find((s) => s.id === set.id)).toBeDefined();
  });

  it('專案可以複製，並且可以搬到另一個專案集', async () => {
    const format = (await library()).formats[0];
    if (format === undefined) throw new Error('沒有格式');

    const setA = await createSet('A 集');
    const setB = await createSet('B 集');
    const project = await createProject('一件創作', format.id, setA.id);

    // 複製
    const copy = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/duplicate`,
      headers: { cookie },
      payload: {},
    });
    expect(copy.statusCode).toBe(200);
    const copied = (copy.json() as { project: ProjectBody }).project;
    expect(copied.title).toBe('一件創作（副本）');
    expect(copied.setId).toBe(setA.id);

    // 搬到 B 集
    const move = await app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}`,
      headers: { cookie },
      payload: { setId: setB.id },
    });
    expect(move.statusCode).toBe(200);

    const inB = await listProjects(`?setId=${setB.id}`);
    expect(inB.projects.map((p) => p.id)).toContain(project.id);
  });

  it('格式可以動態新增，專案列表可以按格式過濾', async () => {
    const lib = await library();
    const ppt = lib.formats.find((f) => f.name === 'PPT');
    const video = lib.formats.find((f) => f.name === 'Video');
    if (ppt === undefined || video === undefined) throw new Error('缺少種子格式');

    await createProject('簡報一', ppt.id);
    await createProject('影片一', video.id);

    const onlyPpt = await listProjects(`?formatId=${ppt.id}`);
    expect(onlyPpt.projects).toHaveLength(1);
    expect(onlyPpt.projects[0]?.title).toBe('簡報一');

    // 新增格式
    const newFormat = await app.inject({
      method: 'POST',
      url: `/brands/${brandId}/formats`,
      headers: { cookie },
      payload: { name: '3D' },
    });
    expect(newFormat.statusCode).toBe(200);

    const after = await library();
    expect(after.formats.map((f) => f.name)).toContain('3D');
  });
});
