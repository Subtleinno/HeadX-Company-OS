import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { backupDirFor } from './manifest.mjs';
import {
  createDatabase,
  listPostgresDump,
  migrationNames,
  postgresVersion,
  restorePostgres,
} from './sources.mjs';
import { verifyBackup, describeFailures } from './verify.mjs';

/**
 * 還原。這是破壞性操作，所以：
 * 1. 一定要 `--yes`（CLI 檢查，未確認就拒絕）。
 * 2. 還原前先完整驗證那份備份，驗不過就不動任何資料。
 * 3. 版本不相容（Postgres 主版本不同）就拒絕，不要用半套工具去猜。
 * 4. 還原後要自己檢查：migration 清單與物件數量要與 manifest 相符。
 *
 * 還原目標預設是 manifest 記錄的資料庫與 bucket（真正的災難復原），
 * 但可以指向別的資料庫／bucket 做演練。
 */

export class RestoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RestoreError';
    this.code = code;
  }
}

function majorOf(version) {
  const match = /^(\d+)/.exec(String(version ?? ''));
  return match === null ? null : Number(match[1]);
}

/**
 * 還原前的確認閘門。抽出來是為了可以測試：這條規則決定會不會覆蓋正式資料，
 * 不可以只靠「CLI 裡面有一行 if」。
 *
 * 只認 boolean true：`--yes=false`、`--yes true`（無等號時會變成字串 "true"）
 * 都不算確認，因為那兩種寫法很容易是用戶打錯。
 */
export function assertRestoreConfirmed(flags = {}) {
  if (flags.yes === true) {
    return;
  }

  throw new RestoreError(
    'confirmation_required',
    '還原是破壞性操作：會覆蓋目標資料庫與 bucket。確認後請加 --yes 再執行。',
  );
}

export async function restoreBackup({
  root,
  backupId,
  targetDb,
  targetBucket,
  createTargetDb = false,
  purgeBucket = false,
  confirmed = false,
  docker,
  minio,
  log,
}) {
  // 確認閘門放在最底層：CLI 已經檢查過，但這裡再擋一次，
  // 將來有其他呼叫者（排程、腳本）也不會繞過。
  assertRestoreConfirmed({ yes: confirmed });

  const dir = backupDirFor(root, backupId);
  const startedAt = new Date();

  const verification = await verifyBackup({
    dir,
    pgRestoreList: (dumpPath) => listPostgresDump({ docker, dumpPath }),
  });

  if (!verification.ok) {
    throw new RestoreError(
      'backup_not_verifiable',
      `備份未通過驗證，未還原任何資料：\n${describeFailures(verification.failures)}`,
    );
  }

  const manifest = verification.manifest;
  const database = targetDb ?? manifest.database;
  const bucket = targetBucket ?? manifest.bucket;

  if (typeof database !== 'string' || database === '') {
    throw new RestoreError('target_unknown', '備份沒有記錄資料庫名稱，請用 --target-db 指定。');
  }

  if (typeof bucket !== 'string' || bucket === '') {
    throw new RestoreError('target_unknown', '備份沒有記錄 bucket 名稱，請用 --target-bucket 指定。');
  }

  const serverVersion = await postgresVersion({ docker });
  const backupMajor = majorOf(manifest.versions?.postgres);
  const serverMajor = majorOf(serverVersion);

  if (backupMajor !== null && serverMajor !== null && backupMajor !== serverMajor) {
    throw new RestoreError(
      'version_incompatible',
      `Postgres 主版本不同：備份是 ${manifest.versions.postgres}，這一部機是 ${serverVersion}。請先用相同主版本還原。`,
    );
  }

  log?.event({ event: 'restore.start', backupId, database, bucket });

  if (createTargetDb) {
    await createDatabase({ docker, database });
  }

  const dumpPath = join(dir, 'postgres', 'dump.pgc');
  await restorePostgres({ docker, dumpPath, database });

  const index = JSON.parse(await readFile(join(dir, 'minio', 'index.json'), 'utf8'));

  await minio.ensureBucket(bucket);

  for (const object of index.objects) {
    await minio.upload(bucket, object.key, join(dir, object.file), object.contentType);
  }

  const purged = purgeBucket
    ? await minio.purgeExcept(
        bucket,
        index.objects.map((object) => object.key),
      )
    : 0;

  // 還原後健康檢查
  const restoredMigrations = await migrationNames({ docker, database });
  const expectedMigrations = manifest.versions?.migrations ?? [];

  if (
    expectedMigrations.length > 0 &&
    restoredMigrations.join(',') !== expectedMigrations.join(',')
  ) {
    throw new RestoreError(
      'migration_mismatch',
      `還原後的 migration 清單與備份不符：預期 ${expectedMigrations.join(', ')}，實際 ${restoredMigrations.join(', ')}`,
    );
  }

  const restoredObjects = await minio.list(bucket);
  const restoredKeys = new Set(restoredObjects.map((object) => object.key));
  const missing = index.objects.filter((object) => !restoredKeys.has(object.key)).map((o) => o.key);

  if (missing.length > 0) {
    throw new RestoreError(
      'object_missing_after_restore',
      `還原後仍有 ${missing.length} 個物件不存在：${missing.slice(0, 5).join('、')}`,
    );
  }

  return {
    backupId,
    database,
    bucket,
    objects: index.objects.length,
    purged,
    migrations: restoredMigrations,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    testOnly: manifest.testOnly === true,
  };
}
