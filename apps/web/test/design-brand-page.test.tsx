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
import { enterEditMode, whenEditable } from './helpers/brand-page';

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

/*
 * 這一支驗的是**版本鏈**，與內容儲存成甚麼形狀無關，所以用一張自定義頁。
 *
 * 固定頁一個一個變成表（色彩 #35、字體 #38、標誌 #36、語氣 #37、主頁 #39，
 * 自定義頁 #41），自由文字的框已經沒有了 —— 原本這裡靠 `textarea` 抓「老闆
 * 打到的那段字」，現在改用自定義頁的「這一頁決定什麼」（`data-custom-decided`），
 * 它是整個品牌模組最後一個仍然是「打一段字」的欄位。
 *
 * 內容因此是自定義頁的 JSON（`{"decided":"…"}`）。這不影響這一支要驗的事：
 * 送出去的就是打的那段字、空的就不送、員工只讀 —— 三件都仍然逐條驗得到。
 */
const PAGES = [
  {
    id: 'p-photo',
    brandId: 'b-moonic',
    kind: 'custom',
    key: 'photography',
    name: '攝影指引',
    brief: '產品照怎樣打燈',
    sortOrder: 60,
    current: { id: 'v2', versionNo: 2, createdAt: '2026-11-11T10:00:00.000Z', note: null, preview: '第二版內容', policyVersionNo: 2 },
  },
];

/** 自定義頁的一段內容：只填「決定什麼」，其餘留空，清空它就是真的空。 */
function customContent(decided: string): string {
  return JSON.stringify({
    decided,
    notDecided: '',
    rules: [],
    examples: [],
    badExamples: [],
    colorRoles: [],
    typeRoles: [],
  });
}

const V2_DOC = customContent('第二版內容');

const V2 = { id: 'v2', versionNo: 2, createdAt: '2026-11-11T10:00:00.000Z', note: null, preview: '第二版內容', policyVersionNo: 2 };
const V1 = { id: 'v1', versionNo: 1, createdAt: '2026-11-10T10:00:00.000Z', note: '第一次', preview: '第一版內容', policyVersionNo: 1 };

function pageDetail(overrides: { current?: unknown; versions?: unknown[] } = {}) {
  return {
    page: PAGES[0],
    versions: overrides.versions ?? [V2, V1],
    current: overrides.current === undefined ? { ...V2, content: V2_DOC } : overrides.current,
  };
}

function openPage(
  user: typeof BOSS | typeof WAI,
  overrides: FakeHandlers = {},
): ReturnType<typeof installFakeApi> {
  window.history.replaceState(null, '', '/#/design/brand/photography');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    // 寫入介面由伺服器回的 canEdit 決定（品牌級授權，#32）；畫面不自己看 role。
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: user.role === 'owner' }),
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
      expect(document.querySelector('[data-brand-page="photography"]')).not.toBeNull();
    });

    await waitFor(() => {
      expect(document.querySelector('[data-custom-decided]')).not.toBeNull();
    });

    const editor = document.querySelector<HTMLTextAreaElement>('[data-custom-decided]');
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
      await screen.findAllByText('這一頁還沒有任何版本。第一次儲存會建立第 1 版。'),
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-brand-page-version]').length).toBe(0);
  });

  it('儲存：送出的就是打的內容，成功後講明建立了第幾版', async () => {
    const api = openPage(BOSS, {
      brandPageSave: () =>
        jsonResponse(201, {
          version: { ...V2, versionNo: 3, content: customContent('第三版內容') },
        }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-custom-decided]')).not.toBeNull();
    });

    const editor = document.querySelector<HTMLTextAreaElement>('[data-custom-decided]');

    if (editor === null) {
      throw new Error('找不到輸入框');
    }

    await whenEditable();
    await enterEditMode();

    await userEvent.clear(editor);
    await userEvent.type(editor, '第三版內容');
    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));

    await waitFor(() => {
      expect(screen.getByText('已儲存第 3 版。')).toBeTruthy();
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/versions'));
    expect(call).toBeDefined();

    const body = JSON.parse(call?.body ?? '{}') as { content?: string };
    expect(JSON.parse(body.content ?? '{}')).toMatchObject({ decided: '第三版內容' });
  });

  it('空內容：不送出，當場講明未有內容', async () => {
    const api = openPage(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-custom-decided]')).not.toBeNull();
    });

    const editor = document.querySelector<HTMLTextAreaElement>('[data-custom-decided]');

    if (editor === null) {
      throw new Error('找不到輸入框');
    }

    await whenEditable();
    await enterEditMode();

    await userEvent.clear(editor);
    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));

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
      expect(document.querySelector('[data-custom-decided]')).not.toBeNull();
    });

    const editor = document.querySelector<HTMLTextAreaElement>('[data-custom-decided]');
    expect(editor?.readOnly).toBe(true);
    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-brand-page-delete="1"]')).toBeNull();
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });

  it('讀不到頁面：講讀不到，而且有重試；不是白畫面', async () => {
    openPage(BOSS, {
      brandPage: () => jsonResponse(500, { error: 'boom' }),
    });

    expect(await screen.findByText('讀不到這一頁。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });

  it('頁面不存在：講明可能已改名或者刪除', async () => {
    openPage(BOSS, {
      brandPage: () => jsonResponse(404, { error: 'page_not_found' }),
    });

    expect(await screen.findByText('這一頁不存在。可能已經改名或者刪除。')).toBeTruthy();
  });
});
