import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 生產映像直接執行 packages/＊ 的 TypeScript 來源，所以相對匯入要用 `.ts`（issue #103）。
 *
 * packages/＊ 的 `main`／`exports` 都指向 `src/index.ts`；api 映像照樣搬來源進去，
 * 靠 Node 的型別剝離執行。型別剝離**不會**改寫 specifier：寫 `./identity.js` 就會去找
 * 一個不存在的 `identity.js`，容器直接 ERR_MODULE_NOT_FOUND 起不來。
 * 這個錯在 tsc、vitest、任何 bundler 之下都不會出現，只有真正 docker run 才見到 ——
 * 所以要有這條測試守住，而不是靠人記得。
 *
 * 兩邊都驗：
 *   1. 靜態：packages/＊/src/＊＊ 內的相對匯入，不得以 .js 結尾。
 *   2. 行為：用子行程 require() 逐個載入 platform 依賴的 raw-TS 套件，真的解析得到。
 */

const repoRoot = resolve(process.cwd());
const packagesDir = join(repoRoot, 'packages');

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
}

function listFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...listFiles(full));
      continue;
    }

    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      found.push(full);
    }
  }

  return found;
}

/** packages/<dir>/src 底下的所有 .ts 檔。 */
const RELATIVE_SPECIFIER = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g;

const platform = JSON.parse(
  readFileSync(join(repoRoot, 'apps/platform/package.json'), 'utf8'),
) as PackageJson;

/** platform 依賴之中屬於 packages/<dir> 的套件資料夾。 */
function platformPackageDirs(): string[] {
  const byName = new Map<string, string>();

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    const manifest = join(packagesDir, entry.name, 'package.json');

    if (!entry.isDirectory() || !existsSync(manifest)) {
      continue;
    }

    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson;

    if (parsed.name !== undefined) {
      byName.set(parsed.name, entry.name);
    }
  }

  return Object.keys(platform.dependencies ?? {})
    .map((name) => byName.get(name))
    .filter((dir): dir is string => dir !== undefined)
    .sort();
}

/** 這些套件才是在 api 映像內以 raw TS 執行的一批（app-shell、ui-kit 由 Vite 打包給瀏覽器，不在此列）。 */
function rawTsPackageSources(): Array<{ file: string; source: string }> {
  const found: Array<{ file: string; source: string }> = [];

  for (const dir of platformPackageDirs()) {
    const srcDir = join(packagesDir, dir, 'src');

    if (!existsSync(srcDir)) {
      continue;
    }

    for (const file of listFiles(srcDir)) {
      found.push({ file, source: readFileSync(file, 'utf8') });
    }
  }

  return found;
}

describe('packages/＊ 的來源可以在映像內直接執行', () => {
  it('相對匯入不以 .js 結尾（Node 型別剝離不會改寫 specifier）', () => {
    const offenders: string[] = [];

    for (const { file, source } of rawTsPackageSources()) {
      for (const match of source.matchAll(RELATIVE_SPECIFIER)) {
        const specifier = match[1];

        if (specifier !== undefined && specifier.endsWith('.js')) {
          offenders.push(`${file.replace(repoRoot, '.')} → ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('至少掃到一個 .ts 相對匯入，證明上面的檢查不是空轉', () => {
    const withTsSpecifier: string[] = [];

    for (const { file, source } of rawTsPackageSources()) {
      for (const match of source.matchAll(RELATIVE_SPECIFIER)) {
        const specifier = match[1];

        if (specifier !== undefined && specifier.endsWith('.ts')) {
          withTsSpecifier.push(`${file.replace(repoRoot, '.')} → ${specifier}`);
        }
      }
    }

    expect(withTsSpecifier.length).toBeGreaterThan(0);
  });

  it('platform 依賴的 raw-TS 套件用 node 真的載入得到', () => {
    const dirs = platformPackageDirs();

    expect(dirs.length).toBeGreaterThan(0);

    for (const dir of dirs) {
      const entry = join(packagesDir, dir, 'src', 'index.ts');

      expect(existsSync(entry), `${dir} 沒有 src/index.ts`).toBe(true);

      const loaded = execFileSync(
        process.execPath,
        ['-e', `const m = require(${JSON.stringify(entry)}); process.stdout.write(String(Object.keys(m).length));`],
        { cwd: repoRoot, encoding: 'utf8' },
      );

      expect(Number(loaded), `${dir} 載入後沒有任何匯出`).toBeGreaterThan(0);
    }
  });
});
