import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 模組註冊（R4／issue #74）。
 *
 * 「有哪些 app」只有 apps/<id>/manifest.json 這一個來源：刪資料夾就是卸載，
 * 加資料夾就是安裝。載入在啟動時做一次，沒有熱重載 —— 換模組就是重啟，
 * 這樣「正在跑的系統」與「磁碟上的清單」永遠一致。
 *
 * apps/ 底下同時住兩種東西：
 *   - 有 manifest.json 的 → 這是一個 app（模組）。
 *   - 只有 package.json 的 → 一般服務（apps/platform、apps/web），不是模組，忽略。
 *   - 兩者都沒有 → 孤立資料夾，多數是搬錯位置或漏了檔案，啟動失敗。
 * 這個分辨很重要：沒有它，apps/platform 會被當成壞掉的模組，服務起不來。
 *
 * 任何一個 manifest 有問題都是啟動失敗，訊息要指出哪個檔、哪個欄位、為甚麼。
 */

export type ModuleKind = 'console' | 'department';

/** 誰可以見到這個 app。預設 internal（只有自己人）。 */
export type ModuleExposure = 'internal' | 'partner' | 'customer';

export const DEFAULT_EXPOSURE: ModuleExposure = 'internal';

export type ModuleManifest = {
  id: string;
  title: string;
  kind: ModuleKind;
  department: string | null;
  order: number;
  available: boolean;
  route: string;
  exposure: ModuleExposure;
  sensitive: boolean;
};

export type ModuleRegistry = {
  /** 依 order 排序；回傳副本，呼叫者改不到內部狀態。 */
  listModules: () => ModuleManifest[];
  /** 有模組的部門鍵，依 order 排序。 */
  departmentKeys: () => string[];
};

/**
 * 掃描根的顯示名稱。載入器收的是一個目錄路徑，但錯誤訊息要講「apps」——
 * 路徑可能是 repo 的 apps/，也可能是映像內的 /app/apps，講絕對路徑對人沒有幫助。
 */
const APP_ROOT = 'apps';

/** manifest 允許的欄位，一個不多一個不少。 */
const FIELDS = [
  'id',
  'title',
  'kind',
  'department',
  'order',
  'available',
  'route',
  'exposure',
  'sensitive',
] as const;

const EXPOSURES: readonly ModuleExposure[] = ['internal', 'partner', 'customer'];

/** 資料夾名與 id 的格式：小寫字母開頭，只可以小寫字母、數字、底線。 */
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export class ModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleError';
  }
}

