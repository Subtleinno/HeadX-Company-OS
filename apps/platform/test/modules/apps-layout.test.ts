import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadModules } from '../../src/modules/registry';

/**
 * R4（issue #74）：manifest 搬到 apps/<id>/，並加三個欄位。
 *
 * 這一檔只放「搬遷之後才成立」的規格：
 *   1. 掃描規則由 modules/* 改為 apps/*，而且要分辨「服務資料夾」與「孤立資料夾」。
 *   2. route、exposure、sensitive 三個新欄位各自的驗證。
 *   3. 舊位置 modules/ 真的不存在。
 *
 * 舊有六條驗證規則（JSON 合法、欄位齊全、無未知欄位、id 等於資料夾名、
 * id 與 department 不重複、最多一個 console、kind 與 department 搭配）
 * 仍然在 registry.test.ts 裡面，一條都沒有少。
 *
 * 改動前跑這一檔會紅：舊載入器讀 modules/*、不認識 route／exposure／sensitive，
 * 而且會把「有 package.json 冇 manifest.json」的資料夾當成壞掉的模組。
 */

const repoApps = resolve(process.cwd(), 'apps');

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'co-apps-'));
  tempDirs.push(dir);
  return dir;
}

/** 一份「九個欄位齊全」的合法 manifest；個別測試只改它想驗的那一個。 */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'design',
    title: '設計／內容／網站',
    kind: 'department',
    department: 'design',
    order: 10,
    available: false,
    route: '/design',
    exposure: 'internal',
    sensitive: false,
    ...overrides,
  };
}

async function writeApp(root: string, folder: string, body: unknown): Promise<void> {
  await mkdir(join(root, folder), { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  await writeFile(join(root, folder, 'manifest.json'), text, 'utf8');
}

/** 寫一個「只有 package.json、沒有 manifest.json」的一般服務資料夾。 */
async function writeService(root: string, folder: string): Promise<void> {
  await mkdir(join(root, folder), { recursive: true });
  await writeFile(
    join(root, folder, 'package.json'),
    JSON.stringify({ name: `@company-os/${folder}`, version: '0.0.0' }, null, 2),
    'utf8',
  );
}

async function errorFrom(root: string): Promise<string> {
  try {
    loadModules(root);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('預期載入失敗，但成功了');
}

describe('掃描 apps/*：服務資料夾與孤立資料夾', () => {
  it('有 package.json、沒有 manifest.json：視為一般服務，忽略而不是報錯', async () => {
    const root = await tempRoot();
    await writeApp(root, 'design', manifest());
    await writeService(root, 'platform');

    const registry = loadModules(root);

    expect(registry.listModules().map((item) => item.id)).toEqual(['design']);
  });

  it('既沒有 manifest.json 也沒有 package.json：孤立資料夾，啟動失敗並指出是哪一個', async () => {
    const root = await tempRoot();
    await writeApp(root, 'design', manifest());
    await mkdir(join(root, 'stray'), { recursive: true });

    const message = await errorFrom(root);

    expect(message).toContain('apps/stray');
    expect(message).toContain('孤立');
  });
});

describe('新欄位 route', () => {
  it('必須以 / 開頭', async () => {
    const root = await tempRoot();
    await writeApp(root, 'design', manifest({ route: 'design' }));

    const message = await errorFrom(root);

    expect(message).toContain('apps/design/manifest.json');
    expect(message).toContain('route');
    expect(message).toContain('/');
  });

  it('未填 route 要報錯，不會靜靜當成沒有路由', async () => {
    const root = await tempRoot();
    const body = manifest();
    delete body.route;
    await writeApp(root, 'design', body);

    expect(await errorFrom(root)).toContain('route');
  });

  it('兩個 manifest 用同一個 route：報重複，並指出兩邊', async () => {
    const root = await tempRoot();
    await writeApp(root, 'design', manifest({ order: 10, route: '/team' }));
    await writeApp(
      root,
      'sales',
      manifest({ id: 'sales', department: 'sales', order: 20, route: '/team' }),
    );

    const message = await errorFrom(root);

    expect(message).toContain('/team');
    expect(message).toContain('apps/design');
    expect(message).toContain('apps/sales');
  });
});

describe('新欄位 exposure', () => {
  it('只可以 internal、partner、customer', async () => {
    const root = await tempRoot();
    await writeApp(root, 'design', manifest({ exposure: 'public' }));

    const message = await errorFrom(root);

    expect(message).toContain('exposure');
    expect(message).toContain('internal');
    expect(message).toContain('partner');
    expect(message).toContain('customer');
  });

  it('沒有填 exposure 時視為 internal（不會變成 undefined 或漏出去）', async () => {
    const root = await tempRoot();
    const body = manifest();
    delete body.exposure;
    await writeApp(root, 'design', body);

    expect(loadModules(root).listModules()[0]?.exposure).toBe('internal');
  });
});

describe('新欄位 sensitive', () => {
  it('必須是布林值，不接受字串 "true"', async () => {
    const root = await tempRoot();
    await writeApp(root, 'design', manifest({ sensitive: 'true' }));

    const message = await errorFrom(root);

    expect(message).toContain('sensitive');
    expect(message).toContain('true');
  });

  it('未填 sensitive 要報錯 —— 「未講」不可以當成「不敏感」', async () => {
    const root = await tempRoot();
    const body = manifest();
    delete body.sensitive;
    await writeApp(root, 'design', body);

    expect(await errorFrom(root)).toContain('sensitive');
  });
});

describe('舊位置 modules/ 真的不再存在', () => {
  it('repo 根目錄沒有 modules/ 資料夾', () => {
    expect(existsSync(resolve(process.cwd(), 'modules'))).toBe(false);
  });

  it('六個 manifest 在 apps/<id>/manifest.json，九個欄位齊全', async () => {
    const ids = ['boss', 'design', 'sales', 'ops_finance', 'hr', 'support'];

    for (const id of ids) {
      const file = join(repoApps, id, 'manifest.json');
      expect(existsSync(file), `缺少 ${file}`).toBe(true);

      const parsed = JSON.parse(await readText(file)) as Record<string, unknown>;

      expect(Object.keys(parsed).sort()).toEqual([
        'available',
        'department',
        'exposure',
        'id',
        'kind',
        'order',
        'route',
        'sensitive',
        'title',
      ]);
      expect(parsed.id).toBe(id);
    }
  });

  it('載入 repo 的 apps/：仍然只有六個模組（platform 與 web 被當成服務忽略）', () => {
    const registry = loadModules(repoApps);

    expect(registry.listModules().map((item) => item.id)).toEqual([
      'boss',
      'design',
      'sales',
      'ops_finance',
      'hr',
      'support',
    ]);
  });
});

/** 讀檔（避免在頂部再 import 一次 readFile）。 */
async function readText(file: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');

  return readFile(file, 'utf8');
}
