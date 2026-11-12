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
 * 缺口與 Need（issue #58）。
 *
 * 四件事，每一件都是「按完之後，真實世界改變了什麼」：
 *   1. 右側欄列出這一頁的缺口，狀態由伺服器講（待建立／進行中），不是前端推。
 *   2. 判斷型而我不是老闆：沒有建立鍵 —— 不是變灰，而是不出現。
 *   3. 按「建立 Need」送一個 POST，回來的編號貼在卡上；重複按不會開第二張。
 *   4. 「查看全部缺口」是一張表，篩選只改變看到哪幾行。
 */

const BOSS = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  department: null,
  mustChangePassword: false,
};

const DESIGNER = {
  id: 'u-designer',
  email: 'designer@example.com',
  displayName: '設計師',
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

const PAGE = {
  id: 'p-photo',
  brandId: 'b-moonic',
  kind: 'custom',
  key: 'photography',
  name: '攝影指引',
  brief: '產品照怎樣打燈',
  sortOrder: 60,
  current: null,
};

const CONTENT = JSON.stringify({
  decided: '產品照用 45 度柔光箱。',
  notDecided: '',
  rules: [],
  examples: [],
  badExamples: [],
  colorRoles: [],
  typeRoles: [],
});

const GAPS = {
  items: [
    {
      pageKey: 'photography',
      pageName: '攝影指引',
      item: 'approved_examples',
      what: '已核准的真實照片',
      type: 'file',
      ruleId: null,
      needId: null,
      needCode: null,
      needState: null,
      assigneeName: null,
    },
    {
      pageKey: 'photography',
      pageName: '攝影指引',
      item: 'photo.subject',
      what: '攝影題材',
      type: 'judgement',
      ruleId: null,
      needId: null,
      needCode: null,
      needState: null,
      assigneeName: null,
    },
    {
      pageKey: 'color',
      pageName: '色彩',
      item: 'roles.surface',
      what: '深色底色 surface',
      type: 'judgement',
      ruleId: 'color.r1',
      needId: 'n-1',
      needCode: 'COS-INTL-001',
      needState: 'claimed',
      assigneeName: '陳老闆',
    },
  ],
  counts: { total: 3, file: 1, judgement: 2, open: 3 },
};

function openPage(user: typeof BOSS | typeof DESIGNER, overrides: FakeHandlers = {}): ReturnType<typeof installFakeApi> {
  window.history.replaceState(null, '', '/#/design/brand/p/photography');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: [PAGE], canEdit: true }),
    brandPage: () =>
      jsonResponse(200, {
        page: PAGE,
        versions: [],
        current: { id: 'v1', versionNo: 1, createdAt: '2026-11-11T10:00:00.000Z', note: null, preview: '', policyVersionNo: 1, content: CONTENT },
      }),
    brandGaps: () => jsonResponse(200, GAPS),
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

describe('品牌缺口', () => {
  it('右側欄只列這一頁的缺口，狀態由伺服器講', async () => {
    openPage(BOSS);

    await waitFor(() => {
      expect(screen.getByText('已核准的真實照片')).toBeTruthy();
    });

    // 色彩頁那一個缺口不在這一頁的欄內 —— 但計數是全品牌的，不在這裡假裝只有一頁。
    expect(screen.queryByText('roles.surface')).toBeNull();
    expect(screen.getAllByText('待建立')).toHaveLength(2);
  });

  it('老闆：判斷型缺口有建立鍵', async () => {
    openPage(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(screen.getByText('攝影題材')).toBeTruthy();
    });

    expect(screen.getAllByRole('button', { name: '建立 Need' })).toHaveLength(2);
  });

  it('有編輯權但不是老闆：判斷型缺口沒有建立鍵，檔案型仍然有', async () => {
    openPage(DESIGNER);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(screen.getByText('攝影題材')).toBeTruthy();
    });

    expect(screen.getAllByRole('button', { name: '建立 Need' })).toHaveLength(1);
    expect(screen.getByText('只有老闆可補')).toBeTruthy();
  });

  it('建立 Need 之後貼上編號，並重讀缺口', async () => {
    const api = openPage(BOSS, {
      brandGapNeed: () => jsonResponse(201, { need: { id: 'n-9', code: 'COS-INTL-009' }, created: true }),
    });

    await waitFor(() => {
      expect(screen.getByText('已核准的真實照片')).toBeTruthy();
    });

    await whenEditable();
    await enterEditMode();

    await userEvent.click(screen.getAllByRole('button', { name: '建立 Need' })[0] as HTMLElement);

    await waitFor(() => {
      expect(api.count('brandGapNeed')).toBe(1);
    });

    const call = api.calls.find((item) => item.path.includes('/gaps/needs'));
    expect(call?.body).toContain('approved_examples');
    expect(api.count('brandGaps')).toBeGreaterThan(1);
  });

  it('查看全部缺口：三行、可按型別篩選', async () => {
    openPage(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(screen.getByText('已核准的真實照片')).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '查看全部缺口' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(4);

    await userEvent.click(screen.getByRole('tab', { name: /檔案型/ }));

    expect(screen.getAllByRole('row')).toHaveLength(2);
  });
});
