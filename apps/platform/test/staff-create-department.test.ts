import { describe, expect, it } from 'vitest';
import { parseCreateStaffInput } from '../src/staff/schema';

/**
 * 建立員工時一併帶部門的輸入驗證（issue #28）。
 *
 * 這一支只管形狀；「design 是不是一個部門」由 registry 回答，測試在整合層。
 * 這裡要釘死的是幾件容易靜靜出錯的事：
 *
 * - 欄位**缺席**當未指派（舊呼叫端不用改），但**寫了空白**要拒絕。
 * - 空白字串不可以靜靜變成 null：那會令打錯字的人以為自己指派了。
 * - 其他未知欄位（例如 `role`）照樣拒絕 —— 這是 body 最容易被塞東西的地方。
 */

const BASE = {
  displayName: '陳大文',
  email: 'taiman@example.com',
  initialPassword: 'temp-secret-2026',
};

describe('parseCreateStaffInput 的部門', () => {
  it('沒有 department 這個鍵：當未指派（null），不報錯', () => {
    const result = parseCreateStaffInput({ ...BASE });

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({ department: null });
  });

  it('明確 null：合法，就是未指派', () => {
    const result = parseCreateStaffInput({ ...BASE, department: null });

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({ department: null });
  });

  it('合法部門：原樣回傳（不自動轉大小寫）', () => {
    const result = parseCreateStaffInput({ ...BASE, department: 'design' });

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({ department: 'design' });
  });

  it('前後有空白：修剪，不留空白進資料庫', () => {
    const result = parseCreateStaffInput({ ...BASE, department: '  design  ' });

    expect(result.errors).toEqual([]);
    expect(result.value).toMatchObject({ department: 'design' });
  });

  it('空白字串：拒絕，不是「未指派」', () => {
    const result = parseCreateStaffInput({ ...BASE, department: '   ' });

    expect(result.value).toBeUndefined();
    expect(result.errors.join()).toContain('不可以是空白');
  });

  it('格式不對（大寫／中文）：拒絕', () => {
    for (const value of ['Design', '設計部', '1design', '-design']) {
      const result = parseCreateStaffInput({ ...BASE, department: value });

      expect(result.value).toBeUndefined();
      expect(result.errors.join()).toContain('格式不對');
    }
  });

  it('不是字串：拒絕（42、true、物件都不可被當成 null 收貨）', () => {
    for (const value of [42, true, {}, []]) {
      const result = parseCreateStaffInput({ ...BASE, department: value });

      expect(result.value).toBeUndefined();
      expect(result.errors.join()).toContain('必須是字串或 null');
    }
  });

  it('夾帶 role 仍然被拒：部門開放了，不代表 body 可以多帶東西', () => {
    const result = parseCreateStaffInput({ ...BASE, department: 'design', role: 'owner' });

    expect(result.value).toBeUndefined();
    expect(result.errors.join()).toContain('role');
  });
});
