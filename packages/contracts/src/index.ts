/**
 * 跨 app 共用的型別與驗證。
 *
 * 規則（見 CODE-MAP）：**只放型別與驗證，不放邏輯**。這個 package 不引用 Fastify、pg
 * 或任何 app；它描述的形狀要兩邊都認得 —— platform 的模組註冊與 app-host 的載入器
 * 用同一份 manifest 驗證，才不會出現「platform 覺得合格、app-host 覺得不合格」。
 *
 * manifest 驗證的錯誤訊息文字是 #74 已經對外的行為，從 platform 搬過來時一個字都沒有改。
 */

export type ModuleKind = 'console' | 'department';

/** 誰可以見到這個 app。預設 internal（只有自己人）。 */
export type ModuleExposure = 'internal' | 'partner' | 'customer';

export const DEFAULT_EXPOSURE: ModuleExposure = 'internal';

/** manifest 允許的欄位，一個不多一個不少。 */
export const MANIFEST_FIELDS = [
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

export const EXPOSURES: readonly ModuleExposure[] = ['internal', 'partner', 'customer'];

/** 資料夾名與 id 的格式：小寫字母開頭，只可以小寫字母、數字、底線。 */
export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * 掃描根的顯示名稱。呼叫者收的是一個目錄路徑，但錯誤訊息要講「apps」——
 * 路徑可能是 repo 的 apps/，也可能是映像內的 /app/apps，講絕對路徑對人沒有幫助。
 */
export const APP_ROOT = 'apps';

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

/** 一個待驗證的 manifest：資料夾名 + 已 parse 的 JSON 物件。 */
export type RawManifest = {
  folder: string;
  record: Record<string, unknown>;
};

export type ManifestValidation = {
  manifest?: ModuleManifest;
  errors: string[];
};

/**
 * 只驗一個 manifest 的欄位。跨 manifest 的重複與 console 數量由 `validateManifests` 查。
 * 一次過報齊所有問題，不是只報第一個 —— 修 manifest 時不用重複啟動去捉下一個錯。
 */
export function validateManifest(folder: string, record: Record<string, unknown>): ManifestValidation {
  const where = `${APP_ROOT}/${folder}/manifest.json`;
  const errors: string[] = [];

  for (const key of Object.keys(record)) {
    if (!(MANIFEST_FIELDS as readonly string[]).includes(key)) {
      errors.push(`${where}：未知欄位 ${key}（只可以有 ${MANIFEST_FIELDS.join('、')}）`);
    }
  }

  const id = record.id;
  if (typeof id !== 'string' || id.trim() === '') {
    errors.push(`${where}：id 必須是非空字串`);
  } else if (!ID_PATTERN.test(id)) {
    errors.push(
      `${where}：id 格式不對（${id}）—— 只可以小寫英文字母、數字、底線，並以字母開頭`,
    );
  } else if (id !== folder) {
    errors.push(`${where}：id 必須等於資料夾名（id=${id}，資料夾=${folder}）`);
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

  const route = record.route;
  if (typeof route !== 'string' || route.trim() === '') {
    errors.push(`${where}：route 必須是非空字串，而且以 / 開頭`);
  } else if (!route.startsWith('/')) {
    errors.push(`${where}：route 必須以 / 開頭（現在是 ${JSON.stringify(route)}）`);
  }

  // exposure 可以省略，省略就是 internal；但填了錯的值要報，不會默默降級。
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

  // sensitive 沒有預設值。「未講」不可以當成「不敏感」。
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
 * 跨 manifest 的檢查：id、department、route 不可以重複；最多一個 console。
 * 用原始欄位判斷，不受其他欄位的錯誤影響 —— 一次過報齊。
 */
export function validateManifests(raws: readonly RawManifest[]): string[] {
  const errors: string[] = [];
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

  return errors;
}

// ---------------------------------------------------------------------------
// app 模組的約定（app-host 與 app 之間的介面）
// ---------------------------------------------------------------------------

/**
 * app 拿到的日誌。只要求 info／warn／error 三個方法，不綁定 Fastify 的 logger 型別。
 */
export type AppLog = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

/**
 * app 拿到的資料庫連線。結構上與 pg 的 Pool／PoolClient 相容（都有 `query`），
 * 但這裡不引用 pg，contracts 才可以保持零依賴。
 */
export type AppDatabase = {
  query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
};

export type AppContext = {
  appId: string;
  log: AppLog;
  /** app 專用帳號的連線，search_path 只有自己的 schema；不需要資料庫的 app 收到 null。 */
  db: AppDatabase | null;
};

/**
 * app 的 `src/index.ts` 必須匯出的東西。
 *
 * 泛型 `TApp` 是 Fastify 實例；app-host 用 `AppModule<FastifyInstance>`，
 * app 那邊寫 `AppModule` 就已足夠（結構相同）。
 *
 * `needsDatabase` 是 app 自己的宣告（不是 manifest 的欄位 —— manifest 的九個欄位
 * 由 #74 鎖定，加第十個會撞到「未知欄位」的閘門）。宣告 true 而環境沒有提供
 * `APP_DB_<ID>_USER`／`APP_DB_<ID>_PASSWORD` 時，app-host 會拒絕啟動。
 */
export type AppModule<TApp = unknown> = {
  needsDatabase?: boolean;
  registerApi: (app: TApp, ctx: AppContext) => void | Promise<void>;
};
