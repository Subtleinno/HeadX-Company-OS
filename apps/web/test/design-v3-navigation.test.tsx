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

    expect(await screen.findByText('這個品牌尚未有 Project')).toBeTruthy();

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

  it('Create 第二行切換格式，Library 與 Outputs 留在左欄', async () => {
    open('/#/design/create/outputs');

    expect((await screen.findAllByText('成品庫')).length).toBeGreaterThan(0);
    const subbar = document.querySelector('[data-frame-subbar]') as HTMLElement;
    expect(Array.from(subbar.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'IG Carousel', '簡報', '影片',
    ]);
    const sidebar = document.querySelector('[data-frame-rail]') as HTMLElement;
    await userEvent.click(within(sidebar).getByRole('button', { name: '全部作品' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/design/create/projects');
    });
    expect(await screen.findByText('這個品牌尚未有 Project')).toBeTruthy();
  });

  it.each([
    ['/#/design/material/library', '這個品牌尚未有素材'],
    ['/#/design/knowledge/list', '這個品牌尚未有知識'],
    ['/#/design/templates/library', 'Carousel 模板'],
  ])('%s 顯示已接通的真實功能', async (hash, title) => {
    open(hash);

    expect(await screen.findByText(title)).toBeTruthy();
    expect(document.querySelector('[data-design-module-state="empty"]')).toBeNull();
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
    expect(await screen.findByText('Carousel 模板')).toBeTruthy();
  });

  it('Knowledge 文件樹驅動選擇，新增與追加版本不會混用', async () => {
    const document = {
      id: '56c49b02-9c9b-4f1f-a22f-b15cb30e9a6e', brandId: 'b-moonic', title: '經期照顧', status: 'verified', createdAt: '2026-11-16T09:00:00.000Z',
      current: { id: '0d1720e0-e69f-4fb3-a5dd-12ffcfad82e1', versionNo: 1, summary: '日常照顧', bodyMd: '## 重點\n內容', sources: [], jurisdiction: ['HK'], reviewBy: null, chunks: [], createdAt: '2026-11-16T09:00:00.000Z' },
    };
    const created = { ...document, id: '46eeaf8f-7046-4e3a-9ea0-dde5aa5a52f6', title: '新知識' };
    const api = open('/#/design/knowledge/list', {
      knowledge: () => jsonResponse(200, { knowledge: [document], total: 1 }),
      knowledgeVersion: () => jsonResponse(201, { knowledge: document, created: true }),
      knowledgeCreate: () => jsonResponse(201, { knowledge: created, created: true }),
    });

    expect(await screen.findByRole('button', { name: '經期照顧' })).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: '儲存知識' }));
    await waitFor(() => expect(api.count('knowledgeVersion')).toBe(1));
    expect(api.count('knowledgeCreate')).toBe(0);

    await userEvent.click(screen.getByRole('button', { name: '新增知識' }));
    await userEvent.type(screen.getByLabelText('標題'), '新知識');
    await userEvent.type(screen.getByLabelText('一句摘要'), '新摘要');
    await userEvent.type(screen.getByLabelText('Markdown 內容'), '## 新段落\n新內容');
    await userEvent.click(screen.getByRole('button', { name: '儲存知識' }));
    await waitFor(() => expect(api.count('knowledgeCreate')).toBe(1));
    expect(api.count('knowledgeVersion')).toBe(1);
  });
});
