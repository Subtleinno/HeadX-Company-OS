import { open, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256File } from './hash.mjs';
import { parseChecksums, parseManifest } from './manifest.mjs';

/**
 * 驗證一份備份。順序固定：manifest → 檔案 → checksums → Postgres → MinIO。
 * 任何一步失敗都繼續跑下一步，一次列齊所有問題；但 manifest 壞掉就沒有意義再往下，
 * 因為其他檢查全部依賴它列的檔案清單。
 *
 * `pgRestoreList(dumpPath)` 由呼叫端注入：正式執行時會用容器內的 pg_restore 真的解析一次，
 * 測試時可以模擬損壞。這是唯一能證明 dump 不只是「檔頭對」的方法。
 */

async function readHead(path, length) {
  const handle = await open(path, 'r');

  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function verifyBackup({ dir, pgRestoreList }) {
  if (typeof pgRestoreList !== 'function') {
    throw new TypeError('verifyBackup 需要 pgRestoreList（用來真的解析 Postgres dump）');
  }

  const checks = [];
  const failures = [];
  const addFailure = (code, message, path) => {
    failures.push({ code, message, ...(path === undefined ? {} : { path }) });
  };

  let manifestText;

  try {
    manifestText = await readFile(join(dir, 'manifest.json'), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      addFailure('manifest_missing', `找不到 manifest.json：${dir}`);
      checks.push({ name: 'manifest', status: 'fail' });
      return { ok: false, backupId: null, checks, failures, manifest: null };
    }
    throw error;
  }

  const parsed = parseManifest(manifestText);

  if (!parsed.ok) {
    addFailure(parsed.code, parsed.message);
    checks.push({ name: 'manifest', status: 'fail' });
    return { ok: false, backupId: null, checks, failures, manifest: null };
  }

  const manifest = parsed.manifest;
  checks.push({ name: 'manifest', status: 'ok' });

  // 檔案：存在、大小、雜湊
  let filesOk = true;

  for (const file of manifest.files) {
    const target = join(dir, file.path);
    let info;

    try {
      info = await stat(target);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        addFailure('file_missing', `manifest 指到的檔案不存在：${file.path}`, file.path);
        filesOk = false;
        continue;
      }
      throw error;
    }

    if (info.size !== file.size) {
      addFailure(
        'size_mismatch',
        `檔案大小與 manifest 不符：${file.path}（預期 ${file.size}，實際 ${info.size}）`,
        file.path,
      );
      filesOk = false;
    }

    const digest = await sha256File(target);

    if (digest !== file.sha256) {
      addFailure(
        'checksum_mismatch',
        `檔案內容與 manifest 不符：${file.path}（預期 ${file.sha256}，實際 ${digest}）`,
        file.path,
      );
      filesOk = false;
    }
  }

  checks.push({ name: 'files', status: filesOk ? 'ok' : 'fail' });

  // checksums.sha256 要與 manifest 一致
  try {
    const text = await readFile(join(dir, 'checksums.sha256'), 'utf8');
    const entries = parseChecksums(text);
    const mismatched = manifest.files.filter((file) => entries.get(file.path) !== file.sha256);

    if (entries.size === 0) {
      addFailure('checksums_mismatch', 'checksums.sha256 沒有任何可讀的項目');
      checks.push({ name: 'checksums', status: 'fail' });
    } else if (mismatched.length > 0) {
      for (const file of mismatched) {
        addFailure('checksums_mismatch', `checksums.sha256 與 manifest 不符：${file.path}`, file.path);
      }
      checks.push({ name: 'checksums', status: 'fail' });
    } else {
      checks.push({ name: 'checksums', status: 'ok' });
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    addFailure('checksums_missing', `找不到 checksums.sha256：${dir}`);
    checks.push({ name: 'checksums', status: 'fail' });
  }

  // Postgres：檔頭要是 pg_dump 的自訂格式，而且真的可以被 pg_restore 讀。
  const dump = manifest.files.find((file) => file.kind === 'postgres-dump');
  let postgresOk = true;

  if (dump === undefined) {
    addFailure('postgres_dump_missing', 'manifest 內沒有 postgres-dump 項目');
    postgresOk = false;
  } else {
    const head = await readHead(join(dir, dump.path), 5);

    if (head.toString('latin1') !== 'PGDMP') {
      addFailure(
        'postgres_dump_unrecognized',
        `Postgres 備份不是 pg_dump 自訂格式：${dump.path}`,
        dump.path,
      );
      postgresOk = false;
    } else {
      try {
        await pgRestoreList(join(dir, dump.path));
      } catch (error) {
        addFailure(
          'postgres_dump_corrupt',
          `pg_restore 讀不到 Postgres 備份：${dump.path}（${error instanceof Error ? error.message : String(error)}）`,
          dump.path,
        );
        postgresOk = false;
      }
    }
  }

  checks.push({ name: 'postgres', status: postgresOk ? 'ok' : 'fail' });

  // MinIO：索引可讀、物件齊全、數量與 manifest 相符
  let minioOk = true;

  try {
    const indexText = await readFile(join(dir, 'minio', 'index.json'), 'utf8');
    const index = JSON.parse(indexText);

    if (index === null || typeof index !== 'object' || index.format !== 'company-os-minio-backup') {
      addFailure('minio_index_invalid', 'minio/index.json 的 format 不正確');
      minioOk = false;
    } else if (!Array.isArray(index.objects)) {
      addFailure('minio_index_invalid', 'minio/index.json 的 objects 不是陣列');
      minioOk = false;
    } else {
      const declared = manifest.objects?.count;

      if (Number.isInteger(declared) && declared !== index.objects.length) {
        addFailure(
          'minio_objects_mismatch',
          `manifest 說有 ${declared} 個物件，索引內有 ${index.objects.length} 個`,
        );
        minioOk = false;
      }

      for (const object of index.objects) {
        try {
          await stat(join(dir, object.file));
        } catch {
          addFailure(
            'minio_objects_mismatch',
            `索引指到的物件檔不存在：${object.file}（key ${object.key}）`,
            object.file,
          );
          minioOk = false;
        }
      }
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      addFailure('minio_index_invalid', '找不到 minio/index.json');
    } else if (error instanceof SyntaxError) {
      addFailure('minio_index_invalid', `minio/index.json 不是有效的 JSON：${error.message}`);
    } else {
      throw error;
    }
    minioOk = false;
  }

  checks.push({ name: 'minio', status: minioOk ? 'ok' : 'fail' });

  if (manifest.consistency?.verified !== true || manifest.usable === false) {
    addFailure(
      'not_usable',
      `這份備份不是一致性快照，不可還原：${manifest.consistency?.failure ?? '沒有記錄原因'}`,
    );
  }

  return {
    ok: failures.length === 0,
    backupId: manifest.backupId,
    checks,
    failures,
    manifest,
  };
}

/** 給 CLI 印的人話摘要：每一條失敗一行。 */
export function describeFailures(failures) {
  return failures.map((failure) => `${failure.code}: ${failure.message}`).join('\n');
}
