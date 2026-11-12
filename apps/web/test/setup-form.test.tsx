// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';

import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';
import { expectHash } from './helpers/assertions';

const BOSS = { id: 'u1', email: 'boss@example.com', displayName: '陳老闆', role: 'owner' };
const PASSWORD = 'correct-horse-9';

afterEach(() => {
  cleanup();
  resetBrowserState();
});

function startSetup(overrides: FakeHandlers = {}) {
  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: true, signedIn: false }),
    setup: () => jsonResponse(201, { user: BOSS }),
    ...overrides,
  });

  render(<App />);

  return api;
}

type Values = {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
};

async function fill(values: Values): Promise<void> {
  const user = userEvent.setup();

  if (values.name !== undefined) {
    await user.type(screen.getByLabelText('顯示名稱'), values.name);
  }

  if (values.email !== undefined) {
    await user.type(screen.getByLabelText('電郵'), values.email);
  }

  if (values.password !== undefined) {
    await user.type(screen.getByLabelText('密碼'), values.password);
  }

  if (values.confirm !== undefined) {
    await user.type(screen.getByLabelText('再輸入一次密碼'), values.confirm);
  }
}

async function submit(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: '建立老闆帳戶' }));
}

/** 找出欄位被 aria-describedby 指到的錯誤訊息。 */
function describedError(label: string): string | null {
  const input = screen.getByLabelText(label);
  const id = input.getAttribute('aria-describedby');

  if (id === null) {
    return null;
  }

  return document.getElementById(id)?.textContent ?? null;
}

describe('建立老闆帳戶：前端驗證', () => {
  it('空白送出時三條訊息都出現，而且不會發 setup 請求', async () => {
    const api = startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await submit();

    expect(await screen.findByText('顯示名稱不可空白。')).toBeTruthy();
    expect(screen.getByText('請輸入有效的電郵。')).toBeTruthy();
    expect(screen.getByText('密碼至少需要 12 個字元。')).toBeTruthy();
    expect(api.count('setup')).toBe(0);
  });

  it('密碼太短與兩次不一致都會指出來', async () => {
    const api = startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await fill({ name: '陳老闆', email: 'boss@example.com', password: 'short-11chr', confirm: 'other' });
    await submit();

    expect(await screen.findByText('密碼至少需要 12 個字元。')).toBeTruthy();
    expect(screen.getByText('兩次輸入的密碼不一致。')).toBeTruthy();
    expect(api.count('setup')).toBe(0);
  });

  it('錯誤訊息用 aria-describedby 連到對應欄位，並標記 aria-invalid', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await submit();

    expect(await screen.findByText('顯示名稱不可空白。')).toBeTruthy();

    const name = screen.getByLabelText('顯示名稱');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(describedError('顯示名稱')).toBe('顯示名稱不可空白。');
    expect(describedError('電郵')).toBe('請輸入有效的電郵。');
  });
});

describe('建立老闆帳戶：改動欄位就收起該欄位的錯誤', () => {
  it('空白送出後只修正一個欄位：那個欄位的錯誤消失，另外兩個仍然在', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await submit();

    expect(await screen.findByText('顯示名稱不可空白。')).toBeTruthy();
    expect(screen.getByText('請輸入有效的電郵。')).toBeTruthy();
    expect(screen.getByText('密碼至少需要 12 個字元。')).toBeTruthy();

    await userEvent.setup().type(screen.getByLabelText('顯示名稱'), '陳老闆');

    await waitFor(() => {
      expect(screen.queryByText('顯示名稱不可空白。')).toBeNull();
    });

    expect(screen.getByText('請輸入有效的電郵。')).toBeTruthy();
    expect(screen.getByText('密碼至少需要 12 個字元。')).toBeTruthy();
    expect(screen.getByLabelText('顯示名稱').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByLabelText('電郵').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('密碼').getAttribute('aria-invalid')).toBe('true');
  });

  it('三個欄位都修正後，畫面上一條錯誤都不剩', async () => {
    const api = startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await submit();
    expect(await screen.findByText('顯示名稱不可空白。')).toBeTruthy();

    await fill({ name: '陳老闆', email: 'boss@example.com', password: PASSWORD, confirm: PASSWORD });

    await waitFor(() => {
      expect(screen.queryByText('顯示名稱不可空白。')).toBeNull();
      expect(screen.queryByText('請輸入有效的電郵。')).toBeNull();
      expect(screen.queryByText('密碼至少需要 12 個字元。')).toBeNull();
    });

    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    // 收起錯誤不等於送出：這時仍未發過請求。
    expect(api.count('setup')).toBe(0);

    await submit();
    // 全套一起跑時 jsdom 會被其他檔拖慢，1 秒的預設等待會隨機紅 —— 這一格
    // 等的是「設定完成後真的入到首頁」，不是「一秒內入到」。
    expect(await screen.findByRole('heading', { name: '今日' }, { timeout: 5000 })).toBeTruthy();
    expect(api.count('setup')).toBe(1);
  });

  it('改動密碼時，兩次不一致的錯誤也一併消失（它取決於兩個欄位）', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await fill({ name: '陳老闆', email: 'boss@example.com', password: PASSWORD, confirm: 'other' });
    await submit();

    expect(await screen.findByText('兩次輸入的密碼不一致。')).toBeTruthy();

    await userEvent.setup().type(screen.getByLabelText('密碼'), 'x');

    await waitFor(() => {
      expect(screen.queryByText('兩次輸入的密碼不一致。')).toBeNull();
    });
  });
});

