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

/**
 * 標誌頁（issue #36）。
 *
 * 這一張要證明四件事：
 *
 *   1. 打開見到的是**這個品牌的標誌系統**：五類資產、四種顏色模式、安全範圍、
 *      方向、背景、最小尺寸 —— 不是空導覽，也不是一個「上載標誌」的按鈕。
 *   2. 缺的地方標成缺，**沒有假標誌**；色彩頁未定那個角色就標缺，不在這一頁補色。
 *   3. 最小尺寸分模式，而且要寫單位（螢幕 px、印刷 mm）。
 *   4. 有編輯權的人改完，重新載入仍然是改過的；員工只讀。
 *
 * 「色彩頁的值」與「字體家族」都是**引用**：這一頁不存色值、不定字族。
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

/** 一份填齊的標誌表。 */
const DOC = {
  assets: [
    {
      id: 'a-logo',
      kind: 'logo',
      name: '主標誌（橫式）',
      master: 'brand/logo/moonic-logo.svg',
      preview: 'brand/logo/moonic-logo.png',
    },
    {
      id: 'a-wordmark',
      kind: 'wordmark',
      name: 'Moonic 字標',
      master: 'brand/logo/moonic-wordmark.svg',
      preview: '',
    },
  ],
  primaryId: 'a-logo',
  modes: {
    brand: { screen: '24px', print: '8mm' },
    mono: { screen: '24px', print: '8mm' },
    reverse: { screen: '24px', print: '8mm' },
    onDark: { screen: '24px', print: '8mm' },
  },
  safeArea: '0.5X（X 為 mark 的高度）',
  orientation: '橫式為主；窄於 320px 用直式',
  backgrounds: '淺色用 ink，品牌色底用反白，深色底用深色 surface',
  whenToUse: '對外一律用主標誌；只有 square 位用 mark',
  howToUse: '四周留 0.5X；不裁切、不加效果',
  wordmarkFamilyId: '',
  misuse: ['不拉長、不壓扁', '不改色', '不加陰影'],
};

const DOC_TEXT = JSON.stringify(DOC);

/** 色彩頁：四個模式各自對應的角色都有值。 */
const COLOUR_DOC = JSON.stringify({
  light: {
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    ink: { hex: '#191919', cmyk: '0 0 0 90' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
  },
  dark: { surface: { hex: '#17171d', cmyk: '0 0 0 90' } },
  ramps: {},
  allowed: [],
  denied: [],
  logoRoles: ['brand.primary'],
});

/** 色彩頁：單色正（ink）未定。 */
const COLOUR_DOC_MISSING_INK = JSON.stringify({
  light: {
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
  },
  dark: { surface: { hex: '#17171d', cmyk: '0 0 0 90' } },
  ramps: {},
  allowed: [],
  denied: [],
  logoRoles: [],
});

const V1 = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '{"assets":[{"id":"a-logo"',
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
    content,
  };

  return { page, versions: [current, V1], current };
}

function openLogo(
  user: typeof BOSS | typeof WAI,
  options: { doc?: string | null; colour?: string | null; type?: string | null } = {},
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

      if (request.path.endsWith('/pages/type')) {
        return jsonResponse(
          200,
          detail(
            { ...LOGO_PAGE, id: 'p-type', key: 'type', name: '字體', sortOrder: 40 },
            options.type === undefined ? null : options.type,
            1,
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
          content: fake.content,
        },
      });
    },
    ...overrides,
  });

  render(<App />);

  return { api, fake };
}

