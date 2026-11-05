/**
 * 指數退避（issue #85 第 4 點）。
 *
 * 純函數：時間與隨機都由外面入，所以測試完全沒有 sleep。
 * 上限一定要存在 —— 沒有上限的退避在「服務死了很久」之後等於永遠唔會再試。
 */

export type BackoffConfig = {
  /** 第 1 次失敗之後等幾久。 */
  initialMs: number;
  /** 任何一次都不會超過這個值。 */
  maxMs: number;
  /** 每次乘幾多。 */
  factor: number;
  /** 抖動比例，0 至 1；0.2 代表 ±20%。 */
  jitter: number;
};

export const DEFAULT_BACKOFF: BackoffConfig = {
  initialMs: 5000,
  maxMs: 300_000,
  factor: 2,
  jitter: 0.2,
};

/** 回傳所有問題；空陣列代表合法。設定錯誤寧願起不動，也不要靜靜用半套。 */
export function validateBackoff(config: BackoffConfig): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(config.initialMs) || config.initialMs < 1) {
    errors.push(`initialMs 必須是正整數（現在 ${String(config.initialMs)}）`);
  }

  if (!Number.isInteger(config.maxMs) || config.maxMs < config.initialMs) {
    errors.push(
      `maxMs 不可以小於 initialMs（現在 maxMs ${String(config.maxMs)}、initialMs ${String(config.initialMs)}）`,
    );
  }

  if (!(config.factor > 1)) {
    errors.push(`factor 必須大於 1（現在 ${String(config.factor)}）—— 否則「退避」其實是固定間隔`);
  }

  if (!(config.jitter >= 0) || config.jitter >= 1) {
    errors.push(`jitter 必須在 0 與 1 之間，不可以等於 1（現在 ${String(config.jitter)}）`);
  }

  return errors;
}

/**
 * 第 `attempt` 次失敗之後要等幾久（毫秒）。
 *
 * `random` 回 0 至 1；回 0.5 代表正中間。抖動是為了避免一批同時失敗的工作
 * 在同一刻一齊重試，把資料庫再打一次。
 *
 * 先封頂再加抖動，加完再封一次：這樣「上限」是真正的上限，
 * 不會因為抖動而超出。
 */
export function backoffDelayMs(
  attempt: number,
  config: BackoffConfig,
  random: () => number,
): number {
  const number = Math.max(1, Math.floor(attempt));
  const base = Math.min(config.initialMs * config.factor ** (number - 1), config.maxMs);
  const spread = base * config.jitter;
  const delay = base - spread + random() * spread * 2;

  return Math.max(1, Math.min(config.maxMs, Math.round(delay)));
}
