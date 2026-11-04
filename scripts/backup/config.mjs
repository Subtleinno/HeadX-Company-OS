/**
 * 備份相關設定的讀取與驗證。
 *
 * 原則：寫錯的值要大聲報出來，不要靜靜退回預設。備份是最後一道防線，
 * 用錯的設定跑一整年而沒有人發現，比直接失敗更糟。
 */

/** 只有 api 會寫 Postgres 與 MinIO，所以備份期間暫停它就可以凍結寫入。 */
export const DEFAULT_QUIESCE_CONTAINERS = ['company-os-api-1'];

function readInteger(raw, fallback, minimum, name, errors) {
  const text = typeof raw === 'string' ? raw.trim() : '';

  if (text === '') {
    return fallback;
  }

  if (!/^\d+$/.test(text)) {
    errors.push(`${name} 必須是整數，收到：${text}`);
    return fallback;
  }

  const value = Number(text);

  if (value < minimum) {
    errors.push(`${name} 必須大於或等於 ${minimum}，收到：${text}`);
    return fallback;
  }

  return value;
}

export function readBackupConfig(env = process.env) {
  const errors = [];

  const rawRoot = typeof env.COMPANY_OS_BACKUP_ROOT === 'string' ? env.COMPANY_OS_BACKUP_ROOT.trim() : '';
  const root = rawRoot === '' ? null : rawRoot;

  const retention = readInteger(env.BACKUP_RETENTION, 7, 1, 'BACKUP_RETENTION', errors);
  const intervalHours = readInteger(env.BACKUP_INTERVAL_HOURS, 24, 0, 'BACKUP_INTERVAL_HOURS', errors);

  const rawContainers =
    typeof env.BACKUP_QUIESCE_CONTAINERS === 'string' ? env.BACKUP_QUIESCE_CONTAINERS : '';
  const listed = rawContainers
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

  return {
    root,
    retention,
    intervalHours,
    quiesceContainers: listed.length > 0 ? listed : [...DEFAULT_QUIESCE_CONTAINERS],
    errors,
  };
}
