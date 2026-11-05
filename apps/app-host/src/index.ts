import type { Pool } from 'pg';
import { AppHostError, readConfig } from './config';
import { buildHost, type BuiltHost, type ModuleLoader } from './host';

/**
 * 啟動入口。兩件事：讀環境、建 host、監聽。
 *
 * 任何錯誤都令程序以非 0 退出並印出原因 —— 載入了壞 app 的 host 不應該看起來健康。
 * `runMain` 回傳退出碼（而不是直接 `process.exit`），測試才可以驗「非 0」這件事
 * 而不用真的殺掉一個程序。
 */

export type RunOptions = {
  loadModule?: ModuleLoader;
  /** #88：單元測試冇真資料庫，可以注入 no-op；正式路徑不傳。 */
  verifyRole?: (pool: Pool, role: string) => Promise<void>;
  /** 測試用：`false` 代表只建 host 不監聽。 */
  listen?: boolean;
  logLine?: (line: string) => void;
  logError?: (line: string) => void;
};

export async function runMain(
  env: NodeJS.ProcessEnv,
  options: RunOptions = {},
): Promise<{ code: number; host?: BuiltHost }> {
  const logLine = options.logLine ?? ((line: string) => console.log(line));
  const logError = options.logError ?? ((line: string) => console.error(line));

  let host: BuiltHost | undefined;

  try {
    const config = readConfig(env);
    host = await buildHost({
      config,
      env,
      ...(options.loadModule === undefined ? {} : { loadModule: options.loadModule }),
      ...(options.verifyRole === undefined ? {} : { verifyRole: options.verifyRole }),
      log: {
        info: logLine,
        warn: logError,
        error: logError,
      },
    });

    if (options.listen !== false) {
      const address = await host.server.listen({ host: '0.0.0.0', port: config.port });
      logLine(`app-host 已啟動：${address}（APP_SET=${config.appIds.join(',') || '（空）'}）`);
    }

    return { code: 0, host };
  } catch (error) {
    logError(error instanceof AppHostError ? error.message : `app-host 啟動失敗：${String(error)}`);
    return { code: 1, ...(host === undefined ? {} : { host }) };
  }
}

// 真正的入口在 main.ts：這裡保持零副作用，測試才可以 import runMain 而
// 不順便啟動一個監聽中的行程。
