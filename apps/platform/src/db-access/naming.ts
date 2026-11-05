import { ID_PATTERN } from '@company-os/contracts';

/**
 * app 資料庫帳號的命名（issue #88）。
 *
 * 命名權只在這裡：manifest 的 id、schema 名、role 名、`APP_DB_*` 變數名四者的
 * 對應關係寫死在一個地方，工具與 app-host 都經這個模組，不各自拼字串。
 *
 * 為甚麼要檢查碰撞：Postgres 的識別碼上限 63 bytes，而 env 變數名要轉大寫。
 * 「截斷之後勉強過關」等於兩個 app 共用一個帳號 —— 那種錯誤在功能測試裡看不到，
 * 只會在某一日發現 A 部門讀到 B 部門的資料。所以寧願拒絕，不願截斷。
 */

/** schema 名就是 app id，與 #75／#77 的單一契約一致。 */
export function schemaNameFor(appId: string): string {
  if (!ID_PATTERN.test(appId)) {
    throw new Error(`app id 不合法：${JSON.stringify(appId)}（只可以小寫字母開頭、小寫英數與底線）`);
  }

  return appId;
}

/** runtime LOGIN role 的固定前綴。改這個等於換一套帳號，已部署的環境會全部對不上。 */
export const ROLE_PREFIX = 'co_app_';

/** Postgres 識別碼上限（bytes）。 */
export const MAX_IDENTIFIER_BYTES = 63;

export function roleNameFor(appId: string): string {
  const schema = schemaNameFor(appId);
  const role = `${ROLE_PREFIX}${schema}`;

  if (Buffer.byteLength(role, 'utf8') > MAX_IDENTIFIER_BYTES) {
    throw new Error(
      `app id 太長：${appId}（role 名 ${role} 超過 ${MAX_IDENTIFIER_BYTES} bytes，不可以用截斷解決）`,
    );
  }

  return role;
}

/** `APP_DB_<ID>_USER`／`APP_DB_<ID>_PASSWORD`，與 app-host 讀的是同一組名字。 */
export function envNamesFor(appId: string): { user: string; password: string } {
  const key = schemaNameFor(appId).toUpperCase();

  return { user: `APP_DB_${key}_USER`, password: `APP_DB_${key}_PASSWORD` };
}

export type AppTarget = {
  appId: string;
  schema: string;
  role: string;
  env: { user: string; password: string };
};

/**
 * 把 app id 清單變成目標清單，同時檢查重複與碰撞。
 *
 * 兩種碰撞都要擋：
 *   1. 同一個 id 出現兩次 —— 呼叫者以為設定了兩個 app。
 *   2. 兩個 id 對應到同一個 role 或同一組 env 名 —— 只可能來自大小寫或截斷，
 *      兩者都是「以為分開了，其實共用」。
 */
export function resolveTargets(appIds: readonly string[]): AppTarget[] {
  if (appIds.length === 0) {
    throw new Error('至少要指定一個 app（--apps a,b）');
  }

  const seenIds = new Set<string>();
  const seenRoles = new Map<string, string>();
  const seenEnv = new Map<string, string>();
  const targets: AppTarget[] = [];

  for (const appId of appIds) {
    if (seenIds.has(appId)) {
      throw new Error(`app id 重複：${appId}`);
    }
    seenIds.add(appId);

    const target: AppTarget = {
      appId,
      schema: schemaNameFor(appId),
      role: roleNameFor(appId),
      env: envNamesFor(appId),
    };

    const roleOwner = seenRoles.get(target.role);
    if (roleOwner !== undefined) {
      throw new Error(`role 名碰撞：${roleOwner} 與 ${appId} 都會用 ${target.role}`);
    }
    seenRoles.set(target.role, appId);

    for (const name of [target.env.user, target.env.password]) {
      const envOwner = seenEnv.get(name);
      if (envOwner !== undefined) {
        throw new Error(`env 名碰撞：${envOwner} 與 ${appId} 都會用 ${name}`);
      }
      seenEnv.set(name, appId);
    }

    targets.push(target);
  }

  return targets;
}

/** 由 `--apps` 的字串拆出 id；空白與空字串一律當沒有。 */
export function parseAppList(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}
