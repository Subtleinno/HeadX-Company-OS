import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/migrate';
import { claimNeed, findNeed, listNeeds, summarizeNeeds } from '../../src/needs/store';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * Needs 的 SQL 真的落資料庫跑一次（issue 184）。
 *
 * 為咩一定要真 SQL：純函數測試（derived state、逾期）全部會過，但真正出事的是
 * 佔位符對不上 —— `findNeed` 曾經把 id 放進 `$1`，而同一個 `$1` 又被 overdue
 * 當成 timestamptz 用，於是認領完讀回新列就 500。這種錯只有讓 Postgres 編譯
 * 那條 SQL 才會現形。
 */

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;

const NOW = new Date('2026-11-10T12:00:00.000Z');

describe('needs store（真 SQL）', () => {
  let db: TempDatabase;
  let bossId: string;

  beforeAll(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });

    const boss = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, password_hash)
       values ('boss@example.test', '老闆', 'owner', 'x')
       returning id`,
    );
    bossId = boss.rows[0]!.id;

    await db.pool.query(
      `insert into need (code, title, detail, kind, app_id, page_key, due_at, created_at)
       values
         ('COS-HK-001', '未有人認領而且已逾期', '詳情一', 'deliverable', null, null,
          now() - interval '3 days', now() - interval '5 days'),
         ('COS-HK-002', '未有人認領，未到期', null, 'decision', 'design', 'brand-kit',
          now() + interval '2 days', now() - interval '1 day')`,
    );
  });

  afterAll(async () => {
    await db.drop();
  });

  it('findNeed 讀得返單筆（id 與「而家」是兩個獨立參數）', async () => {
    const id = await idOf('COS-HK-001');
    const found = await findNeed(db.pool, id, NOW);

    expect(found).not.toBeNull();
    expect(found?.code).toBe('COS-HK-001');
    expect(found?.state).toBe('open');
    // due_at 已經過去，所以逾期要算得出來 —— 這一項正是靠 timestamptz 參數。
    expect(found?.overdue).toBe(true);
  });

  it('findNeed 找唔到就回 null，唔會擲錯', async () => {
    const found = await findNeed(db.pool, '00000000-0000-0000-0000-000000000000', NOW);

    expect(found).toBeNull();
  });

  it('清單排序：逾期行先', async () => {
    const items = await listNeeds(
      db.pool,
      { filter: 'all', appId: undefined, limit: 50 },
      NOW,
    );

    expect(items.map((item) => item.code)).toEqual(['COS-HK-001', 'COS-HK-002']);
  });

  it('來源篩選：company 只取未綁 app 的', async () => {
    const items = await listNeeds(db.pool, { filter: 'all', appId: null, limit: 50 }, NOW);

    expect(items.map((item) => item.code)).toEqual(['COS-HK-001']);
  });

  it('認領之後狀態變 claimed，而且讀得返新列', async () => {
    const id = await idOf('COS-HK-002');

    await expect(claimNeed(db.pool, id, bossId)).resolves.toBe(true);

    const after = await findNeed(db.pool, id, NOW);

    expect(after?.state).toBe('claimed');
    expect(after?.assignee).toEqual({ id: bossId, name: '老闆' });
  });

  it('同一件工作認領兩次：第二次拿到 false，唔會覆蓋原認領人', async () => {
    const id = await idOf('COS-HK-002');

    await expect(claimNeed(db.pool, id, bossId)).resolves.toBe(false);
  });

  it('計數同清單講同一件事', async () => {
    const counts = await summarizeNeeds(db.pool, undefined, NOW);

    // 001 未認領、002 已認領，兩件都未關閉；001 逾期。
    expect(counts).toMatchObject({
      open: 1,
      claimed: 1,
      uploaded: 0,
      absorbed: 0,
      closed: 0,
      overdue: 1,
      total: 2,
    });
  });

  async function idOf(code: string): Promise<string> {
    const row = await db.pool.query<{ id: string }>('select id from need where code = $1', [code]);

    return row.rows[0]!.id;
  }
});
