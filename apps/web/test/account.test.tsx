// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { AccountScreen } from '../src/screens/AccountScreen';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * 個人帳戶與安全（issue 124）。
 *
 * 這一頁有三件事最容易寫錯，所以每一件都有測試釘住：
 *
 *   1. **資料只有一個來源**：`GET /me`。不是 `/auth/state`，也不是 URL 的品牌段。
 *   2. **失敗照實講**：舊密碼錯是 403、session 失效是 401、名額用完是 429、
 *      系統忙是 503 —— 四種不可以壓成同一句「發生錯誤」。
 *   3. **密碼不外洩**：不進 storage、不進網址、不進 console、不留在畫面上。
 *      任何一次提交失敗都清空兩個密碼欄。
 */

const WAI = {
  id: 'u-wai',
  email: 'wai@example.com',
  displayName: '林慧',
  role: 'staff' as const,
  mustChangePassword: false,
};

const ME = (user: typeof WAI = WAI) => jsonResponse(200, { user });

type RenderOptions = {
  me?: FakeHandlers['me'];
  changePassword?: FakeHandlers['changePassword'];
  logout?: FakeHandlers['logout'];
};

function renderAccount(options: RenderOptions = {}) {
  const onSignedOut = vi.fn();
  const onUserChanged = vi.fn();
  const onBack = vi.fn();

  const api = installFakeApi({
    me: options.me ?? (() => ME()),
    changePassword: options.changePassword ?? (() => jsonResponse(200, { user: { ...WAI, mustChangePassword: false } })),
    logout: options.logout ?? (() => jsonResponse(204, null)),
  });

  render(
    <AccountScreen
      user={WAI}
      onSignedOut={onSignedOut}
      onUserChanged={onUserChanged}
      onBack={onBack}
    />,
  );

  return { api, onSignedOut, onUserChanged, onBack };
}

function currentPassword(): HTMLInputElement {
  return screen.getByLabelText('現在的密碼') as HTMLInputElement;
}

function nextPassword(): HTMLInputElement {
  return screen.getByLabelText('新密碼') as HTMLInputElement;
}

/**
 * 等 `/me` 落地。
 *
 * 頂欄與頁內都可以出現姓名，所以用 `data-account-name` 定位頁內那一個，
 * 不用 `findByText`（它會因為兩個地方同名而報 ambiguous）。
 */
async function waitForName(name: string): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector('[data-account-name]')?.textContent).toBe(name);
  });
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.type(currentPassword(), from);
  await user.type(nextPassword(), to);
  await user.click(screen.getByRole('button', { name: '改密碼' }));
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  vi.restoreAllMocks();
});

describe('個人帳戶：資料只有一個來源', () => {
  it('讀 /me 並顯示姓名、電郵、角色與帳戶 id', async () => {
    const { api } = renderAccount();

    await waitForName('林慧');

    expect(api.count('me')).toBe(1);
    expect(screen.getByText('wai@example.com')).toBeTruthy();
    expect(screen.getByText('員工')).toBeTruthy();
    expect(screen.getByText('u-wai')).toBeTruthy();
  });

  it('以 /me 為準：/auth/state 與 /me 不同時，顯示的是 /me 的那一份', async () => {
    // /auth/state 是外殼的開機判斷，不是這一頁的資料來源。
    // 兩份若不一致（例如改了名之後 session 快照未更新），這一頁跟 /me。
    installFakeApi({
      state: () =>
        jsonResponse(200, {
          setupRequired: false,
          signedIn: true,
          user: { ...WAI, displayName: '舊名' },
        }),
      me: () => ME({ ...WAI, displayName: '新名' }),
    });

    window.history.replaceState(null, '', '/#/account');
    render(<App />);

    // 頁內那一行（data-account-name）跟 /me；不是外殼快照，也不是舊名。
    await waitFor(() => {
      expect(document.querySelector('[data-account-name]')?.textContent).toBe('新名');
    });
    expect(document.body.textContent).not.toContain('舊名');
  });

  it('不顯示密碼雜湊、session token 或後端多回來的內部欄位', async () => {
    renderAccount({
      me: () =>
        jsonResponse(200, {
          user: { ...WAI, password_hash: 'scrypt$1$abc', session_token: 'tok-123', department: 'design' },
        }),
    });

    await waitForName('林慧');

    const text = document.body.textContent ?? '';

    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('tok-123');
    expect(text).not.toContain('password_hash');
    // department 不是 /me 的公開欄位（toPublicUser 不給），所以就算有人塞進來也不顯示。
    expect(text).not.toContain('design');
  });

  it('如實講姓名、電郵與角色現在不可以改', async () => {
    renderAccount();

    await waitForName('林慧');

    expect(document.body.textContent).toContain('姓名、電郵與角色現在不可以在此修改');
  });

  it('mustChangePassword 為 true 時明講「要改」，為 false 時明講「已自行設定」', async () => {
    renderAccount({ me: () => ME({ ...WAI, mustChangePassword: true }) });

    await waitForName('林慧');
    expect(document.body.textContent).toContain('要改（未改之前不可以用其他功能）');

    cleanup();
    resetBrowserState();

    renderAccount();
    await waitForName('林慧');
    expect(document.body.textContent).toContain('已自行設定');
  });
});

