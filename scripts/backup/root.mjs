import fs from 'node:fs';
import path from 'node:path';

/**
 * 備份根目錄的閘門。
 *
 * 核心規則：備份不可以與來源在同一粒實體碟。這部機的資料在 C:（系統碟），
 * 所以 C: 一律拒絕 —— 「備份」寫在同一粒碟上，碟壞了就一起消失。
 *
 * 唯一的例外是明確標記的測試用資料夾（路徑含 TEST-ONLY，而且呼叫端要明示開啟），
 * 給「這部機真的只有一粒碟」的驗收用，manifest 會記住這份備份是測試用的。
 */

const TEST_ONLY_MARKER = /(^|[\\/])test-only([\\/]|$)/i;

const GUIDE_SET_ROOT =
  '在 .env 設定 COMPANY_OS_BACKUP_ROOT，指向 C: 以外的另一粒實體碟（例如 D:/company-os-backups）。';

function fail(code, message, guidance) {
  return { ok: false, code, message, guidance };
}

function isInside(child, parent, separators) {
  const normalize = (value) => (separators.win32 ? value.toLowerCase() : value);
  const target = normalize(child);
  const base = normalize(parent);

  if (target === base) {
    return true;
  }

  const withSeparator = /[\\/]$/.test(base) ? base : `${base}${separators.sep}`;
  return target.startsWith(withSeparator);
}

/** 真的碰檔案系統的探測；測試會注入自己的版本。 */
export function realProbe() {
  return {
    exists: (target) => {
      try {
        fs.statSync(target);
        return true;
      } catch {
        return false;
      }
    },
    isDirectory: (target) => {
      try {
        return fs.statSync(target).isDirectory();
      } catch {
        return false;
      }
    },
    isWritable: (target) => {
      try {
        fs.accessSync(target, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function evaluateBackupRoot(options = {}) {
  const {
    root,
    platform = process.platform,
    systemDrive = process.env.SystemDrive ?? 'C:',
    sourcePaths = [],
    allowTestOnly = false,
    probe,
  } = options;

  const win32 = platform === 'win32';
  const paths = win32 ? path.win32 : path.posix;
  const separators = { win32, sep: paths.sep };

  const raw = typeof root === 'string' ? root.trim() : '';

  if (raw === '') {
    return fail('backup_root_unset', '未設定 COMPANY_OS_BACKUP_ROOT，備份不會寫到任何地方。', GUIDE_SET_ROOT);
  }

  if (!paths.isAbsolute(raw)) {
    return fail(
      'backup_root_relative',
      `備份根目錄必須是絕對路徑，收到：${raw}`,
      GUIDE_SET_ROOT,
    );
  }

  const resolved = paths.resolve(raw);

  for (const source of sourcePaths) {
    if (typeof source !== 'string' || source.trim() === '') {
      continue;
    }

    const sourceResolved = paths.resolve(source.trim());

    if (isInside(resolved, sourceResolved, separators)) {
      return fail(
        'backup_root_inside_source',
        `備份根目錄位於來源資料之內：${resolved}（來源 ${sourceResolved}）`,
        '備份要與來源分開：指到另一粒碟上與資料無關的資料夾。',
      );
    }
  }

  const drive = paths.parse(resolved).root;
  const systemRoot = win32
    ? paths.parse(paths.resolve(`${systemDrive.replace(/[\\/]+$/, '')}\\`)).root
    : '/';
  const onSystemDrive = drive.toUpperCase() === systemRoot.toUpperCase();

  let testOnly = false;

  if (onSystemDrive) {
    if (!allowTestOnly) {
      return fail(
        'backup_root_on_system_drive',
        `備份根目錄在系統碟 ${drive} 上：${resolved}`,
        '換到另一粒實體碟。只有一粒碟的機器，備份與資料會一起消失。',
      );
    }

    if (!TEST_ONLY_MARKER.test(resolved)) {
      return fail(
        'backup_root_test_only_unmarked',
        `開啟了測試用開關，但路徑沒有 TEST-ONLY 標記：${resolved}`,
        '測試用資料夾必須在路徑中包含 TEST-ONLY，避免這個開關被誤用到正式環境。',
      );
    }

    testOnly = true;
  }

  const fsProbe = probe ?? realProbe();

  if (!fsProbe.exists(resolved)) {
    return fail(
      'backup_root_missing',
      `備份根目錄不存在：${resolved}`,
      '先建立資料夾（本工具刻意不自動建立，避免打錯字時靜靜寫到別處）。',
    );
  }

  if (!fsProbe.isDirectory(resolved)) {
    return fail('backup_root_not_directory', `備份根目錄不是資料夾：${resolved}`, '指向一個資料夾。');
  }

  if (!fsProbe.isWritable(resolved)) {
    return fail(
      'backup_root_not_writable',
      `備份根目錄不可寫入：${resolved}`,
      '檢查磁碟是否接好、是否被設成唯讀，或改用有寫入權限的資料夾。',
    );
  }

  return {
    ok: true,
    root: resolved,
    drive,
    testOnly,
    warning: testOnly
      ? `這份備份會寫在系統碟上（${resolved}），只可用於 TEST-ONLY 驗收，不是真正的異碟備份。`
      : null,
  };
}
