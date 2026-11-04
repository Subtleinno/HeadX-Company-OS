// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Field, type FieldProps } from '../src/index.js';

/**
 * ui-kit 的元件測試（issue #73）。
 *
 * 這些斷言在 R3 **之前不存在**：那時 Field 只是 apps/web 裡面的一個檔案，
 * 沒有「元件自己的契約」可言。搬進 package 之後，契約要由 package 自己守住：
 * 一定有不靠 placeholder 的 label、錯誤訊息與欄位用 aria-describedby 綁住、
 * 密碼欄位有文字按鈕可以切換顯示。
 */

afterEach(() => {
  cleanup();
});

function renderField(overrides: Partial<FieldProps> = {}) {
  const props: FieldProps = {
    id: 'test-field',
    label: '電郵',
    value: '',
    autoComplete: 'email',
    onChange: () => undefined,
    ...overrides,
  };

  return render(<Field {...props} />);
}

describe('Field', () => {
  it('label 是可見的 <label for>，不是 placeholder', () => {
    renderField();

    const input = screen.getByLabelText('電郵');
    expect(input).toBeTruthy();
    expect(input.getAttribute('placeholder')).toBeNull();
  });

  it('有錯誤時 aria-invalid 為 true，並以 aria-describedby 指向錯誤文字', () => {
    renderField({ error: '請輸入有效的電郵。' });

    const input = screen.getByLabelText('電郵');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBe('test-field-error');
    expect(document.getElementById('test-field-error')?.textContent).toBe('請輸入有效的電郵。');
  });

  it('沒有錯誤時不會亂掛 aria-invalid／aria-describedby', () => {
    renderField();

    const input = screen.getByLabelText('電郵');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('密碼欄位有文字按鈕切換顯示，切換後 type 變成 text', async () => {
    renderField({ id: 'pw', label: '密碼', type: 'password' });

    const toggle = screen.getByRole('button', { name: '顯示' });
    expect(screen.getByLabelText('密碼').getAttribute('type')).toBe('password');

    await userEvent.click(toggle);

    expect(screen.getByLabelText('密碼').getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: '隱藏' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('非密碼欄位不會出現切換按鈕', () => {
    renderField();

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disabled 會傳到 input 上', () => {
    renderField({ disabled: true });

    expect(screen.getByLabelText('電郵').hasAttribute('disabled')).toBe(true);
  });
});
