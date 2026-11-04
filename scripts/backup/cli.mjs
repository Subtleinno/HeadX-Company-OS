#!/usr/bin/env node
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HeadBucketCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createAuditDb, recordBackupAction } from './audit.mjs';
import { COMMAND_FLAGS, assertKnownFlags, parseFlags } from './args.mjs';
import { readBackupConfig } from './config.mjs';
import { BackupError, createBackup } from './create.mjs';
import { createConsoleLogger } from './log.mjs';
import { backupDirFor, parseManifest } from './manifest.mjs';
import { planPrune } from './retention.mjs';
import { RestoreError, assertRestoreConfirmed, restoreBackup } from './restore.mjs';
import { evaluateBackupRoot } from './root.mjs';
import { resolveIntervalMs, runScheduleOnce } from './schedule.mjs';
import { createDocker, createMinio, listPostgresDump } from './sources.mjs';
import { checkStorage } from './storage-check.mjs';
import { describeFailures, verifyBackup } from './verify.mjs';

/**
 * 備份與還原的 CLI。
 *
 * 為什麼是 .mjs 而不是 TypeScript：這是災難復原工具，必須在一個「只有 Node 與 Docker」的
 * checkout 上直接跑，不可以要求先 build。repo 內既有的維運腳本（ports-check、storage-smoke）
 * 也是同一個做法。
 *
 * 退出碼：0 成功、1 失敗、2 拒絕執行（例如 restore 沒有 --yes）。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REFUSED = 2;


function loadEnv() {
  try {
    process.loadEnvFile(join(repoRoot, '.env'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('找不到 .env：請先複製 .env.example 為 .env', { cause: error });
    }
    throw error;
  }
}

function dbConfig(database) {
  return {
    host: '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 25432),
    user: process.env.POSTGRES_USER ?? 'company_os',
    password: process.env.POSTGRES_PASSWORD ?? '',
    database,
  };
}

function requireString(flags, name) {
  const value = flags[name];

  if (typeof value !== 'string' || value === '') {
    throw new Error(`缺少參數 --${name}`);
  }

  return value;
}

function context() {
  loadEnv();

  const backup = readBackupConfig(process.env);

  if (backup.errors.length > 0) {
    throw new Error(backup.errors.join('\n'));
  }

  const accessKey = process.env.MINIO_ROOT_USER ?? '';
  const secretKey = process.env.MINIO_ROOT_PASSWORD ?? '';

  if (accessKey === '' || secretKey === '') {
    throw new Error('MINIO_ROOT_USER 或 MINIO_ROOT_PASSWORD 未設定（只說哪一個沒設，不顯示值）');
  }

  const dataDir = process.env.MINIO_DATA_DIR ? resolve(repoRoot, process.env.MINIO_DATA_DIR) : null;
  const dataRoot = process.env.COMPANY_OS_DATA_ROOT
    ? resolve(process.env.COMPANY_OS_DATA_ROOT)
    : null;

  return {
    backup,
    dataDir,
    dataRoot,
    bucket: process.env.MINIO_BUCKET ?? 'company-os',
    database: process.env.POSTGRES_DB ?? 'company_os',
    docker: createDocker({ repoRoot }),
    minio: createMinio({
      endpoint: `http://127.0.0.1:${process.env.PORT_MINIO_API ?? '29000'}`,
      accessKey,
      secretKey,
    }),
  };
}

/** 備份根目錄的閘門。來源包括 MinIO 資料夾、整個資料根目錄與 repo 本身。 */
function resolveRoot({ backup, dataDir, dataRoot }, allowTestOnly) {
  const evaluation = evaluateBackupRoot({
    root: backup.root,
    sourcePaths: [dataDir, dataRoot, repoRoot].filter((item) => typeof item === 'string'),
    allowTestOnly,
  });

  if (!evaluation.ok) {
    const error = new Error(`${evaluation.message}\n${evaluation.guidance}`);
    error.code = evaluation.code;
    throw error;
  }

  return evaluation;
}

function loggerFor(root) {
  return createConsoleLogger({
    root,
    logDir: root === null ? join(repoRoot, '.data', 'backup-logs') : undefined,
  });
}

