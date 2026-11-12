import { describe, expect, it } from 'vitest';
import { POLICY_RULES } from '../src/brand-policy/rules';
import { isPolicySlot } from '../src/brand-policy/store';

/**
 * 策略規則 id 表（#56）。
 *
 * 這一張表是「策略文本」與「檢查器」之間唯一的契約：#59 只實作這張表列出的
 * id，測試保證兩邊一一對應。所以這裡要釘死三件事 —— id 的形狀、id 不重複、
 * 每一條都寫齊「一句定義、閾值、三態條件」。漏了任何一樣，checker 就只能
 * 靠猜，最後兩邊講兩個版本。
 */

describe('策略規則 id 表', () => {
  it('每條 id 都是 <槽>.r<數字>，而且不重複', () => {
    const ids = POLICY_RULES.map((rule) => rule.id);

    for (const id of ids) {
      expect(id).toMatch(/^[a-z]+\.r[1-9]\d*$/);
    }

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每個 id 所屬的槽都存在，而且不只是自定義頁', () => {
    for (const rule of POLICY_RULES) {
      expect(isPolicySlot(rule.slot)).toBe(true);
      expect(rule.slot).not.toBe('custom');

      // id 的前綴要對得上槽：`color.r2` 一定住在 color。唯一例外是語氣 ——
      // 槽名是歷史的 `tone`，規則 id 用品牌書上的 `voice`。兩邊寫得不一致
      // 的話，規則卡會把一條色彩規則掛到字體頁上。
      const prefix = rule.id.split('.')[0];
      const expected = rule.slot === 'tone' ? 'voice' : rule.slot;

      expect(prefix).toBe(expected);
    }
  });

  it('每一條都寫齊一句定義、閾值與三態條件', () => {
    for (const rule of POLICY_RULES) {
      expect(rule.summary.length).toBeGreaterThan(4);
      expect(rule.threshold.length).toBeGreaterThan(2);
      expect(rule.pass.length).toBeGreaterThan(2);
      expect(rule.fail.length).toBeGreaterThan(2);
      expect(rule.undetermined.length).toBeGreaterThan(2);
    }
  });

  it('五個有可量化規則的槽都有規則；圖像、主頁、應用、自定義刻意零規則', () => {
    const slots = new Set(POLICY_RULES.map((rule) => rule.slot));

    expect([...slots].sort()).toEqual(['color', 'logo', 'platform', 'tone', 'type']);

    for (const empty of ['image', 'home', 'apply', 'custom']) {
      expect(slots.has(empty as never)).toBe(false);
    }
  });

  it('id 數目與策略正文引用的數目一致（12 條）', () => {
    expect(POLICY_RULES).toHaveLength(12);
  });
});
