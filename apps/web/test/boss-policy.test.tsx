// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * Boss Portal／品牌頁策略（#34、#56）。
 *
 * 這一張要證明四件事：
 *
 *   1. 九個槽都在，第一個是平台；每一槽有自己的現行版本與自己的版本列表。
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

const PLATFORM_V1 = {
  id: 'pol-platform-1',
  versionNo: 1,
  createdAt: '2026-11-12T03:00:00.000Z',
  note: 'v2 全文',
  preview: '你在定這個品牌替誰解決甚麼',
};

function slot(
  slotKey: string,
  current: unknown | null,
  versions: unknown[] = [],
  usedBy: { brand: string; page: string; versionNo: number }[] = [],
) {
  return { slot: slotKey, current, versions, usedBy };
}

/** 與後端 `POLICY_SLOTS` 同一個次序（#56）。 */
const POLICY = [
  slot('platform', { ...PLATFORM_V1, content: '平台的標準全文' }, [PLATFORM_V1], [
    { brand: 'Moonic 滿月堂', page: '品牌主頁', versionNo: 4 },
  ]),
  slot('color', null, []),
  slot('type', null, []),
  slot('logo', { ...LOGO_V2, content: '標誌的標準全文' }, [LOGO_V2, LOGO_V1]),
  slot('image', null, []),
  slot('tone', null, []),
  slot('home', { ...HOME_V1, content: '品牌主頁的標準全文' }, [HOME_V1]),
  slot('apply', null, []),
  slot('custom', null, []),
];

/** 只抄兩條規則：test 要驗的是「畫面照 id 表顯示」，不是抄整張表。 */
const RULES = [
  {
    id: 'platform.r1',
    slot: 'platform',
    summary: '定位三檢各有證據',
    threshold: '真實、相關、獨特，每項至少一句證據',
    pass: '三項都有證據',
    fail: '任何一項的證據是空的',
    undetermined: '平台頁未有定位陳述',
  },
  {
    id: 'logo.r1',
    slot: 'logo',
    summary: '淨空間以 x 定義',
    threshold: 'clear_space_x 要有倍數與 x 等於幾多',
    pass: '有倍數並寫明 x',
    fail: '只寫「留足夠空間」',
    undetermined: '標誌頁未有版本',
  },
];

function openPolicy(user: typeof BOSS | typeof WAI, handlers: FakeHandlers = {}) {
  window.history.replaceState(null, '', '/#/boss/policy/brand');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    policy: () => jsonResponse(200, { slots: POLICY, rules: RULES }),
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
  it('老闆：九個槽都在，第一個是平台，載入它的現行內容', async () => {
    openPolicy(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-policy="platform"]')).not.toBeNull();
    });

    const tabs = Array.from(document.querySelectorAll('[data-policy-tab]')).map(
      (item) => item.innerHTML.replace(/<[^>]+>/g, ''),
    );

    expect(tabs).toEqual([
      '平台v1',
      '色彩缺',
      '字體缺',
      '標誌v2',
      '圖像缺',
      '語氣缺',
      '品牌主頁v1',
      '應用缺',
      '自定義頁通用缺',
    ]);

    expect(document.querySelector('textarea')?.value).toBe('平台的標準全文');
    // 「第 1 版」同時出現在頁頭與列表第一行，所以查頁頭那一個。
    expect(document.querySelector('.brand-page__meta')?.textContent).toBe('第 1 版');
  });

  it('右欄列出這一槽的規則 id 與閾值；沒有可量化規則的槽如實講', async () => {
    openPolicy(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-rule="platform.r1"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-rule="logo.r1"]')).toBeNull();

    await userEvent.click(screen.getByText('圖像'));

    await waitFor(() => {
      expect(document.querySelector('[data-policy="image"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-rule]')).toBeNull();
    expect(
      document.body.textContent?.includes('這一槽沒有可量化的規則'),
    ).toBe(true);
  });

  it('右欄講得出現行這一版正在支撐哪幾頁', async () => {
    openPolicy(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-policy-used-by]')).not.toBeNull();
    });

    expect(document.querySelector('[data-policy-used-by]')?.textContent).toContain('品牌主頁');
    expect(document.querySelector('[data-policy-used-by]')?.textContent).toContain('Moonic 滿月堂');
    expect(document.querySelector('[data-policy-used-by]')?.textContent).toContain(
      '現行這一版由 1 頁使用',
    );
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
