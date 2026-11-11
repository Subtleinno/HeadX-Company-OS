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
 * 色彩頁（issue #35）。
 *
 * 這一張要證明四件事，四件都是「打開畫面之後，眼睛看到什麼」：
 *
 *   1. 看到的是**有角色的色**：每一個色都有名字（`brand.primary`、`ink`…），
 *      而且分組（品牌色／閱讀色／功能色）—— 不是一排沒有名字的色塊。
 *   2. 缺的角色標成缺。角色未有色值就講「缺」，不填一個「差不多」的色。
 *   3. 淺色與深色共用同一批角色名，各有一套值；深色獨有的角色在淺色不叫「缺」。
 *   4. 有編輯權的人改完之後，重新載入仍然是改過的 —— 內容真的入了版本鏈，
 *      不是只留在畫面。
 *
 * 「員工只讀」與「現行不是色彩表」兩條另驗：前者是權限，後者是誠實（舊的
 * 自由文字不可以假裝成「全部缺」）。
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

const COLOR_PAGE = {
  id: 'p-color',
  brandId: 'b-moonic',
  kind: 'fixed',
  key: 'color',
  name: '色彩',
  brief: null,
  sortOrder: 30,
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
  {
    id: 'p-logo',
    brandId: 'b-moonic',
    kind: 'fixed',
    key: 'logo',
    name: '標誌',
    brief: null,
    sortOrder: 20,
    current: null,
  },
  COLOR_PAGE,
];

/** 一份「有值也有缺」的色彩表：`warning` 刻意留空，`surface` 只有深色。 */
const DOC = {
  light: {
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    'brand.secondary': { hex: '#7a5cff', cmyk: '60 65 0 0' },
    ink: { hex: '#000000', cmyk: '0 0 0 100' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
    muted: { hex: '#999999', cmyk: '0 0 0 40' },
    success: { hex: '#1a7f37', cmyk: '80 0 70 10' },
    danger: { hex: '#c02626', cmyk: '0 90 85 5' },
  },
  dark: {
    ink: { hex: '#f5f5f7', cmyk: '0 0 0 3' },
    paper: { hex: '#0b0b0f', cmyk: '0 0 0 96' },
    surface: { hex: '#17171d', cmyk: '0 0 0 90' },
  },
  ramps: {
    'brand.primary': [
      { step: '100', hex: '#e6ecff' },
      { step: '500', hex: '#0057ff' },
    ],
  },
  allowed: [{ text: 'ink on paper' }],
  denied: [{ text: 'muted on paper' }],
  logoRoles: ['brand.primary', 'ink'],
};

const DOC_TEXT = JSON.stringify(DOC, null, 2);

const V2 = {
  id: 'v2',
  versionNo: 2,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: '上一版',
  preview: '{"light":{"ink":{"hex":"#111111"',
  policyVersionNo: 2,
};

type Fake = { content: string | null; versionNo: number };

function detailFor(fake: Fake) {
  if (fake.content === null) {
    return { page: COLOR_PAGE, versions: [], current: null };
  }

  const current = {
    id: `v${fake.versionNo}`,
    versionNo: fake.versionNo,
    createdAt: '2026-11-12T09:00:00.000Z',
    note: null,
    preview: fake.content.slice(0, 120),
    policyVersionNo: 3,
    content: fake.content,
  };

  return {
    page: COLOR_PAGE,
    versions: [current, V2],
    current,
  };
}

function openColor(
  user: typeof BOSS | typeof WAI,
  overrides: FakeHandlers = {},
  initial: string | null = DOC_TEXT,
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/color');

  const fake: Fake = { content: initial, versionNo: 3 };

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: user.role === 'owner' }),
    brandPage: () => jsonResponse(200, detailFor(fake)),
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

function role(name: string): HTMLElement | null {
  return document.querySelector(`[data-color-role="${name}"]`);
}

