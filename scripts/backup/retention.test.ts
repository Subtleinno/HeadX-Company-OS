import { describe, expect, it } from 'vitest';
import { planPrune } from './retention.mjs';

/**
 * 保留策略。最重要的一條：不論怎麼設定，都不可以刪掉唯一一份有效備份。
 * 只有通過驗證的備份才算「有效」；未驗證或壞掉的不計入保留數量。
 */

function backup(id: string, createdAt: string, verified = true) {
  return { id, createdAt, verified };
}

describe('planPrune', () => {
  it('保留最新 N 份，其餘列為可刪除', () => {
    const plan = planPrune({
      keep: 2,
      backups: [
        backup('c', '2026-11-03T00:00:00.000Z'),
        backup('a', '2026-11-01T00:00:00.000Z'),
        backup('b', '2026-11-02T00:00:00.000Z'),
      ],
    });

    expect(plan.keep).toEqual(['c', 'b']);
    expect(plan.remove).toEqual(['a']);
    expect(plan.reason).toBeNull();
  });

  it('份數少於保留數量時不刪任何東西', () => {
    const plan = planPrune({ keep: 7, backups: [backup('a', '2026-11-01T00:00:00.000Z')] });

    expect(plan.remove).toEqual([]);
    expect(plan.keep).toEqual(['a']);
  });

  it('唯一一份有效備份永遠不會被刪，即使 keep 是 1 而有兩份檔案', () => {
    const plan = planPrune({
      keep: 1,
      backups: [
        backup('new', '2026-11-04T00:00:00.000Z', false),
        backup('old', '2026-11-01T00:00:00.000Z', true),
      ],
    });

    expect(plan.keep).toEqual(['old']);
    expect(plan.remove).toEqual([]);
    expect(plan.skipped).toEqual(['new']);
  });

  it('未通過驗證的備份不計入保留數量，也不會被自動刪除', () => {
    const plan = planPrune({
      keep: 1,
      backups: [
        backup('verified', '2026-11-01T00:00:00.000Z', true),
        backup('broken', '2026-11-03T00:00:00.000Z', false),
      ],
    });

    expect(plan.keep).toEqual(['verified']);
    expect(plan.remove).toEqual([]);
    expect(plan.skipped).toEqual(['broken']);
  });

  it('keep 小於 1 時當成 1（不可以用 0 把全部刪光）', () => {
    const plan = planPrune({
      keep: 0,
      backups: [
        backup('b', '2026-11-02T00:00:00.000Z'),
        backup('a', '2026-11-01T00:00:00.000Z'),
      ],
    });

    expect(plan.keep).toEqual(['b']);
    expect(plan.remove).toEqual(['a']);
  });

  it('完全沒有有效備份時不刪任何東西，並講明原因', () => {
    const plan = planPrune({
      keep: 3,
      backups: [backup('a', '2026-11-01T00:00:00.000Z', false)],
    });

    expect(plan.remove).toEqual([]);
    expect(plan.keep).toEqual([]);
    expect(plan.skipped).toEqual(['a']);
  });

  it('空清單不會爆，也不會刪東西', () => {
    expect(planPrune({ keep: 5, backups: [] })).toEqual({
      keep: [],
      remove: [],
      skipped: [],
      reason: null,
      clamped: false,
    });
  });

  it('keep 少於 1 時要標記為 clamped，不可以靜靜改掉用戶的要求', () => {
    const plan = planPrune({
      keep: 0,
      backups: [backup('a', '2026-11-01T00:00:00.000Z')],
    });

    expect(plan.keep).toEqual(['a']);
    expect(plan.remove).toEqual([]);
    expect(plan.clamped).toBe(true);
  });
});