describe('個人帳戶：讀取狀態', () => {
  it('讀取中如實講，不是空白一片', () => {
    renderAccount({ me: () => new Promise(() => {}) as never });

    expect(screen.getByText('正在讀取你的帳戶資料…')).toBeTruthy();
  });

  it('讀取失敗要講原因並可以重試，重試成功之後才顯示資料', async () => {
    let attempts = 0;

    const { api } = renderAccount({
      me: () => {
        attempts += 1;

        return attempts === 1
          ? jsonResponse(503, { error: 'service_unavailable' })
          : ME();
      },
    });

    await screen.findByText('讀不到你的帳戶資料。');

    await userEvent.setup().click(screen.getByRole('button', { name: '重試' }));

    await waitForName('林慧');
    expect(api.count('me')).toBe(2);
  });

  it('401 講未登入，並提供重新登入而不是假裝已登入', async () => {
    const { onSignedOut } = renderAccount({ me: () => jsonResponse(401, { error: 'not_signed_in' }) });

    await screen.findByText('你未登入，或者登入已經失效。');

    await userEvent.setup().click(screen.getByRole('button', { name: '重新登入' }));

    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('林慧')).toBeNull();
  });

  it('403 entry_untrusted 原樣講入口不可信，不當成權限問題', async () => {
    renderAccount({ me: () => jsonResponse(403, { error: 'entry_untrusted' }) });

    await screen.findByText('這個請求不是經由可信的內部入口轉發過來，一律拒絕。');
    expect(screen.queryByText('林慧')).toBeNull();
  });
});