describe('建立老闆帳戶：後端回應', () => {
  it('API 回 400 並指明欄位時，訊息指到那個欄位', async () => {
    startSetup({
      setup: () => jsonResponse(400, { error: 'invalid_input', field: 'email' }),
    });

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await fill({ name: '陳老闆', email: 'boss@example.com', password: PASSWORD, confirm: PASSWORD });
    await submit();

    expect(await screen.findByText('請輸入有效的電郵。')).toBeTruthy();
    expect(describedError('電郵')).toBe('請輸入有效的電郵。');
    expect(screen.queryByText('發生未預期的錯誤，請稍後再試。')).toBeNull();
  });

  it('API 回 409 時顯示「已經有老闆帳戶，請登入。」並切到登入畫面', async () => {
    startSetup({ setup: () => jsonResponse(409, { error: 'already_set_up' }) });

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await fill({ name: '陳老闆', email: 'boss@example.com', password: PASSWORD, confirm: PASSWORD });
    await submit();

    expect(await screen.findByText('已經有老闆帳戶，請登入。')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '登入 Company OS' })).toBeTruthy();
    await expectHash('/login');
  });

  it('網絡錯誤顯示「錯誤：無法連線到伺服器，請稍後再試。」', async () => {
    startSetup({
      setup: () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await fill({ name: '陳老闆', email: 'boss@example.com', password: PASSWORD, confirm: PASSWORD });
    await submit();

    expect(await screen.findByText('錯誤：無法連線到伺服器，請稍後再試。')).toBeTruthy();
  });

  it('其他錯誤顯示「錯誤：發生未預期的錯誤，請稍後再試。」', async () => {
    startSetup({ setup: () => jsonResponse(500, { error: 'internal' }) });

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await fill({ name: '陳老闆', email: 'boss@example.com', password: PASSWORD, confirm: PASSWORD });
    await submit();

    expect(await screen.findByText('錯誤：發生未預期的錯誤，請稍後再試。')).toBeTruthy();
  });
});

describe('建立老闆帳戶：送出流程', () => {
  it('送出中按鈕停用並顯示「建立中…」，再按也不會重複送出', async () => {
    const api = startSetup({ setup: () => new Promise(() => undefined) });

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await fill({ name: '陳老闆', email: 'boss@example.com', password: PASSWORD, confirm: PASSWORD });
    await submit();

    const button = await screen.findByRole('button', { name: '建立中…' });
    expect(button.hasAttribute('disabled')).toBe(true);

    await userEvent.setup().click(button);
    expect(api.count('setup')).toBe(1);
  });

  it('成功（201）後直接進入首頁', async () => {
    startSetup();

    await screen.findByRole('heading', { name: '建立老闆帳戶' });
    await fill({ name: '陳老闆', email: 'boss@example.com', password: PASSWORD, confirm: PASSWORD });
    await submit();

    expect(await screen.findByRole('heading', { name: '今日' })).toBeTruthy();
    expect(screen.getByText('陳老闆')).toBeTruthy();
  });
});
