import { describe, expect, it } from 'vitest';
import { resolveIntervalMs, runScheduleOnce } from './schedule.mjs';

/**
 * 排程：一輪＝建立備份，再按保留策略清理。
 * 硬規則：建立失敗時絕對不可以執行清理（否則一次失敗可能把既有備份掃光）。
 */

describe('resolveIntervalMs', () => {
  it('24 小時是 86400000 毫秒', () => {
    expect(resolveIntervalMs(24)).toBe(86_400_000);
  });

  it('0 小時代表只跑一次，回 0', () => {
    expect(resolveIntervalMs(0)).toBe(0);
  });

  it('負數或非數字當成只跑一次，不會變成無限迴圈', () => {
    expect(resolveIntervalMs(-1)).toBe(0);
    expect(resolveIntervalMs(Number.NaN)).toBe(0);
  });
});

describe('runScheduleOnce', () => {
  it('成功時回報 backup ID 與被清理的備份', async () => {
    const calls: string[] = [];

    const result = await runScheduleOnce({
      keep: 3,
      create: async () => {
        calls.push('create');
        return { backupId: '20261104-144005-0a1b2c' };
      },
      prune: async (keep: number) => {
        calls.push(`prune:${keep}`);
        return { removed: ['20261101-000000-000001'] };
      },
    });

    expect(result.created).toBe(true);
    expect(result.backupId).toBe('20261104-144005-0a1b2c');
    expect(result.pruned).toEqual(['20261101-000000-000001']);
    expect(result.error).toBeNull();
    expect(calls).toEqual(['create', 'prune:3']);
  });

  it('建立備份失敗時不執行清理，並把原因帶出來', async () => {
    let pruned = false;

    const result = await runScheduleOnce({
      keep: 3,
      create: async () => {
        throw new Error('備份根目錄不可寫入');
      },
      prune: async () => {
        pruned = true;
        return { removed: [] };
      },
    });

    expect(result.created).toBe(false);
    expect(result.error).toContain('備份根目錄不可寫入');
    expect(result.pruned).toEqual([]);
    expect(pruned).toBe(false);
  });

  it('清理失敗不影響「備份已建立」這個事實，但錯誤要看得見', async () => {
    const result = await runScheduleOnce({
      keep: 1,
      create: async () => ({ backupId: 'b1' }),
      prune: async () => {
        throw new Error('無法刪除 20260101-000000-000000');
      },
    });

    expect(result.created).toBe(true);
    expect(result.backupId).toBe('b1');
    expect(result.error).toContain('無法刪除');
  });

  it('每一輪都留一行結構化記錄，包含結果與時間', async () => {
    const lines: Record<string, unknown>[] = [];

    await runScheduleOnce({
      keep: 1,
      now: () => new Date('2026-11-04T14:40:00.000Z'),
      create: async () => ({ backupId: 'b1' }),
      prune: async () => ({ removed: [] }),
      log: (entry: Record<string, unknown>) => lines.push(entry),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: 'backup.schedule',
      result: 'ok',
      backupId: 'b1',
      finishedAt: '2026-11-04T14:40:00.000Z',
    });
  });
});
