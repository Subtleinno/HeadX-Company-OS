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
import { colourDoc } from './fixtures/brandColour';

/**
 * 標誌頁（issue #64，取代 #36 的畫面）。
 *
 * 這一張要證明五件事：
 *
 *   1. 打開見到的是**這個品牌的標誌系統**：五類檔案、四種顏色模式、淨空間、
 *      兩個最小尺寸、組合、背景 —— 不是一個「上載標誌」的按鈕。
 *   2. 色值只來自色彩頁；這一頁只有角色名，沒有色值輸入。
 *   3. 功能色不可用於標誌（`color.r4` 的同一條界線），當場講。
 *   4. 缺的地方標成缺，**沒有假標誌**：缺檔、不是向量、冇類別 logo 都講得出。
 *   5. 有編輯權的人改完，重新載入仍然是改過的；員工只讀。
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

const LOGO_PAGE = {
  id: 'p-logo',
  brandId: 'b-moonic',
  kind: 'fixed',
  key: 'logo',
  name: '標誌',
  brief: null,
  sortOrder: 20,
  current: null,
};

const PAGES = [
  {
    id: 'p-home',
    brandId: 'b-moonic',
    kind: 'fixed',
    key: 'home',
    name: '品牌主頁',
    brief: null,
    sortOrder: 10,
    current: null,
  },
  LOGO_PAGE,
];

/** 一份填齊的標誌表：兩件檔案、四種模式各有角色、淨空間與兩個尺寸都有值。 */
const DOC = {
  assets: [
    {
      class: 'logo',
      label: '主標誌（橫式）',
      file_ref: 'brand/logo/moonic-logo.svg',
      version: 'v3',
    },
    {
      class: 'wordmark',
      label: 'Moonic 字標',
      file_ref: 'brand/logo/moonic-wordmark.svg',
      version: '',
    },
  ],
  logic_line: '一個印章。',
  master_vector: 'brand/logo/moonic-logo.svg',
  lockups: [{ id: 'horizontal', use: '網站頁首', min: '120px' }],
  construction: '圓心對齊字標基線。',
  clear_space_x: { x: '字標高度', multiples: '2x', note: '' },
  min_size: { screen_px: 24, print_mm: 8 },
  modes: [
    { mode: 'brand', color_role: 'brand.primary', note: '' },
    { mode: 'mono', color_role: 'ink', note: '' },
    { mode: 'reverse', color_role: 'paper', note: '' },
    { mode: 'onDark', color_role: 'surface', note: '' },
  ],
  backgrounds: '淺色用 ink，品牌色底用反白，深色底用深色 surface',
  misuse: [{ example: '拉長', reason: '比例一變就不是同一個標誌' }],
};

const DOC_TEXT = JSON.stringify(DOC);

/** 色彩頁：四個模式各自對應的角色都有值。 */
const COLOUR_DOC = JSON.stringify(
  colourDoc({
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    ink: { hex: '#191919', cmyk: '0 0 0 90' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
    surface: { hex: '#17171d', cmyk: '0 0 0 90' },
  }),
);

/** 色彩頁：單色正（ink）未定。 */
const COLOUR_DOC_MISSING_INK = JSON.stringify(
  colourDoc({
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
    surface: { hex: '#17171d', cmyk: '0 0 0 90' },
  }),
);

const V1 = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '{"assets":[{"class":"logo"',
  policyVersionNo: 2,
};

type Fake = { content: string | null; versionNo: number };

function detail(page: unknown, content: string | null, versionNo: number) {
  if (content === null) {
    return { page, versions: [], current: null };
  }

  const current = {
    id: `v${versionNo}`,
    versionNo,
    createdAt: '2026-11-12T09:00:00.000Z',
    note: null,
    preview: content.slice(0, 120),
    policyVersionNo: 3,
    changed: [],
    content,
  };

  return { page, versions: [current, V1], current };
}

function openLogo(
  user: typeof BOSS | typeof WAI,
  options: { doc?: string | null; colour?: string | null } = {},
  overrides: FakeHandlers = {},
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/logo');

  const fake: Fake = { content: options.doc === undefined ? DOC_TEXT : options.doc, versionNo: 3 };
  const colour = options.colour === undefined ? COLOUR_DOC : options.colour;

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: user.role === 'owner' }),
    brandPage: (request) => {
      if (request.path.endsWith('/pages/color')) {
        return jsonResponse(
          200,
          detail(
            { ...LOGO_PAGE, id: 'p-color', key: 'color', name: '色彩', sortOrder: 30 },
            colour,
            2,
          ),
        );
      }

      return jsonResponse(200, detail(LOGO_PAGE, fake.content, fake.versionNo));
    },
    brandPageSave: (request) => {
      const body = JSON.parse(request.body ?? '{}') as { content?: string };

      fake.content = body.content ?? '';
      fake.versionNo += 1;

      return jsonResponse(201, {
        version: {
          id: `v${fake.versionNo}`,
          versionNo: fake.versionNo,
          createdAt: '2026-11-12T10:00:00.000Z',
          note: null,
          preview: fake.content.slice(0, 120),
          policyVersionNo: 3,
          changed: [],
          content: fake.content,
        },
      });
    },
    ...overrides,
  });

  render(<App />);

  return { api, fake };
}

