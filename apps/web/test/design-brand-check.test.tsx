// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';
import { enterEditMode, whenEditable } from './helpers/brand-page';

/**
 * 驗證規則的畫面（issue #59）。
 *
 * 要證明的是三件在畫面上看得見的事：
 *   1. 三個數字一起出 —— 單看「不通過 0」會令人以為合格。
 *   2. 不通過有一條橫幅：規則 id、位置、怎樣改。它不阻止儲存。
 *   3. 跑不到檢查 ≠ 合格：講「檢查未跑到」，不畫一個綠色的 0。
 */

const BOSS = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  department: null,
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

const PAGE = {
  id: 'p-platform',
  brandId: 'b-moonic',
  kind: 'fixed',
  key: 'platform',
  name: '平台',
  brief: null,
  sortOrder: 10,
  current: null,
};

const CONTENT = JSON.stringify({ tests: { real: '二〇二四年幫三家診所改過預約流程' } });

const REPORT = {
  items: [
    {
      ruleId: 'platform.r1',
      state: 'fail',
      location: '平台／三檢・獨特',
      detail: '獨特的「專業」只是形容詞。',
      fix: '換成一件可以查證的事：誰、幾時、發生過什麼。',
    },
    { ruleId: 'color.r1', state: 'pass', location: '色彩／角色表', detail: '四個必要角色都有值。', fix: '' },
    {
      ruleId: 'type.r2',
      state: 'undetermined',
      location: '字體',
      detail: '字體頁未有版本。',
      fix: '先建立字體頁。',
    },
  ],
  summary: { pass: 1, fail: 1, undetermined: 1 },
  headline: {
    ruleId: 'platform.r1',
    state: 'fail',
    location: '平台／三檢・獨特',
    detail: '獨特的「專業」只是形容詞。',
    fix: '換成一件可以查證的事：誰、幾時、發生過什麼。',
  },
  pageKey: 'platform',
};

const PASSING = {
  items: [{ ruleId: 'platform.r1', state: 'pass', location: '平台／三檢', detail: '三項都有可查證的證據。', fix: '' }],
  summary: { pass: 1, fail: 0, undetermined: 0 },
  headline: null,
  pageKey: 'platform',
};

function openPage(overrides: FakeHandlers = {}): ReturnType<typeof installFakeApi> {
  window.history.replaceState(null, '', '/#/design/brand/p/platform');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: [PAGE], canEdit: true }),
    brandPage: () =>
      jsonResponse(200, {
        page: PAGE,
        versions: [],
        current: {
          id: 'v1',
          versionNo: 1,
          createdAt: '2026-11-11T10:00:00.000Z',
          note: null,
          preview: '',
          policyVersionNo: 1,
          content: CONTENT,
        },
      }),
    brandCheck: () => jsonResponse(200, REPORT),
    ...overrides,
  });

  render(<App />);

  return api;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('檢查摘要條', () => {
  it('三個數字一起出，並講最重要那一句', async () => {
    openPage();

    await waitFor(() => {
      expect(screen.getByText('通過 1')).toBeTruthy();
    });

    expect(screen.getByText('不通過 1')).toBeTruthy();
    expect(screen.getByText('無法判斷 1')).toBeTruthy();
    expect(screen.getByText('獨特的「專業」只是形容詞。')).toBeTruthy();
  });

  it('查看明細：逐條列規則 id、位置與怎樣改；無法判斷的一條連到缺口', async () => {
    openPage();

    await waitFor(() => {
      expect(screen.getByText('通過 1')).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '查看明細' }));

    // platform.r1 出現在兩處：橫幅與明細那一行 —— 兩處都是它，不是兩個問題。
    expect(screen.getAllByText('platform.r1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('type.r2')).toBeTruthy();
    expect(screen.getByText('平台／三檢・獨特')).toBeTruthy();
    expect(screen.getAllByText(/換成一件可以查證的事/).length).toBeGreaterThanOrEqual(2);

    // 只有無法判斷的那一條有「去缺口」：不通過不是缺資料。
    expect(screen.getAllByRole('button', { name: '去缺口' })).toHaveLength(1);
  });

  it('有不通過就有橫幅：規則 id、位置、怎樣改，而且不擋儲存', async () => {
    openPage();

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(screen.getByText('通過 1')).toBeTruthy();
    });

    const banner = document.querySelector('[data-brand-banner="platform.r1"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('不通過');
    expect(banner?.textContent).toContain('平台／三檢・獨特');
    expect(banner?.textContent).toContain('換成一件可以查證的事');

    // 儲存鍵仍然可用：檢查只報告。
    expect((screen.getByRole('button', { name: '儲存為新版本' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('全部通過就沒有橫幅', async () => {
    openPage({ brandCheck: () => jsonResponse(200, PASSING) });

    await waitFor(() => {
      expect(screen.getByText('通過 1')).toBeTruthy();
    });

    expect(document.querySelector('[data-brand-banner]')).toBeNull();
  });

  it('沒有規則的頁：講清楚，不畫一個 0 0 0 的綠條', async () => {
    openPage({
      brandCheck: () =>
        jsonResponse(200, { items: [], summary: { pass: 0, fail: 0, undetermined: 0 }, headline: null, pageKey: 'platform' }),
    });

    await waitFor(() => {
      expect(screen.getByText('這一頁沒有可以機械檢查的規則。')).toBeTruthy();
    });

    expect(screen.queryByText('不通過 0')).toBeNull();
  });

  it('檢查跑不到：講「不代表合格」，不畫綠色', async () => {
    openPage({ brandCheck: () => jsonResponse(500, { error: 'boom' }) });

    await waitFor(() => {
      expect(screen.getByText('檢查未跑到；這不代表合格。')).toBeTruthy();
    });

    expect(screen.queryByText('通過 0')).toBeNull();
  });

  it('儲存之後會再跑一次檢查 —— 檢查讀的是現行版本', async () => {
    const api = openPage({
      brandPageSave: () =>
        jsonResponse(201, {
          version: {
            id: 'v2',
            versionNo: 2,
            createdAt: '2026-11-11T11:00:00.000Z',
            note: null,
            preview: '',
            policyVersionNo: 1,
            content: CONTENT,
          },
        }),
    });

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(screen.getByText('通過 1')).toBeTruthy();
    });

    const before = api.count('brandCheck');

    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));

    await waitFor(() => {
      expect(api.count('brandCheck')).toBeGreaterThan(before);
    });
  });
});
