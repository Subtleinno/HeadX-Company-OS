/**
 * 保留策略：只保留最近 N 份「已驗證」的備份。
 *
 * 三條硬規則：
 * 1. 未通過驗證的備份不計入保留數量，也不會被自動刪除（留給人判斷）。
 * 2. 不論 keep 設成多少，永遠至少留一份有效備份。
 * 3. 這裡只負責「打算刪哪些」，實際刪除由呼叫端逐份執行。
 *
 * `reason` 不為 null 時，呼叫端應該把原因寫進 log，而不是靜靜地什麼都不做。
 */
export function planPrune({ backups, keep }) {
  const requested = Number.isFinite(keep) ? Math.floor(keep) : 1;
  // 至少留一份：keep=0 不是「全部刪掉」，而是被夾到 1。夾這件事要讓呼叫端知道，
  // 否則用戶以為刪光了，其實沒有。
  const keepCount = Math.max(1, requested);
  const clamped = keepCount !== requested;

  const sorted = [...backups].sort((left, right) =>
    left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0,
  );

  const valid = sorted.filter((backup) => backup.verified === true);
  const skipped = sorted.filter((backup) => backup.verified !== true).map((backup) => backup.id);

  return {
    keep: valid.slice(0, keepCount).map((backup) => backup.id),
    remove: valid.slice(keepCount).map((backup) => backup.id),
    skipped,
    clamped,
    reason:
      sorted.length > 0 && valid.length === 0 ? '沒有任何通過驗證的備份，不執行清理' : null,
  };
}
