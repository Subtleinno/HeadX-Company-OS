import { readFileSync, readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dockerfile 與 apps/ 的一致性守門（R4／issue #74）。
 *
 * API 映像要帶住 app 清單（apps/<id>/manifest.json），但 Docker 的 COPY 不支援
 * 「複製所有 apps/＊/manifest.json」，所以 Dockerfile 逐個寫出來。
 * 逐個寫的代價是：新增一個 app 之後忘記加一行，映像就會靜靜少一個部門，
 * 而且啟動不會報錯（掃描到的 apps/ 裡面根本沒有那個資料夾）。
 *
 * 這條測試就是補這個洞：檔案系統是唯一真相，Dockerfile 要跟得上。
 * 兩個方向都驗 —— 少一行會紅，多一行（app 已刪）也會紅。
 */

const repoRoot = resolve(process.cwd());
const dockerfile = readFileSync(join(repoRoot, 'apps', 'platform', 'Dockerfile'), 'utf8');
const appsDir = join(repoRoot, 'apps');

/** apps/ 底下真正有 manifest.json 的資料夾。 */
function appsWithManifest(): string[] {
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(appsDir, name, 'manifest.json')))
    .sort();
}

/** Dockerfile 有 COPY 的 manifest。 */
function copiedManifests(): string[] {
  const found: string[] = [];

  for (const line of dockerfile.split(/\r?\n/)) {
    const match = /^COPY apps\/([a-z0-9_]+)\/manifest\.json\s+\.\/apps\/\1\/manifest\.json$/.exec(
      line.trim(),
    );

    if (match !== null && match[1] !== undefined) {
      found.push(match[1]);
    }
  }

  return found.sort();
}

describe('API Dockerfile 帶齊所有 app 的 manifest', () => {
  it('每個有 manifest.json 的 apps/<id>/ 都有一行 COPY', () => {
    expect(copiedManifests()).toEqual(appsWithManifest());
  });

  it('沒有多餘的 COPY（app 刪了，Dockerfile 也要跟著刪）', () => {
    const missingFromDisk = copiedManifests().filter(
      (id) => !existsSync(join(appsDir, id, 'manifest.json')),
    );

    expect(missingFromDisk).toEqual([]);
  });

  it('MODULES_DIR 指住 /app/apps，不是舊的 /app/modules', () => {
    expect(dockerfile).toContain('ENV MODULES_DIR=/app/apps');
    expect(dockerfile).not.toContain('/app/modules');
  });

  it('映像沒有把整個 apps/ 或舊的 modules/ 抄進去', () => {
    expect(dockerfile).not.toMatch(/^COPY\s+apps\s+\.\/apps$/m);
    expect(dockerfile).not.toMatch(/^COPY\s+modules\b/m);
  });
});