function hexInput(name: string): HTMLInputElement | null {
  return document.querySelector(`[data-color-hex="${name}"]`);
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

describe('色彩頁', () => {
  it('打開見到有角色的色：分三組、每個色都有名字、有 HEX／RGB／CMYK', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(role('brand.primary')).not.toBeNull();
    });

    // 三組都在，而且每一組的標題就是分組名（不是裝飾）。
    expect(document.querySelector('[data-color-group="brand"]')).not.toBeNull();
    expect(document.querySelector('[data-color-group="reading"]')).not.toBeNull();
    expect(document.querySelector('[data-color-group="function"]')).not.toBeNull();
    expect(screen.getByText('品牌色')).toBeTruthy();
    expect(screen.getByText('閱讀色')).toBeTruthy();
    expect(screen.getByText('功能色')).toBeTruthy();

    // 九個角色一個都不少（角色名是寫死的，不由內容決定）。
    const roles = document.querySelectorAll('[data-color-role]');
    expect(roles.length).toBe(9);
    expect(role('ink')).not.toBeNull();
    expect(role('paper')).not.toBeNull();

    // 有值的那一個：HEX 是打進去的，RGB 由 HEX 算，CMYK 是人填的。
    expect(hexInput('brand.primary')?.value).toBe('#0057ff');
    expect(role('brand.primary')?.textContent).toContain('0 87 255');
    expect(
      (document.querySelector('[data-color-cmyk="brand.primary"]') as HTMLInputElement).value,
    ).toBe('100 90 0 0');
    expect(role('brand.primary')?.getAttribute('data-missing')).toBe('false');
  });

  it('缺的角色標成缺：沒有色值就是缺，不填一個近似色', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(role('warning')).not.toBeNull();
    });

    expect(role('warning')?.getAttribute('data-missing')).toBe('true');
    expect(hexInput('warning')?.value).toBe('');
    expect(role('warning')?.textContent).toContain('缺');

    // 缺哪幾個要講得出來，不是叫人數九行。
    const summary = document.querySelector('[data-color-missing]');
    expect(summary?.textContent).toContain('warning');
    expect(summary?.textContent).not.toContain('paper');
  });

  it('淺色與深色是同一批角色名、兩套值；深色獨有的角色在淺色不叫缺', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(role('ink')).not.toBeNull();
    });

    // 淺色：surface 未有值，但它只在深色要求，所以不標「缺」。
    expect(role('surface')?.getAttribute('data-missing')).toBe('false');
    expect(role('surface')?.getAttribute('data-dark-only')).toBe('true');

    await userEvent.click(document.querySelector('[data-color-mode="dark"]') as HTMLElement);

    // 深色：同一批名字，另一套值。
    expect(document.querySelectorAll('[data-color-role]').length).toBe(9);
    expect(hexInput('ink')?.value).toBe('#f5f5f7');
    expect(hexInput('paper')?.value).toBe('#0b0b0f');
    expect(hexInput('surface')?.value).toBe('#17171d');
    // 深色沒有 warning 的值：仍然是缺，不是沿用淺色那一個。
    expect(role('warning')?.getAttribute('data-missing')).toBe('true');
  });

  it('有編輯權的人改一段：送入版本鏈，重新載入仍然是改過的', async () => {
    const { api } = openColor(BOSS);

    await waitFor(() => {
      expect(hexInput('warning')).not.toBeNull();
    });

    await userEvent.type(hexInput('warning') as HTMLInputElement, '#f5a623');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    // 送出去的就是這一張色彩表：改的那一個入了 JSON，其餘原樣。
    const sent = JSON.parse(savedContent(api)) as {
      light: Record<string, { hex: string; cmyk: string }>;
    };
    expect(sent.light['warning']).toEqual({ hex: '#f5a623', cmyk: '' });
    expect(sent.light['ink']).toEqual({ hex: '#000000', cmyk: '0 0 0 100' });

    // 重新載入之後仍然是改過的（現行內容來自伺服器回的版本）。
    await waitFor(() => {
      expect(hexInput('warning')?.value).toBe('#f5a623');
    });
    expect(role('warning')?.getAttribute('data-missing')).toBe('false');
  });

  it('准用與不准算得出對比：21.00 過兩關，2.85 兩關都不過', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-color-pair="allowed"]')).not.toBeNull();
    });

    const allowed = document.querySelector('[data-color-pair="allowed"]');
    expect(allowed?.textContent).toContain('ink on paper');
    expect(allowed?.textContent).toContain('21.00');
    expect(allowed?.textContent).toContain('過');
    expect(allowed?.textContent).not.toContain('不過');

    const denied = document.querySelector('[data-color-pair="denied"]');
    expect(denied?.textContent).toContain('muted on paper');
    expect(denied?.textContent).toContain('2.85');
    expect(denied?.textContent).toContain('不過');
  });

  it('與標誌頁的對應：功能色不出現在標誌可用的角色裡', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-color-logo-role="brand.primary"]')).not.toBeNull();
    });

    expect(
      (document.querySelector('[data-color-logo-role="brand.primary"] input') as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (document.querySelector('[data-color-logo-role="ink"] input') as HTMLInputElement).checked,
    ).toBe(true);

    // 功能色連勾都勾不到：不是變灰，是不存在。
    expect(document.querySelector('[data-color-logo-role="warning"]')).toBeNull();
    expect(document.querySelector('[data-color-logo-role="success"]')).toBeNull();

    const note = document.querySelector('[data-color-logo-note]');
    expect(note?.textContent).toContain('功能色不可用於標誌');
    expect(note?.textContent).toContain('success、warning、danger');
  });

  it('現行內容不是色彩表（舊的自由文字）：講讀不到，不假裝全部缺', async () => {
    openColor(BOSS, {}, '品牌主色係藍色。');

    expect(
      await screen.findByText('這一版內容不是色彩表，所以讀不到當中的角色。'),
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-color-role]').length).toBe(0);
  });

  it('版本列表不印原始 JSON：用色點表示那一版有幾個色', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-brand-page-version]').length).toBe(2);
    });

    const first = document.querySelector('[data-brand-page-version="3"]');
    expect(first?.textContent).not.toContain('"light"');
    expect(document.querySelectorAll('[data-color-version-swatch]').length).toBeGreaterThan(0);
  });

  it('員工：看得到色彩表，改不了（沒有儲存鍵，色值唯讀）', async () => {
    openColor(WAI);

    await waitFor(() => {
      expect(hexInput('ink')).not.toBeNull();
    });

    expect(hexInput('ink')?.readOnly).toBe(true);
    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-color-logo-role="ink"] input')).toBeNull();
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});
