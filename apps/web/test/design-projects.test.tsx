// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectDetail } from '@company-os/contracts';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import {
  installFakeApi,
  jsonResponse,
  resetBrowserState,
  type FakeHandlers,
} from './helpers/fake-api';

const BOSS = {
  id: 'u-boss',
  email: 'boss@example.com',
  displayName: '陳老闆',
  role: 'owner',
  department: null,
  mustChangePassword: false,
};
const DESIGN = {
  id: 'design', title: 'Marketing Design', kind: 'department', department: 'design',
  order: 10, available: true, route: '/design',
};
const BRANDS = [{ id: 'b-moonic', code: 'moonic', name: 'Moonic' }];
const PROJECT_ID = '2e0ab540-64b0-4e21-b0f2-e67a38d8d001';

function project(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: PROJECT_ID,
    brandId: 'b-moonic',
    brandName: 'Moonic',
    title: '經期前日常照顧 Carousel',
    format: 'carousel',
    previewUrl: null,
    state: 'awaiting_agent',
    briefVersionNo: null,
    agentRun: null,
    createdAt: '2026-11-16T08:00:00.000Z',
    originalRequest: {
      id: '46eeaf8f-7046-4e3a-9ea0-dde5aa5a52f6',
      body: '為 Moonic 建立五頁 IG Carousel，語氣溫暖，不可作醫療保證。',
      createdBy: 'u-boss',
      createdAt: '2026-11-16T08:00:00.000Z',
    },
    brief: null,
    briefVersions: [],
    ...over,
  };
}

