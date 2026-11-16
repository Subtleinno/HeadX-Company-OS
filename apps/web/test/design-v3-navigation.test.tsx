// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState } from './helpers/fake-api';

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

function open(hash = '/#/design/create/projects') {
  window.history.replaceState(null, '', hash);

  installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: [], canEdit: true }),
    projects: () => jsonResponse(200, { projects: [], total: 0 }),
  });

  render(<App />);
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

    expect(await screen.findByText('這個品牌尚未有 Project')).toBeTruthy();

    const tabs = moduleTabs();
    expect(Array.from(tabs.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      '創作',
      '品牌',
      '素材',
      '知識',
      'Templates',
    ]);
    expect(within(tabs).queryByText('Needs')).toBeNull();
  });

  it('Create 子導覽是 Projects／Outputs，並可由 Outputs 回去 Projects', async () => {
    open('/#/design/create/outputs');

    expect(await screen.findByText('Outputs 未提供')).toBeTruthy();
    const subbar = document.querySelector('[data-frame-subbar]') as HTMLElement;
    await userEvent.click(within(subbar).getByRole('button', { name: 'Projects' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/design/create/projects');
    });
    expect(await screen.findByText('這個品牌尚未有 Project')).toBeTruthy();
  });

  it.each([
    ['/#/design/material/library', '素材庫 未提供'],
    ['/#/design/knowledge/list', '內容清單 未提供'],
    ['/#/design/templates/library', 'Templates 未提供'],
  ])('%s 顯示真實空狀態，不是通用空白頁', async (hash, title) => {
    open(hash);

    expect(await screen.findByText(title)).toBeTruthy();
    expect(document.querySelector('[data-design-module-state="empty"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /AI|生成|新增|上載/ })).toBeNull();
  });

  it('按 Templates 頂層入口會到固定路由', async () => {
    open();

    await waitFor(() => {
      expect(within(moduleTabs()).getByRole('button', { name: 'Templates' })).toBeTruthy();
    });
    await userEvent.click(within(moduleTabs()).getByRole('button', { name: 'Templates' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/design/templates/library');
    });
    expect(await screen.findByText('Templates 未提供')).toBeTruthy();
  });
});
