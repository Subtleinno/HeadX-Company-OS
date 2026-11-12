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
import { enterEditMode, whenEditable } from './helpers/brand-page';

/**
 * 色彩頁（issue #62，取代 #35）。
 *
 * 這一張要證明的是「打開畫面之後，眼睛看到什麼」：
 *
 *   1. 看到的是**有角色的色**：每個色都有名字、分三組、有 HEX／RGB／CMYK／
 *      深色值與理由 —— 不是一排沒有名字的色塊。
 *   2. 四個必要角色缺一個就標缺，摘要講得出是哪一個。
 *   3. 未定的角色不叫缺 —— 品牌次要色未填是未決定，不是缺失。
 *   4. **不達標的配對旁邊有替代色與實測數據**，而且按「採用」真的改得動。
 *   5. 版本列表講「改了哪一欄」，不是再印一次 JSON。
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

function role(
  id: string,
  group: 'brand' | 'reading' | 'function',
  hex: string,
  extra: { cmyk?: string; dark?: string; name?: string; usage?: string; reason?: string } = {},
) {
  return {
    id,
    group,
    name: extra.name ?? '',
    hex,
    cmyk: extra.cmyk ?? '',
    dark: extra.dark ?? '',
    usage: extra.usage ?? '',
    reason: extra.reason ?? '',
  };
}

/**
 * 一份「有值、有缺、有不達標」的色彩表：
 *   `surface` 刻意留空（必要角色缺 → 標缺）
 *   `warning` 未填（功能色未定 → 不叫缺）
 *   `brand.primary` 放在白紙上只有 1.6:1（不達標 → 要出替代色）
 */
const DOC = {
  stance: '先白，後墨，再藍。',
  roles: [
    role('brand.primary', 'brand', '#c8d2ff', {
      name: 'Signal Blue',
      cmyk: '20 12 0 0',
      usage: '標記',
      reason: '只標記一件事',
    }),
    role('brand.secondary', 'brand', '#7a5cff'),
    role('ink', 'reading', '#000000', { cmyk: '0 0 0 100', dark: '#f5f5f7' }),
    role('paper', 'reading', '#ffffff', { cmyk: '0 0 0 0' }),
    role('muted', 'reading', '#999999'),
    role('success', 'function', '#1a7f37'),
    role('danger', 'function', '#c02626'),
  ],
  order: { text: '先紙，後墨，再藍。', reason: '白是底，藍只做標記' },
  ratios: [
    { role: 'paper', percent: 70, reason: '大量留白' },
    { role: 'ink', percent: 30, reason: '文字' },
  ],
  contrast_floor: 4.5,
  large_floor: 3,
  pairs: {
    allowed: [
      { fg: 'ink', bg: 'paper', use: 'body', reason: '正文' },
      { fg: 'brand.primary', bg: 'paper', use: 'body', reason: '品牌色做標記' },
    ],
    forbidden: [{ fg: 'muted', bg: 'paper', reason: '2.85:1，讀不到' }],
  },
  tints: [{ name: 'primary-100', hex: '#e6ecff', reason: 'hover 底' }],
};

const DOC_TEXT = JSON.stringify(DOC);

