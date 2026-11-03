/**
 * 寫入審計紀錄。只有寫，沒有讀、沒有改、沒有刪 —— 資料庫的 trigger 也不允許改。
 * 這張 issue 沒有把 writeAudit 接到任何路由；先讓之後的動作有地方留痕。
 */

export type ActorType = 'human' | 'agent' | 'system';

export type AuditEntry = {
  actorType: ActorType;
  actorId: string;
  action: string;
  target?: string;
  detail?: Record<string, unknown>;
};

/** 只需要 query；真的 Pool 或測試用的假物件都可以。 */
export type AuditDb = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

const ACTOR_TYPES: readonly ActorType[] = ['human', 'agent', 'system'];

/**
 * actorType 在程式層先驗一次：資料庫的 check 約束訊息對呼叫者不夠清楚，
 * 而且寫不進去的紀錄應該在擲錯時就看得見，不要靜靜漏掉。
 */
export async function writeAudit(db: AuditDb, entry: AuditEntry): Promise<void> {
  if (!ACTOR_TYPES.includes(entry.actorType)) {
    throw new Error(
      `audit_log 的 actorType 不合法：${String(entry.actorType)}（只可以是 human、agent、system）`,
    );
  }

  await db.query(
    `insert into audit_log (actor_type, actor_id, action, target, detail)
     values ($1, $2, $3, $4, $5)`,
    [entry.actorType, entry.actorId, entry.action, entry.target ?? null, entry.detail ?? {}],
  );
}
