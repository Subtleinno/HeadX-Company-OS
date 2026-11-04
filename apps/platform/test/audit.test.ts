import { describe, expect, it } from 'vitest';
import { writeAudit } from '../src/audit';

type Call = { text: string; values?: unknown[] };

function fakeDb(): { calls: Call[]; query: (text: string, values?: unknown[]) => Promise<unknown> } {
  const calls: Call[] = [];

  return {
    calls,
    query: async (text, values) => {
      calls.push(values === undefined ? { text } : { text, values });
      return { rows: [] };
    },
  };
}

describe('writeAudit', () => {
  it('actorType 不合法時拒絕，而且完全不碰資料庫', async () => {
    const db = fakeDb();

    await expect(
      writeAudit(db, { actorType: 'robot' as never, actorId: 'x', action: 'y' }),
    ).rejects.toThrow(/actorType/);

    expect(db.calls).toHaveLength(0);
  });

  it('寫入一列，參數照 actorType、actorId、action、target、detail 的順序', async () => {
    const db = fakeDb();

    await writeAudit(db, {
      actorType: 'agent',
      actorId: 'workbuddy',
      action: 'migration.applied',
      target: '0001_audit_log.sql',
      detail: { step: 1 },
    });

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.text).toMatch(/insert into audit_log/i);
    expect(db.calls[0]?.values).toEqual([
      'agent',
      'workbuddy',
      'migration.applied',
      '0001_audit_log.sql',
      { step: 1 },
    ]);
  });

  it('沒有 target 與 detail 時寫 null 與空物件，不是 undefined', async () => {
    const db = fakeDb();

    await writeAudit(db, { actorType: 'system', actorId: 'boot', action: 'started' });

    expect(db.calls[0]?.values).toEqual(['system', 'boot', 'started', null, {}]);
  });
});
