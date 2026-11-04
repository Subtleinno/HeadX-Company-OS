import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 備份機制的倉庫層閘門：設定範本、指令、文件三邊要對得上。
 * 這一組在文件或 package.json 漂移時會變紅，不靠人記得。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('.env.example 的備份設定', () => {
  const env = readText('.env.example');

  it('有 COMPANY_OS_BACKUP_ROOT 而且預設留空（不可以預設寫在 C:）', () => {
    expect(env).toMatch(/^COMPANY_OS_BACKUP_ROOT=\s*$/m);
  });

  it('有保留份數與排程間隔', () => {
    expect(env).toMatch(/^BACKUP_RETENTION=\d+$/m);
    expect(env).toMatch(/^BACKUP_INTERVAL_HOURS=\d+$/m);
  });
});

describe('package.json 的備份指令', () => {
  const pkg = JSON.parse(readText('package.json')) as { scripts: Record<string, string> };

  it('五個備份指令加 restore 都存在，而且都走同一支 CLI', () => {
    for (const name of [
      'backup:create',
      'backup:verify',
      'backup:list',
      'backup:prune',
      'backup:schedule',
      'restore',
      'storage:check',
    ]) {
      expect(pkg.scripts[name], `缺少 npm script：${name}`).toBeDefined();
      expect(pkg.scripts[name]).toContain('scripts/backup/cli.mjs');
    }
  });
});

describe('文件', () => {
  const doc = readText('docs/backup-restore.md');

  it('每一條指令都寫在文件裡', () => {
    for (const command of [
      'npm run backup:create',
      'npm run backup:verify',
      'npm run backup:list',
      'npm run backup:prune',
      'npm run restore',
      'npm run storage:check',
    ]) {
      expect(doc).toContain(command);
    }
  });

  it('有災難復原檢查清單，而且寫明測試用備份不可以當成正式備份', () => {
    expect(doc).toContain('災難復原檢查清單');
    expect(doc).toContain('TEST-ONLY');
  });

  it('寫明儲存空間遺失的六種錯誤碼', () => {
    for (const code of [
      'minio_not_running',
      'data_dir_missing',
      'data_dir_empty',
      'bucket_missing',
      'object_missing',
      'object_unreadable',
    ]) {
      expect(doc).toContain(code);
    }
  });
});
