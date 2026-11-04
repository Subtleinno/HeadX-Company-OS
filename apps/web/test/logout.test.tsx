// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';

import { installFakeApi, jsonResponse, resetBrowserState } from './helpers/fake-api';
import { expectHash } from './helpers/assertions';

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };

afterEach(() => {
  cleanup();
  resetBrowserState();
  vi.restoreAllMocks();
});

describe('登出', () => {
  it('發出的 POST 帶 content-type: application/json 而且沒有 body', async () => {
    const api = installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
      logout: () => jsonResponse(204, null),
    });

    render(<App />);

    await screen.findByRole('heading', { name: '今日' });
    await userEvent.setup().click(screen.getByRole('button', { name: '登出' }));

    await screen.findByRole('heading', { name: '登入 Company OS' });

    const call = api.calls.find((entry) => entry.path.endsWith('/auth/logout'));
    expect(call).toBeDefined();
    expect(call?.method).toBe('POST');
    expect(call?.contentType).toBe('application/json');
    expect(call?.body).toBeNull();
  });

  it('登出成功後回到登入畫面，網址是 #/login', async () => {
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
      logout: () => jsonResponse(204, null),
    });

    render(<App />);

    await screen.findByRole('heading', { name: '今日' });
    await userEvent.setup().click(screen.getByRole('button', { name: '登出' }));

    expect(await screen.findByRole('heading', { name: '登入 Company OS' })).toBeTruthy();
    await expectHash('/login');
    expect(screen.queryByRole('heading', { name: '今日' })).toBeNull();
  });

  it('登出失敗時留在首頁並顯示錯誤，不假裝已登出', async () => {
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
      logout: () => jsonResponse(500, { error: 'internal' }),
    });

    render(<App />);

    await screen.findByRole('heading', { name: '今日' });
    await userEvent.setup().click(screen.getByRole('button', { name: '登出' }));

    expect(await screen.findByText('錯誤：發生未預期的錯誤，請稍後再試。')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '今日' })).toBeTruthy();
  });
});

describe('密碼不外洩', () => {
  it('密碼不會出現在網址、localStorage、sessionStorage 或 console', async () => {
    const password = 'correct-horse-9';
    const logged: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((value) => String(value)).join(' '));
      });
    }

    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: false }),
      login: () => jsonResponse(401, { error: 'invalid_credentials' }),
    });

    render(<App />);

    await screen.findByRole('heading', { name: '登入 Company OS' });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('電郵'), 'boss@example.com');
    await user.type(screen.getByLabelText('密碼'), password);
    await user.click(screen.getByRole('button', { name: '登入' }));

    await screen.findByText('錯誤：電郵或密碼不正確。');

    expect(window.location.href.includes(password)).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(logged.some((line) => line.includes(password))).toBe(false);
  });
});
