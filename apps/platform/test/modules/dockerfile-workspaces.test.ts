import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dockerfile 與 platform 依賴的一致性守門（issue #103）。
 *
 * 起因：#83 令 apps/platform import 了 @company-os/policy，但 Dockerfile 沒有
 * COPY packages/policy。本機 tsc、lint、unit、容器 CI 全部綠（因為它們都有完整
 * repo），只有真正 docker build 才紅：
 *   process "/bin/sh -c npm run build --workspace @company-os/platform" exit code: 2
 * 正式環境因此卡在舊映像，app_grant 從未上線。
 *
 * 唯一真相是 apps/platform/package.json 的 dependencies：
 * 凡是 @company-os/＊ 而又對應到 packages/<dir> 的，Dockerfile 三個位置都要有：
 *   1. npm ci 前的 packages/<dir>/package.json（沒有它就连不到 workspace）
 *   2. build 前的完整來源（入口是 src/index.ts，不是 dist）
 *   3. runtime stage（node_modules/@company-os/<dir> 是符號連結，指回 packages/）
 *
 * 少一行會紅；套件移除但 Dockerfile 沒跟著刪，也會紅。
 */

const repoRoot = resolve(process.cwd());
const dockerfile = readFileSync(join(repoRoot, 'apps', 'platform', 'Dockerfile'), 'utf8');

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
}

const platform = readJson(join(repoRoot, 'apps', 'platform', 'package.json'));

/** packages/ 底下 name → 資料夾名（例如 @company-os/policy → policy）。 */
function packagesByName(): Map<string, string> {
  const found = new Map<string, string>();
  const packagesDir = join(repoRoot, 'packages');

  if (!existsSync(packagesDir)) {
    return found;
  }

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifest = join(packagesDir, entry.name, 'package.json');

    if (!existsSync(manifest)) {
      continue;
    }

    const parsed = readJson(manifest);

    if (parsed.name !== undefined) {
      found.set(parsed.name, entry.name);
    }
  }

  return found;
}

/** platform 依賴之中，屬於 packages/<dir> 的套件 → 資料夾名。 */
function platformWorkspaceDeps(): string[] {
  const byName = packagesByName();
  const dirs: string[] = [];

  for (const name of Object.keys(platform.dependencies ?? {})) {
    const dir = byName.get(name);

    if (dir !== undefined) {
      dirs.push(dir);
    }
  }

  return dirs.sort();
}

/** Dockerfile 有 `COPY packages/<dir> packages/<dir>`（完整來源）的資料夾。 */
function copiedSources(): string[] {
  return collect(/^COPY packages\/([a-z0-9-]+) packages\/\1$/);
}

/** Dockerfile 有 `COPY packages/<dir>/package.json ...`（npm ci 前）的資料夾。 */
function copiedManifests(): string[] {
  return collect(/^COPY packages\/([a-z0-9-]+)\/package\.json packages\/\1\/package\.json$/);
}

/** Dockerfile 有 `COPY --from=build /app/packages/<dir> ./packages/<dir>` 的資料夾。 */
function copiedIntoRuntime(): string[] {
  return collect(/^COPY --from=build \/app\/packages\/([a-z0-9-]+) \.\/packages\/\1$/);
}

function collect(pattern: RegExp): string[] {
  const found: string[] = [];

  for (const line of dockerfile.split(/\r?\n/)) {
    const match = pattern.exec(line.trim());

    if (match !== null && match[1] !== undefined) {
      found.push(match[1]);
    }
  }

  return found.sort();
}

describe('API Dockerfile 帶齊 platform 的 workspace 依賴', () => {
  it('每個 @company-os/＊ 依賴都對應到真實存在的 packages/<dir>', () => {
    // 名稱打錯或者套件未建立時，下面的集合比對會靜靜通過（兩邊都沒有），
    // 所以先獨立驗一次：依賴清單裡每個 @company-os/＊ 都要找得到資料夾。
    const byName = packagesByName();
    const unresolved = Object.keys(platform.dependencies ?? {})
      .filter((name) => name.startsWith('@company-os/'))
      .filter((name) => !byName.has(name));

    expect(unresolved).toEqual([]);
  });

  it('npm ci 之前有帶住每個 workspace 依賴的 package.json', () => {
    // 這一個是「至少」而不是「等於」：根目錄 npm ci 要滿足整份 lockfile，
    // 所以還要帶住 apps/web 的依賴（design-tokens、i18n、ui-kit、app-shell）。
    // platform 自己的依賴則一個都不能少 —— 少一個就沒有符號連結，build 會紅。
    const missing = platformWorkspaceDeps().filter((dir) => !copiedManifests().includes(dir));

    expect(missing).toEqual([]);
  });

  it('package.json COPY 的每個資料夾都是真實存在的 workspace', () => {
    // 另一個方向：套件搬走或改名之後，Dockerfile 的舊行要跟著刪。
    const known = new Set(packagesByName().values());
    const stale = copiedManifests().filter((dir) => !known.has(dir));

    expect(stale).toEqual([]);
    expect(copiedManifests().length).toBeGreaterThan(0);
  });

  it('build 之前有帶住每個 workspace 依賴的完整來源', () => {
    expect(copiedSources()).toEqual(platformWorkspaceDeps());
  });

  it('runtime stage 有帶住每個 workspace 依賴（符號連結指回 packages/）', () => {
    expect(copiedIntoRuntime()).toEqual(platformWorkspaceDeps());
  });
});
