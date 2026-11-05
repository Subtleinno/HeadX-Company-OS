import { describe, expect, it } from 'vitest';
import {
  createDecider,
  decide,
  validateCondition,
  type PolicyRule,
} from '../../src/settings/policy';

/**
 * 政策引擎（issue #80／決策 C04）。
 *
 * 決策 C04 的預設是「全部需批准」：沒有任何規則命中時回 require_approval。
 * 這個預設很重要 —— 它保證「忘記寫規則」的後果是保守的（多問一次），
 * 而不是「靜靜放行」。測試最後一組就是在釘死這一點。
 *
 * 決定性規則：只看 enabled 且未刪除的規則，按 priority 由小到大，第一條命中者勝。
 * 所以「先命中」不等於「最嚴格」，規則的次序就是優先次序。
 */

function rule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: 'r1',
    domain: 'payment',
    condition: { all: [{ field: 'amount', op: 'lte', value: 1000, currency: 'HKD' }] },
    action: 'allow',
    priority: 100,
    enabled: true,
    deletedAt: null,
    ...overrides,
  };
}

const facts = { amount: 500, currency: 'HKD' };

describe('condition 格式驗證', () => {
  it('合格的最小條件', () => {
    const result = validateCondition({ all: [{ field: 'kind', op: 'eq', value: 'invoice' }] });

    expect(result.errors).toEqual([]);
    expect(result.condition).toEqual({ all: [{ field: 'kind', op: 'eq', value: 'invoice' }] });
  });

  it('所有合法運算子：eq、lte、gte、in', () => {
    const result = validateCondition({
      all: [
        { field: 'kind', op: 'eq', value: 'invoice' },
        { field: 'amount', op: 'lte', value: 1000, currency: 'HKD' },
        { field: 'amount', op: 'gte', value: 10, currency: 'HKD' },
        { field: 'department', op: 'in', value: ['design', 'sales'] },
      ],
    });

    expect(result.errors).toEqual([]);
  });

  it('不是物件、沒有 all、all 不是陣列、all 是空陣列，一律拒絕', () => {
    for (const bad of [null, 'all', [], {}, { all: 'x' }, { all: [] }, { all: {} }]) {
      const result = validateCondition(bad);

      expect(result.condition, JSON.stringify(bad)).toBeUndefined();
      expect(result.errors.length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  it('空陣列要拒絕：all 是空的等於「全部命中」，會變成放行一切的規則', () => {
    const result = validateCondition({ all: [] });

    expect(result.errors.join('\n')).toContain('all');
  });

  it('未知運算子、缺 field、多餘欄位都拒絕', () => {
    const cases = [
      { all: [{ field: 'kind', op: 'like', value: 'x' }] },
      { all: [{ op: 'eq', value: 'x' }] },
      { all: [{ field: '', op: 'eq', value: 'x' }] },
      { all: [{ field: 'kind', op: 'eq', value: 'x', extra: 1 }] },
      { all: [{ field: 'kind', op: 'eq' }] },
    ];

    for (const bad of cases) {
      expect(validateCondition(bad).errors.length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  it('金額比較一定要帶 currency：lte、gte 沒有 currency 就拒絕', () => {
    for (const op of ['lte', 'gte'] as const) {
      const result = validateCondition({ all: [{ field: 'amount', op, value: 100 }] });

      expect(result.errors.join('\n'), op).toContain('currency');
    }
  });

  it('金額比較的值一定要是數字', () => {
    for (const bad of ['100', null, true, [100]]) {
      const result = validateCondition({
        all: [{ field: 'amount', op: 'lte', value: bad, currency: 'HKD' }],
      });

      expect(result.errors.length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  it('in 的值一定要是非空陣列，元素只可以是字串、數字或布林', () => {
    expect(validateCondition({ all: [{ field: 'd', op: 'in', value: [] }] }).errors.length).toBeGreaterThan(0);
    expect(
      validateCondition({ all: [{ field: 'd', op: 'in', value: [{ a: 1 }] }] }).errors.length,
    ).toBeGreaterThan(0);
    expect(validateCondition({ all: [{ field: 'd', op: 'in', value: 'design' }] }).errors.length).toBeGreaterThan(0);
  });

  it('eq 的值只可以是字串、數字或布林', () => {
    for (const bad of [null, [], { a: 1 }]) {
      expect(
        validateCondition({ all: [{ field: 'k', op: 'eq', value: bad }] }).errors.length,
        JSON.stringify(bad),
      ).toBeGreaterThan(0);
    }
  });
});

describe('decide：沒有規則命中時一律 require_approval', () => {
  it('完全沒有規則', () => {
    const decision = decide([], 'payment', facts);

    expect(decision).toEqual({ action: 'require_approval', ruleId: null, reason: 'no_rule_matched' });
  });

  it('有規則但條件不命中', () => {
    const decision = decide([rule()], 'payment', { amount: 5000, currency: 'HKD' });

    expect(decision.action).toBe('require_approval');
    expect(decision.ruleId).toBeNull();
  });

  it('規則屬於另一個 domain 時不適用', () => {
    const decision = decide([rule()], 'outbound', facts);

    expect(decision.action).toBe('require_approval');
    expect(decision.ruleId).toBeNull();
  });
});

describe('decide：第一條命中者勝，priority 由小到大', () => {
  it('priority 數字小的先算，即使它比較寬鬆', () => {
    const allow = rule({ id: 'allow', action: 'allow', priority: 10 });
    const ask = rule({ id: 'ask', action: 'require_approval', priority: 20 });

    expect(decide([ask, allow], 'payment', facts)).toEqual({
      action: 'allow',
      ruleId: 'allow',
      reason: 'rule_matched',
    });
  });

  it('反過來，次序不同結果就不同（證明真的是按 priority 排）', () => {
    const allow = rule({ id: 'allow', action: 'allow', priority: 20 });
    const ask = rule({ id: 'ask', action: 'require_approval', priority: 10 });

    expect(decide([allow, ask], 'payment', facts).action).toBe('require_approval');
  });

  it('停用的規則不參與：即使它是唯一命中的一條', () => {
    const decision = decide([rule({ enabled: false })], 'payment', facts);

    expect(decision.action).toBe('require_approval');
    expect(decision.ruleId).toBeNull();
  });

  it('已刪除的規則不參與：即使它是唯一命中的一條', () => {
    const decision = decide([rule({ deletedAt: new Date('2026-01-01T00:00:00Z') })], 'payment', facts);

    expect(decision.ruleId).toBeNull();
  });

  it('停用的高優先規則會讓位給下一條命中的規則', () => {
    const disabled = rule({ id: 'disabled', action: 'allow', priority: 10, enabled: false });
    const backup = rule({ id: 'backup', action: 'require_approval', priority: 50 });

    expect(decide([disabled, backup], 'payment', facts)).toEqual({
      action: 'require_approval',
      ruleId: 'backup',
      reason: 'rule_matched',
    });
  });
});

describe('decide：多條子句要全部命中（all）', () => {
  it('兩條都命中才算命中', () => {
    const candidate = rule({
      condition: {
        all: [
          { field: 'kind', op: 'eq', value: 'invoice' },
          { field: 'amount', op: 'lte', value: 1000, currency: 'HKD' },
        ],
      },
    });

    expect(decide([candidate], 'payment', { kind: 'invoice', amount: 500, currency: 'HKD' }).ruleId).toBe('r1');
    expect(decide([candidate], 'payment', { kind: 'receipt', amount: 500, currency: 'HKD' }).ruleId).toBeNull();
  });

  it('fact 缺少某個欄位就是不命中，不是錯誤', () => {
    const candidate = rule({ condition: { all: [{ field: 'kind', op: 'eq', value: 'invoice' }] } });

    expect(decide([candidate], 'payment', {}).ruleId).toBeNull();
  });
});

describe('decide：金額比較要看貨幣', () => {
  it('貨幣不同視為不命中', () => {
    const decision = decide([rule()], 'payment', { amount: 500, currency: 'CNY' });

    expect(decision.ruleId).toBeNull();
  });

  it('fact 完全沒有 currency 時也不命中（不會當成「同一種貨幣」）', () => {
    expect(decide([rule()], 'payment', { amount: 500 }).ruleId).toBeNull();
  });

  it('貨幣相同才比較，邊界值算命中（lte 含等於）', () => {
    expect(decide([rule()], 'payment', { amount: 1000, currency: 'HKD' }).ruleId).toBe('r1');
    expect(decide([rule()], 'payment', { amount: 1000.01, currency: 'HKD' }).ruleId).toBeNull();
  });

  it('gte 也一樣：邊界值算命中', () => {
    const candidate = rule({
      condition: { all: [{ field: 'amount', op: 'gte', value: 1000, currency: 'HKD' }] },
    });

    expect(decide([candidate], 'payment', { amount: 1000, currency: 'HKD' }).ruleId).toBe('r1');
    expect(decide([candidate], 'payment', { amount: 999.99, currency: 'HKD' }).ruleId).toBeNull();
  });

  it('amount 不是數字時不命中，不是拋錯', () => {
    expect(decide([rule()], 'payment', { amount: '500', currency: 'HKD' }).ruleId).toBeNull();
  });
});

describe('decide：eq 與 in', () => {
  it('eq 比對字串、數字、布林', () => {
    const eq = (value: unknown) =>
      rule({
        domain: 'd',
        condition: { all: [{ field: 'f', op: 'eq' as const, value: value as string }] },
      });

    expect(decide([eq('x')], 'd', { f: 'x' }).ruleId).toBe('r1');
    expect(decide([eq('x')], 'd', { f: 'y' }).ruleId).toBeNull();
    expect(decide([eq(1)], 'd', { f: 1 }).ruleId).toBe('r1');
    expect(decide([eq(1)], 'd', { f: '1' }).ruleId).toBeNull();
    expect(decide([eq(true)], 'd', { f: true }).ruleId).toBe('r1');
  });

  it('in 比對清單', () => {
    const listed = rule({
      domain: 'd',
      condition: { all: [{ field: 'department', op: 'in', value: ['design', 'sales'] }] },
    });

    expect(decide([listed], 'd', { department: 'sales' }).ruleId).toBe('r1');
    expect(decide([listed], 'd', { department: 'hr' }).ruleId).toBeNull();
  });
});

describe('createDecider：把規則綁進來的版本，對外就是 decide(domain, facts)', () => {
  it('回傳的函數只需要 domain 與 facts', () => {
    const bound = createDecider([rule()]);

    expect(bound('payment', facts)).toEqual({ action: 'allow', ruleId: 'r1', reason: 'rule_matched' });
    expect(bound('outbound', facts).action).toBe('require_approval');
  });
});

describe('decide 不改動輸入', () => {
  it('傳入的規則陣列次序不變（排序發生在內部）', () => {
    const rules = [rule({ id: 'b', priority: 20 }), rule({ id: 'a', priority: 10 })];

    decide(rules, 'payment', facts);

    expect(rules.map((item) => item.id)).toEqual(['b', 'a']);
  });
});
