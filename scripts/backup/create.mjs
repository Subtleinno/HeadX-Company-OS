import { rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sha256File } from './hash.mjs';
import {
  backupDirFor,
  buildManifest,
  checksumsText,
  makeBackupId,
  serializeManifest,
} from './manifest.mjs';
import {
  copyFileWithMode,
  dumpPostgres,
  ensureDir,
  listPostgresDump,
  listingSignature,
  migrationNames,
  objectFileFor,
  writeVersionsFile,
} from './sources.mjs';
import { secretFileWarning } from './secrets.mjs';
import { verifyBackup } from './verify.mjs';

/**
 * 建立一次備份。
 *
 * 一致性策略（issue #61 §3）：Company OS 只有 api 容器會寫 Postgres 與 MinIO，
 * 所以備份期間先停掉它（stop-writers），令兩個元件都凍結在同一點，然後才各自快照。
 * 停不掉就即刻失敗，不會產生一份「看起來有備份」的東西。
 *
 * 額外檢查：快照前後各列一次物件清單，簽章不同就代表凍結期間仍然有人在寫，
 * 這份備份會標成不可用並回報失敗。
 */
export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

async function snapshotMinio({ minio, bucket, dir }) {
  const objects = await minio.list(bucket);
  const index = {
    format: 'company-os-minio-backup',
    version: 1,
    bucket,
    capturedAt: new Date().toISOString(),
    objects: [],
  };

  for (const object of objects) {
    const file = objectFileFor(object.key);
    const target = join(dir, file);

    await ensureDir(dirname(target));

    const { contentType } = await minio.download(bucket, object.key, target);
    const info = await stat(target);

    index.objects.push({
      key: object.key,
      file,
      size: info.size,
      sha256: await sha256File(target),
      contentType,
      etag: object.etag,
    });
  }

  await writeFile(join(dir, 'minio', 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  return { objects: index.objects, signature: listingSignature(objects) };
}

export async function createBackup({
  repoRoot,
  root,
  database,
  bucket,
  quiesceContainers,
  docker,
  minio,
  testOnly = false,
  trigger = 'manual',
  log,
}) {
  const startedAt = new Date();
  const backupId = makeBackupId(startedAt);
  const finalDir = backupDirFor(root, backupId);
  const tmpDir = join(root, 'company-os', `.tmp-${backupId}`);

  const alreadyStopped = [];
  const stoppedNow = [];
  const releaseErrors = [];
  const warnings = [];
  const quiesce = { strategy: 'stop-writers', containers: quiesceContainers, alreadyStopped, stoppedAt: null };

  await ensureDir(join(tmpDir, 'postgres'));
  await ensureDir(join(tmpDir, 'minio', 'objects'));
  await ensureDir(join(tmpDir, 'config'));

  let result = null;
  let mainError = null;

  try {
    // 0. 先確認來源活著：壞掉的來源不必停 api 去等。
    await migrationNames({ docker, database });
    const before = await minio.list(bucket);

    // 1. 凍結寫入
    for (const name of quiesceContainers) {
      const running = await docker.inspectRunning(name);

      if (running === null) {
        throw new BackupError(
          'quiesce_container_missing',
          `找不到容器 ${name}：無法保證備份期間沒有人寫入，已停止。`,
        );
      }

      if (!running) {
        alreadyStopped.push(name);
        log?.event({ event: 'backup.quiesce.skipped', container: name, reason: 'already-stopped' });
        continue;
      }

      await docker.stop(name);
      stoppedNow.push(name);
      log?.event({ event: 'backup.quiesce.stopped', container: name });
    }

    quiesce.stoppedAt = new Date().toISOString();

    // 2. Postgres 邏輯備份（pg_dump 本身是單一交易快照）
    const dump = await dumpPostgres({
      docker,
      database,
      target: join(tmpDir, 'postgres', 'dump.pgc'),
    });

    // 3. MinIO 物件快照（經 S3 協定，不搬內部格式）
    const snapshot = await snapshotMinio({ minio, bucket, dir: tmpDir });

    // 4. 再列一次：簽章不同代表凍結期間仍然有人寫
    const after = await minio.list(bucket);
    const beforeSignature = listingSignature(before);
    const afterSignature = listingSignature(after);
    const consistent =
      beforeSignature === afterSignature && snapshot.signature === afterSignature;

    // 5. 版本、compose 與環境設定
    const versions = await writeVersionsFile({
      target: join(tmpDir, 'config', 'versions.json'),
      docker,
      database,
      repoRoot,
    });

    await copyFileWithMode(
      join(repoRoot, 'docker-compose.yml'),
      join(tmpDir, 'config', 'docker-compose.yml'),
      0o644,
    );
    await copyFileWithMode(join(repoRoot, '.env'), join(tmpDir, 'config', 'env.backup'), 0o600);

    // env.backup 內有密碼：要求 0600，但 Windows 會忽略。收不緊就要說出來。
    const secretWarning = secretFileWarning((await stat(join(tmpDir, 'config', 'env.backup'))).mode);
    if (secretWarning !== null) {
      warnings.push(secretWarning.message);
      log?.event({ event: 'backup.secret.mode', permissions: secretWarning.permissions });
    }

    // 6. 檔案清單
    const files = [
      { path: 'postgres/dump.pgc', kind: 'postgres-dump', sha256: dump.sha256, size: dump.size },
    ];

    const indexPath = 'minio/index.json';
    const indexInfo = await stat(join(tmpDir, indexPath));
    files.push({
      path: indexPath,
      kind: 'minio-index',
      sha256: await sha256File(join(tmpDir, indexPath)),
      size: indexInfo.size,
    });

    for (const object of snapshot.objects) {
      files.push({
        path: object.file,
        kind: 'minio-object',
        objectKey: object.key,
        contentType: object.contentType,
        sha256: object.sha256,
        size: object.size,
      });
    }

    for (const [path, kind, sensitive] of [
      ['config/docker-compose.yml', 'compose', false],
      ['config/env.backup', 'env', true],
      ['config/versions.json', 'versions', false],
    ]) {
      const info = await stat(join(tmpDir, path));
      files.push({
        path,
        kind,
        sha256: await sha256File(join(tmpDir, path)),
        size: info.size,
        ...(sensitive ? { sensitive: true } : {}),
      });
    }

    // 7. manifest 與 checksum
    const manifest = buildManifest({
      backupId,
      createdAt: startedAt.toISOString(),
      testOnly,
      database,
      bucket,
      quiesce,
      versions,
      objects: {
        count: snapshot.objects.length,
        totalBytes: snapshot.objects.reduce((sum, object) => sum + object.size, 0),
      },
      files,
      consistency: {
        verified: consistent,
        method: 'object-listing-stable',
        failure: consistent ? null : 'MinIO 物件清單在快照期間改變：這份備份不可還原。',
      },
    });

    await writeFile(join(tmpDir, 'manifest.json'), serializeManifest(manifest), 'utf8');
    await writeFile(join(tmpDir, 'checksums.sha256'), checksumsText(manifest.files), 'utf8');

    // 8. 由暫存目錄改名成正式目錄：中途失敗不會留下半份「看似完整」的備份
    try {
      await rename(tmpDir, finalDir);
    } catch (error) {
      throw new BackupError(
        'finalize_failed',
        `無法把備份移到 ${finalDir}：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!consistent) {
      throw new BackupError(
        'inconsistent_snapshot',
        `一致性檢查失敗：${manifest.consistency.failure}（已保留在 ${finalDir}，標記為不可用）`,
      );
    }

    // 9. 自我驗證：備份完成不等於可用，要當場驗一次
    const verification = await verifyBackup({
      dir: finalDir,
      pgRestoreList: (dumpPath) => listPostgresDump({ docker, dumpPath }),
    });

    if (!verification.ok) {
      throw new BackupError(
        'verify_failed',
        `備份已建立但驗證失敗：\n${verification.failures
          .map((failure) => `${failure.code}: ${failure.message}`)
          .join('\n')}`,
      );
    }

    result = { backupId, dir: finalDir, manifest, verification, quiesce, trigger, warnings };
  } catch (error) {
    mainError = error;
  } finally {
    for (const name of stoppedNow) {
      try {
        await docker.start(name);
        log?.event({ event: 'backup.quiesce.started', container: name });
      } catch (error) {
        releaseErrors.push(`${name}：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (mainError !== null) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  if (mainError !== null) {
    throw mainError;
  }

  if (releaseErrors.length > 0) {
    throw new BackupError(
      'unquiesce_failed',
      `備份已完成，但無法重新啟動：${releaseErrors.join('；')}。請立即手動執行 docker compose up -d api。`,
    );
  }

  return result;
}
