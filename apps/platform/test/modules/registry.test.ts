import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadModules } from '../../src/modules/registry';

/**
 * 模組註冊的驗證規則。
 *
 * 「有哪些部門」只有 apps/<id>/manifest.json 這一個來源，載入失敗就是啟動失敗，
 * 所以每一條規則都要有一個會紅的案例，訊息要指出哪個檔、哪個欄位、為甚麼。
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
  const dir = await mkdtemp(join(tmpdir(), 'co-modules-'));
  tempDirs.push(dir);
  return dir;
}

/**
 * 一份合法的 manifest（R4 之後是九個欄位）。
 * route 預設由 id 推出：這樣每條測試只會撞到它想驗的那一條規則，
 * 不會因為兩個 fixture 用了同一個 route 而多報一條重複。
 */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: 'design',
    title: '設計／內容／網站',
    kind: 'department',
    department: 'design',
    order: 10,
    available: false,
    ...overrides,
  };

  return {
    ...base,
    route: overrides.route ?? `/${String(base.id)}`,
    exposure: overrides.exposure ?? 'internal',
    sensitive: overrides.sensitive ?? false,
  };
}

async function writeModule(root: string, id: string, body: unknown): Promise<void> {
  await mkdir(join(root, id), { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  await writeFile(join(root, id, 'manifest.json'), text, 'utf8');
}

async function errorFrom(root: string): Promise<string> {
  try {
    loadModules(root);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('預期載入失敗，但成功了');
}

describe('模組註冊：六個初始 manifest', () => {
  it('載入 repo 內的 apps/：六個，依 order 排序', () => {
    const registry = loadModules(repoApps);

    expect(registry.listModules().map((item) => item.id)).toEqual([
      'boss',
      'design',
      'sales',
      'ops_finance',
      'hr',
      'support',
    ]);

    expect(registry.listModules().map((item) => item.order)).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('六個都是 available: false，未建立的部門軟件不會假裝可用', () => {
    const registry = loadModules(repoApps);

    expect(registry.listModules().every((item) => item.available === false)).toBe(true);
  });

  it('boss 是唯一的 console，department 是 null', () => {
    const registry = loadModules(repoApps);
    const consoles = registry.listModules().filter((item) => item.kind === 'console');

    // 只比對對外公開的六個欄位：route／exposure／sensitive 是暫定值，
    // 不適合寫死在這裡當成規格（它們的驗證在 apps-layout.test.ts）。
    expect(
      consoles.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        department: item.department,
        order: item.order,
        available: item.available,
      })),
    ).toEqual([
      { id: 'boss', title: '老闆台', kind: 'console', department: null, order: 0, available: false },
    ]);
  });

  it('departmentKeys() 只有五個部門，不含老闆台', () => {
    const registry = loadModules(repoApps);

    expect(registry.departmentKeys()).toEqual(['design', 'sales', 'ops_finance', 'hr', 'support']);
  });
});

describe('模組註冊：刪資料夾就是卸載', () => {
  it('刪掉一個模組資料夾，重新載入就少一個', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ id: 'design', department: 'design', order: 10 }));
    await writeModule(
      root,
      'sales',
      manifest({ id: 'sales', title: '銷售', department: 'sales', order: 20 }),
    );

    expect(loadModules(root).listModules().map((item) => item.id)).toEqual(['design', 'sales']);

    await rm(join(root, 'sales'), { recursive: true, force: true });

    expect(loadModules(root).listModules().map((item) => item.id)).toEqual(['design']);
    expect(loadModules(root).departmentKeys()).toEqual(['design']);
  });

  it('空的 apps/ 目錄：零個模組，不是崩潰', async () => {
    const root = await tempRoot();

    expect(loadModules(root).listModules()).toEqual([]);
  });
});

