// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';

import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };
const PASSWORD = 'correct-horse-9';

afterEach(() => {
  cleanup();
  resetBrowserState();
});

function startLogin(overrides: FakeHandlers = {}) {
  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: false }),
    login: () => jsonResponse(200, { user: BOSS }),
    ...overrides,
  });

  render(<App />);

  return api;
}

async function signIn(password: string = PASSWORD): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('電郵'), 'boss@example.com');
  await user.type(screen.getByLabelText('密碼'), password);
  await user.click(screen.getByRole('button', { name: '登入' }));
}

describe('登入：改動欄位就收起錯誤', () => {
  it('401 之後改動密碼，訊息消失；未改動前一直顯示', async () => {
    startLogin({ login: () => jsonResponse(401, { error: 'invalid_credentials' }) });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('錯誤：電郵或密碼不正確。')).toBeTruthy();

    await userEvent.setup().type(screen.getByLabelText('密碼'), 'x');

    await waitFor(() => {
      expect(screen.queryByText('錯誤：電郵或密碼不正確。')).toBeNull();
    });
  });

  it('401 之後改動電郵，訊息同樣消失', async () => {
    startLogin({ login: () => jsonResponse(401, { error: 'invalid_credentials' }) });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('錯誤：電郵或密碼不正確。')).toBeTruthy();

    await userEvent.setup().type(screen.getByLabelText('電郵'), 'x');

    await waitFor(() => {
      expect(screen.queryByText('錯誤：電郵或密碼不正確。')).toBeNull();
    });
  });

  it('電郵欄位的錯誤在該欄位一改動就消失', async () => {
    startLogin({ login: () => jsonResponse(400, { error: 'invalid_input', field: 'email' }) });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('請輸入有效的電郵。')).toBeTruthy();
    expect(screen.getByLabelText('電郵').getAttribute('aria-invalid')).toBe('true');

    await userEvent.setup().type(screen.getByLabelText('電郵'), 'x');

    await waitFor(() => {
      expect(screen.queryByText('請輸入有效的電郵。')).toBeNull();
    });

    expect(screen.getByLabelText('電郵').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('登入', () => {
  it('401 只說「電郵或密碼不正確」，不區分哪一個錯', async () => {
    startLogin({ login: () => jsonResponse(401, { error: 'invalid_credentials' }) });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('錯誤：電郵或密碼不正確。')).toBeTruthy();
    expect(screen.queryByText(/電郵不存在/)).toBeNull();
    expect(screen.queryByText(/密碼錯誤/)).toBeNull();
  });

  it('429 用 Retry-After 換算分鐘，600 秒是 10 分鐘', async () => {
    startLogin({
      login: () => jsonResponse(429, { error: 'too_many_attempts' }, { 'retry-after': '600' }),
    });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('錯誤：嘗試次數過多，請在 10 分鐘後再試。')).toBeTruthy();
  });

  it('429 的 61 秒進位成 2 分鐘，30 秒是 1 分鐘', async () => {
    startLogin({
      login: () => jsonResponse(429, { error: 'too_many_attempts' }, { 'retry-after': '61' }),
    });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('錯誤：嘗試次數過多，請在 2 分鐘後再試。')).toBeTruthy();

    cleanup();
    resetBrowserState();

    startLogin({
      login: () => jsonResponse(429, { error: 'too_many_attempts' }, { 'retry-after': '30' }),
    });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('錯誤：嘗試次數過多，請在 1 分鐘後再試。')).toBeTruthy();
  });

  it('429 沒有 Retry-After 時仍然講得出分鐘數', async () => {
    startLogin({ login: () => jsonResponse(429, { error: 'too_many_attempts' }) });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('錯誤：嘗試次數過多，請在 1 分鐘後再試。')).toBeTruthy();
  });

  it('網絡錯誤與 5xx 各有對應訊息', async () => {
    startLogin({
      login: () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByText('錯誤：無法連線到伺服器，請稍後再試。')).toBeTruthy();
  });

  it('送出中按鈕停用並顯示「登入中…」，只發一次請求', async () => {
    const api = startLogin({ login: () => new Promise(() => undefined) });

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    const button = await screen.findByRole('button', { name: '登入中…' });
    expect(button.hasAttribute('disabled')).toBe(true);

    await userEvent.setup().click(button);
    expect(api.count('login')).toBe(1);
  });

  it('成功後進入首頁', async () => {
    startLogin();

    await screen.findByRole('heading', { name: '登入 Company OS' });
    await signIn();

    expect(await screen.findByRole('heading', { name: '今日' })).toBeTruthy();
  });
});
