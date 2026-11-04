import { Pool } from 'pg';
import { AppHostError, databaseEnvNames } from './config';

/**
 * 每個 app 用自己的資料庫帳號，連線之後 `search_path` 只有自己的 schema。
 *
 * 兩件事要分清楚：
 *   1. `search_path` 只控制未限定名稱怎樣解析，**不是權限隔離**（見 #75 的說明）。
 *   2. 真正擋住「讀 public 的表」的是該帳號的 ACL —— 帳號由 #88 建立，
 *      本張只消費環境提供的帳號，不會回退用共用或超級帳號。
 *
 * 為甚麼用 startup `options` 而不是連線後才 `SET`：Pool 會重用連線，
 * 連線後才 SET 有機會與第一條查詢競爭；`options` 是連線握手的一部分，沒有這個窗口。
 */

export type AppCredentials = { user: string; password: string };

export function resolveCredentials(
  appId: string,
  env: NodeJS.ProcessEnv,
): AppCredentials | null {
  const names = databaseEnvNames(appId);
  const rawUser = env[names.user];
  const rawPassword = env[names.password];

  const hasUser = rawUser !== undefined && rawUser.trim() !== '';
  const hasPassword = rawPassword !== undefined && rawPassword !== '';

  if (!hasUser && !hasPassword) {
    return null;
  }

  if (!hasUser || !hasPassword) {
    const missing = hasUser ? names.password : names.user;
    throw new AppHostError(
      `apps/${appId} 的資料庫帳號設定不完整：缺少 ${missing}（要一對 ${names.user} 與 ${names.password}）`,
    );
  }

  return { user: (rawUser as string).trim(), password: rawPassword as string };
}

export function requireCredentials(appId: string, env: NodeJS.ProcessEnv): AppCredentials {
  const credentials = resolveCredentials(appId, env);
  if (credentials === null) {
    const names = databaseEnvNames(appId);
    throw new AppHostError(
      `apps/${appId} 需要資料庫，但沒有設定 ${names.user} 與 ${names.password}（不會回退用共用帳號）`,
    );
  }

  return credentials;
}

/** app 的 schema 就是它的 id；`ID_PATTERN` 已保證只含小寫英數與底線。 */
export function createAppPool(appId: string, env: NodeJS.ProcessEnv, credentials: AppCredentials): Pool {
  return new Pool({
    host: env.PGHOST ?? 'db',
    port: Number(env.PGPORT ?? 5432),
    database: env.PGDATABASE ?? 'company_os',
    user: credentials.user,
    password: credentials.password,
    max: 4,
    // 只有自己的 schema，刻意不含 public 或 $user。
    options: `-c search_path=${appId}`,
  });
}
