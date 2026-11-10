import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyWithHash, sha256File, sha256Text } from './hash.mjs';
import {
  BACKUP_FORMAT,
  FORMAT_VERSION,
  backupDirFor,
  buildManifest,
  checksumsText,
  makeBackupId,
  parseManifest,
  serializeManifest,
} from './manifest.mjs';

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'co-manifest-'));
}

function sampleFiles() {
  return [
    { path: 'config/docker-compose.yml', kind: 'compose', sha256: 'a'.repeat(64), size: 10 },
    { path: 'postgres/dump.pgc', kind: 'postgres-dump', sha256: 'b'.repeat(64), size: 2048 },
  ];
}

describe('makeBackupId', () => {
  it('格式是 YYYYMMDD-HHMMSS-六位十六進位，時間取自傳入的時鐘', () => {
    const id = makeBackupId(new Date('2026-11-04T14:40:05Z'), '0a1b2c');

    expect(id).toBe('20261104-144005-0a1b2c');
    expect(id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);
  });

  it('同一秒的兩次備份不會撞名（後綴不同）', () => {
    const at = new Date('2026-11-04T14:40:05Z');

    expect(makeBackupId(at, 'aaaaaa')).not.toBe(makeBackupId(at, 'bbbbbb'));
  });
});

describe('backupDirFor', () => {
  it('目錄是 <root>/company-os/<id>', () => {
    const dir = backupDirFor('D:\\company-os-backups', '20261104-144005-0a1b2c');

    expect(dir).toBe(join('D:\\company-os-backups', 'company-os', '20261104-144005-0a1b2c'));
    expect(dir).toContain('20261104-144005-0a1b2c');
    expect(dir).toMatch(/company-os[\\/]20261104-144005-0a1b2c$/);
  });
});

describe('buildManifest', () => {
  const base = {
    backupId: '20261104-144005-0a1b2c',
    createdAt: '2026-11-04T14:40:05.000Z',
    testOnly: false,
    database: 'company_os',
    bucket: 'company-os',
    quiesce: {
      strategy: 'stop-writers',
      containers: ['headx-company-os-api-1'],
      alreadyStopped: [],
      stoppedAt: '2026-11-04T14:40:06.000Z',
    },
    versions: {
      gitCommit: '193bfa3',
      node: 'v26.13.0',
      postgres: 'PostgreSQL 16.14',
      minio: 'RELEASE.2025-10-15T17-29-55Z',
      migrations: ['0001_audit_log.sql', '0002_users_sessions.sql', '0003_stored_file.sql'],
    },
    objects: { count: 1, totalBytes: 50 },
    files: sampleFiles(),
    consistency: { verified: true, method: 'object-listing-stable', failure: null },
  };

  it('記錄格式、版本、備份 ID、檔案清單與合計', () => {
    const manifest = buildManifest(base);

    expect(manifest.format).toBe(BACKUP_FORMAT);
    expect(manifest.version).toBe(FORMAT_VERSION);
    expect(manifest.backupId).toBe(base.backupId);
    expect(manifest.testOnly).toBe(false);
    expect(manifest.files).toHaveLength(2);
    expect(manifest.totals).toEqual({ files: 2, bytes: 2058 });
  });

  it('檔案清單按路徑排序，兩次建出的 manifest 完全一樣', () => {
    const forward = buildManifest({ ...base, files: sampleFiles() });
    const backward = buildManifest({ ...base, files: [...sampleFiles()].reverse() });

    expect(forward.files.map((file) => file.path)).toEqual([
      'config/docker-compose.yml',
      'postgres/dump.pgc',
    ]);
    expect(serializeManifest(forward)).toBe(serializeManifest(backward));
  });

  it('只記錄檔案的雜湊與大小，不會把檔案內容寫進 manifest', () => {
    const manifest = buildManifest({
      ...base,
      files: [
        ...sampleFiles(),
        { path: 'config/env.backup', kind: 'env', sha256: 'c'.repeat(64), size: 120, sensitive: true },
      ],
    });

    const text = serializeManifest(manifest);

    expect(text).toContain('config/env.backup');
    expect(text).toContain('"sensitive": true');
    // 真正的 .env 內容永遠不會出現在 manifest。
    expect(text).not.toMatch(/POSTGRES_PASSWORD=.+/);
    expect(text).not.toMatch(/MINIO_ROOT_PASSWORD=.+/);
  });

  it('一致性失敗的備份標成不可用', () => {
    const manifest = buildManifest({
      ...base,
      consistency: { verified: false, method: 'object-listing-stable', failure: 'object 在快照期間改變' },
    });

    expect(manifest.consistency.verified).toBe(false);
    expect(manifest.usable).toBe(false);
  });

  it('測試用的備份在 manifest 標記 testOnly', () => {
    expect(buildManifest({ ...base, testOnly: true }).testOnly).toBe(true);
  });
});