describe('個人帳戶：改密碼', () => {
  it('只送 currentPassword 與 newPassword 兩個欄位', async () => {
    const { api } = renderAccount();

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'old-password-1', 'new-password-22');

    await screen.findByText('密碼已改好，你現在用的是新密碼。');

    const call = api.calls.find((entry) => entry.path.endsWith('/auth/change-password'));

    expect(call?.method).toBe('POST');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      currentPassword: 'old-password-1',
      newPassword: 'new-password-22',
    });
  });

  it('成功之後用回應更新狀態：必須改密碼變成 false，並清空兩個欄位', async () => {
    const { onUserChanged } = renderAccount({
      changePassword: () => jsonResponse(200, { user: { ...WAI, mustChangePassword: false } }),
    });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'old-password-1', 'new-password-22');

    await screen.findByText('密碼已改好，你現在用的是新密碼。');

    expect(onUserChanged).toHaveBeenCalledWith(expect.objectContaining({ mustChangePassword: false }));
    expect(currentPassword().value).toBe('');
    expect(nextPassword().value).toBe('');
  });

  it('兩個欄位都空時不發請求，只講要填', async () => {
    const { api } = renderAccount();

    await waitForName('林慧');

    await userEvent.setup().click(screen.getByRole('button', { name: '改密碼' }));

    expect(await screen.findByText('請先填現在的密碼與新密碼。')).toBeTruthy();
    expect(api.count('changePassword')).toBe(0);
  });

  it('舊密碼錯（403）講「現在的密碼不正確」，不是 session 失效；清空欄位並把焦點移回舊密碼欄', async () => {
    renderAccount({
      changePassword: () => jsonResponse(403, { error: 'invalid_current_password' }),
    });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'wrong-password', 'new-password-22');

    await screen.findByText('現在的密碼不正確。');

    expect(document.body.textContent).not.toContain('登入已經失效');
    expect(currentPassword().value).toBe('');
    expect(nextPassword().value).toBe('');
    await waitFor(() => {
      expect(document.activeElement).toBe(currentPassword());
    });
  });

  it('名額用完（429）用 Retry-After 換算成分鐘', async () => {
    renderAccount({
      changePassword: () =>
        jsonResponse(429, { error: 'too_many_attempts' }, { 'retry-after': '120' }),
    });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'old-password-1', 'new-password-22');

    await screen.findByText('錯誤次數太多，請等 2 分鐘後再試。');
  });

  it('新密碼太短（422 too_short）講 12 位，不自己另立規則', async () => {
    renderAccount({
      changePassword: () =>
        jsonResponse(422, { error: 'invalid_input', field: 'newPassword', reason: 'too_short' }),
    });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'old-password-1', 'short');

    await screen.findByText('新密碼太短，最少要 12 位。');
  });

  it('新舊相同（422 same_as_current）照實講', async () => {
    renderAccount({
      changePassword: () =>
        jsonResponse(422, {
          error: 'invalid_input',
          field: 'newPassword',
          reason: 'same_as_current',
        }),
    });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'same-password-1', 'same-password-1');

    await screen.findByText('新密碼不可以與現在的密碼相同。');
  });

  it('後端逐條列出的 422 原因原樣顯示，不改寫', async () => {
    renderAccount({
      changePassword: () =>
        jsonResponse(422, {
          error: 'invalid_input',
          reasons: ['未知欄位 extra（只可以有 currentPassword、newPassword）'],
        }),
    });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'old-password-1', 'new-password-22');

    await screen.findByText('未知欄位 extra（只可以有 currentPassword、newPassword）');
  });

  it('409 講密碼已經在別處改過，不假裝成功', async () => {
    renderAccount({
      changePassword: () => jsonResponse(409, { error: 'password_changed_elsewhere' }),
    });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'old-password-1', 'new-password-22');

    await screen.findByText('這個帳戶的密碼已經在別處改過，請重新登入再用新密碼。');
    expect(document.body.textContent).not.toContain('密碼已改好');
  });

  it('503 講系統忙，不當成密碼錯', async () => {
    renderAccount({
      changePassword: () => jsonResponse(503, { error: 'service_busy' }, { 'retry-after': '5' }),
    });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'old-password-1', 'new-password-22');

    await screen.findByText('系統正在忙，密碼未有改動，請稍後再試。');
    expect(document.body.textContent).not.toContain('現在的密碼不正確');
  });

  it('提交中不再接受第二次提交（按鈕停用）', async () => {
    // 先給一個無害的預設值，再等 handler 被呼叫時換成「放行」，
    // 避免 TypeScript 把 `release` 窄化成永遠是 null。
    let release: () => void = () => {};

    const { api } = renderAccount({
      changePassword: () =>
        new Promise((resolve) => {
          release = () => {
            resolve(jsonResponse(200, { user: { ...WAI, mustChangePassword: false } }));
          };
        }) as never,
    });

    await waitForName('林慧');

    const user = userEvent.setup();
    await user.type(currentPassword(), 'old-password-1');
    await user.type(nextPassword(), 'new-password-22');
    await user.click(screen.getByRole('button', { name: '改密碼' }));

    await screen.findByRole('button', { name: '正在改…' });

    await user.click(screen.getByRole('button', { name: '正在改…' }));

    expect(api.count('changePassword')).toBe(1);

    release();
    await screen.findByText('密碼已改好，你現在用的是新密碼。');
  });
});

describe('個人帳戶：登出', () => {
  it('登出成功之後叫 onSignedOut', async () => {
    const { onSignedOut } = renderAccount();

    await waitForName('林慧');

    await userEvent.setup().click(screen.getByRole('button', { name: '登出' }));

    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledTimes(1);
    });
  });

  it('登出失敗留在這一頁並講清楚，不假裝已登出', async () => {
    const { onSignedOut } = renderAccount({ logout: () => jsonResponse(500, { error: 'internal' }) });

    await waitForName('林慧');

    await userEvent.setup().click(screen.getByRole('button', { name: '登出' }));

    expect(await screen.findByText('登出未成功，你仍然在這個 session 之內。')).toBeTruthy();
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('如實講登出只結束這一個 session', async () => {
    renderAccount();

    await waitForName('林慧');

    expect(document.body.textContent).toContain('登出只結束這一個 session，不會刪除公司身份，也不影響其他裝置。');
  });
});

