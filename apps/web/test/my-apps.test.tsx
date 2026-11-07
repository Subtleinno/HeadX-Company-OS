// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * 我的 Apps（issue 123）。
 *
 * 這一頁最容易寫錯的地方是「把可唔可以入去交畀前端猜」：
 *
 *   1. app 清單只有一個來源（`GET /modules`），唔可以自己抄一份。
 *   2. 可不可以入去由 `GET /app-grants/access/:appId` 講，前端只轉述。
 *   3. 未啟用／未授權唔可以顯示成「可用」；查不到就講查不到，
 *      唔可以當成「不允許」，亦唔可以當成「允許」。
 *   4. `available: false` 的 app 就算 access 回 allowed，都不可以顯示成可以入。
 */

const WAI = { id: 'u-wai', email: 'wai@example.com', displayName: '林慧', role: 'staff' };

type Module = {
  id: string;
  title: string;
  kind: string;
  department: string | null;
  order: number;
  available: boolean;
};

const SALES: Module = {
  id: 'sales',
  title: '銷售',
  kind: 'department',
  department: 'sales',
  order: 2,
  available: false,
};

const DESIGN: Module = {
  id: 'design',
  title: '設計／內容／網站',
  kind: 'department',
  department: 'design',
  order: 3,
  available: true,
};

function openHome(handlers: FakeHandlers = {}, user: typeof WAI = WAI) {
  window.history.replaceState(null, '', '/#/');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    settings: () => jsonResponse(200, { settings: [] }),
    modules: () => jsonResponse(200, { modules: [SALES, DESIGN] }),
    appAccess: () => jsonResponse(200, { allowed: false, reason: 'app_disabled' }),
    ...handlers,
  });

  render(<App />);

  return api;
}

function card(id: string): HTMLElement {
  return document.querySelector(`[data-app-id="${id}"]`) as HTMLElement;
}

async function waitForCard(id: string): Promise<void> {
  await waitFor(() => {
    expect(document.querySelector(`[data-app-id="${id}"]`)).not.toBeNull();
  });
}

const accessCalls = (api: { calls: { path: string }[] }, id: string): number =>
  api.calls.filter((call) => call.path.includes(`/app-grants/access/${id}`)).length;

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('我的 Apps：清單來源', () => {
  it('列出 manifest 的欄位：名稱、id、類型、部門', async () => {
    openHome();

    await waitForCard('design');

    const text = card('design').textContent ?? '';

    expect(text).toContain('設計／內容／網站');
    expect(text).toContain('design');
    expect(text).toContain('部門');
    expect(text).toContain('design 部');
  });

  it('每個 app 只查一次存取判斷', async () => {
    const api = openHome();

    await waitForCard('design');

    expect(accessCalls(api, 'sales')).toBe(1);
    expect(accessCalls(api, 'design')).toBe(1);
  });

  it('清單為空時如實講，不是靜靜一片空白', async () => {
    openHome({ modules: () => jsonResponse(200, { modules: [] }) });

    await waitFor(() => {
      expect(document.body.textContent).toContain('沒有任何 app');
    });
  });

  it('讀取失敗要有原因與重試，不偽裝成空清單', async () => {
    let attempts = 0;

    openHome({
      modules: () => {
        attempts += 1;

        return attempts === 1
          ? jsonResponse(503, { error: 'service_unavailable', message: '資料庫連不上' })
          : jsonResponse(200, { modules: [SALES] });
      },
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('讀不到 app 清單');
    });

    expect(document.body.textContent).toContain('資料庫連不上');
    expect(document.body.textContent).not.toContain('沒有任何 app');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '重試' }));

    await waitForCard('sales');
  });

  it('401 講 session 失效，403 講無權限', async () => {
    openHome({ modules: () => jsonResponse(401, { error: 'not_signed_in' }) });

    await waitFor(() => {
      expect(document.body.textContent).toContain('登入已經失效');
    });

    cleanup();
    resetBrowserState();

    openHome({ modules: () => jsonResponse(403, { error: 'forbidden' }) });

    await waitFor(() => {
      expect(document.body.textContent).toContain('你沒有查看 app 清單的權限');
    });
  });
});

