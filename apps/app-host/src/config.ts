/**
 * app-host 的啟動設定：全部來自環境變數。
 *
 * `APP_SET` 是這個容器要載入哪些 app 的唯一來源（決策 C32）。空字串或未設定
 * 代表不載入任何 app —— 容器仍然要正常啟動，因為 compose 的 `apps` 服務
 * 是常設的，未指定 APP_SET 時它就是一個健康的空殼。
 */

export const DEFAULT_APPS_DIR = '/app/apps';

/** 容器內一律監聽 8080（REPO-MAP 端口規則第 2 條）。 */
export const DEFAULT_PORT = 8080;

export class AppHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppHostError';
  }
}

export type HostConfig = {
  /** 要載入的 app id，次序就是 APP_SET 的次序。重複留給 manifests 那邊報錯。 */
  appIds: string[];
  appsDir: string;
  port: number;
};

export function parseAppSet(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function resolveDir(raw: string | undefined): string {
  return raw === undefined || raw.trim() === '' ? DEFAULT_APPS_DIR : raw.trim();
}

function resolvePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORT;
  }

  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new AppHostError(`PORT 不是有效端口：${value}`);
  }

  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new AppHostError(`PORT 超出 1–65535：${value}`);
  }

  return port;
}

export function readConfig(env: NodeJS.ProcessEnv): HostConfig {
  return {
    appIds: parseAppSet(env.APP_SET),
    appsDir: resolveDir(env.APPS_DIR),
    port: resolvePort(env.PORT),
  };
}

/** `APP_DB_<ID>_USER`／`APP_DB_<ID>_PASSWORD` 的變數名稱。 */
export function databaseEnvNames(appId: string): { user: string; password: string } {
  const key = appId.toUpperCase();
  return { user: `APP_DB_${key}_USER`, password: `APP_DB_${key}_PASSWORD` };
}
