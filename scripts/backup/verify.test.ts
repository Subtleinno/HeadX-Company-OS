import { mkdir, mkdtemp, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';import { afterEach, describe, expect, it } from 'vitest';
import { sha256File } from './hash.mjs';
import { backupDirFor, buildManifest, checksumsText, serializeManifest } from './manifest.mjs';
import { verifyBackup } from './verify.mjs';

/**
 * 驗證一份備份：manifest、checksum、Postgres dump 與 MinIO 物件都要對得上。
 * 每個失敗都要指出是哪一個檔／哪一部分，不是只回一句「驗證失敗」。
 *
 * pg_restore 以參數注入：測試不需要 Docker，但仍然會驗到「dump 壞掉」這一條。
 */

const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

type FixtureOptions = {
  dumpMagic?: string;
  inconsistent?: boolean;
  indexOverride?: unknown;
  indexObjects?: number;
};

async function buildFixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'co-verify-'));
  dirs.push(root);

  const id = '20260101-000000-abcdef';
  const dir = backupDirFor(root, id);

  await mkdir(join(dir, 'postgres'), { recursive: true });
  await mkdir(join(dir, 'minio', 'objects'), { recursive: true });
  await mkdir(join(dir, 'config'), { recursive: true });

  const dump = Buffer.concat([Buffer.from(options.dumpMagic ?? 'PGDMP'), Buffer.from([1, 16, 0, 7])]);
  await writeFile(join(dir, 'postgres', 'dump.pgc'), dump);

  const objectFile = 'minio/objects/0a1b2c3d.bin';
  await writeFile(join(dir, objectFile), Buffer.from('smoke-object'));
  const objectSha = await sha256File(join(dir, objectFile));

  const index = {
    format: 'company-os-minio-backup',
    version: 1,
    bucket: 'company-os',
    objects: Array.from({ length: options.indexObjects ?? 1 }, (_unused, position) => ({
      key: position === 0 ? '_smoke/persist-check.txt' : `extra/${position}.txt`,
      file: position === 0 ? objectFile : `minio/objects/missing${position}.bin`,
      size: 12,
      sha256: objectSha,
      contentType: 'text/plain',
    })),
  };

  await writeFile(
    join(dir, 'minio', 'index.json'),
    typeof options.indexOverride === 'string'
      ? options.indexOverride
      : JSON.stringify(options.indexOverride ?? index, null, 2),
  );

  await writeFile(join(dir, 'config', 'docker-compose.yml'), 'name: company-os\n');
  await writeFile(join(dir, 'config', 'env.backup'), 'POSTGRES_PASSWORD=redacted\n');
  await writeFile(join(dir, 'versions.json'), '{"gitCommit":"193bfa3"}\n');

  const paths = [
    'postgres/dump.pgc',
    'minio/index.json',
    objectFile,
    'config/docker-compose.yml',
    'config/env.backup',
    'versions.json',
  ];

  const files = [];

  for (const path of paths) {
    const info = await stat(join(dir, path));
    files.push({
      path,
      kind: path.startsWith('postgres') ? 'postgres-dump' : 'file',
      sha256: await sha256File(join(dir, path)),
      size: info.size,
    });
  }

  const manifest = buildManifest({
    backupId: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    testOnly: false,
    database: 'company_os',
    bucket: 'company-os',
    quiesce: {
      strategy: 'stop-writers',
      containers: ['company-os-api-1'],
      alreadyStopped: [],
      stoppedAt: '2026-01-01T00:00:01.000Z',
    },
    versions: {
      gitCommit: '193bfa3',
      node: 'v26.13.0',
      postgres: '16.14',
      minio: 'RELEASE.2025-10-15T17-29-55Z',
      migrations: ['0001_audit_log.sql'],
    },
    objects: { count: index.objects.length, totalBytes: 12 * index.objects.length },
    files,
    consistency: {
      verified: options.inconsistent !== true,
      method: 'object-listing-stable',
      failure: options.inconsistent === true ? '物件在快照期間改變' : null,
    },
  });

  await writeFile(join(dir, 'manifest.json'), serializeManifest(manifest));
  await writeFile(join(dir, 'checksums.sha256'), checksumsText(files));

  return { root, dir, id, objectFile };
}