type RawModule = {
  folder: string;
  record: Record<string, unknown>;
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 只驗一個 manifest 的欄位；跨模組的重複與 console 數量另外查。 */
function validateFields(raw: RawModule): { manifest?: ModuleManifest; errors: string[] } {
  const where = `${APP_ROOT}/${raw.folder}/manifest.json`;
  const record = raw.record;
  const errors: string[] = [];

  for (const key of Object.keys(record)) {
    if (!(FIELDS as readonly string[]).includes(key)) {
      errors.push(`${where}：未知欄位 ${key}（只可以有 ${FIELDS.join('、')}）`);
    }
  }

  const id = record.id;
  if (typeof id !== 'string' || id.trim() === '') {
    errors.push(`${where}：id 必須是非空字串`);
  } else if (!ID_PATTERN.test(id)) {
    errors.push(
      `${where}：id 格式不對（${id}）—— 只可以小寫英文字母、數字、底線，並以字母開頭`,
    );
  } else if (id !== raw.folder) {
    errors.push(`${where}：id 必須等於資料夾名（id=${id}，資料夾=${raw.folder}）`);
  }

  const title = record.title;
  if (typeof title !== 'string' || title.trim() === '') {
    errors.push(`${where}：title 必須是非空字串`);
  }

  const kind = record.kind;
  if (kind !== 'console' && kind !== 'department') {
    errors.push(`${where}：kind 必須是 console 或 department（現在是 ${JSON.stringify(kind)}）`);
  }

  const department = record.department;
  if (department !== null && typeof department !== 'string') {
    errors.push(`${where}：department 必須是字串或 null`);
  } else if (typeof department === 'string' && department.trim() === '') {
    errors.push(`${where}：department 不可以是空字串（沒有部門請填 null）`);
  }

  if (kind === 'console' && department !== null) {
    errors.push(`${where}：kind 是 console 時 department 必須是 null`);
  }

  if (kind === 'department' && typeof department !== 'string') {
    errors.push(`${where}：kind 是 department 時 department 必填`);
  }

  const order = record.order;
  if (typeof order !== 'number' || !Number.isInteger(order)) {
    errors.push(`${where}：order 必須是整數（現在是 ${JSON.stringify(order)}）`);
  }

  const available = record.available;
  if (typeof available !== 'boolean') {
    errors.push(`${where}：available 必須是 true 或 false（現在是 ${JSON.stringify(available)}）`);
  }

  // R4：route 是 app 掛在哪條路徑的宣告。唯一性在下面跨模組查。
  const route = record.route;
  if (typeof route !== 'string' || route.trim() === '') {
    errors.push(`${where}：route 必須是非空字串，而且以 / 開頭`);
  } else if (!route.startsWith('/')) {
    errors.push(`${where}：route 必須以 / 開頭（現在是 ${JSON.stringify(route)}）`);
  }

  // R4：exposure 可以省略，省略就是 internal；但填了錯的值要報，不會默默降級。
  const exposure = record.exposure;
  let exposureValue: ModuleExposure = DEFAULT_EXPOSURE;

  if (exposure !== undefined) {
    if (typeof exposure !== 'string' || !(EXPOSURES as readonly string[]).includes(exposure)) {
      errors.push(
        `${where}：exposure 必須是 ${EXPOSURES.join('、')} 其中之一（現在是 ${JSON.stringify(exposure)}）`,
      );
    } else {
      exposureValue = exposure as ModuleExposure;
    }
  }

  // R4：sensitive 沒有預設值。「未講」不可以當成「不敏感」。
  const sensitive = record.sensitive;
  if (typeof sensitive !== 'boolean') {
    errors.push(`${where}：sensitive 必須是 true 或 false（現在是 ${JSON.stringify(sensitive)}）`);
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    manifest: {
      id: id as string,
      title: title as string,
      kind: kind as ModuleKind,
      department: department as string | null,
      order: order as number,
      available: available as boolean,
      route: route as string,
      exposure: exposureValue,
      sensitive: sensitive as boolean,
    },
  };
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

  const raws: RawModule[] = [];
  const manifests: ModuleManifest[] = [];

  for (const folder of folders.sort()) {
    const file = join(dir, folder, 'manifest.json');

    if (!existsSync(file)) {
      // 有 package.json 的是服務（apps/platform、apps/web），不是模組。
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

    const raw: RawModule = { folder, record: parsed as Record<string, unknown> };
    raws.push(raw);

    const result = validateFields(raw);
    errors.push(...result.errors);

    if (result.manifest !== undefined) {
      manifests.push(result.manifest);
    }
  }

  // 跨模組的檢查用原始欄位，不受其他欄位的錯誤影響 —— 一次過報齊。
  const seenIds = new Map<string, string>();
  const seenDepartments = new Map<string, string>();
  const seenRoutes = new Map<string, string>();
  const consoles: string[] = [];

  for (const raw of raws) {
    const where = `${APP_ROOT}/${raw.folder}/manifest.json`;

    const id = raw.record.id;
    if (typeof id === 'string' && id.trim() !== '') {
      const previous = seenIds.get(id);
      if (previous !== undefined) {
        errors.push(`${where}：id ${id} 與 ${APP_ROOT}/${previous} 重複`);
      } else {
        seenIds.set(id, raw.folder);
      }
    }

    const department = raw.record.department;
    if (typeof department === 'string' && department.trim() !== '') {
      const previous = seenDepartments.get(department);
      if (previous !== undefined) {
        errors.push(`${where}：department ${department} 與 ${APP_ROOT}/${previous} 重複`);
      } else {
        seenDepartments.set(department, raw.folder);
      }
    }

    // R4：兩個 app 掛同一條 route，等於有一條永遠到不了。
    const route = raw.record.route;
    if (typeof route === 'string' && route.trim() !== '') {
      const previous = seenRoutes.get(route);
      if (previous !== undefined) {
        errors.push(`${where}：route ${route} 與 ${APP_ROOT}/${previous} 重複`);
      } else {
        seenRoutes.set(route, raw.folder);
      }
    }

    if (raw.record.kind === 'console') {
      consoles.push(raw.folder);
    }
  }

  if (consoles.length > 1) {
    errors.push(`只能有一個 console 模組，現在有 ${consoles.length} 個：${consoles.join('、')}`);
  }

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
