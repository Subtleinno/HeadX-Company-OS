import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/**
 * 備份的 manifest：機器可讀，記錄這次備份到底是什麼、由什麼版本產生、
 * 每個檔案的大小與 SHA-256。
 *
 * 不寫入任何檔案內容，也不寫入 .env 的值 —— 只寫路徑、大小、雜湊。
 */

export const BACKUP_FORMAT = 'company-os-backup';
export const FORMAT_VERSION = 1;

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

/** `YYYYMMDD-HHMMSS-<6 位十六進位>`，時間用 UTC，避免時區改變排序。 */
export function makeBackupId(date = new Date(), suffix = randomBytes(3).toString('hex')) {
  const stamp = [
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`,
  ].join('-');

  return `${stamp}-${suffix}`;
}

export function backupDirFor(root, backupId) {
  return join(root, 'company-os', backupId);
}

function sortByPath(files) {
  return [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

/**
 * 建 manifest。`consistency.verified` 不是 true 時，這份備份一律標成不可用（usable: false）：
 * 寧願講明「這份不能還原」，也不要讓人以為有備份。
 */
export function buildManifest(input) {
  const files = sortByPath(input.files).map((file) => ({
    path: file.path,
    kind: file.kind ?? 'file',
    sha256: file.sha256,
    size: file.size,
    ...(file.sensitive === true ? { sensitive: true } : {}),
    ...(file.objectKey === undefined ? {} : { objectKey: file.objectKey }),
    ...(file.contentType === undefined ? {} : { contentType: file.contentType }),
  }));

  const consistency = input.consistency ?? {
    verified: false,
    method: null,
    failure: '沒有記錄一致性策略',
  };

  return {
    format: BACKUP_FORMAT,
    version: FORMAT_VERSION,
    backupId: input.backupId,
    createdAt: input.createdAt,
    testOnly: input.testOnly === true,
    usable: consistency.verified === true,
    database: input.database ?? null,
    bucket: input.bucket ?? null,
    quiesce: input.quiesce ?? null,
    versions: input.versions ?? {},
    objects: input.objects ?? { count: 0, totalBytes: 0 },
    consistency,
    files,
    totals: {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
    },
  };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function invalid(message) {
  return { ok: false, code: 'manifest_invalid', message };
}

export function parseManifest(text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid('manifest.json 不是有效的 JSON');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalid('manifest.json 的最外層必須是物件');
  }

  if (parsed.format !== BACKUP_FORMAT) {
    return invalid(`format 不是 ${BACKUP_FORMAT}（收到 ${String(parsed.format)}）`);
  }

  if (parsed.version !== FORMAT_VERSION) {
    return invalid(`version 不是 ${FORMAT_VERSION}（收到 ${String(parsed.version)}）`);
  }

  if (typeof parsed.backupId !== 'string' || parsed.backupId === '') {
    return invalid('缺少 backupId');
  }

  if (!Array.isArray(parsed.files)) {
    return invalid('files 必須是陣列');
  }

  for (const file of parsed.files) {
    if (file === null || typeof file !== 'object') {
      return invalid('files 內有項目不是物件');
    }

    if (typeof file.path !== 'string' || file.path === '') {
      return invalid('files 內有項目缺少 path');
    }

    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      return invalid(`files 內 ${file.path} 缺少有效的 sha256`);
    }

    if (!Number.isInteger(file.size) || file.size < 0) {
      return invalid(`files 內 ${file.path} 的 size 不是非負整數`);
    }
  }

  return { ok: true, manifest: parsed };
}

/** checksums.sha256 的格式與 `sha256sum` 相同，方便用系統工具核對。 */
export function checksumsText(files) {
  return `${files.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`;
}

export function parseChecksums(text) {
  const entries = new Map();

  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line.trim());
    if (match !== null) {
      entries.set(match[2], match[1]);
    }
  }

  return entries;
}