describe('parseManifest', () => {
  const valid = serializeManifest(
    buildManifest({
      backupId: '20261104-144005-0a1b2c',
      createdAt: '2026-11-04T14:40:05.000Z',
      testOnly: false,
      database: 'company_os',
      bucket: 'company-os',
      quiesce: { strategy: 'stop-writers', containers: [], alreadyStopped: [], stoppedAt: null },
      versions: { gitCommit: 'x', node: 'v26.13.0', postgres: '16.14', minio: 'x', migrations: [] },
      objects: { count: 0, totalBytes: 0 },
      files: sampleFiles(),
      consistency: { verified: true, method: 'object-listing-stable', failure: null },
    }),
  );

  it('可以讀回自己寫出的 manifest', () => {
    const result = parseManifest(valid);

    expect(result.ok).toBe(true);
    expect(result.manifest.backupId).toBe('20261104-144005-0a1b2c');
    expect(result.manifest.files).toHaveLength(2);
  });

  it('不是 JSON、格式不對、版本不對都回 manifest_invalid 並講原因', () => {
    const notJson = parseManifest('not json');
    expect(notJson.ok).toBe(false);
    expect(notJson.code).toBe('manifest_invalid');

    const wrongFormat = parseManifest(JSON.stringify({ ...JSON.parse(valid), format: 'other' }));
    expect(wrongFormat.code).toBe('manifest_invalid');
    expect(wrongFormat.message).toContain('format');

    const wrongVersion = parseManifest(JSON.stringify({ ...JSON.parse(valid), version: 99 }));
    expect(wrongVersion.code).toBe('manifest_invalid');
    expect(wrongVersion.message).toContain('version');
  });

  it('缺 backupId、files 不是陣列、檔案項目缺 sha256 都被擋下', () => {
    const missingId = parseManifest(JSON.stringify({ ...JSON.parse(valid), backupId: undefined }));
    expect(missingId.ok).toBe(false);

    const badFiles = parseManifest(JSON.stringify({ ...JSON.parse(valid), files: 'none' }));
    expect(badFiles.ok).toBe(false);

    const badEntry = parseManifest(
      JSON.stringify({
        ...JSON.parse(valid),
        files: [{ path: 'a', size: 1 }],
      }),
    );
    expect(badEntry.ok).toBe(false);
    expect(badEntry.message).toContain('sha256');
  });
});

describe('checksumsText', () => {
  it('每個檔案一行：<sha256>  <路徑>', () => {
    expect(checksumsText(sampleFiles())).toBe(
      `${'a'.repeat(64)}  config/docker-compose.yml\n${'b'.repeat(64)}  postgres/dump.pgc\n`,
    );
  });
});

describe('hash', () => {
  it('sha256File 等於直接對內容做 SHA-256', async () => {
    const dir = await tempDir();
    const file = join(dir, 'a.txt');
    await writeFile(file, 'company-os', 'utf8');

    const expected = createHash('sha256').update('company-os').digest('hex');

    expect(sha256Text('company-os')).toBe(expected);
    expect(await sha256File(file)).toBe(expected);
  });

  it('copyWithHash 複製檔案並回報大小與雜湊', async () => {
    const dir = await tempDir();
    const source = join(dir, 'source.bin');
    const target = join(dir, 'target.bin');
    await writeFile(source, Buffer.from([1, 2, 3, 4, 5]));

    const result = await copyWithHash(source, target);

    expect(result.size).toBe(5);
    expect(result.sha256).toBe(createHash('sha256').update(Buffer.from([1, 2, 3, 4, 5])).digest('hex'));
    expect([...(await readFile(target))]).toEqual([1, 2, 3, 4, 5]);
  });
});