const V2 = {
  id: 'v2',
  versionNo: 2,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: '上一版',
  preview: '{"roles":[{"id":"ink"',
  policyVersionNo: 2,
  // 第一版沒有上一版可以比。
  changed: [],
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
    // 後端算好的「改了哪一欄」：這一版改了墨色。
    changed: ['roles.ink.hex'],
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

function roleRow(id: string): HTMLElement | null {
  return document.querySelector(`[data-color-role="${id}"]`);
}

function hexInput(id: string): HTMLInputElement | null {
  return document.querySelector(`[data-color-hex="${id}"]`);
}

function pairRow(text: string): HTMLElement | null {
  return (
    document.querySelector(`[data-color-pair-text="${text}"]`)?.closest('[data-color-pair]') ?? null
  );
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
  it('打開見到有角色的色：分三組、每格連名字與理由、HEX／RGB／CMYK／深色值', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(roleRow('brand.primary')).not.toBeNull();
    });

    expect(document.querySelector('[data-color-group="brand"]')).not.toBeNull();
    expect(document.querySelector('[data-color-group="reading"]')).not.toBeNull();
    expect(document.querySelector('[data-color-group="function"]')).not.toBeNull();

    // 九個角色一個都不少（角色名是寫死的，不由內容決定）。
    expect(document.querySelectorAll('[data-color-role]').length).toBe(9);

    expect(hexInput('brand.primary')?.value).toBe('#c8d2ff');
    expect(roleRow('brand.primary')?.textContent).toContain('200 210 255');
    expect(
      (document.querySelector('[data-color-cmyk="brand.primary"]') as HTMLInputElement).value,
    ).toBe('20 12 0 0');
    expect(
      (document.querySelector('[data-color-name="brand.primary"]') as HTMLInputElement).value,
    ).toBe('Signal Blue');
    expect(
      (document.querySelector('[data-color-reason="brand.primary"]') as HTMLInputElement).value,
    ).toBe('只標記一件事');
    expect((document.querySelector('[data-color-dark="ink"]') as HTMLInputElement).value).toBe(
      '#f5f5f7',
    );
  });

  it('第一屏是立場句，沿用平台頁那句', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-color-stance]')).not.toBeNull();
    });

    expect(document.querySelector('[data-color-stance]')?.textContent).toContain(
      '先白，後墨，再藍。',
    );
  });

  it('四個必要角色缺一個就標缺，摘要講得出是哪一個', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(roleRow('surface')).not.toBeNull();
    });

    expect(roleRow('surface')?.getAttribute('data-missing')).toBe('true');
    expect(roleRow('surface')?.textContent).toContain('缺');

    const summary = document.querySelector('[data-color-missing]');
    expect(summary?.textContent).toContain('surface');
    expect(summary?.textContent).not.toContain('paper');
  });

  it('未定的角色不叫缺：功能色未填是未決定', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(roleRow('warning')).not.toBeNull();
    });

    expect(roleRow('warning')?.getAttribute('data-missing')).toBe('false');
    expect(roleRow('warning')?.textContent).toContain('未定');
    expect(document.querySelector('[data-color-undecided]')?.textContent).toContain('warning');
  });

  it('不達標的配對旁邊有替代色、實測數字，色相留得住', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(pairRow('brand.primary on paper')).not.toBeNull();
    });

    const failing = pairRow('brand.primary on paper');
    expect(failing?.getAttribute('data-color-pair-state')).toBe('fail');
    expect(failing?.textContent).toContain('不過');

    const alternative = failing?.querySelector('[data-color-alt]');
    const hex = alternative?.getAttribute('data-color-alt-hex') ?? '';
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    // 建議是「把本來那個角色壓深」，不是換成另一個用途的色。
    expect(alternative?.textContent).toContain('把 brand.primary 調到');

    const ratio = Number(
      alternative?.querySelector('[data-color-alt-ratio]')?.getAttribute('data-color-alt-ratio'),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('達標的配對不出替代色：只有不達標才要人做決定', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(pairRow('ink on paper')).not.toBeNull();
    });

    const passing = pairRow('ink on paper');
    expect(passing?.getAttribute('data-color-pair-state')).toBe('pass');
    expect(passing?.querySelector('[data-color-alt]')).toBeNull();
  });

  it('按「採用」真的改得動：色值變成建議值，儲存之後仍然在', async () => {
    const { api } = openColor(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(pairRow('brand.primary on paper')).not.toBeNull();
    });

    const alternative = pairRow('brand.primary on paper')?.querySelector('[data-color-alt]');
    const suggested = alternative?.getAttribute('data-color-alt-hex') ?? '';

    await userEvent.click(
      document.querySelector('[data-color-alt-apply="brand.primary"]') as HTMLElement,
    );

    expect(hexInput('brand.primary')?.value).toBe(suggested);

    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as {
      roles: { id: string; hex: string }[];
    };
    expect(sent.roles.find((item) => item.id === 'brand.primary')?.hex).toBe(suggested);

    // 改完之後那一組就達標，替代色提示消失。
    await waitFor(() => {
      expect(pairRow('brand.primary on paper')?.getAttribute('data-color-pair-state')).toBe('pass');
    });
  });

  it('准用與禁止分開；准用要標明是內文還是大字', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(pairRow('muted on paper')).not.toBeNull();
    });

    expect(
      pairRow('muted on paper')?.closest('[data-color-section]')?.getAttribute('data-color-section'),
    ).toBe('forbidden');
    expect(pairRow('muted on paper')?.textContent).toContain('2.85');

    const use = document.querySelector('[data-color-pair-use="ink on paper"]') as HTMLSelectElement;
    expect(use.value).toBe('body');
    expect(use.textContent).toContain('大字');
  });

  it('版本列表講改了哪一欄，不是再印一次 JSON', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-brand-page-version]').length).toBe(2);
    });

    const current = document.querySelector('[data-brand-page-version="3"]');
    expect(current?.textContent).toContain('改了');
    expect(current?.textContent).toContain('角色 · ink · 螢幕 HEX');
    expect(current?.textContent).not.toContain('"roles"');

    // 第一版沒有上一版可以比 —— 講「未有名可以比」，不是「改了 0 項」。
    const first = document.querySelector('[data-brand-page-version="2"]');
    expect(first?.textContent).toContain('未有名可以比');
  });

  it('現行內容不是色彩表（舊的自由文字）：講讀不到，不假裝全部缺', async () => {
    openColor(BOSS, {}, '品牌主色係藍色。');

    expect(await screen.findByText('這一版內容不是色彩表，所以讀不到當中的角色。')).toBeTruthy();
    expect(document.querySelectorAll('[data-color-role]').length).toBe(0);
  });

  it('舊形狀（light／dark 兩張表）同樣讀不到，但可以一鍵由空白起手', async () => {
    openColor(BOSS, {}, JSON.stringify({ light: { ink: { hex: '#111111' } }, dark: {}, ramps: {} }));

    await whenEditable();
    await enterEditMode();

    expect(await screen.findByText('這一版內容不是色彩表，所以讀不到當中的角色。')).toBeTruthy();
    expect(document.querySelector('[data-color-reset]')).not.toBeNull();
  });

  it('版本列表不印原始 JSON：用色點表示那一版有幾個色', async () => {
    openColor(BOSS);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-brand-page-version]').length).toBe(2);
    });

    expect(document.querySelectorAll('[data-color-version-swatch]').length).toBeGreaterThan(0);
  });

  it('員工：看得到色彩表，改不了（沒有儲存鍵，色值唯讀）', async () => {
    openColor(WAI);

    await waitFor(() => {
      expect(hexInput('ink')).not.toBeNull();
    });

    expect(hexInput('ink')?.readOnly).toBe(true);
    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-color-alt-apply]')).toBeNull();
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});