describe('模組註冊：驗證規則（每條一個失敗案例）', () => {
  it('JSON 不合法：指名檔案', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', '{ "id": "design", ');

    const message = await errorFrom(root);

    expect(message).toContain('apps/design/manifest.json');
    expect(message).toContain('JSON');
  });

  it('缺欄位（沒有 title）', async () => {
    const root = await tempRoot();
    const body = manifest();
    delete body.title;
    await writeModule(root, 'design', body);

    const message = await errorFrom(root);

    expect(message).toContain('apps/design/manifest.json');
    expect(message).toContain('title');
  });

  it('型別錯誤（order 是字串）', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ order: '10' }));

    const message = await errorFrom(root);

    expect(message).toContain('order');
    expect(message).toContain('整數');
  });

  it('型別錯誤（available 不是 boolean）', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ available: 'false' }));

    expect(await errorFrom(root)).toContain('available');
  });

  it('order 不是整數（1.5）', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ order: 1.5 }));

    expect(await errorFrom(root)).toContain('order');
  });

  it('未知欄位', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ icon: 'pencil' }));

    const message = await errorFrom(root);

    expect(message).toContain('icon');
    expect(message).toContain('未知欄位');
  });

  it('id 與資料夾名不同', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ id: 'designer' }));

    const message = await errorFrom(root);

    expect(message).toContain('id');
    expect(message).toContain('designer');
  });

  it('id 格式不對（大寫與空白）', async () => {
    const root = await tempRoot();
    await writeModule(root, 'Design Site', manifest({ id: 'Design Site' }));

    expect(await errorFrom(root)).toContain('id');
  });

  it('id 重複（複製貼上忘了改 id）', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ id: 'design', department: 'design', order: 10 }));
    await writeModule(root, 'design2', manifest({ id: 'design', department: 'design2', order: 20 }));

    expect(await errorFrom(root)).toContain('重複');
  });

  it('department 重複', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ id: 'design', department: 'design', order: 10 }));
    await writeModule(root, 'sales', manifest({ id: 'sales', department: 'design', order: 20 }));

    const message = await errorFrom(root);

    expect(message).toContain('department');
    expect(message).toContain('重複');
  });

  it('console 帶 department', async () => {
    const root = await tempRoot();
    await writeModule(
      root,
      'boss',
      manifest({ id: 'boss', title: '老闆台', kind: 'console', department: 'boss', order: 0 }),
    );

    expect(await errorFrom(root)).toContain('department');
  });

  it('department 模組沒有 department', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ department: null }));

    expect(await errorFrom(root)).toContain('department');
  });

  it('kind 不是 console 或 department', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ kind: 'app' }));

    expect(await errorFrom(root)).toContain('kind');
  });

  it('兩個 console', async () => {
    const root = await tempRoot();
    await writeModule(
      root,
      'boss',
      manifest({ id: 'boss', title: '老闆台', kind: 'console', department: null, order: 0 }),
    );
    await writeModule(
      root,
      'desk',
      manifest({ id: 'desk', title: '另一個台', kind: 'console', department: null, order: 1 }),
    );

    expect(await errorFrom(root)).toContain('console');
  });

  it('資料夾沒有 manifest.json', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'design'), { recursive: true });
    await writeFile(join(root, 'design', 'notes.md'), '# 未完成的部門\n', 'utf8');

    const message = await errorFrom(root);

    expect(message).toContain('apps/design');
    expect(message).toContain('manifest.json');
  });

  it('apps/ 下有孤立檔案', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest());
    await writeFile(join(root, 'README.md'), '# 不應該在這裡\n', 'utf8');

    const message = await errorFrom(root);

    expect(message).toContain('README.md');
    expect(message).toContain('孤立檔案');
  });

  it('多個錯誤會一次列出，不是只報第一個', async () => {
    const root = await tempRoot();
    await writeModule(root, 'design', manifest({ order: '10' }));
    await mkdir(join(root, 'sales'), { recursive: true });

    const message = await errorFrom(root);

    expect(message).toContain('order');
    expect(message).toContain('apps/sales');
  });
});
