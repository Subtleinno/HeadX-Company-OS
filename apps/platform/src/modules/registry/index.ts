import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_ROOT,
  DEFAULT_EXPOSURE,
  validateManifest,
  validateManifests,
  type ModuleExposure,
  type ModuleKind,
  type ModuleManifest,
  type RawManifest,
} from '@company-os/contracts';

/**
 * 模組註冊（R4／issue #74；R8 起驗證邏輯搬到 `packages/contracts`）。
 *
 * 「有哪些 app」只有 apps/<id>/manifest.json 這一個來源：刪資料夾就是卸載，
 * 加資料夾就是安裝。載入在啟動時做一次，沒有熱重載 —— 換模組就是重啟，
 * 這樣「正在跑的系統」與「磁碟上的清單」永遠一致。
 *
 * apps/ 底下同時住兩種東西：
 *   - 有 manifest.json 的 → 這是一個 app（模組）。
 *   - 只有 package.json 的 → 一般服務（apps/platform、apps/web、apps/app-host），不是模組，忽略。
 *   - 兩者都沒有 → 孤立資料夾，多數是搬錯位置或漏了檔案，啟動失敗。
 * 這個分辨很重要：沒有它，apps/platform 會被當成壞掉的模組，服務起不來。
 *
 * 任何一個 manifest 有問題都是啟動失敗，訊息要指出哪個檔、哪個欄位、為甚麼。
 * 欄位驗證在 contracts；這裡只負責掃描資料夾、讀檔、以及跨 manifest 的檢查。
 */

export type { ModuleExposure, ModuleKind, ModuleManifest };
export { DEFAULT_EXPOSURE };

export type ModuleRegistry = {
  /** 依 order 排序；回傳副本，呼叫者改不到內部狀態。 */
  listModules: () => ModuleManifest[];
  /** 有模組的部門鍵，依 order 排序。 */
  departmentKeys: () => string[];
};

export class ModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleError';
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 讀入一個 apps 目錄。任何錯誤一次全部列出，不是只報第一個 ——
 * 修 manifest 時不用重複啟動去捉下一個錯。
 */
export function loadModules(dir: string): ModuleRegistry {
  const errors: string[] = [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new ModuleError(`無法讀取 app 目錄 ${dir}：${describe(error)}`);
  }

  const folders: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      folders.push(entry.name);
      continue;
    }

    // apps/ 下只可以有 app 與服務資料夾；散落的檔案代表有人放錯了位置。
    errors.push(
      `${APP_ROOT}/${entry.name}：孤立檔案 —— ${APP_ROOT}/ 下只可以放資料夾（app 用 <id>/manifest.json，服務用 package.json）`,
    );
  }

  const raws: RawManifest[] = [];
  const manifests: ModuleManifest[] = [];

  for (const folder of folders.sort()) {
    const file = join(dir, folder, 'manifest.json');

    if (!existsSync(file)) {
      // 有 package.json 的是服務（apps/platform、apps/web、apps/app-host），不是模組。
      if (existsSync(join(dir, folder, 'package.json'))) {
        continue;
      }

      errors.push(
        `${APP_ROOT}/${folder}：孤立資料夾 —— 既沒有 manifest.json（app），也沒有 package.json（服務）`,
      );
      continue;
    }

    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      errors.push(`${APP_ROOT}/${folder}/manifest.json：讀不到（${describe(error)}）`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      errors.push(`${APP_ROOT}/${folder}/manifest.json：不是合法的 JSON（${describe(error)}）`);
      continue;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push(`${APP_ROOT}/${folder}/manifest.json：最外層必須是一個物件`);
      continue;
    }

    const record = parsed as Record<string, unknown>;
    raws.push({ folder, record });

    const result = validateManifest(folder, record);
    errors.push(...result.errors);

    if (result.manifest !== undefined) {
      manifests.push(result.manifest);
    }
  }

  errors.push(...validateManifests(raws));

  if (errors.length > 0) {
    throw new ModuleError(errors.join('\n'));
  }

  const modules = manifests.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    listModules: () => modules.map((item) => ({ ...item })),
    departmentKeys: () =>
      modules.filter((item) => item.department !== null).map((item) => item.department as string),
  };
}
