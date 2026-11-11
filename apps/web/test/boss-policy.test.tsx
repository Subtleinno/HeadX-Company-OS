// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * Boss Portal／品牌頁策略（issue #34）。
 *
 * 這一張要證明四件事：
 *
 *   1. 六個槽都在，第一個是品牌主頁；每一槽有自己的現行版本與自己的版本列表。
 *   2. 儲存＝新增一版（POST 一個 version），不是改寫上一版。
 *   3. **沒有刪除鍵、沒有用回鍵** —— 策略只加不改。不是變灰，而是不存在。
 *   4. 未有內容的槽如實講缺，不畫一個空的第 1 版。
 *
 * 權限那一條只驗畫面（員工開不到）。後端真的拒絕寫入在
 * `brand-policy.integration.test.ts` —— 「按鈕看不到」與「後端拒絕」是兩件事。
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
  id: 's-wai',
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

const HOME_V1 = {
  id: 'pol-home-1',
  versionNo: 1,
  createdAt: '2026-11-12T02:00:00.000Z',
  note: '第一版',
  preview: '你在把這個品牌現有的每一頁編成一份主頁',
};

const LOGO_V1 = {
  id: 'pol-logo-1',
  versionNo: 1,
  createdAt: '2026-11-11T02:00:00.000Z',
  note: null,
  preview: '色值只引用色彩頁角色',
};

const LOGO_V2 = {
  id: 'pol-logo-2',
  versionNo: 2,
  createdAt: '2026-11-12T02:00:00.000Z',
  note: '加安全範圍',
  preview: '色值只引用色彩頁角色。安全範圍 X',
};

function slot(slotKey: string, current: unknown | null, versions: unknown[] = []) {
  return { slot: slotKey, current, versions };
}

const POLICY = [
  slot('home', { ...HOME_V1, content: '品牌主頁的標準全文' }, [HOME_V1]),
  slot('logo', { ...LOGO_V2, content: '標誌的標準全文' }, [LOGO_V2, LOGO_V1]),
  slot('color', null),
  slot('type', null),
  slot('tone', null),
  slot('custom', null),
];

function openPolicy(user: typeof BOSS | typeof WAI, handlers: FakeHandlers = {}) {
  window.history.replaceState(null, '', '/#/boss/policy/brand');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    policy: () => jsonResponse(200, { slots: POLICY }),
    ...handlers,
  });

  render(<App />);

  return api;
}

afterEach(() => {
  cleanup();
  resetBrowserState();
});

describe('品牌頁策略', () => {
  it('老闆：六個槽都在，第一個是品牌主頁，載入它的現行內容', async () => {
    openPolicy(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-policy="home"]')).not.toBeNull();
    });

    const tabs = Array.from(document.querySelectorAll('[data-policy-tab]')).map(
      (item) => item.textContent,
    );

    expect(tabs).toEqual(['品牌主頁', '標誌', '色彩', '字體', '語氣', '自定義頁通用']);
    expect(document.querySelector('textarea')?.value).toBe('品牌主頁的標準全文');
    // 「第 1 版」同時出現在頁頭與列表第一行，所以查頁頭那一個。
    expect(document.querySelector('.brand-page__meta')?.textContent).toBe('第 1 版');
  });

  it('切去標誌：編輯框與版本列表都換成那個槽的', async () => {
    openPolicy(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-policy-tab="logo"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByText('標誌'));

    await waitFor(() => {
      expect(document.querySelector('[data-policy="logo"]')).not.toBeNull();
    });

    expect(document.querySelector('textarea')?.value).toBe('標誌的標準全文');
    expect(document.querySelectorAll('[data-policy-version]').length).toBe(2);
    expect(
      document.querySelector('[data-policy-version="2"]')?.getAttribute('data-current'),
    ).toBe('true');
  });

  it('沒有刪除鍵、沒有用回鍵：策略只加不改', async () => {
    openPolicy(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-policy-tab="logo"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByText('標誌'));

    await waitFor(() => {
      expect(document.querySelector('[data-policy-version="1"]')).not.toBeNull();
    });

    // 舊版那一行只有「第 1 版」與時間，沒有任何動作鍵。
    const old = document.querySelector('[data-policy-version="1"]');
    expect(old?.querySelectorAll('button').length).toBe(0);
    expect(screen.queryByText('刪除')).toBeNull();
    expect(screen.queryByText('用這一版')).toBeNull();
  });

  it('儲存：送出的就是打的內容，成功後講明建立了第幾版', async () => {
    const api = openPolicy(BOSS, {
      policySave: () => jsonResponse(201, { version: { ...LOGO_V2, versionNo: 3 } }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-policy-tab="logo"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByText('標誌'));

    await waitFor(() => {
      expect(document.querySelector('textarea')?.value).toBe('標誌的標準全文');
    });

    const editor = document.querySelector('textarea');

    if (editor === null) {
      throw new Error('找不到輸入框');
    }

    await userEvent.clear(editor);
    await userEvent.type(editor, '新的標誌標準');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(screen.getByText('已儲存第 3 版。')).toBeTruthy();
    });

    const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/versions'));
    expect(call?.path).toContain('/policy/logo/versions');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ content: '新的標誌標準' });
  });

  it('空內容：儲存鍵停用，不送出', async () => {
    const api = openPolicy(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-policy-tab="home"]')).not.toBeNull();
    });

    const editor = document.querySelector('textarea');

    if (editor === null) {
      throw new Error('找不到輸入框');
    }

    await userEvent.clear(editor);

    expect(document.querySelector('[data-policy-save]')?.hasAttribute('disabled')).toBe(true);
    expect(api.count('policySave')).toBe(0);
  });

  it('未有內容的槽：如實講缺，不畫一個空的第 1 版', async () => {
    openPolicy(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-policy-tab="color"]')).not.toBeNull();
    });

    await userEvent.click(screen.getByText('色彩'));

    expect(await screen.findByText('這個槽未有內容，標成缺。')).toBeTruthy();
    expect(document.querySelectorAll('[data-policy-version]').length).toBe(0);
  });

  it('員工：開不到這一頁，見不到六個槽', async () => {
    openPolicy(WAI);

    expect(await screen.findByText('你冇權限睇呢頁')).toBeTruthy();
    expect(document.querySelector('[data-policy]')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });
});