async function readBackups(root) {
  const base = join(root, 'company-os');
  let entries;

  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const backups = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.tmp-')) {
      continue;
    }

    const dir = join(base, entry.name);
    let manifest;

    try {
      const parsed = parseManifest(await readFile(join(dir, 'manifest.json'), 'utf8'));
      if (!parsed.ok) {
        continue;
      }
      manifest = parsed.manifest;
    } catch {
      continue;
    }

    let verifiedMarker = false;
    let sizeBytes = 0;

    try {
      const marker = JSON.parse(await readFile(join(dir, 'verified.json'), 'utf8'));
      verifiedMarker = marker.ok === true;
    } catch {
      // 沒有 verified.json：這份備份沒有通過建立時的自我驗證。
    }

    for (const file of manifest.files) {
      sizeBytes += file.size;
    }

    backups.push({
      id: manifest.backupId,
      createdAt: manifest.createdAt,
      testOnly: manifest.testOnly === true,
      usable: manifest.usable === true,
      verified: verifiedMarker && manifest.usable === true,
      sizeBytes,
      dir,
      manifest,
    });
  }

  return backups.sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
}

async function commandCreate(flags) {
  const ctx = context();
  const evaluation = resolveRoot(ctx, flags['test-only-root'] === true);
  const log = loggerFor(evaluation.root);

  if (evaluation.warning !== null) {
    log.say(`警告：${evaluation.warning}`);
  }

  const database = typeof flags.database === 'string' ? flags.database : ctx.database;
  const bucket = typeof flags.bucket === 'string' ? flags.bucket : ctx.bucket;
  const startedAt = new Date().toISOString();
  const audit = createAuditDb(dbConfig(database));

  const auditEntry = async (result, backupId, detail, errorMessage) => {
    try {
      await recordBackupAction(audit, {
        action: 'backup.create',
        backupId,
        result,
        startedAt,
        finishedAt: new Date().toISOString(),
        trigger: 'manual',
        error: errorMessage,
        detail: { database, bucket, testOnly: evaluation.testOnly, ...detail },
      });
    } catch (auditError) {
      log.say(`警告：審計寫入失敗（${auditError.message}）`);
    }
  };

  try {
    const result = await createBackup({
      repoRoot,
      root: evaluation.root,
      database,
      bucket,
      quiesceContainers: ctx.backup.quiesceContainers,
      docker: ctx.docker,
      minio: ctx.minio,
      testOnly: evaluation.testOnly,
      trigger: 'manual',
      log,
    });

    // 驗證通過才寫 marker：list 與 prune 只用這個 marker 判斷「已驗證」。
    await writeFile(
      join(result.dir, 'verified.json'),
      `${JSON.stringify({ ok: true, verifiedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );

    await auditEntry('ok', result.backupId, {
      files: result.manifest.totals.files,
      bytes: result.manifest.totals.bytes,
      objects: result.manifest.objects.count,
      gitCommit: result.manifest.versions.gitCommit,
    });

    log.say(`備份完成：${result.backupId}`);
    log.say(`  目錄：${result.dir}`);
    log.say(
      `  檔案 ${result.manifest.totals.files} 個、${result.manifest.totals.bytes} bytes；物件 ${result.manifest.objects.count} 個`,
    );
    log.say(`  一致性：${result.manifest.consistency.method}（凍結 ${result.quiesce.containers.join(', ')}）`);
    log.say(`  自我驗證：通過（${result.verification.checks.map((check) => check.name).join('、')}）`);

    if (result.manifest.testOnly) {
      log.say('  注意：這是 TEST-ONLY 備份（寫在系統碟上），不具備異碟保護。');
    }

    for (const warning of result.warnings) {
      log.say(`  警告：${warning}`);
    }

    return 0;
  } catch (error) {
    await auditEntry('error', null, {}, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await audit.end();
  }
}

async function commandVerify(flags) {
  const ctx = context();
  const evaluation = resolveRoot(ctx, flags['test-only-root'] === true);
  const backups = await readBackups(evaluation.root);
  const backupId =
    typeof flags['backup-id'] === 'string' ? flags['backup-id'] : (backups[0]?.id ?? null);

  if (backupId === null) {
    throw new Error('找不到任何備份：請用 --backup-id 指定，或先執行 npm run backup:create');
  }

  const result = await verifyBackup({
    dir: backupDirFor(evaluation.root, backupId),
    pgRestoreList: (dumpPath) => listPostgresDump({ docker: ctx.docker, dumpPath }),
  });

  const audit = createAuditDb(dbConfig(ctx.database));

  try {
    await recordBackupAction(audit, {
      action: 'backup.verify',
      backupId,
      result: result.ok ? 'ok' : 'error',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      trigger: 'manual',
      error: result.ok ? null : describeFailures(result.failures),
      detail: { checks: result.checks.map((check) => `${check.name}:${check.status}`) },
    });
  } catch (error) {
    process.stdout.write(`警告：審計寫入失敗（${error.message}）\n`);
  } finally {
    await audit.end();
  }

  for (const check of result.checks) {
    process.stdout.write(`  ${check.status === 'ok' ? 'PASS' : 'FAIL'}  ${check.name}\n`);
  }

  if (!result.ok) {
    process.stdout.write(`\n${describeFailures(result.failures)}\n`);
    process.stdout.write(`VERIFY_FAILED ${backupId}\n`);
    return 1;
  }

  process.stdout.write(`VERIFY_OK ${backupId}（${result.manifest.totals.files} 個檔案）\n`);

  if (result.manifest.testOnly === true) {
    process.stdout.write('警告：這是 TEST-ONLY 備份，不是真正的異碟備份。\n');
  }

  return 0;
}

async function commandList(flags) {
  const ctx = context();
  const evaluation = resolveRoot(ctx, flags['test-only-root'] === true);
  const backups = await readBackups(evaluation.root);

  if (backups.length === 0) {
    process.stdout.write(`沒有任何備份（${join(evaluation.root, 'company-os')}）。\n`);
    return 0;
  }

  for (const backup of backups) {
    const flags = [backup.verified ? 'verified' : 'unverified'];
    if (backup.testOnly) {
      flags.push('TEST-ONLY');
    }
    process.stdout.write(
      `${backup.id}  ${backup.createdAt}  ${backup.sizeBytes} bytes  ${flags.join(',')}\n`,
    );
  }

  return 0;
}

/**
 * 清理的實作：只有「現在驗得過」的備份才可以刪。
 * 手動 prune 與排程 prune 共用同一段程式，避免兩邊規則漂移。
 */
async function pruneVerified({ ctx, root, keep, say }) {
  const backups = await readBackups(root);
  const plan = planPrune({ backups, keep });

  if (plan.reason !== null) {
    say(plan.reason);
  }

  if (plan.clamped) {
    say(`keep 少於 1：已改成保留 1 份（要求 ${keep}）。最後一份有效備份不會被自動刪除。`);
  }

  const removed = [];

  for (const id of plan.remove) {
    const dir = backupDirFor(root, id);
    const verification = await verifyBackup({
      dir,
      pgRestoreList: (dumpPath) => listPostgresDump({ docker: ctx.docker, dumpPath }),
    });

    if (!verification.ok) {
      say(`保留 ${id}：刪除前驗證不通過（${describeFailures(verification.failures)}）`);
      continue;
    }

    await rm(dir, { recursive: true, force: true });
    removed.push(id);
    say(`已刪除 ${id}`);
  }

  return { keep: plan.keep, removed, skipped: plan.skipped };
}

async function commandPrune(flags) {
  const ctx = context();
  const evaluation = resolveRoot(ctx, flags['test-only-root'] === true);
  const keep = typeof flags.keep === 'string' ? Number(flags.keep) : ctx.backup.retention;
  const say = (text) => process.stdout.write(`${text}\n`);
  const result = await pruneVerified({ ctx, root: evaluation.root, keep, say });

  const audit = createAuditDb(dbConfig(ctx.database));

  try {
    await recordBackupAction(audit, {
      action: 'backup.prune',
      backupId: null,
      result: 'ok',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      trigger: 'manual',
      detail: { keep, kept: result.keep, removed: result.removed, skipped: result.skipped },
    });
  } catch (error) {
    process.stdout.write(`警告：審計寫入失敗（${error.message}）\n`);
  } finally {
    await audit.end();
  }

  process.stdout.write(`保留 ${result.keep.length} 份，刪除 ${result.removed.length} 份。\n`);

  return 0;
}

async function commandRestore(flags) {
  try {
    assertRestoreConfirmed(flags);
  } catch (error) {
    process.stdout.write(`${error.message}\n`);
    return REFUSED;
  }

  const ctx = context();
  const evaluation = resolveRoot(ctx, flags['test-only-root'] === true);
  const backupId = requireString(flags, 'backup-id');
  const log = loggerFor(evaluation.root);
  const targetDb = typeof flags['target-db'] === 'string' ? flags['target-db'] : undefined;
  const targetBucket =
    typeof flags['target-bucket'] === 'string' ? flags['target-bucket'] : undefined;
  const startedAt = new Date().toISOString();

  const audit = createAuditDb(dbConfig(targetDb ?? ctx.database));

  try {
    const result = await restoreBackup({
      root: evaluation.root,
      backupId,
      targetDb,
      targetBucket,
      createTargetDb: flags['create-target-db'] === true,
      purgeBucket: flags['purge-bucket'] === true,
      confirmed: true,
      docker: ctx.docker,
      minio: ctx.minio,
      log,
    });

    await recordBackupAction(audit, {
      action: 'backup.restore',
      backupId,
      result: 'ok',
      startedAt,
      finishedAt: result.finishedAt,
      trigger: 'manual',
      detail: {
        database: result.database,
        bucket: result.bucket,
        objects: result.objects,
        purged: result.purged,
        testOnly: result.testOnly,
      },
    });

    log.say(`還原完成：${backupId}`);
    log.say(`  資料庫：${result.database}（migration ${result.migrations.length} 個）`);
    log.say(`  bucket：${result.bucket}（物件 ${result.objects} 個，清除多餘 ${result.purged} 個）`);

    if (result.testOnly) {
      log.say('  注意：來源是 TEST-ONLY 備份。');
    }

    return 0;
  } catch (error) {
    try {
      await recordBackupAction(audit, {
        action: 'backup.restore',
        backupId,
        result: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        trigger: 'manual',
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // 資料庫可能正是壞掉的那一半，不要用審計錯誤蓋住真正的錯誤。
    }
    throw error;
  } finally {
    await audit.end();
  }
}

async function commandStorageCheck(flags) {
  const ctx = context();
  const evaluation = resolveRoot(ctx, flags['test-only-root'] === true);
  const backups = await readBackups(evaluation.root);
  const latest = backups.find((backup) => backup.verified) ?? null;
  const container = process.env.STORAGE_CONTAINER ?? 'company-os-storage-1';
  const probeKey = process.env.STORAGE_PROBE_KEY ?? '_smoke/persist-check.txt';

  const result = await checkStorage({
    latestVerifiedBackup: latest === null ? null : { id: latest.id, createdAt: latest.createdAt },
    probes: {
      containerRunning: async () => (await ctx.docker.inspectRunning(container)) === true,
      dataDir: async () => {
        if (ctx.dataDir === null) {
          return { exists: false, isDirectory: false, isEmpty: true, readable: false };
        }

        try {
          const info = await stat(ctx.dataDir);
          const entries = await readdir(ctx.dataDir);
          return {
            exists: true,
            isDirectory: info.isDirectory(),
            isEmpty: entries.length === 0,
            readable: true,
          };
        } catch (error) {
          if (error?.code === 'ENOENT') {
            return { exists: false, isDirectory: false, isEmpty: true, readable: false };
          }
          if (error?.code === 'EACCES' || error?.code === 'EPERM') {
            return { exists: true, isDirectory: true, isEmpty: false, readable: false };
          }
          throw error;
        }
      },
      headBucket: async () => {
        await ctx.minio.client.send(new HeadBucketCommand({ Bucket: ctx.bucket }));
      },
      headObject: async (key) => {
        try {
          await ctx.minio.client.send(new HeadObjectCommand({ Bucket: ctx.bucket, Key: key }));
          return true;
        } catch (error) {
          if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
            return false;
          }
          throw error;
        }
      },
      probeKey,
    },
  });

  for (const check of result.checks) {
    process.stdout.write(`  ${check.status === 'ok' ? 'PASS' : 'FAIL'}  ${check.code}  ${check.message}\n`);

    if (check.guidance !== null) {
      process.stdout.write(`        → ${check.guidance}\n`);
    }
  }

  process.stdout.write(result.ok ? 'STORAGE_OK\n' : `STORAGE_FAILED ${result.code}\n`);

  if (!result.ok) {
    const audit = createAuditDb(dbConfig(ctx.database));

    try {
      await recordBackupAction(audit, {
        action: 'storage.check',
        backupId: latest?.id ?? null,
        result: 'error',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        trigger: 'manual',
        error: result.code,
        detail: { checks: result.checks.map((check) => `${check.code}:${check.status}`) },
      });
    } catch (error) {
      process.stdout.write(`警告：審計寫入失敗（${error.message}）\n`);
    } finally {
      await audit.end();
    }
  }

  return result.ok ? 0 : 1;
}

async function commandSchedule(flags) {
  const ctx = context();
  const evaluation = resolveRoot(ctx, flags['test-only-root'] === true);
  const log = loggerFor(evaluation.root);
  const intervalMs = resolveIntervalMs(ctx.backup.intervalHours);

  const once = async () => {
    const result = await runScheduleOnce({
      keep: ctx.backup.retention,
      log: (entry) => log.event(entry),
      create: async () => {
        const created = await createBackup({
          repoRoot,
          root: evaluation.root,
          database: ctx.database,
          bucket: ctx.bucket,
          quiesceContainers: ctx.backup.quiesceContainers,
          docker: ctx.docker,
          minio: ctx.minio,
          testOnly: evaluation.testOnly,
          trigger: 'schedule',
          log,
        });

        await writeFile(
          join(created.dir, 'verified.json'),
          `${JSON.stringify({ ok: true, verifiedAt: new Date().toISOString() }, null, 2)}\n`,
          'utf8',
        );

        log.say(`排程備份完成：${created.backupId}`);
        return { backupId: created.backupId };
      },
      prune: async (keep) => {
        const result = await pruneVerified({
          ctx,
          root: evaluation.root,
          keep,
          say: (text) => log.say(text),
        });

        return { removed: result.removed };
      },
    });

    if (result.error !== null) {
      log.say(`排程備份失敗：${result.error}`);
    }

    return result;
  };

  if (intervalMs === 0) {
    const result = await once();
    return result.error === null ? 0 : 1;
  }

  log.say(`排程備份已啟動：每 ${ctx.backup.intervalHours} 小時一次（Ctrl+C 結束）。`);

  for (;;) {
    await once();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
  }
}

const COMMANDS = {
  create: commandCreate,
  verify: commandVerify,
  list: commandList,
  prune: commandPrune,
  restore: commandRestore,
  schedule: commandSchedule,
  'storage-check': commandStorageCheck,
};

// 指令表與旗標白名單必須一一對應，否則會出現「指令存在但沒有白名單」的漏洞。
for (const name of Object.keys(COMMANDS)) {
  if (COMMAND_FLAGS[name] === undefined) {
    throw new Error(`指令 ${name} 沒有在 COMMAND_FLAGS 登記`);
  }
}

async function main() {
  const command = process.argv[2];
  const handler = COMMANDS[command];

  if (handler === undefined) {
    process.stderr.write(
      `用法：node scripts/backup/cli.mjs <${Object.keys(COMMANDS).join('|')}> [選項]\n`,
    );
    return REFUSED;
  }

  const flags = parseFlags(process.argv.slice(3));
  assertKnownFlags(command, flags);

  return handler(flags);
}

try {
  process.exitCode = await main();
} catch (error) {
  const code = error instanceof BackupError || error instanceof RestoreError ? error.code : null;
  const message = error instanceof Error ? error.message : String(error);

  // 訊息前面一定要有一個分隔，否則「失敗」會直接黏在下一個字上（曾經出現「失敗未設定…」）。
  process.stderr.write(`${code === null ? `失敗：${message}` : `${code}：${message}`}\n`);
  process.exitCode = 1;
}
