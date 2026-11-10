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
 * 舊容器名，但容許前面帶 `headx-`。
 *
 * compose project 已由 `company-os` 改名為 `headx-company-os`，所以
 * `headx-company-os-api-1` 這個**正確**的名字本身包含舊字串。單純 includes
 * 會把正確的東西也判成錯，所以這裡用負向環視：只有「沒有 headx- 前綴」的
 * `company-os-api-1` 才算殘留。
 */
const BARE_OLD_CONTAINER = new RegExp(`(?<!headx-)${OLD_CONTAINER_NAME}-1`);

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
  // 歸檔目錄一律是歷史紀錄（例如 `MASTER-PLAN-2026-11-07.md` 寫的是搬遷前的架構），
  // 改掉就會變成錯的歷史。歸檔不代表現行規則，所以掃描豁免整批。
  'docs/archive/',
  SELF,
];

/**
 * 允許保留舊容器名的地方。
 *
 * 2026-11-11 完成 compose project 改名（`company-os` → `headx-company-os`）之後，
 * 全 repo 只應該剩下新名字，所以這張清單只豁免本檔（它要寫出被禁的字串）。
 */
const OLD_CONTAINER_ALLOWLIST = [SELF];

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

function scanTree(matcher: string | RegExp): string[] {
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

      const text = buffer.toString('utf8');
      const matched = typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text);

      if (matched) {
        hits.push(relativePath);
      }
    }
  };

  walk(repoRoot, '');

  return hits.sort();
}

/** 去掉允許清單之後仍有命中的檔案。 */
function strayFiles(matcher: string | RegExp, allowlist: string[]): string[] {
  return scanTree(matcher).filter(
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

  it('沒有人再用未加 headx- 前綴的舊容器名', () => {
    expect(strayFiles(BARE_OLD_CONTAINER, OLD_CONTAINER_ALLOWLIST)).toEqual([]);
  }, 30_000);

  it('本張不改的東西真的沒有被改：compose 服務仍叫 api、仍用 API_PORT', () => {
    const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8');

    // 服務名稱留給 R6，這裡必須仍是 api。
    expect(compose).toMatch(/^ {2}api:$/m);
    expect(compose).toMatch(/dockerfile: apps\/platform\/Dockerfile/);
  });

  it('備份腳本預設暫停的容器，等於 compose project 名 + -api-1', () => {
    const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8');
    const project = /^name:\s*(\S+)\s*$/m.exec(compose)?.[1];

    expect(project, 'docker-compose.yml 必須有頂層 name:').toBeTruthy();

    // 名字寫錯的後果是「備份停在錯的容器」，要等到真的要還原那一日才發現，
    // 所以這裡不接受手抄的常數：一定要等於 compose 的 project 名。
    const config = readFileSync(join(repoRoot, 'scripts/backup/config.mjs'), 'utf8');
    expect(config).toContain(`'${project}-api-1'`);
  });
});
