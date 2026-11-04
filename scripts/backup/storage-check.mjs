/**
 * 儲存空間遺失偵測。
 *
 * 同一個「storage 壞了」，其實有六種完全不同的情況：容器沒開、資料夾不見、
 * 資料夾是空的、沒權限、bucket 不見、物件不見。處理方法不一樣，
 * 所以錯誤碼要分開，而且每個都要指向還原路徑。
 *
 * 這裡只做判斷與措辭；探測動作全部由呼叫端注入（CLI 用真的 Docker 與 S3）。
 */

const DOC = 'docs/backup-restore.md';

function restoreHint(latestVerifiedBackup) {
  if (latestVerifiedBackup === null || latestVerifiedBackup === undefined) {
    return '目前沒有已驗證的備份：先修好儲存空間，並立即建立第一份備份。';
  }

  return `最近已驗證的備份：${latestVerifiedBackup.id}（${latestVerifiedBackup.createdAt}）。先修好儲存空間，再執行 npm run restore -- --backup-id ${latestVerifiedBackup.id} --yes。`;
}

function isNotFoundError(error) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error;
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchBucket' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function isPermissionError(error) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error;
  return (
    candidate.code === 'EACCES' ||
    candidate.code === 'EPERM' ||
    candidate.name === 'AccessDenied' ||
    candidate.$metadata?.httpStatusCode === 403
  );
}

/**
 * 探測介面：
 * - containerRunning(): boolean
 * - dataDir(): { exists, isDirectory, isEmpty, readable }
 * - headBucket(): Promise<void>
 * - headObject(key): Promise<boolean>
 * - probeKey: string
 */
export async function checkStorage({ probes, latestVerifiedBackup = null }) {
  const checks = [];
  const hint = `還原步驟見 ${DOC}。${restoreHint(latestVerifiedBackup)}`;

  const record = (name, code, status, message, guidance) => {
    checks.push({ name, code, status, message, guidance: guidance ?? null });
  };

  // 1. 容器
  let running = false;

  try {
    running = (await probes.containerRunning()) === true;
  } catch {
    // 探測本身爆掉，等同「沒有在跑」：寧願報錯，也不要當成正常。
  }

  if (running) {
    record('container', 'container', 'ok', 'storage 容器正在執行');
  } else {
    record(
      'container',
      'minio_not_running',
      'fail',
      'storage 容器沒有在執行',
      `先啟動容器：docker compose up -d storage。${hint}`,
    );
  }

  // 2. 資料目錄
  const dir = await probes.dataDir();

  if (!dir.exists || !dir.isDirectory) {
    record(
      'data_dir',
      'data_dir_missing',
      'fail',
      'MinIO 的資料目錄不存在',
      `接回正確的碟，或把資料夾放回 .env 的 MINIO_DATA_DIR 指到的位置。不要新建一個空資料夾就當沒事。${hint}`,
    );
  } else if (!dir.readable) {
    record(
      'data_dir',
      'permission_denied',
      'fail',
      'MinIO 的資料目錄沒有讀取權限',
      `檢查資料夾的 ACL／擁有者；Docker Desktop 需要能讀寫這個資料夾。${hint}`,
    );
  } else if (dir.isEmpty) {
    record(
      'data_dir',
      'data_dir_empty',
      'fail',
      'MinIO 的資料目錄是空的',
      `資料夾存在但沒有任何內部結構：這通常代表碟接了但路徑錯了。先確認 MINIO_DATA_DIR，再還原。不要在空資料夾上重新初始化，否則 MinIO 會建立新的空叢集。${hint}`,
    );
  } else {
    record('data_dir', 'data_dir', 'ok', 'MinIO 的資料目錄存在而且不是空的');
  }

  // 3. bucket
  try {
    await probes.headBucket();
    record('bucket', 'bucket', 'ok', 'bucket 存在');
  } catch (error) {
    if (isNotFoundError(error)) {
      record(
        'bucket',
        'bucket_missing',
        'fail',
        'bucket 不見了',
        `不要建立一個空 bucket 當成已修好：先還原。${hint}`,
      );
    } else if (isPermissionError(error)) {
      record(
        'bucket',
        'permission_denied',
        'fail',
        '讀取 bucket 時權限不足',
        `檢查 MINIO_ROOT_USER／MINIO_ROOT_PASSWORD 是否與資料一起還原。${hint}`,
      );
    } else {
      // 不把連線細節（主機、端口）寫進訊息，留給 log。
      record(
        'bucket',
        'minio_unreachable',
        'fail',
        '連不上 MinIO',
        `確認容器狀態與 127.0.0.1 上的端口；連不上時任何 bucket 檢查都不可信。${hint}`,
      );
    }
  }

  // 4. 已知物件
  if (checks.some((check) => check.code === 'minio_unreachable' || check.code === 'bucket_missing')) {
    record('object', 'object_skipped', 'ok', 'bucket 未就緒，跳過物件檢查');
  } else {
    try {
      const found = await probes.headObject(probes.probeKey);

      if (found) {
        record('object', 'object', 'ok', `探測物件仍然讀得到（${probes.probeKey}）`);
      } else {
        record(
          'object',
          'object_missing',
          'fail',
          `探測物件不見了（${probes.probeKey}）`,
          `bucket 在但物件不在，代表資料被刪或只還原了一半。${hint}`,
        );
      }
    } catch (error) {
      record(
        'object',
        'object_unreadable',
        'fail',
        '探測物件讀取失敗',
        `bucket 在但讀不到物件，通常是權限或磁碟錯誤。${hint}`,
      );
      void error;
    }
  }

  const firstFailure = checks.find((check) => check.status === 'fail');

  return {
    ok: firstFailure === undefined,
    code: firstFailure?.code ?? 'ok',
    checks,
  };
}

export const STORAGE_ERROR_CODES = [
  'minio_not_running',
  'data_dir_missing',
  'data_dir_empty',
  'permission_denied',
  'minio_unreachable',
  'bucket_missing',
  'object_missing',
  'object_unreadable',
];
