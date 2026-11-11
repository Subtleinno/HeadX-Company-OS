// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeApi } from './helpers/fake-api';

/**
 * 只有老闆可以開新品牌（issue #19）。
 *
 * 後端本來就係對的（`POST /brands` 由 requireOwner 把關）。要修的是前端：
 * 從前它對任何人都畫出「新增品牌」表單，員工填完按下去才收到 403，而畫面
 * 把 403 講成「品牌代碼或名稱有問題」—— 這是講錯原因。
 *
 * 所以這裡驗兩件事：員工見不到表單（而且要見到原因），老闆照舊見到。
 * 「員工見不到」不足以證明安全 —— 真正的閘在後端，所以另有一條 API 回歸測試
 * 在 `directory.integration.test.ts`（POST /brands 對員工 403）。
 */

const BOSS = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  department: null,
  mustChangePassword: false,
};

const WAI = {
  id: 'u-wai',
  email: 'wai@example.com',
  displayName: '林慧',
  role: 'staff',
  department: 'design',
  mustChangePassword: false,
};

const BRANDS = [{ id: 'b-moonic', code: 'moonic', name: 'Moonic' }];

const DESIGN = {
  id: 'design',
  title: 'Design',
  kind: 'department',
  department: 'design',
  order: 10,
  available: true,
  route: '/design',
};

function openDesign(user: typeof BOSS | typeof WAI): FakeApi {
  // 直接由 /design 開機：這一張測的是「有咩角色見到咩」，不是落點。
  window.history.replaceState(null, '', '/#/design');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: BRANDS[0]?.id ?? null }),
  });

  render(<App />);

  return api;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('只有老闆可以開新品牌', () => {
  it('老闆：見到新增品牌的表單', async () => {
    openDesign(BOSS);

    expect(await screen.findByRole('heading', { name: '新增品牌' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '建立' })).toBeTruthy();
    expect(document.querySelector('[data-brand-create="owner-only"]')).toBeNull();
  });

  it('員工：見不到表單，而且見到原因', async () => {
    openDesign(WAI);

    // 等品牌清單畫出來，證明這一頁真的渲染了，不是仍在載入。
    await waitFor(() => {
      expect(document.querySelectorAll('[data-brand-row]').length).toBe(1);
    });

    expect(screen.queryByRole('heading', { name: '新增品牌' })).toBeNull();
    expect(screen.queryByRole('button', { name: '建立' })).toBeNull();

    const note = document.querySelector('[data-brand-create="owner-only"]');

    expect(note).not.toBeNull();
    expect(note?.textContent).toBe(
      '只有老闆可以開新品牌。品牌一開就全公司都用得，所以入口只放喺老闆嗰邊。',
    );
  });

  it('員工：品牌清單照樣讀得到（selector 要用），只係唔可以開新的', async () => {
    const api = openDesign(WAI);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-brand-row]').length).toBe(1);
    });

    expect(api.calls.some((call) => call.path.endsWith('/brands') && call.method === 'GET')).toBe(
      true,
    );
    // 冇任何 POST：表單根本不存在，唔會有人誤按。
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });
});
