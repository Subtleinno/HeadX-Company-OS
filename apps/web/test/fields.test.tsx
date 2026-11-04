// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';

import { installFakeApi, jsonResponse, resetBrowserState } from './helpers/fake-api';

afterEach(() => {
  cleanup();
  resetBrowserState();
});

function startSetup(): void {
  installFakeApi({ state: () => jsonResponse(200, { setupRequired: true, signedIn: false }) });
  render(<App />);
}

function startLogin(): void {
  installFakeApi({ state: () => jsonResponse(200, { setupRequired: false, signedIn: false }) });
  render(<App />);
}

describe('建立老闆帳戶的欄位', () => {
  it('四個欄位都有可見的 label（不是只有 placeholder）', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });

    for (const label of ['顯示名稱', '電郵', '密碼', '再輸入一次密碼']) {
      const input = screen.getByLabelText(label);
      expect(input.tagName).toBe('INPUT');
      expect(input.getAttribute('placeholder')).toBeNull();
    }
  });

  it('autocomplete 正確：name、email、new-password、new-password', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });

    expect(screen.getByLabelText('顯示名稱').getAttribute('autocomplete')).toBe('name');
    expect(screen.getByLabelText('電郵').getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText('密碼').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText('再輸入一次密碼').getAttribute('autocomplete')).toBe('new-password');
  });

  it('電郵欄位是 type="email"', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });

    expect(screen.getByLabelText('電郵').getAttribute('type')).toBe('email');
  });

  it('密碼欄位預設是 password，「顯示」切換成 text，「隱藏」切回 password', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });

    const password = screen.getByLabelText('密碼');
    expect(password.getAttribute('type')).toBe('password');

    const toggles = screen.getAllByRole('button', { name: '顯示' });
    expect(toggles).toHaveLength(2);

    const user = userEvent.setup();
    await user.click(toggles[0] as HTMLElement);
    expect(password.getAttribute('type')).toBe('text');

    await user.click(screen.getAllByRole('button', { name: '隱藏' })[0] as HTMLElement);
    expect(password.getAttribute('type')).toBe('password');
  });

  it('進入畫面時焦點落在第一個欄位', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });

    expect(document.activeElement).toBe(screen.getByLabelText('顯示名稱'));
  });
});

describe('登入的欄位', () => {
  it('autocomplete 是 username 與 current-password，密碼可切換顯示', async () => {
    startLogin();

    await screen.findByRole('heading', { name: '登入 Company OS' });

    expect(screen.getByLabelText('電郵').getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('密碼').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.getByLabelText('密碼').getAttribute('type')).toBe('password');

    await userEvent.setup().click(screen.getByRole('button', { name: '顯示' }));
    expect(screen.getByLabelText('密碼').getAttribute('type')).toBe('text');
  });

  it('進入畫面時焦點落在電郵欄位', async () => {
    startLogin();

    await screen.findByRole('heading', { name: '登入 Company OS' });

    expect(document.activeElement).toBe(screen.getByLabelText('電郵'));
  });
});
