/**
 * 排程：一輪＝建立備份，再按保留策略清理。
 *
 * 硬規則：建立失敗時不執行清理。否則一次失敗（例如碟未接上）之後，
 * 清理可能把僅有的有效備份當成「超出保留數量」而刪掉。
 */

export function resolveIntervalMs(intervalHours) {
  const hours = Number(intervalHours);

  if (!Number.isFinite(hours) || hours <= 0) {
    return 0;
  }

  return Math.round(hours * 3_600_000);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runScheduleOnce({
  create,
  prune,
  keep = 7,
  now = () => new Date(),
  log = () => undefined,
}) {
  let backupId = null;
  let created = false;
  let error = null;

  try {
    const result = await create();
    backupId = result?.backupId ?? null;
    created = true;
  } catch (caught) {
    error = messageOf(caught);
  }

  let pruned = [];

  if (created) {
    try {
      const result = await prune(keep);
      pruned = result?.removed ?? [];
    } catch (caught) {
      // 備份本身已經成功，這句要清楚說明是哪一步失敗。
      error = `備份已建立，但清理失敗：${messageOf(caught)}`;
    }
  }

  log({
    event: 'backup.schedule',
    result: error === null ? 'ok' : 'error',
    backupId,
    pruned,
    error,
    finishedAt: now().toISOString(),
  });

  return { created, backupId, pruned, error };
}
