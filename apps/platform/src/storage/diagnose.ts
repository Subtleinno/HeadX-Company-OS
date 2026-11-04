/**
 * 儲存空間診斷。
 *
 * `/health` 只說「storage 出問題」，但「MinIO 沒啟動」與「bucket 不見了」
 * 要用完全不同的方法處理。這裡把可從 API 內部看見的原因分成幾個碼，
 * 每個碼都指向本機的詳細檢查與還原文件。
 *
 * 資料目錄（host 上的 MINIO_DATA_DIR）API 看不到，由 `npm run storage:check` 檢查。
 */

/**
 * storage 檢查的硬上限。
 * AWS SDK 預設會重試，storage 停掉時 /health 可以拖到 11 秒以上；監控與 docker healthcheck
 * 都等不到那個答案。這裡是最後防線，ping 自己另有 2 秒逾時。
 *
 * 定義在這一邊（而不是 app.ts）：app.ts 要用它做預設值，這裡也要用它做預設參數，
 * 放在 app.ts 會形成 app → diagnose → app 的循環依賴（邊界規則 5）。
 * app.ts 仍然對外轉出同一個常數，名字與數值不變。
 */
export const DEFAULT_STORAGE_TIMEOUT_MS = 2500;

export type StorageDiagnosisCode =
  | 'ok'
  | 'minio_unreachable'
  | 'bucket_missing'
  | 'permission_denied'
  | 'object_missing'
  | 'object_unreadable'
  | 'timeout'
  | 'storage_error';

export type StorageDiagnosis = {
  status: 'ok' | 'error';
  code: StorageDiagnosisCode;
  guidance: string;
};

export type StorageProbe = {
  /** 用來證明「不只知道 bucket 在，還讀得到物件」。 */
  probeKey: string;
  headBucket: () => Promise<void>;
  headObject: (key: string) => Promise<boolean>;
  /**
   * bucket 是否完全沒有物件。全新安裝時探測物件本來就不存在，
   * 這種「空」不是資料遺失；沒有這個探測就分不出兩者。
   */
  bucketIsEmpty?: () => Promise<boolean>;
};

const GUIDE_SUFFIX =
  '在本機執行 npm run storage:check 取得完整檢查（包含資料目錄）；還原步驟見 docs/backup-restore.md。';

const TIMEOUT_MARKER = 'StorageDiagnosisTimeout';

function timeoutError(): Error {
  const error = new Error('storage 診斷逾時');
  error.name = TIMEOUT_MARKER;
  return error;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

function classify(error: unknown): Exclude<StorageDiagnosisCode, 'ok'> {
  if (typeof error !== 'object' || error === null) {
    return 'minio_unreachable';
  }

  const candidate = error as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  if (candidate.name === TIMEOUT_MARKER) {
    return 'timeout';
  }

  if (candidate.$metadata?.httpStatusCode === 404 || candidate.name === 'NotFound') {
    return 'bucket_missing';
  }

  if (
    candidate.code === 'EACCES' ||
    candidate.code === 'EPERM' ||
    candidate.name === 'AccessDenied' ||
    candidate.$metadata?.httpStatusCode === 403
  ) {
    return 'permission_denied';
  }

  return 'minio_unreachable';
}

const GUIDANCE: Record<Exclude<StorageDiagnosisCode, 'ok'>, string> = {
  minio_unreachable: `連不上 MinIO：先確認 storage 容器在跑（docker compose up -d storage）。${GUIDE_SUFFIX}`,
  bucket_missing: `bucket 不見了：不要建立空 bucket 當成已修好，先還原。${GUIDE_SUFFIX}`,
  permission_denied: `權限不足：檢查 MinIO 帳密是否與資料一起還原。${GUIDE_SUFFIX}`,
  object_missing: `探測物件不見了：bucket 在但資料不在。${GUIDE_SUFFIX}`,
  object_unreadable: `探測物件讀取失敗：通常是權限或磁碟錯誤。${GUIDE_SUFFIX}`,
  timeout: `檢查逾時：storage 沒有在時限內回應。${GUIDE_SUFFIX}`,
  storage_error: `storage 診斷未設定或發生未預期的錯誤。${GUIDE_SUFFIX}`,
};

function failure(code: Exclude<StorageDiagnosisCode, 'ok'>): StorageDiagnosis {
  return { status: 'error', code, guidance: GUIDANCE[code] };
}

/**
 * 回傳一個延遲執行的診斷函式。每次呼叫都重新探測，不快取：
 * 快取會令「已經修好了」與「其實仍然壞」都看不出來。
 */
export function createStorageDiagnosis(
  probe: StorageProbe,
  timeoutMs: number = DEFAULT_STORAGE_TIMEOUT_MS,
): () => Promise<StorageDiagnosis> {
  return async (): Promise<StorageDiagnosis> => {
    try {
      const bucket = await withTimeout(probe.headBucket(), timeoutMs);
      void bucket;
    } catch (error) {
      return failure(classify(error));
    }

    try {
      const found = await withTimeout(probe.headObject(probe.probeKey), timeoutMs);

      if (found) {
        return { status: 'ok', code: 'ok', guidance: '' };
      }

      // bucket 完全沒有物件：這是全新安裝，不是資料遺失。
      if (probe.bucketIsEmpty !== undefined && (await probe.bucketIsEmpty())) {
        return { status: 'ok', code: 'ok', guidance: '' };
      }

      return failure('object_missing');
    } catch (error) {
      const code = classify(error);

      // bucket 已經通了，所以「讀不到物件」不是連線問題，而是物件本身的問題。
      if (code === 'timeout' || code === 'permission_denied') {
        return failure(code);
      }

      return failure('object_unreadable');
    }
  };
}
