import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 模組註冊。
 *
 * 「有哪些部門」只有 modules/<id>/manifest.json 這一個來源：刪資料夾就是卸載，
 * 加資料夾就是安裝。載入在啟動時做一次，沒有熱重載 —— 換模組就是重啟，
 * 這樣「正在跑的系統」與「磁碟上的清單」永遠一致。
 *
 * 任何一個 manifest 有問題都是啟動失敗，訊息要指出哪個檔、哪個欄位、為甚麼。
 */

export type ModuleKind = 'console' | 'department';

export type ModuleManifest = {
  id: string;
  title: string;
  kind: ModuleKind;
  department: string | null;
  order: number;
  available: boolean;
};

export type ModuleRegistry = {
  /** 依 order 排序；回傳副本，呼叫者改不到內部狀態。 */
  listModules: () => ModuleManifest[];
  /** 有模組的部門鍵，依 order 排序。 */
  departmentKeys: () => string[];
};

/** manifest 允許的欄位，一個不多一個不少。 */
const FIELDS = ['id', 'title', 'kind', 'department', 'order', 'available'] as const;

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
  const where = `modules/${raw.folder}/manifest.json`;
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
    },
  };
}

/**
 * 讀入一個模組目錄。任何錯誤一次全部列出，不是只報第一個 ——
 * 修 manifest 時不用重複啟動去捉下一個錯。
 */
export function loadModules(dir: string): ModuleRegistry {
  const errors: string[] = [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new ModuleError(`無法讀取模組目錄 ${dir}：${describe(error)}`);
  }

  const folders: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      folders.push(entry.name);
      continue;
    }

    // modules/ 下只可以有模組資料夾；散落的檔案代表有人放錯了位置。
    errors.push(
      `modules/${entry.name}：孤立檔案 —— modules/ 下只可以放 <id>/manifest.json 的資料夾`,
    );
  }

  const raws: RawModule[] = [];
  const manifests: ModuleManifest[] = [];

  for (const folder of folders.sort()) {
    const file = join(dir, folder, 'manifest.json');

    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      errors.push(`modules/${folder}：資料夾內沒有 manifest.json`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      errors.push(`modules/${folder}/manifest.json：不是合法的 JSON（${describe(error)}）`);
      continue;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push(`modules/${folder}/manifest.json：最外層必須是一個物件`);
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
  const consoles: string[] = [];

  for (const raw of raws) {
    const where = `modules/${raw.folder}/manifest.json`;

    const id = raw.record.id;
    if (typeof id === 'string' && id.trim() !== '') {
      const previous = seenIds.get(id);
      if (previous !== undefined) {
        errors.push(`${where}：id ${id} 與 modules/${previous} 重複`);
      } else {
        seenIds.set(id, raw.folder);
      }
    }

    const department = raw.record.department;
    if (typeof department === 'string' && department.trim() !== '') {
      const previous = seenDepartments.get(department);
      if (previous !== undefined) {
        errors.push(`${where}：department ${department} 與 modules/${previous} 重複`);
      } else {
        seenDepartments.set(department, raw.folder);
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
