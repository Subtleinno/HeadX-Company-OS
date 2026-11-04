import pg from 'pg';

/**
 * 備份／驗證／還原／刪除都要留痕，寫入既有的 audit_log（只准追加，資料庫 trigger 強制）。
 *
 * 這裡刻意不用 UPDATE／DELETE：連「補寫」都不做，出錯就直接讓呼叫端看見。
 * 連不上資料庫時不假裝成功 —— 呼叫端會把錯誤印出來並以失敗結束。
 */

const { Pool } = pg;

export function createAuditDb({ host, port, user, password, database }) {
  return new Pool({
    host,
    port,
    user,
    password,
    database,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
}

export async function recordBackupAction(pool, entry) {
  const detail = {
    result: entry.result,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    trigger: entry.trigger,
    error: entry.error ?? null,
    ...(entry.detail ?? {}),
  };

  await pool.query(
    `insert into audit_log (actor_type, actor_id, action, target, detail)
     values ($1, $2, $3, $4, $5)`,
    ['system', `backup:${entry.trigger}`, entry.action, entry.backupId ?? null, detail],
  );
}
