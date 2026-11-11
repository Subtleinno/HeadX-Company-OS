import { describe, expect, it } from 'vitest';
import { parseDepartmentInput } from '../src/staff/schema';

/**
 * 指派部門的輸入驗證（issue #12）。
 *
 * 這一支只管形狀，不管部門清單是否存在 —— 「`design` 是不是一個部門」
 * 由 registry 回答，測試在整合層。這裡要釘死的是幾件容易靜靜出錯的事：
 * 空白字串不是「取消指派」、多餘欄位不可以被吞掉、大小寫不可以自動改。
 */
describe('parseDepartmentInput', () => {
  it('合法部門：原樣回傳（不自動轉大小寫）', () => {
    expect(parseDepartmentInput({ department: 'design' })).toEqual({
      errors: [],
      value: { department: 'design' },
    });
  });

  it('null = 取消指派，是合法值', () => {
    expect(parseDepartmentInput({ department: null })).toEqual({
      errors: [],
      value: { department: null },
    });
  });

  it('缺少 department：拒絕（不可以當成取消指派）', () => {
    const result = parseDepartmentInput({});

    expect(result.value).toBeUndefined();
    expect(result.errors.join()).toContain('department 必須存在');
  });

  it('空白字串：拒絕，並講清楚要傳 null', () => {
    const result = parseDepartmentInput({ department: '   ' });

    expect(result.value).toBeUndefined();
    expect(result.errors.join()).toContain('null');
  });

  it('多餘欄位：拒絕，不靜靜忽略', () => {
    const result = parseDepartmentInput({ department: 'design', role: 'owner' });

    expect(result.value).toBeUndefined();
    expect(result.errors.join()).toContain('role');
  });

  it('型別不對：拒絕', () => {
    expect(parseDepartmentInput({ department: 42 }).value).toBeUndefined();
    expect(parseDepartmentInput('design').value).toBeUndefined();
    expect(parseDepartmentInput(null).value).toBeUndefined();
  });

  it('格式不對（大寫、空白、過長）：拒絕', () => {
    for (const value of ['Design', 'de sign', 'design-1', 'a'.repeat(42)]) {
      expect(parseDepartmentInput({ department: value }).value).toBeUndefined();
    }
  });
});
