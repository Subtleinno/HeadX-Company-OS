// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeHandlers,
} from './helpers/fake-api';

/**
 * 品牌頁版本（issue #33）。
 *
 * 這一張要證明四件事，每一件都是「按完之後，真實世界改變了什麼」：
 *
 *   1. 現行與舊版同時看得見 —— 而且「現行」那一個是伺服器說的，不是前端推的。
 *   2. 儲存＝新增一版（POST 一個 version），不是改寫上一版。
 *   3. 現行版本沒有刪除鍵：不是變灰，而是不出現。變灰會令人以為等一等就可以。
 *   4. 被拒絕時原樣講伺服器那句（現行／被成品釘住），不自創理由。
 *
 * 讀與寫的權限差別另有一條：員工看得到、改不了。這一條單獨驗，因為
 * 「按鈕變灰」與「後端真的拒絕」是兩件事 —— 後端那半在
 * `brand-page-versions.integration.test.ts`。
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

const PAGES = [
  { id: 'p-home', brandId: 'b-moonic', kind: 'fixed', key: 'home', name: '品牌主頁', brief: null, sortOrder: 10, current: null },
  { id: 'p-logo', brandId: 'b-moonic', kind: 'fixed', key: 'logo', name: '標誌', brief: null, sortOrder: 20, current: { id: 'v2', versionNo: 2, createdAt: '2026-11-11T10:00:00.000Z', note: null, preview: '第二版內容', policyVersionNo: 2 } },
  { id: 'p-color', brandId: 'b-moonic', kind: 'fixed', key: 'color', name: '色彩', brief: null, sortOrder: 30, current: null },
];

const V2 = { id: 'v2', versionNo: 2, createdAt: '2026-11-11T10:00:00.000Z', note: null, preview: '第二版內容', policyVersionNo: 2 };
const V1 = { id: 'v1', versionNo: 1, createdAt: '2026-11-10T10:00:00.000Z', note: '第一次', preview: '第一版內容', policyVersionNo: 1 };

function pageDetail(overrides: { current?: unknown; versions?: unknown[] } = {}) {
  return {
    page: PAGES[1],
    versions: overrides.versions ?? [V2, V1],
    current: overrides.current === undefined ? { ...V2, content: '第二版內容' } : overrides.current,
  };
}

function openPage(
  user: typeof BOSS | typeof WAI,
  overrides: FakeHandlers = {},
): ReturnType<typeof installFakeApi> {
  window.history.replaceState(null, '', '/#/design/brand/page/logo');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES }),
    brandPage: () => jsonResponse(200, pageDetail()),
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

describe('品牌頁版本', () => {
  it('老闆：見到現行內容與舊版列表，現行那一版沒有刪除鍵', async () => {
    openPage(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-brand-page="logo"]')).not.toBeNull();
    });

    const editor = document.querySelector('textarea');
    expect(editor?.value).toBe('第二版內容');

    expect(document.querySelectorAll('[data-brand-page-version]').length).toBe(2);
    expect(document.querySelector('[data-brand-page-version="2"]')?.getAttribute('data-current')).toBe('true');

    // 現行版本：不出現刪除鍵（不是變灰）。
    expect(document.querySelector('[data-brand-page-delete="2"]')).toBeNull();
    expect(document.querySelector('[data-brand-page-restore="2"]')).toBeNull();

    // 舊版可以做兩件事：用回它，或者刪它。
    expect(document.querySelector('[data-brand-page-restore="1"]')).not.toBeNull();
    expect(document.querySelector('[data-brand-page-delete="1"]')).not.toBeNull();

    expect(screen.getByText('現行')).toBeTruthy();
  });

  it('未有版本：講明未有版本，不畫一個空的第 1 版', async () => {
    openPage(BOSS, {
      brandPage: () => jsonResponse(200, pageDetail({ current: null, versions: [] })),
    });

    expect(
      await screen.findAllByText('這一頁仲未有任何版本。第一次儲存會建立第 1 版。'),
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-brand-page-version]').length).toBe(0);
  });

  it('儲存：送出的就是打的內容，成功後講明建立了第幾版', async () => {
    const api = openPage(BOSS, {
      brandPageSave: () =>
        jsonResponse(201, {
          version: { ...V2, versionNo: 3, content: '第三版內容' },
        }),
    });

    await waitFor(() => {
      expect(document.querySelector('textarea')).not.toBeNull();
    });

    const editor = document.querySelector('textarea');

    if (editor === null) {
      throw new Error('找不到輸入框');
    }

    await userEvent.clear(editor);
    await userEvent.type(editor, '第三版內容');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(screen.getByText('已儲存第 3 版。')).toBeTruthy();
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/versions'));
    expect(call).toBeDefined();
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ content: '第三版內容' });
  });

  it('空內容：不送出，當場講明未有內容', async () => {
    const api = openPage(BOSS);

    await waitFor(() => {
      expect(document.querySelector('textarea')).not.toBeNull();
    });

    const editor = document.querySelector('textarea');

    if (editor === null) {
      throw new Error('找不到輸入框');
    }

    await userEvent.clear(editor);
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    expect(api.count('brandPageSave')).toBe(0);
    expect(document.querySelector('[data-brand-page-save]')?.hasAttribute('disabled')).toBe(true);
  });

  it('刪除要按兩次：第一次只是問，第二次才送 DELETE', async () => {
    const api = openPage(BOSS, {
      brandPageDelete: () => jsonResponse(200, { deleted: true, versionNo: 1 }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-brand-page-delete="1"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByText('刪除'));

    expect(api.count('brandPageDelete')).toBe(0);
    expect(screen.getByText('再按一次確定刪除')).toBeTruthy();

    await userEvent.click(screen.getByText('再按一次確定刪除'));

    await waitFor(() => {
      expect(api.count('brandPageDelete')).toBe(1);
    });
    expect(await screen.findByText('已刪除第 1 版。')).toBeTruthy();
  });

  it('刪除被拒：原樣講伺服器那句，不自創理由', async () => {
    openPage(BOSS, {
      brandPageDelete: () =>
        jsonResponse(409, {
          error: 'version_pinned',
          message: '第 1 版被已出街成品釘住（2026 秋季包裝盒 v2）。要斷開，先改那一件成品。',
        }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-brand-page-delete="1"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByText('刪除'));
    await userEvent.click(screen.getByText('再按一次確定刪除'));

    expect(
      await screen.findByText(
        '第 1 版被已出街成品釘住（2026 秋季包裝盒 v2）。要斷開，先改那一件成品。',
      ),
    ).toBeTruthy();
  });

  it('用回舊版：送去 restore，不是把現行改掉', async () => {
    const api = openPage(BOSS, {
      brandPageRestore: () =>
        jsonResponse(201, { version: { ...V2, versionNo: 3, content: '第一版內容' } }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-brand-page-restore="1"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByText('用這一版'));

    await waitFor(() => {
      expect(api.count('brandPageRestore')).toBe(1);
    });

    expect(api.calls.some((item) => item.path.endsWith('/versions/v1/restore'))).toBe(true);
    expect(await screen.findByText('已用第 1 版建立第 3 版。')).toBeTruthy();
  });

  it('員工：看得到內容，改不了（沒有儲存鍵，輸入框唯讀）', async () => {
    openPage(WAI);

    await waitFor(() => {
      expect(document.querySelector('textarea')).not.toBeNull();
    });

    const editor = document.querySelector('textarea');
    expect(editor?.readOnly).toBe(true);
    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-brand-page-delete="1"]')).toBeNull();
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });

  it('讀不到頁面：講讀不到，而且有重試；不是白畫面', async () => {
    openPage(BOSS, {
      brandPage: () => jsonResponse(500, { error: 'boom' }),
    });

    expect(await screen.findByText('讀唔到這一頁。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });

  it('頁面不存在：講明可能已改名或者刪除', async () => {
    openPage(BOSS, {
      brandPage: () => jsonResponse(404, { error: 'page_not_found' }),
    });

    expect(await screen.findByText('這一頁不存在。可能已經改名或者刪除。')).toBeTruthy();
  });
});
