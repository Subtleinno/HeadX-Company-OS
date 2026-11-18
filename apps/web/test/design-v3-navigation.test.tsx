// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

const BOSS = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  department: null,
  mustChangePassword: false,
};

const DESIGN = {
  id: 'design',
  title: 'Marketing Design',
  kind: 'department',
  department: 'design',
  order: 10,
  available: true,
  route: '/design',
};

const BRANDS = [{ id: 'b-moonic', code: 'moonic', name: 'Moonic' }];

function open(hash = '/#/design/create/projects', handlers: FakeHandlers = {}) {
  window.history.replaceState(null, '', hash);

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: [], canEdit: true }),
    projects: () => jsonResponse(200, { projects: [], total: 0 }),
    ...handlers,
  });

  render(<App />);
  return api;
}

function moduleTabs(): HTMLElement {
  const node = document.querySelector('[data-frame-slot="modules"]');
  expect(node).not.toBeNull();
  return node as HTMLElement;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('Marketing Design v3 導覽', () => {
  it('五個頂層入口可見；Needs 不住在業務模組列', async () => {
    open();

    expect(await screen.findByText('未有創作')).toBeTruthy();

    const tabs = moduleTabs();
    expect(Array.from(tabs.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      '製作',
      '品牌',
      '素材',
      '知識',
      '模板',
    ]);
    expect(within(tabs).queryByText('Needs')).toBeNull();
  });

  it('Create 顯示作品庫：格式過濾器＋資料夾／專案集樹', async () => {
    open('/#/design/create/projects', {
      library: () =>
        jsonResponse(200, {
          formats: [
            { id: 'f-ppt', name: 'PPT', sortOrder: 1 },
            { id: 'f-layout', name: '排版', sortOrder: 2 },
            { id: 'f-video', name: 'Video', sortOrder: 3 },
          ],
          folders: [{ id: 'd-1', name: '2026 春', count: 0 }],
          sets: [],
          deletedSets: [],
        }),
    });

    expect(await screen.findByText('未有創作')).toBeTruthy();

    const rail = document.querySelector('[data-create-rail]') as HTMLElement;
    expect(within(rail).getByRole('button', { name: '全部' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'PPT' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: '排版' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Video' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: '新資料夾' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: '新專案集' })).toBeTruthy();
    expect(within(rail).getByText('2026 春')).toBeTruthy();
  });

  it.each([
    ['/#/design/material/library'],
    ['/#/design/knowledge/list'],
    ['/#/design/templates/library'],
  ])('%s 留空骨架（11-17 清空待重做）', async (hash) => {
    open(hash);

    // 內容區不應畫出任何「已接通」的佔位卡或文字 —— 只留空骨架。
    await waitFor(() => {
      expect(document.querySelector('[data-frame-blank="true"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-design-module-state]')).toBeNull();
  });

  it('按 Templates 頂層入口會到固定路由', async () => {
    open();

    await waitFor(() => {
      expect(within(moduleTabs()).getByRole('button', { name: '模板' })).toBeTruthy();
    });
    await userEvent.click(within(moduleTabs()).getByRole('button', { name: '模板' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/design/templates/library');
    });
    expect(document.querySelector('[data-design-module-state]')).toBeNull();
  });

  it('Knowledge 模組留空骨架（11-17 清空待重做）', async () => {
    open('/#/design/knowledge/list');

    await waitFor(() => {
      expect(within(moduleTabs()).getByRole('button', { name: '知識' })).toBeTruthy();
    });
    expect(document.querySelector('[data-design-module-state]')).toBeNull();
    expect(document.querySelector('[data-frame-blank="true"]')).not.toBeNull();
  });
});
