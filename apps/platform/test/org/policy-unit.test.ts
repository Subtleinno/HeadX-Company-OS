import { describe, expect, it } from 'vitest';
import { decide, type PolicyRule } from '../../src/settings/policy.js';

/**
 * decide 帶 unitId（issue #81）：越近的單位的規則先考慮，整間公司的規則排最後。
 *
 * 不帶 unitOrder 時必須與 #80 完全一樣 —— 只看 org_unit_id 為空的規則。
 * 這一點是回歸線：既有流程沒有單位概念，任何改變都會靜靜改變它們的批准行為。
 */

const BUY = { all: [{ field: 'amount', op: 'lte' as const, value: 100, currency: 'HKD' }] };

let counter = 0;

function rule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  counter += 1;

  return {
    id: `r${counter}`,
    domain: 'payment',
    condition: BUY,
    action: 'allow',
    priority: 100,
    enabled: true,
    orgUnitId: null,
    ...overrides,
  };
}

const FACTS = { amount: 50, currency: 'HKD' };

describe('decide 帶 unitOrder', () => {
  it('近的單位先，即使它的 priority 數字比較大', () => {
    const near = rule({ id: 'near', orgUnitId: 'store', action: 'require_approval', priority: 900 });
    const far = rule({ id: 'far', orgUnitId: 'brand', action: 'allow', priority: 10 });

    const decision = decide([far, near], 'payment', FACTS, { unitOrder: ['store', 'brand', 'company'] });

    expect(decision).toEqual({ action: 'require_approval', ruleId: 'near', reason: 'rule_matched' });
  });

  it('同一個單位之內仍然按 priority 由小到大', () => {
    const slow = rule({ id: 'slow', orgUnitId: 'store', action: 'require_approval', priority: 500 });
    const fast = rule({ id: 'fast', orgUnitId: 'store', action: 'allow', priority: 1 });

    expect(decide([slow, fast], 'payment', FACTS, { unitOrder: ['store'] }).ruleId).toBe('fast');
  });

  it('整間公司的規則排在所有單位之後（單位沒有規則時才輪到它）', () => {
    const company = rule({ id: 'company', orgUnitId: null, action: 'allow', priority: 1 });

    expect(decide([company], 'payment', FACTS, { unitOrder: ['store', 'brand'] }).ruleId).toBe('company');
  });

  it('單位有規則命中時，整間公司的規則不會被先考慮', () => {
    const company = rule({ id: 'company', orgUnitId: null, action: 'allow', priority: 1 });
    const store = rule({ id: 'store', orgUnitId: 'store', action: 'require_approval', priority: 999 });

    expect(decide([company, store], 'payment', FACTS, { unitOrder: ['store', 'brand'] }).ruleId).toBe('store');
  });

  it('不在 unitOrder 裡（不是祖先）的單位規則一律不考慮', () => {
    const unrelated = rule({ id: 'other', orgUnitId: 'other-brand', action: 'allow', priority: 1 });

    const decision = decide([unrelated], 'payment', FACTS, { unitOrder: ['store', 'brand'] });

    expect(decision).toEqual({ action: 'require_approval', ruleId: null, reason: 'no_rule_matched' });
  });
});

describe('decide 不帶 unitOrder：與 #80 完全一樣', () => {
  it('單位規則完全被忽略', () => {
    const store = rule({ id: 'store', orgUnitId: 'store', action: 'allow', priority: 1 });

    expect(decide([store], 'payment', FACTS)).toEqual({
      action: 'require_approval',
      ruleId: null,
      reason: 'no_rule_matched',
    });
  });

  it('沒有 orgUnitId 欄位的舊規則照舊按 priority', () => {
    const older = rule({ id: 'older', action: 'allow', priority: 10 });
    const newer = rule({ id: 'newer', action: 'require_approval', priority: 20 });

    expect(decide([newer, older], 'payment', FACTS).ruleId).toBe('older');
  });

  it('沒有命中仍然回 require_approval', () => {
    const expensive = rule({
      id: 'expensive',
      condition: { all: [{ field: 'amount', op: 'lte', value: 10, currency: 'HKD' }] },
    });

    expect(decide([expensive], 'payment', FACTS).action).toBe('require_approval');
  });
});

describe('decide 帶 unitOrder 的其他邊界', () => {
  it('近的單位規則不命中時，遠的單位仍然有機會', () => {
    const nearMiss = rule({
      id: 'near-miss',
      orgUnitId: 'store',
      condition: { all: [{ field: 'amount', op: 'lte', value: 1, currency: 'HKD' }] },
    });
    const farHit = rule({ id: 'far-hit', orgUnitId: 'brand', action: 'allow', priority: 500 });

    expect(decide([nearMiss, farHit], 'payment', FACTS, { unitOrder: ['store', 'brand'] }).ruleId).toBe('far-hit');
  });

  it('停用與已刪除的單位規則仍然被跳過', () => {
    const disabled = rule({ id: 'disabled', orgUnitId: 'store', enabled: false, priority: 1 });
    const deleted = rule({ id: 'deleted', orgUnitId: 'store', deletedAt: new Date(), priority: 2 });

    expect(decide([disabled, deleted], 'payment', FACTS, { unitOrder: ['store'] }).ruleId).toBeNull();
  });

  it('空的 unitOrder：等於只看整間公司的規則', () => {
    const company = rule({ id: 'company', action: 'allow', priority: 1 });
    const store = rule({ id: 'store', orgUnitId: 'store', priority: 0 });

    expect(decide([company, store], 'payment', FACTS, { unitOrder: [] }).ruleId).toBe('company');
  });
});
