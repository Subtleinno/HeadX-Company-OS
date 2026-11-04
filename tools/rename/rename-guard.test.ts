import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * R2 的守門測試（issue #72）。
 *
 * 這一張只做一件事：把 `apps/api` 用 `git mv` 改名為 `apps/platform`，並更新所有指向舊路徑的地方。
 * 不改行為、不改端口、不改 compose 服務名稱。
 *
 * 這個檔案本身就是「不准再有 apps/api」的證據，所以它自己必然會提到那兩個字串。
 * 為了不自摳豁免，字串一律用陣列接出來，令 git grep 掃不到本檔 —— 否則這個測試
 * 只能靠「把自己加入允許清單」才過，那就等於自己批自己。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

/** 舊的 app 路徑與舊的容器名前綴，拆開組裝，令本檔不會被自己的 grep 命中。 */
const OLD_APP_PATH = ['apps', 'api'].join('/');
const OLD_CONTAINER_NAME = ['company-os', 'api'].join('-');

/**
 * 本檔自我豁免：這個測試必須寫出它要禁的字串（測試名稱、註解、斷言），
 * 否則連「禁止 apps/api」這件事都表達不到。豁免只限本檔一個。
 */
const SELF = 'tools/rename/rename-guard.test.ts';

/**
 * 允許保留 `apps/api` 的地方：它們描述的是「搬遷前後」或「R2 計劃」，
 * 改掉就會變成錯的歷史紀錄（issue #72 的實作規則 5 明確要求保留舊路徑）。
 */
const OLD_PATH_ALLOWLIST = [
  'docs/architecture/REPO-MAP.md',
  'docs/architecture/CODE-MAP.md',
  'docs/product/',
  SELF,
];

/**
 * 允許保留 `company-os-api` 的地方：全部是 compose 容器名 `company-os-api-1`
 * （project `company-os` + 服務 `api` 自動生成），不是資料夾路徑。
 *
 * issue #72 的實作規則 4 明確寫「備份腳本裡的服務名稱」本張不改、留給 R6，
 * 所以這幾個檔案在 R2 必須原樣保留；R6 改服務名時會一併更新。
 * 已於 issue #72 留言取得裁定：擴大允許清單，不改容器名。
 */
const OLD_CONTAINER_ALLOWLIST = [
  '.env.example',
  'docs/backup-restore.md',
  'scripts/backup/config.mjs',
  'scripts/backup/config.test.ts',
  'scripts/backup/manifest.test.ts',
  'scripts/backup/verify.test.ts',
  SELF,
];

/**
 * 掃描整個 repo 的檔案內容，找出含某字串的檔案。
 *
 * 不用 `git grep`：issue #72 指定的容器驗收是 `git archive | docker run`，
 * 容器內沒有 `.git`，靠 git 的測試會在容器裡假紅（第一次跑就是這樣紅的）。
 * 直接掃檔案樹，本地與容器行為一致，順便也掃得到未入 git 的檔案。
 *
 * 跳過：依賴、產出、本機工作資料（.workbuddy／.zcode 不是 repo 的一部分）、二進位檔。
 */
const SKIP_DIRS = new Set([
  '.git',
  '.workbuddy',
  '.zcode',
  '.data',
  'node_modules',
  'dist',
  'coverage',
]);

function isSkippedPath(relativePath: string): boolean {
  return relativePath
    .split('/')
    .some((segment) => SKIP_DIRS.has(segment));
}

function scanTree(needle: string): string[] {
  const hits: string[] = [];

  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

      if (entry.name === '.git' || isSkippedPath(relativePath)) {
        continue;
      }

      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full, relativePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stat = statSync(full);
      // 大檔與二進位檔不會是「引用路徑」的地方，跳過以免拖慢與亂報。
      if (stat.size > 2_000_000) {
        continue;
      }

      const buffer = readFileSync(full);
      if (buffer.includes(0)) {
        continue;
      }

      if (buffer.toString('utf8').includes(needle)) {
        hits.push(relativePath);
      }
    }
  };

  walk(repoRoot, '');

  return hits.sort();
}

/** 去掉允許清單之後仍有命中的檔案。 */
function strayFiles(needle: string, allowlist: string[]): string[] {
  return scanTree(needle).filter(
    (file) => !allowlist.some((allowed) => (allowed.endsWith('/') ? file.startsWith(allowed) : file === allowed)),
  );
}

describe('R2：apps/api 改名為 apps/platform', () => {
  it('舊資料夾 apps/api 已經不存在', () => {
    expect(existsSync(join(repoRoot, OLD_APP_PATH))).toBe(false);
  }, 30_000);

  it('新資料夾 apps/platform 存在，而且 package 名稱為 @company-os/platform', () => {
    const packageJsonPath = join(repoRoot, 'apps/platform/package.json');
    expect(existsSync(packageJsonPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string };
    expect(pkg.name).toBe('@company-os/platform');
  });

  it('沒有任何 package 仍叫 @company-os/api', () => {
    expect(strayFiles('@company-os/api', [SELF])).toEqual([]);
  }, 30_000);

  it('除了說明搬遷前後的檔案之外，沒有人再提到舊路徑 apps/api', () => {
    expect(strayFiles(OLD_APP_PATH, OLD_PATH_ALLOWLIST)).toEqual([]);
  }, 30_000);

  it('除了 compose 容器名之外，沒有人再提到 company-os-api', () => {
    expect(strayFiles(OLD_CONTAINER_NAME, OLD_CONTAINER_ALLOWLIST)).toEqual([]);
  }, 30_000);

  it('本張不改的東西真的沒有被改：compose 服務仍叫 api、仍用 API_PORT', () => {
    const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8');

    // 服務名稱留給 R6，這裡必須仍是 api。
    expect(compose).toMatch(/^ {2}api:$/m);
    expect(compose).toMatch(/dockerfile: apps\/platform\/Dockerfile/);
  });

  it('備份腳本裡的容器名沒有被動過（留給 R6）', () => {
    const config = readFileSync(join(repoRoot, 'scripts/backup/config.mjs'), 'utf8');
    expect(config).toContain(`'${OLD_CONTAINER_NAME}-1'`);
  });
});