describe('個人帳戶：未保存的輸入', () => {
  it('填了密碼再按回首頁會先問；取消就留在這一頁', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onBack } = renderAccount();

    await waitForName('林慧');

    const user = userEvent.setup();
    await user.type(currentPassword(), 'old-password-1');

    await user.click(screen.getByRole('button', { name: '回首頁' }));

    expect(confirm).toHaveBeenCalledWith('你有未提交的密碼輸入，離開會清空。要繼續嗎？');
    expect(onBack).not.toHaveBeenCalled();
    expect(currentPassword().value).toBe('old-password-1');
  });

  it('確認之後才真的離開', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onBack } = renderAccount();

    await waitForName('林慧');

    const user = userEvent.setup();
    await user.type(nextPassword(), 'new-password-22');
    await user.click(screen.getByRole('button', { name: '回首頁' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('沒有填任何密碼就直接走，不問', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onBack } = renderAccount();

    await waitForName('林慧');

    await userEvent.setup().click(screen.getByRole('button', { name: '回首頁' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('個人帳戶：密碼不外洩', () => {
  it('密碼不進 storage、不進網址、不進 console，也不留在提交失敗後的畫面上', async () => {
    const secret = 'submitted-secret-9';
    const logged: string[] = [];

    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((value) => String(value)).join(' '));
      });
    }

    renderAccount({ changePassword: () => jsonResponse(403, { error: 'invalid_current_password' }) });

    await waitForName('林慧');

    await fillAndSubmit(userEvent.setup(), 'old-password-1', secret);

    await screen.findByText('現在的密碼不正確。');

    expect(window.location.href.includes(secret)).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.body.innerHTML.includes(secret)).toBe(false);
    expect(logged.some((line) => line.includes(secret))).toBe(false);
  });
});

describe('個人帳戶：首次強制改密碼要先引導', () => {
  it('未改密碼的人一登入就被帶去改密碼頁，而且不會去讀 app 清單', async () => {
    const api = installFakeApi({
      state: () =>
        jsonResponse(200, {
          setupRequired: false,
          signedIn: true,
          user: { ...WAI, mustChangePassword: true },
        }),
      me: () => ME({ ...WAI, mustChangePassword: true }),
      settings: () => jsonResponse(200, { settings: [] }),
      modules: () => jsonResponse(200, { modules: [] }),
    });

    window.history.replaceState(null, '', '/#/');
    render(<App />);

    await screen.findByText('你要先改密碼，才可以用其他功能。');

    expect(window.location.hash).toBe('#/account');
    // /modules 在未改密碼時一定 403 password_change_required；不去問，就不會顯示成「沒有權限」。
    expect(api.count('modules')).toBe(0);
  });

  it('首頁主選單有「帳戶」真導覽：員工都到得了自己那一頁', async () => {
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: WAI }),
      me: () => ME(),
      modules: () => jsonResponse(200, { modules: [] }),
    });

    window.history.replaceState(null, '', '/#/');
    render(<App />);

    // 首頁（不是帳戶頁）：等首頁的標題，不是等 data-account-name。
    await screen.findByRole('heading', { name: '今日' });

    // 舊首頁 footer 嘅帳戶連結已移除，改由 Frame 主選單嘅真導覽進入。
    const accountNav = screen.getByRole('button', { name: '帳戶' });

    expect(accountNav).toBeTruthy();
    await userEvent.setup().click(accountNav);

    expect(window.location.hash).toBe('#/account');
  });

  it('已自行設定密碼的人可以由首頁去帳戶頁，見到同一個身份', async () => {
    installFakeApi({
      state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: WAI }),
      me: () => ME(),
      modules: () => jsonResponse(200, { modules: [] }),
      settings: () => jsonResponse(200, { settings: [] }),
    });

    window.history.replaceState(null, '', '/#/account');
    render(<App />);

    await screen.findByRole('heading', { name: '個人帳戶與安全' });
    await waitForName('林慧');
  });
});