function modeRow(key: string): HTMLElement | null {
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
  it('看到的是標誌系統：五類資產清單、四種顏色模式、安全範圍、方向、背景', async () => {
    openLogo(BOSS);

    await waitFor(() => {
      expect(modeRow('brand')).not.toBeNull();
    });

    // 四種顏色模式逐行，每一行講明對應色彩頁哪一個角色。
    const modes = document.querySelectorAll('[data-logo-mode]');
    expect(modes.length).toBe(4);
    expect(modeRow('brand')?.textContent).toContain('brand.primary');
    expect(modeRow('mono')?.textContent).toContain('ink');
    expect(modeRow('reverse')?.textContent).toContain('paper');
    expect(modeRow('onDark')?.textContent).toContain('surface');

    // 資產清單：五類是上限，用了一類就少一個選擇。
    expect(document.querySelectorAll('[data-logo-asset]').length).toBe(2);
    expect(document.querySelector('[data-logo-asset="a-logo"]')?.textContent).toContain('Logo');

    // 主標誌、安全範圍、方向、背景都講得出來。
    expect((document.querySelector('[data-logo-primary]') as HTMLSelectElement).value).toBe('a-logo');
    expect((document.querySelector('[data-logo-safe-area]') as HTMLInputElement).value).toContain('0.5X');
    expect((document.querySelector('[data-logo-orientation]') as HTMLInputElement).value).toContain('橫式');
    expect((document.querySelector('[data-logo-backgrounds]') as HTMLElement).textContent).toContain('surface');
  });

  it('顏色由色彩頁提供：這一頁只顯示，沒有色值輸入', async () => {
    openLogo(BOSS);

    // 色彩頁是非同步讀的：先讀完才講值，未讀完講「正在讀」而不是畫一個空。
    await waitFor(() => {
      expect(document.querySelector('[data-logo-mode-value="brand"]')?.textContent).toContain('#0057ff');
    });

    expect(document.querySelector('[data-logo-mode-value="brand"]')?.textContent).toContain('#0057ff');
    expect(document.querySelector('[data-logo-mode-value="mono"]')?.textContent).toContain('#191919');
    expect(document.querySelector('[data-logo-mode-value="onDark"]')?.textContent).toContain('#17171d');

    // 這一頁沒有色值欄位：沒有任何 input 拿顏色。
    const colourInputs = Array.from(document.querySelectorAll('input')).filter(
      (input) => input.type === 'color',
    );
    expect(colourInputs.length).toBe(0);
  });

  it('色彩頁未定那個角色：標成缺，不在這一頁補一個色', async () => {
    openLogo(BOSS, { colour: COLOUR_DOC_MISSING_INK });

    await waitFor(() => {
      expect(document.querySelector('[data-logo-mode-value="mono"]')?.textContent).toContain('缺');
    });

    expect(modeRow('mono')?.getAttribute('data-missing')).toBe('true');
    const value = document.querySelector('[data-logo-mode-value="mono"]');
    expect(value?.textContent).toContain('缺');
    expect(value?.textContent).toContain('色彩頁');
    // 沒有偷偷填一個近似色。
    expect(value?.textContent).not.toContain('#');
  });

  it('最小尺寸分模式，而且要寫單位：螢幕 px、印刷 mm', async () => {
    openLogo(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-logo-screen="mono"]')).not.toBeNull();
    });

    await userEvent.clear(document.querySelector('[data-logo-screen="mono"]') as HTMLInputElement);
    await userEvent.type(document.querySelector('[data-logo-screen="mono"]') as HTMLInputElement, '24');

    expect(modeRow('mono')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-logo-unit-error="mono"]')?.textContent).toContain('px');

    await userEvent.type(document.querySelector('[data-logo-screen="mono"]') as HTMLInputElement, 'px');
    expect(modeRow('mono')?.getAttribute('data-missing')).toBe('false');

    // 印刷那一格用 mm：寫 px 不算。
    await userEvent.clear(document.querySelector('[data-logo-print="mono"]') as HTMLInputElement);
    await userEvent.type(document.querySelector('[data-logo-print="mono"]') as HTMLInputElement, '8px');
    expect(modeRow('mono')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-logo-unit-error="mono"]')?.textContent).toContain('mm');
  });

  it('五類資產封頂：同一類不可以有第二個，加滿之後沒有「新增资产」', async () => {
    openLogo(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-logo-asset-add]')).not.toBeNull();
    });

    // 已經用了 Logo 與 Wordmark，新增時只可以揀其餘三類。
    const options = Array.from(
      (document.querySelector('[data-logo-asset-kind]') as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(options).toEqual(['mark', 'monogram', 'appicon']);

    for (const kind of ['mark', 'monogram', 'appicon']) {
      await page_addAsset(kind);
    }

    expect(document.querySelectorAll('[data-logo-asset]').length).toBe(5);
    expect(document.querySelector('[data-logo-asset-add]')).toBeNull();
    expect(document.querySelector('[data-logo-asset-limit]')?.textContent).toContain('五類');
  });

  it('主檔要向量：主檔不是向量就標缺，主標誌未指定也標缺', async () => {
    openLogo(BOSS, {
      doc: JSON.stringify({
        ...DOC,
        primaryId: '',
        assets: [{ ...DOC.assets[0], master: 'brand/logo/moonic-logo.png' }],
      }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-logo-asset="a-logo"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-logo-asset="a-logo"]')?.getAttribute('data-missing')).toBe(
      'true',
    );
    expect(document.querySelector('[data-logo-asset="a-logo"]')?.textContent).toContain('向量');

    const summary = document.querySelector('[data-logo-missing]');
    expect(summary?.textContent).toContain('主標誌');
  });

  it('有編輯權的人改完：入了版本鏈，重新載入仍然是改過的', async () => {
    const { api } = openLogo(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-logo-safe-area]')).not.toBeNull();
    });

    const safe = document.querySelector('[data-logo-safe-area]') as HTMLInputElement;
    await userEvent.clear(safe);
    await userEvent.type(safe, '1X');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof DOC;
    expect(sent.safeArea).toBe('1X');
    expect(sent.assets.length).toBe(2);

    await waitFor(() => {
      expect((document.querySelector('[data-logo-safe-area]') as HTMLInputElement).value).toBe('1X');
    });
  });

  it('現行內容不是標誌表（舊的自由文字）：講讀不到，不畫假資產', async () => {
    openLogo(BOSS, { doc: '主標誌見附件。' });

    expect(await screen.findByText('這一版內容不是標誌表，所以讀不到當中的資產。')).toBeTruthy();
    expect(document.querySelectorAll('[data-logo-asset]').length).toBe(0);
  });

  it('員工：看得到標誌系統，改不了（沒有儲存鍵、沒有新增資產）', async () => {
    openLogo(WAI);

    await waitFor(() => {
      expect(modeRow('brand')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-logo-asset-add]')).toBeNull();
    expect((document.querySelector('[data-logo-safe-area]') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});

async function page_addAsset(kind: string): Promise<void> {
  await userEvent.selectOptions(
    document.querySelector('[data-logo-asset-kind]') as HTMLSelectElement,
    kind,
  );
  await userEvent.click(document.querySelector('[data-logo-asset-add]') as HTMLElement);
}
