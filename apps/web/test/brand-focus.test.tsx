// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeApi,
  type FakeHandlers,
  type RecordedRequest,
} from './helpers/fake-api';

/**
 * 記住每位員工上次工作的品牌（issue #15）。
 *
 * 四件事，每一件都獨立可證：
 *   1. 伺服器記住的那一個，就是畫面選中的那一個（唔會重新隨機）。
 *   2. 第一次（冇記錄）：隨機揀一個，並即刻寫返伺服器 —— 下一次就固定。
 *   3. 記錄指的品牌已經冇了：當第一次處理，寫一個仍然存在的，不留空白。
 *   4. 自己換品牌：寫入新的一個。
 *
 * 這裡走真 `App` + 真登入表單 + 真品牌 selector：記憶是「登入之後見到邊個
 * 品牌」的結果，不是某個 hook 自己講。
 */

const WAI = {
  id: 'u-wai',
  email: 'wai@example.com',
  displayName: '林慧',
  role: 'staff',
  department: 'design',
  mustChangePassword: false,
};

const DESIGN = {
  id: 'design',
  title: 'Design',
  kind: 'department',
  department: 'design',
  order: 10,
  available: true,
  route: '/design',
};

const MOONIC = { id: 'b-moonic', code: 'moonic', name: 'Moonic' };
const HX = { id: 'b-hx', code: 'hxdesign', name: 'HX Design' };
const BRANDS = [MOONIC, HX];

/** 寫入 focus 的請求（PUT），由請求內容取出 brandId。 */
function focusWrites(api: FakeApi): string[] {
  return api.calls
    .filter((call) => call.path.endsWith('/me/brand-focus') && call.method === 'PUT')
    .map((call) => String((JSON.parse(call.body ?? '{}') as { brandId?: string }).brandId ?? ''));
}

function focusReads(api: FakeApi): RecordedRequest[] {
  return api.calls.filter(
    (call) => call.path.endsWith('/me/brand-focus') && call.method === 'GET',
  );
}

/** 哪一行被標成「而家嘅品牌」。 */
function currentBrandName(): string | null {
  const row = document.querySelector('[data-brand-row][data-brand-current="true"]');

  return row?.querySelector('.design-brands__name')?.textContent ?? null;
}

async function signInAsStaff(focusBrandId: string | null, handlers: FakeHandlers = {}): Promise<FakeApi> {
  window.history.replaceState(null, '', '/#/login');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: false }),
    login: () => jsonResponse(200, { user: WAI }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: (request) =>
      request.method === 'GET'
        ? jsonResponse(200, { brandId: focusBrandId })
        : jsonResponse(200, { brandId: (JSON.parse(request.body ?? '{}') as { brandId: string }).brandId }),
    ...handlers,
  });

  render(<App />);

  await userEvent.type(await screen.findByLabelText('電郵'), WAI.email);
  await userEvent.type(screen.getByLabelText('密碼'), 'correct-horse-battery');
  await userEvent.click(screen.getByRole('button', { name: '登入' }));

  // 兩件事都要等到：落到 /design，而且品牌清單真的畫出來。
  await waitFor(() => {
    expect(window.location.hash).toBe('#/design');
  });
  await waitFor(() => {
    expect(document.querySelectorAll('[data-brand-row]').length).toBe(BRANDS.length);
  });

  return api;
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  resetBrowserState();
  // 品牌快取與「第一次揀邊個」都是模組層狀態，不清就會跨測試傳染。
  resetDirectoryCache();
});

describe('記住上次工作的品牌', () => {
  it('伺服器記住的那一個就是選中的那一個，而且唔會再寫一次', async () => {
    const api = await signInAsStaff(HX.id);

    await waitFor(() => {
      expect(currentBrandName()).toBe('HX Design');
    });

    expect(focusWrites(api)).toEqual([]);
    // 讀一次就夠：selector 同頁面共用同一個請求結果。
    expect(focusReads(api)).toHaveLength(1);
  });

  it('第一次：隨機揀一個，並即刻寫返伺服器', async () => {
    const api = await signInAsStaff(null);

    await waitFor(() => {
      expect(focusWrites(api)).toHaveLength(1);
    });

    const written = focusWrites(api)[0] ?? '';

    expect(BRANDS.map((brand) => brand.id)).toContain(written);
    // 畫面上選中的那一個，就是寫入的那一個 —— 唔可以寫 A 顯示 B。
    await waitFor(() => {
      const name = currentBrandName();
      expect(name).toBe(written === MOONIC.id ? 'Moonic' : 'HX Design');
    });
  });

  /**
   * 隨機要真係隨機，唔可以偷偷變成「永遠揀第一個」。
   * 用固定的亂數值證明「揀第幾個」係由亂數決定：0.99 落在清單最尾那一個。
   */
  it('第一次的隨機會用到清單唔同位置，唔係永遠揀第一個', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const api = await signInAsStaff(null);

    await waitFor(() => {
      expect(focusWrites(api)).toHaveLength(1);
    });

    expect(focusWrites(api)).toEqual([HX.id]);
    expect(currentBrandName()).toBe('HX Design');
  });

  it('記住的品牌已經唔存在：當第一次處理，寫一個仍然存在嘅', async () => {
    const api = await signInAsStaff('00000000-0000-4000-8000-000000000000');

    await waitFor(() => {
      expect(focusWrites(api)).toHaveLength(1);
    });

    expect(BRANDS.map((brand) => brand.id)).toContain(focusWrites(api)[0]);
    expect(currentBrandName()).not.toBeNull();
  });

  it('自己換品牌：寫入新揀嘅一個', async () => {
    const api = await signInAsStaff(MOONIC.id);

    await waitFor(() => {
      expect(currentBrandName()).toBe('Moonic');
    });

    await userEvent.click(screen.getByRole('button', { name: '選擇品牌' }));

    const list = await screen.findByRole('listbox', { name: '選擇品牌' });

    await userEvent.click(within(list).getByRole('option', { name: 'HX Design' }));

    await waitFor(() => {
      expect(currentBrandName()).toBe('HX Design');
    });

    expect(focusWrites(api)).toEqual([HX.id]);
  });
});