function open(hash = '/#/design/create/projects', handlers: FakeHandlers = {}) {
  window.history.replaceState(null, '', hash);
  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: [], canEdit: true }),
    projects: () => jsonResponse(200, { projects: [], total: 0 }),
    projectCreative: () => jsonResponse(200, { workspace: {
      brand: { brandId: 'b-moonic', brandName: 'Moonic', releaseId: null, releaseNo: null, colors: { primary: '#171717', ink: '#171717', paper: '#F7F6F3', accent: '#171717' }, fonts: { display: 'Inter', body: 'Inter' }, tone: { traits: [], banned: [], languagePolicy: '' }, image: { composition: '', light: '', space: '' }, pages: [] },
      materials: [], knowledge: [], templates: [], compositions: [], outputs: [],
    } }),
    ...handlers,
  });
  render(<App />);
  return api;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('Marketing Design Projects', () => {
  it('由真實空列表建立 Project，保存原文並進入可重新整理的詳情深鏈', async () => {
    const createdProject = project();
    const api = open('/#/design/create/projects', {
      projectCreate: () => jsonResponse(201, { project: createdProject, created: true }),
      projectDetail: () => jsonResponse(200, { project: createdProject }),
    });

    const createButtons = await screen.findAllByRole('button', { name: '新增 Project' });
    const createButton = createButtons[0];
    if (createButton === undefined) throw new Error('新增 Project 入口不存在');
    await userEvent.click(createButton);
    await userEvent.click(screen.getByRole('button', { name: '保存並建立 Project' }));
    expect(api.count('projectCreate')).toBe(0);
    expect(await screen.findByText('請填寫 Project 名稱和原始要求。')).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Project 名稱'), '  經期前日常照顧 Carousel  ');
    await userEvent.type(screen.getByLabelText('原始要求'), '  為 Moonic 建立五頁 IG Carousel。  ');
    await userEvent.click(screen.getByRole('button', { name: '保存並建立 Project' }));

    await waitFor(() => {
      expect(window.location.hash).toBe(`#/design/create/projects/${PROJECT_ID}/brief`);
    });
    await userEvent.click(await screen.findByRole('tab', { name: 'Brief' }));
    expect(await screen.findByText('為 Moonic 建立五頁 IG Carousel，語氣溫暖，不可作醫療保證。')).toBeTruthy();
    const call = api.calls.find((item) => item.path === '/api/projects' && item.method === 'POST');
    expect(call?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      brandId: 'b-moonic',
      title: '經期前日常照顧 Carousel',
      request: '為 Moonic 建立五頁 IG Carousel。',
      format: 'carousel',
    });
    expect(api.count('projectDetail')).toBe(1);
    expect(screen.getAllByText('等待外部 agent 接手').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /生成|AI 整理/ })).toBeNull();
  });

  it('列表按後端順序顯示，點 Project 後重新讀詳情而不是用列表快照', async () => {
    const first = project();
    const second = project({
      id: 'fa66c1f0-3db1-4f21-a462-b91215ef3c1f',
      title: '頭皮護理貼文',
      state: 'planning',
      briefVersionNo: 1,
    });
    const api = open('/#/design/create/projects', {
      projects: () => jsonResponse(200, { projects: [second, first], total: 2 }),
      projectDetail: () => jsonResponse(200, { project: first }),
    });

    const firstLink = await screen.findByRole('button', { name: '經期前日常照顧 Carousel' });
    expect(screen.getByRole('button', { name: '頭皮護理貼文' })).toBeTruthy();
    await userEvent.click(firstLink);

    await waitFor(() => expect(window.location.hash).toBe(`#/design/create/projects/${PROJECT_ID}/brief`));
    expect(api.count('projectDetail')).toBe(1);
    await userEvent.click(await screen.findByRole('tab', { name: 'Brief' }));
    expect(await screen.findByText(first.originalRequest.body)).toBeTruthy();
  });

  it('左欄搜尋與格式資料夾共用真 Project 列表', async () => {
    const carousel = project();
    const deck = project({
      id: 'fa66c1f0-3db1-4f21-a462-b91215ef3c1f',
      title: '品牌季度簡報',
      format: 'presentation',
    });
    open('/#/design/create/projects', {
      projects: () => jsonResponse(200, { projects: [carousel, deck], total: 2 }),
    });

    const search = await screen.findByRole('searchbox', { name: 'Search projects and folders' });
    await userEvent.type(search, '季度');
    expect(screen.queryByRole('button', { name: carousel.title })).toBeNull();
    expect(screen.getByRole('button', { name: deck.title })).toBeTruthy();

    await userEvent.clear(search);
    const subbar = document.querySelector('[data-frame-subbar]') as HTMLElement;
    await userEvent.click(within(subbar).getByRole('button', { name: 'Presentation' }));
    await waitFor(() => expect(window.location.hash).toBe('#/design/create/presentation'));
    expect(screen.queryByRole('button', { name: carousel.title })).toBeNull();
    expect(screen.getByRole('button', { name: deck.title })).toBeTruthy();
  });

  it('Brief 版本可切換閱讀，來源 actor、request identity 和原始要求分開保存', async () => {
    const v1 = {
      id: '0d88a56d-c246-4269-a4f8-4b4b73cdce01', versionNo: 1,
      document: {
        objective: '初版目的', audience: '香港女性', channel: 'Instagram', format: '五頁 Carousel',
        language: '繁體中文', constraints: ['不作醫療保證'], dueDate: null,
      },
      note: null, sourceRequestId: '46eeaf8f-7046-4e3a-9ea0-dde5aa5a52f6',
      basedOnBriefVersionId: null, agentId: 'a-agent', agentName: 'Brief agent',
      requestId: 'request-1', createdAt: '2026-11-16T09:00:00.000Z',
    };
    const v2 = {
      ...v1,
      id: '56c49b02-9c9b-4f1f-a22f-b15cb30e9a6e', versionNo: 2,
      document: { ...v1.document, objective: '經期前五天日常照顧' },
      basedOnBriefVersionId: v1.id, requestId: 'request-2', createdAt: '2026-11-16T10:00:00.000Z',
    };
    open(`/#/design/create/projects/${PROJECT_ID}/brief`, {
      projectDetail: () => jsonResponse(200, {
        project: project({
          state: 'planning', briefVersionNo: 2, brief: v2, briefVersions: [v2, v1],
          agentRun: {
            id: '0d1720e0-e69f-4fb3-a5dd-12ffcfad82e1', agentId: 'a-agent', agentName: 'Brief agent',
            requestId: 'claim-1', claimedAt: '2026-11-16T08:30:00.000Z',
          },
        }),
      }),
    });

    await userEvent.click(await screen.findByRole('tab', { name: 'Brief' }));
    expect(await screen.findByText('經期前五天日常照顧')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'AI Agent' }));
    expect(screen.getByText('已由外部 agent 接手')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Brief' }));
    await userEvent.click(screen.getByRole('button', { name: /版本 1/ }));
    expect(await screen.findByText('初版目的')).toBeTruthy();
    expect(screen.queryByText('經期前五天日常照顧')).toBeNull();
    expect(screen.getByText(project().originalRequest.body)).toBeTruthy();
  });

  it('讀取失敗可重試；權限不足不顯示新增入口', async () => {
    let attempts = 0;
    open('/#/design/create/projects', {
      projects: () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse(500, { error: 'database_unavailable' })
          : jsonResponse(200, { projects: [], total: 0 });
      },
    });
    expect(await screen.findByText('讀不到 Projects。')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(await screen.findByText('這個品牌尚未有 Project')).toBeTruthy();

    cleanup();
    resetBrowserState();
    resetDirectoryCache();
    open('/#/design/create/projects', {
      projects: () => jsonResponse(403, { error: 'forbidden', reason: 'app_access_denied' }),
    });
    expect(await screen.findByText('你沒有權限讀取 Projects。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '新增 Project' })).toBeNull();
  });
});
