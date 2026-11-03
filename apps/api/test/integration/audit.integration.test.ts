import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeAudit } from '../../src/audit';
import { migrate } from '../../src/migrate';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * audit_log 的防篡改 trigger。全部在臨時資料庫 co_test_<隨機> 內證明：
 * 正式資料庫的審計表刪不掉，測試列一寫進去就永久留下垃圾。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;

describe('audit_log 只准追加', () => {
  let db: TempDatabase;

  beforeAll(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
    await writeAudit(db.pool, {
      actorType: 'human',
      actorId: 'boss',
      action: 'test.insert',
      target: '0001_audit_log.sql',
    });
  });

  afterAll(async () => {
    await db.drop();
  });

  it('INSERT 正常，一列寫得進去，detail 預設空物件', async () => {
    const rows = await db.pool.query<{
      actor_type: string;
      actor_id: string;
      action: string;
      detail: unknown;
    }>('select actor_type, actor_id, action, detail from audit_log');

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.actor_type).toBe('human');
    expect(rows.rows[0]?.actor_id).toBe('boss');
    expect(rows.rows[0]?.detail).toEqual({});
  });

  it('UPDATE 失敗，SQLSTATE 42501', async () => {
    await expect(db.pool.query("update audit_log set action = 'changed'")).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('DELETE 失敗，SQLSTATE 42501', async () => {
    await expect(db.pool.query('delete from audit_log')).rejects.toMatchObject({ code: '42501' });
  });

  it('TRUNCATE 失敗，SQLSTATE 42501', async () => {
    await expect(db.pool.query('truncate audit_log')).rejects.toMatchObject({ code: '42501' });
  });

  it('拿掉觸發器之後，UPDATE、DELETE、TRUNCATE 都會成功（證明上面測的真的是觸發器）', async () => {
    const client = await db.pool.connect();

    try {
      await client.query('begin');
      await client.query('drop trigger audit_log_no_update_delete on audit_log');
      await client.query('drop trigger audit_log_no_truncate on audit_log');

      await client.query("update audit_log set action = 'changed'");
      const updated = await client.query(
        "select count(*)::int as n from audit_log where action = 'changed'",
      );
      expect(updated.rows[0]?.n).toBe(1);

      await client.query("delete from audit_log where action = 'changed'");
      const deleted = await client.query('select count(*)::int as n from audit_log');
      expect(deleted.rows[0]?.n).toBe(0);

      await client.query('truncate audit_log');
      const truncated = await client.query('select count(*)::int as n from audit_log');
      expect(truncated.rows[0]?.n).toBe(0);
    } finally {
      // 回滾：觸發器與那一列都要回到原狀，不影響其他個案。
      await client.query('rollback');
      client.release();
    }
  });

  it('回滾之後觸發器仍然生效，那一列還在', async () => {
    await expect(db.pool.query('delete from audit_log')).rejects.toMatchObject({ code: '42501' });

    const rows = await db.pool.query('select count(*)::int as n from audit_log');
    expect(rows.rows[0]?.n).toBe(1);
  });
});