function input(selector: string): HTMLInputElement | null {
  return document.querySelector(selector);
}

function mode(key: string): HTMLElement | null {
  return document.querySelector(`[data-logo-mode="${key}"]`);
}

function savedContent(api: ReturnType<typeof installFakeApi>): string {
  const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/versions'));
  const body = JSON.parse(call?.body ?? '{}') as { content?: string };

  return body.content ?? '';
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('標誌頁', () => {
  it('看到的是標誌系統：四種模式、檔案清單、淨空間、兩個最小尺寸、背景', async () => {
    openLogo(BOSS);

    await waitFor(() => {
      expect(mode('brand')).not.toBeNull();
    });

    // 四種顏色模式逐行，每一行講明用色彩頁哪一個角色。
    expect(document.querySelectorAll('[data-logo-mode]').length).toBe(4);

    for (const [key, role] of [
      ['brand', 'brand.primary'],
      ['mono', 'ink'],
      ['reverse', 'paper'],
      ['onDark', 'surface'],
    ] as const) {
      const select = document.querySelector(`[data-logo-mode-role="${key}"]`) as HTMLSelectElement;

      expect(select.value).toBe(role);
    }

    // 檔案清單：類別是身份，一類一件。
    expect(document.querySelectorAll('[data-logo-asset]').length).toBe(2);
    expect(document.querySelector('[data-logo-asset="logo"]')?.textContent).toContain('Logo');
    expect(input('[data-logo-asset-file="logo"]')?.value).toContain('moonic-logo.svg');

    // 淨空間、兩個最小尺寸、背景都講得出來。
    expect(input('[data-logo-space-x]')?.value).toBe('字標高度');
    expect(input('[data-logo-space-multiples]')?.value).toBe('2x');
    expect(input('[data-logo-min-screen]')?.value).toBe('24');
    expect(input('[data-logo-min-print]')?.value).toBe('8');
    expect(input('[data-logo-backgrounds-text]')?.value).toContain('surface');
  });

  it('顏色由色彩頁提供：這一頁只顯示，沒有色值輸入', async () => {
    openLogo(BOSS);

    // 色彩頁是非同步讀的：先讀完才講值，未讀完講「正在讀」而不是畫一個空。
    await waitFor(() => {
      expect(document.querySelector('[data-logo-mode-value="brand"]')?.textContent).toContain(
        '#0057ff',
      );
    });

    expect(document.querySelector('[data-logo-mode-value="mono"]')?.textContent).toContain('#191919');
    expect(document.querySelector('[data-logo-mode-value="onDark"]')?.textContent).toContain('#17171d');

    // 這一頁沒有色值欄位。
    const colourInputs = Array.from(document.querySelectorAll('input')).filter(
      (element) => element.type === 'color',
    );
    expect(colourInputs.length).toBe(0);
  });

  it('色彩頁未定那個角色：標成缺，不在這一頁補一個色', async () => {
    openLogo(BOSS, { colour: COLOUR_DOC_MISSING_INK });

    await waitFor(() => {
      expect(document.querySelector('[data-logo-mode-value="mono"]')?.textContent).toContain('缺');
    });

    expect(mode('mono')?.getAttribute('data-missing')).toBe('true');

    const value = document.querySelector('[data-logo-mode-value="mono"]');

    expect(value?.textContent).toContain('色彩頁');
    expect(value?.textContent).not.toContain('#');
  });

  it('功能色不可用於標誌：揀了就在當場講，缺口也算它', async () => {
    openLogo(BOSS, {
      doc: JSON.stringify({
        ...DOC,
        modes: [{ mode: 'brand', color_role: 'danger', note: '' }, ...DOC.modes.slice(1)],
      }),
    });

    await waitFor(() => {
      expect(mode('brand')?.getAttribute('data-missing')).toBe('true');
    });

    expect(document.querySelector('[data-logo-mode-badge="brand"]')?.textContent).toContain(
      '功能色不可用',
    );
    expect(document.querySelector('[data-logo-missing]')?.textContent).toContain('顏色模式');
  });

  it('兩個最小尺寸寫了同一個數：當場講 px 與 mm 不是同一個單位', async () => {
    openLogo(BOSS, { doc: JSON.stringify({ ...DOC, min_size: { screen_px: 24, print_mm: 24 } }) });

    await waitFor(() => {
      expect(document.querySelector('[data-logo-min-same]')).not.toBeNull();
    });

    expect(document.querySelector('[data-logo-min-same]')?.textContent).toContain('同一個數');
  });

  it('五類封頂：同一類不可以有第二個，加滿之後沒有新增鍵', async () => {
    openLogo(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-logo-asset-add="mark"]')).not.toBeNull();
    });

    // 已經用了 Logo 與 Wordmark，新增的按鈕只出三類。
    expect(document.querySelector('[data-logo-asset-add="logo"]')).toBeNull();
    expect(document.querySelector('[data-logo-asset-add="wordmark"]')).toBeNull();

    for (const kind of ['mark', 'monogram', 'appicon']) {
      await userEvent.click(
        document.querySelector(`[data-logo-asset-add="${kind}"]`) as HTMLElement,
      );
    }

    expect(document.querySelectorAll('[data-logo-asset]').length).toBe(5);
    expect(document.querySelector('[data-logo-asset-adder]')).toBeNull();
    expect(document.querySelector('[data-logo-asset-limit]')?.textContent).toContain('五類');
  });

  it('主檔不是向量：標缺，並講明不是向量檔', async () => {
    openLogo(BOSS, {
      doc: JSON.stringify({
        ...DOC,
        assets: [{ ...DOC.assets[0], file_ref: 'brand/logo/moonic-logo.png' }],
      }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-logo-asset="logo"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-logo-asset="logo"]')?.getAttribute('data-missing')).toBe(
      'true',
    );
    expect(document.querySelector('[data-logo-asset="logo"]')?.textContent).toContain('不是向量檔');
    expect(document.querySelector('[data-logo-missing]')?.textContent).toContain('檔案');
  });

  it('冇類別 logo 的檔案：主標誌標缺，而且講明主標誌由類別決定', async () => {
    openLogo(BOSS, {
      doc: JSON.stringify({
        ...DOC,
        assets: [{ class: 'wordmark', label: '字標', file_ref: 'w.svg', version: '' }],
      }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-logo-primary-hint]')).not.toBeNull();
    });

    expect(document.querySelector('[data-logo-primary-hint]')?.textContent).toContain('主標誌');
    expect(document.querySelector('[data-logo-missing]')?.textContent).toContain('主標誌');
  });

  it('有編輯權的人改完：入了版本鏈，重新載入仍然是改過的', async () => {
    const { api } = openLogo(BOSS);

    await waitFor(() => {
      expect(input('[data-logo-space-multiples]')).not.toBeNull();
    });

    const multiples = input('[data-logo-space-multiples]') as HTMLInputElement;

    await userEvent.clear(multiples);
    await userEvent.type(multiples, '1x');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof DOC;

    expect(sent.clear_space_x.multiples).toBe('1x');
    expect(sent.assets.length).toBe(2);

    await waitFor(() => {
      expect(input('[data-logo-space-multiples]')?.value).toBe('1x');
    });
  });

  it('現行內容不是標誌表（舊的自由文字）：講讀不到，不畫假檔案', async () => {
    openLogo(BOSS, { doc: '主標誌見附件。' });

    expect(
      await screen.findByText('這一版內容不是標誌表，所以讀不到當中的檔案與模式。'),
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-logo-asset]').length).toBe(0);
  });

  it('#36 的舊形狀（modes 是一個物件）一樣講讀不到', async () => {
    openLogo(BOSS, {
      doc: JSON.stringify({
        assets: [{ id: 'a-1', kind: 'logo', name: '主標誌', master: 'logo.svg' }],
        modes: { brand: { screen: '24px', print: '8mm' } },
        primaryId: 'a-1',
      }),
    });

    expect(
      await screen.findByText('這一版內容不是標誌表，所以讀不到當中的檔案與模式。'),
    ).toBeTruthy();
  });

  it('員工：看得到標誌系統，改不了（沒有儲存鍵、沒有新增檔案）', async () => {
    openLogo(WAI);

    await waitFor(() => {
      expect(mode('brand')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-logo-asset-adder]')).toBeNull();
    expect(input('[data-logo-space-x]')?.readOnly).toBe(true);
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});
