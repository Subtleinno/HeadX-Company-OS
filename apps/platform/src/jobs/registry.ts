import { JOB_TYPE_MAX_LENGTH, JOB_TYPE_PATTERN, type JobHandler } from './types.js';

/**
 * handler 註冊表（issue #85）。
 *
 * 這一層的唯一職責：type 一定要對應到程式裡明寫的函數。
 * 如果「要執行邊段程式」可以由 payload 或資料庫某一欄決定，那張表就變成
 * 遠端執行介面（import 路徑、SQL、shell 全部都會有人試）。
 * 所以註冊表是唯一入口，而且它同時是領取條件的來源。
 */

export type HandlerRegistry = {
  get: (type: string) => JobHandler | undefined;
  has: (type: string) => boolean;
  /** 固定的字母序，用來做領取條件與啟動日誌。 */
  types: () => readonly string[];
};

export function createHandlerRegistry(handlers: Record<string, JobHandler>): HandlerRegistry {
  for (const [type, handler] of Object.entries(handlers)) {
    if (typeof handler !== 'function') {
      throw new Error(`handler「${type}」不是函數：type 必須對應到一段程式`);
    }

    if (type.length > JOB_TYPE_MAX_LENGTH || !JOB_TYPE_PATTERN.test(type)) {
      throw new Error(
        `handler 的 type 格式不合法：${type}（要小寫字母開頭，只用小寫英數與底線，可以用點分段）`,
      );
    }
  }

  // 凍結副本：呼叫者之後改動原本的物件，不可以偷偷多註冊一個 handler。
  const frozen: Readonly<Record<string, JobHandler>> = Object.freeze({ ...handlers });
  const types: readonly string[] = Object.freeze(Object.keys(frozen).sort());

  return {
    get: (type) => (Object.hasOwn(frozen, type) ? frozen[type] : undefined),
    has: (type) => Object.hasOwn(frozen, type),
    types: () => types,
  };
}

/** 供 job 模組對外匯出。 */
export type { JobHandler };