describe('我的 Apps：可不可以入去由後端講', () => {
  it('憑老闆身份允許時照原文轉述', async () => {
    openHome(
      { appAccess: () => jsonResponse(200, { allowed: true, via: 'owner' }) },
      { ...WAI, role: 'owner' },
    );

    await waitForCard('design');

    expect(card('design').textContent).toContain('允許（憑老闆身份）');
  });

  it('憑授權允許時照原文轉述', async () => {
    openHome({ appAccess: () => jsonResponse(200, { allowed: true, via: 'grant' }) });

    await waitForCard('design');

    expect(card('design').textContent).toContain('允許（憑授權）');
  });

  it('不允許時顯示原因代碼與人話，不是「可用」', async () => {
    openHome();

    await waitForCard('sales');

    const text = card('sales').textContent ?? '';

    expect(text).toContain('app_disabled');
    expect(text).toContain('這個 app 未啟用');
    expect(text).not.toContain('允許（憑');
  });

  it('存取判斷本身失敗時講「查不到」，不當成不允許也不當成允許', async () => {
    openHome({ appAccess: () => jsonResponse(500, { error: 'boom' }) });

    await waitForCard('sales');

    const text = card('sales').textContent ?? '';

    expect(text).toContain('查不到');
    expect(text).not.toContain('允許（憑');
    // 「查不到」不可以寫成「不允許」：兩者對用戶的意義剛好相反。
    expect(text).not.toContain('不允許');
  });

  it('未啟用的 app 就算 access 允許都不可以進入', async () => {
    openHome({ appAccess: () => jsonResponse(200, { allowed: true, via: 'owner' }) });

    await waitForCard('sales');

    const enter = document.querySelector('[data-app-enter="sales"]') as HTMLButtonElement;

    expect(enter.disabled).toBe(true);
    expect(card('sales').textContent).toContain('未啟用');
  });

  it('進入鍵如實講「未接駁」，不做一個假裝會跳的鍵', async () => {
    openHome({ appAccess: () => jsonResponse(200, { allowed: true, via: 'grant' }) });

    await waitForCard('design');

    const enter = document.querySelector('[data-app-enter="design"]') as HTMLButtonElement;

    expect(enter.disabled).toBe(true);
    expect(card('design').textContent).toContain('未有前端入口');
  });
});

describe('我的 Apps：範圍與界線', () => {
  it('未能按品牌過濾就如實講，不做假的品牌下拉', async () => {
    openHome();

    await waitForCard('sales');

    expect(document.body.textContent).toContain('品牌身份契約未定');
    expect(screen.queryByRole('button', { name: /品牌/ })).toBeNull();
  });

  it('不會自己造一個「可用」的 app（六個全部未啟用時一個都不可以入）', async () => {
    openHome({
      modules: () => jsonResponse(200, { modules: [SALES, { ...DESIGN, available: false }] }),
      appAccess: () => jsonResponse(200, { allowed: true, via: 'owner' }),
    });

    await waitForCard('design');

    const enters = Array.from(document.querySelectorAll('[data-app-enter]')) as HTMLButtonElement[];

    expect(enters.length).toBe(2);
    expect(enters.every((button) => button.disabled)).toBe(true);
  });

  it('員工只會見到後端給他的 app（前端不自己補）', async () => {
    openHome({ modules: () => jsonResponse(200, { modules: [SALES] }) });

    await waitForCard('sales');

    expect(document.querySelectorAll('[data-app-id]').length).toBe(1);
  });

  it('卡片內的文字都在同一張卡，不會串到另一個 app', async () => {
    openHome({
      modules: () => jsonResponse(200, { modules: [SALES, DESIGN] }),
      appAccess: (request) =>
        request.path.includes('design')
          ? jsonResponse(200, { allowed: true, via: 'grant' })
          : jsonResponse(200, { allowed: false, reason: 'grant_missing' }),
    });

    await waitForCard('design');

    expect(within(card('design')).getByText(/允許（憑授權）/)).toBeDefined();
    expect(card('sales').textContent).toContain('grant_missing');
    expect(card('sales').textContent).not.toContain('允許（憑授權）');
  });
});
