// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { installFakeApi, jsonResponse, resetBrowserState, type FakeHandlers } from './helpers/fake-api';

/**
 * 頁清單與專屬系統建議（issue #60）。
 *
 * 四件事在畫面上看得到：
 *   1. 左側欄分四組（品牌主頁／識別／品牌專屬／應用），空的組不出現。
 *   2. 未有版本的頁在名稱右側顯示「缺」—— 不從清單消失。
 *   3. 主頁出一張建議卡；按下去是一張 640px 的對話框，三項連理由、邊界連角色。
 *   4. 接受＝多一頁（清單重讀）；略過＝不再提；「其實屬於這一頁」只在該頁提醒。
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

const VERSION = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '',
  policyVersionNo: 1,
};

function page(
  key: string,
  name: string,
  group: 'home' | 'identity' | 'custom' | 'apply',
  sortOrder: number,
  hasVersion: boolean,
) {
  return {
    id: `p-${key}`,
    brandId: 'b-moonic',
    kind: group === 'custom' ? 'custom' : 'fixed',
    key,
    name,
    brief: group === 'custom' ? '這一頁要決定盒子與標籤。' : null,
    sortOrder,
    group,
    current: hasVersion ? VERSION : null,
  };
}

const PAGES = [
  page('home', '品牌主頁', 'home', 10, true),
  page('platform', '平台', 'identity', 20, true),
  page('color', '色彩', 'identity', 30, false),
  page('packaging', '包裝', 'custom', 60, true),
];

const SUGGESTION = {
  id: 's-1',
  signature: 'sig-sky-1',
  name: '天空漸層',
  slug: 'sky-gradient',
  brief: '節慶圖的背景漸層怎樣配、幾時用、幾時不用',
  checks: {
    unique: '只有這個品牌用漸層講時間',
    repeated: '每一張節慶圖都要用',
    noRoom: '色彩頁只講角色，講不到漸層的過渡',
  },
  refs: ['paper', 'ink', 'brand.primary'],
  belongsTo: null,
  state: 'pending',
  createdAt: '2026-11-12T10:00:00.000Z',
};

function open(options: { hash?: string; suggestions?: unknown[]; overrides?: FakeHandlers } = {}): ReturnType<typeof installFakeApi> {
  window.history.replaceState(null, '', options.hash ?? '/#/design/brand/home');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: true }),
    brandPage: () =>
      jsonResponse(200, {
        page: PAGES[0],
        versions: [],
        current: { ...VERSION, content: '{}' },
      }),
    brandSuggestions: () => jsonResponse(200, { items: options.suggestions ?? [] }),
    ...options.overrides,
  });

  render(<App />);

  return api;
}

function sidebarItems(): string[] {
  return Array.from(document.querySelectorAll('[data-frame-rail] .frame-sidebar__item')).map(
    (node) => node.textContent ?? '',
  );
}

function groupTitles(): string[] {
  return Array.from(document.querySelectorAll('[data-frame-rail] .frame-sidebar__group-title')).map(
    (node) => node.textContent ?? '',
  );
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('頁清單分組', () => {
  it('四組按次序：品牌主頁／識別／品牌專屬；空的組不出現', async () => {
    open();

    // 等後端那一份清單到位（未到位時外殼顯示靜態的五頁，那是載入中的樣貌）。
    await waitFor(() => {
      expect(sidebarItems()).toContain('包裝');
    });

    // 品牌主頁自成第一組，沒有組標題（一組不需要標題去解釋自己）。
    expect(groupTitles()).toEqual(['識別 IDENTITY', '品牌專屬 CUSTOM']);
    // 「缺」是與名同一個按鈕的一部分（讀屏讀得到），斷言前先剝走。
    expect(sidebarItems().map((label) => label.replace('缺', ''))).toEqual([
      '品牌主頁',
      '平台',
      '色彩',
      '包裝',
    ]);
  });

  it('未有版本的頁顯示「缺」，但不從清單消失', async () => {
    open();

    await waitFor(() => {
      expect(sidebarItems()).toContain('包裝');
    });

    expect(sidebarItems().find((label) => label.startsWith('色彩'))).toContain('缺');
    expect(sidebarItems().find((label) => label.startsWith('平台'))).not.toContain('缺');
    expect(document.querySelectorAll('[data-badge-tone="warning"]')).toHaveLength(1);
  });
});

describe('專屬系統建議', () => {
  it('主頁出一張卡，不自己彈出來擋住人', async () => {
    open({ suggestions: [SUGGESTION] });

    await waitFor(() => {
      expect(screen.getByText('建議新增一頁：天空漸層')).toBeTruthy();
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('按下去開對話框：三項連理由、邊界連角色、brief 預填', async () => {
    open({ suggestions: [SUGGESTION] });

    await waitFor(() => {
      expect(screen.getByText('建議新增一頁：天空漸層')).toBeTruthy();
    });

    await userEvent.click(screen.getByText('建議新增一頁：天空漸層'));

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('獨有');
    expect(dialog.textContent).toContain('只有這個品牌用漸層講時間');
    expect(dialog.textContent).toContain('其他頁放不下');
    expect(dialog.textContent).toContain('不決定顏色、字體、標誌或語氣');
    expect(dialog.textContent).toContain('brand.primary');

    const field = document.querySelector('[data-suggest-brief]') as HTMLInputElement;
    expect(field.value).toBe(SUGGESTION.brief);
  });

  it('接受：送出改過的 brief，然後清單重讀', async () => {
    const api = open({
      suggestions: [SUGGESTION],
      overrides: {
        brandSuggestionAccept: () =>
          jsonResponse(201, { page: page('sky-gradient', '天空漸層', 'custom', 70, false), suggestion: SUGGESTION }),
      },
    });

    await waitFor(() => {
      expect(screen.getByText('建議新增一頁：天空漸層')).toBeTruthy();
    });

    await userEvent.click(screen.getByText('建議新增一頁：天空漸層'));

    const field = document.querySelector('[data-suggest-brief]') as HTMLInputElement;
    await userEvent.clear(field);
    await userEvent.type(field, '只講節慶圖');
    await userEvent.click(screen.getByRole('button', { name: '接受並建立' }));

    await waitFor(() => {
      expect(api.count('brandSuggestionAccept')).toBe(1);
    });

    const call = api.calls.find((item) => item.path.includes('/accept'));
    expect(call?.body).toContain('只講節慶圖');
    // 接受＝多一頁：左側清單要重讀。
    expect(api.count('brandPages')).toBeGreaterThan(1);
  });

  it('略過：送出 dismiss，並講明不會再提', async () => {
    const api = open({
      suggestions: [SUGGESTION],
      overrides: {
        brandSuggestionDismiss: () => jsonResponse(200, { suggestion: { ...SUGGESTION, state: 'dismissed' } }),
      },
    });

    await waitFor(() => {
      expect(screen.getByText('建議新增一頁：天空漸層')).toBeTruthy();
    });

    await userEvent.click(screen.getByText('建議新增一頁：天空漸層'));
    await userEvent.click(screen.getByRole('button', { name: '略過' }));

    await waitFor(() => {
      expect(api.count('brandSuggestionDismiss')).toBe(1);
    });

    expect(screen.getByText('已略過；內容沒有明顯變化不會再提。')).toBeTruthy();
  });

  it('「其實屬於這一頁」：只在那一頁頂部提醒，不開對話框', async () => {
    open({
      hash: '/#/design/brand/color',
      suggestions: [{ ...SUGGESTION, belongsTo: 'color', name: '深色模式用色' }],
      overrides: {
        brandPage: () =>
          jsonResponse(200, {
            page: PAGES[2],
            versions: [],
            current: { ...VERSION, content: '{}' },
          }),
      },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-suggest-belongs]')).not.toBeNull();
    });

    expect(document.querySelector('[data-suggest-belongs]')?.textContent).toContain('色彩');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('品牌主頁過時：有頁在它之後改過就講，並列出是哪幾頁', async () => {
    open({
      overrides: {
        brandPages: () =>
          jsonResponse(200, {
            items: [
              page('home', '品牌主頁', 'home', 10, true),
              {
                ...page('color', '色彩', 'identity', 30, true),
                current: { ...VERSION, id: 'v9', versionNo: 9, createdAt: '2026-11-12T09:00:00.000Z' },
              },
            ],
            canEdit: true,
          }),
      },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-brand-home-stale]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-home-stale]')?.textContent).toContain('色彩');
  });
});