const pgOk = async (): Promise<void> => undefined;

describe('verifyBackup：有效備份', () => {
  it('manifest、checksum、dump、物件全部通過', async () => {
    const fixture = await buildFixture();

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(true);
    expect(result.backupId).toBe(fixture.id);
    expect(result.failures).toEqual([]);
    expect(result.checks.map((check) => check.name)).toEqual([
      'manifest',
      'files',
      'checksums',
      'postgres',
      'minio',
    ]);
  });
});

describe('verifyBackup：失敗要指出原因', () => {
  it('manifest 不存在：manifest_missing', async () => {
    const fixture = await buildFixture();
    await unlink(join(fixture.dir, 'manifest.json'));

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    expect(result.failures[0]?.code).toBe('manifest_missing');
  });

  it('manifest 壞掉：manifest_invalid', async () => {
    const fixture = await buildFixture();
    await writeFile(join(fixture.dir, 'manifest.json'), '{ broken');

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    expect(result.failures[0]?.code).toBe('manifest_invalid');
  });

  it('manifest 指到的檔案不見了：file_missing 並指出是哪一個', async () => {
    const fixture = await buildFixture();
    await unlink(join(fixture.dir, 'config', 'docker-compose.yml'));

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    const failure = result.failures.find((item) => item.code === 'file_missing');
    expect(failure?.message).toContain('config/docker-compose.yml');
  });

  it('檔案內容被改（大小相同）：checksum_mismatch', async () => {
    const fixture = await buildFixture();
    await writeFile(join(fixture.dir, 'config', 'docker-compose.yml'), 'name: evil-os\n');

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    const failure = result.failures.find((item) => item.code === 'checksum_mismatch');
    expect(failure?.message).toContain('config/docker-compose.yml');
  });

  it('checksums.sha256 被刪：checksums_missing', async () => {
    const fixture = await buildFixture();
    await unlink(join(fixture.dir, 'checksums.sha256'));

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    expect(result.failures.map((item) => item.code)).toContain('checksums_missing');
  });

  it('Postgres dump 不是 pg_dump 格式：postgres_dump_unrecognized', async () => {
    const fixture = await buildFixture({ dumpMagic: 'NOPE!' });

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    expect(result.failures.map((item) => item.code)).toContain('postgres_dump_unrecognized');
  });

  it('pg_restore 讀不到 dump（內容損壞）：postgres_dump_corrupt', async () => {
    const fixture = await buildFixture();

    const result = await verifyBackup({
      dir: fixture.dir,
      pgRestoreList: async () => {
        throw new Error('pg_restore: error: could not read from input file');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures.map((item) => item.code)).toContain('postgres_dump_corrupt');
  });

  it('MinIO 索引不是 JSON：minio_index_invalid', async () => {
    const fixture = await buildFixture({ indexOverride: 'not json' });

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    expect(result.failures.map((item) => item.code)).toContain('minio_index_invalid');
  });

  it('索引聲稱有兩個物件但只有一個檔：minio_objects_mismatch', async () => {
    const fixture = await buildFixture({ indexObjects: 2 });

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    expect(result.failures.map((item) => item.code)).toContain('minio_objects_mismatch');
  });

  it('一致性未通過的備份不可用：not_usable', async () => {
    const fixture = await buildFixture({ inconsistent: true });

    const result = await verifyBackup({ dir: fixture.dir, pgRestoreList: pgOk });

    expect(result.ok).toBe(false);
    expect(result.failures.map((item) => item.code)).toContain('not_usable');
  });
});

describe('verifyBackup：備份目錄本身有問題', () => {
  it('目錄不存在時不是擲錯，而是回一個看得懂的失敗', async () => {
    const result = await verifyBackup({
      dir: join(tmpdir(), 'co-does-not-exist-123456'),
      pgRestoreList: pgOk,
    });

    expect(result.ok).toBe(false);
    expect(result.failures[0]?.code).toBe('manifest_missing');
  });
});
