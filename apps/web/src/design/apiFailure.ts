import type { ApiFailure } from '../api';

/**
 * 把後端的拒絕理由原樣變成一句人話。
 *
 * 三層：`message`（後端寫給人看的那句，例如「已經有一張頁用 naming：命名」）、
 * 第一條 `reason`（驗證失敗時具體欠什麼）、最後才是自備的兜底。**不自己發明
 * 理由** —— 把「撞名」講成「格式有問題」會令人改錯地方。
 */
export function failureMessage(failure: ApiFailure, fallback: string): string {
  if (failure.kind === 'http') {
    if (failure.message !== null) {
      return failure.message;
    }

    const first = failure.reasons[0];

    if (first !== undefined) {
      return first;
    }
  }

  return fallback;
}
