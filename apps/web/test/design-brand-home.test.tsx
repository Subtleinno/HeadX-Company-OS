// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { changedPaths } from '@company-os/contracts';
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
import { fullHomeDoc } from './fixtures/brandHome';
import { emptyToneDoc } from '../src/design/brandTone';
import { enterEditMode, whenEditable } from './helpers/brand-page';

/**
 * 品牌主頁（issue #67，取代 #39）。
 *
 * 這一張要證明五件事：
 *
 *   1. 主頁自己擁有立場、是誰、關鍵詞、版面；其餘全部是引用。
 *   2. 每一個引用都寫明來源頁與當時版本 —— 「追得回來源頁」是畫面上一行字，
 *      不是註釋。
 *   3. 版面每一塊都要有理由；冇理由當場標，因為那一塊不會出現在輸出。
 *   4. 舊形狀（#39 的 `intro`／`logoMode`）講讀不到，不當成空白主頁蓋掉。
 *   5. 「給 AI 用」讀的是伺服器交出去的 prompt 包，不是這裡再砌一份。
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

function summary(key: string, name: string, kind: 'fixed' | 'custom', order: number, current: boolean) {
  return {
    id: `p-${key}`,
    brandId: 'b-moonic',
    kind,
    key,
    name,
    brief: kind === 'custom' ? `${name}這一頁要決定什麼。` : null,
    sortOrder: order,
    group: 'identity',
    current: current
      ? { id: `v-${key}`, versionNo: 1, createdAt: '2026-11-11T10:00:00.000Z', note: null, preview: '', policyVersionNo: 1, changed: [] }
      : null,
  };
}

const HOME = summary('home', '品牌主頁', 'fixed', 10, true);
const LOGO = summary('logo', '標誌', 'fixed', 20, true);
const COLOR = summary('color', '色彩', 'fixed', 30, true);
const TYPE = summary('type', '字體', 'fixed', 40, true);
const TONE = summary('tone', '語氣', 'fixed', 50, true);
const PACKAGING = summary('packaging', '包裝', 'custom', 60, true);
const PHOTOGRAPHY = summary('photography', '攝影', 'custom', 70, true);
const NAMING = summary('naming', '命名', 'custom', 80, false);

const PAGES = [HOME, LOGO, COLOR, TYPE, TONE, PACKAGING, PHOTOGRAPHY, NAMING];

const HOME_DOC = fullHomeDoc();

const COLOUR_DOC = JSON.stringify(
  colourDoc({
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
  }),
);

const LOGO_DOC = JSON.stringify({
  assets: [{ class: 'logo', label: '主標誌（橫式）', file_ref: 'logo.svg', version: 'v1' }],
  modes: [
    { mode: 'brand', color_role: 'brand.primary', note: '' },
    { mode: 'mono', color_role: 'ink', note: '' },
  ],
  min_size: { screen_px: 24, print_mm: 12 },
  logic_line: '一個印章。',
  clear_space_x: { x: '字標高度', multiples: '1x', note: '' },
  backgrounds: '',
  lockups: [],
  construction: '',
  misuse: [],
  master_vector: '',
});

const TYPE_DOC = JSON.stringify({
  families: [
    {
      id: 'f-latin',
      script: 'latin',
      name: 'Inter',
      license_web: 'SIL OFL 1.1，可嵌入',
      license_print: '',
      license_app: '',
      license_desktop: '',
      file_ref: 'fonts/Inter.woff2',
    },
    {
      id: 'f-chinese',
      script: 'chinese',
      name: 'Noto Serif TC',
      license_web: 'SIL OFL 1.1，可嵌入',
      license_print: '',
      license_app: '',
      license_desktop: '',
      file_ref: 'fonts/NotoSerifTC.woff2',
    },
  ],
  roles: [
    {
      role: 'heading',
      family: 'f-latin',
      weight: '600',
      size: '28px',
      leading: '1.3',
      min: 20,
      measure: '32 字元',
      color_role: 'ink',
      reason: '',
    },
  ],
});

const TONE_DOC = JSON.stringify({
  ...emptyToneDoc(),
  traits: [
    {
      name: '直接',
      do: '講清楚要對方做甚麼',
      dont: '轉彎',
      sentence: '請你星期三之前回覆。',
    },
  ],
  samples: { like: ['請你星期三之前回覆。'], unlike: ['請盡快回覆。'] },
});

const PROMPT_PACK = `# Moonic

## 立場
我們相信護理應該講得出理由。

## 版面
1. stance【重點】 —— 先講相信什麼，後面才有依據。
2. swatches —— 講完立場就給證據。`;

const POLICY = {
  slots: [
    {
      slot: 'home',
      versions: [],
      current: {
        id: 'pv-home',
        versionNo: 1,
        createdAt: '2026-11-10T10:00:00.000Z',
        note: null,
        preview: '你在把這個品牌現有的每一頁編成一份主頁',
        content:
          '你在把這個品牌現有的每一頁編成一份主頁，不是在另做一套識別。必讀每一頁的現行版本，包括自定義頁。缺頁標成缺，不准虛構內容補洞。',
      },
    },
  ],
};

type Fake = { content: string; versionNo: number; pages: typeof PAGES; changed: unknown[] };

function detail(page: unknown, content: string, versionNo: number, changed: unknown[] = []) {
  const current = {
    id: `v${versionNo}`,
    versionNo,
    createdAt: '2026-11-12T09:00:00.000Z',
    note: null,
    preview: content.slice(0, 120),
    policyVersionNo: 1,
    content,
    changed,
  };

  return { page, versions: [current], current };
}

function openHome(
  user: typeof BOSS | typeof WAI,
  options: { doc?: string | null; pages?: typeof PAGES; toneMissing?: boolean; prompt?: string | null } = {},
  overrides: FakeHandlers = {},
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/home');

  const fake: Fake = {
    content: options.doc === undefined ? JSON.stringify(HOME_DOC) : (options.doc ?? ''),
    versionNo: 3,
    changed: [],
    pages:
      options.pages ??
      (options.toneMissing === true
        ? PAGES.map((item) => (item.key === 'tone' ? { ...item, current: null } : item))
        : PAGES),
  };

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: fake.pages, canEdit: user.role === 'owner' }),
    policy: () => jsonResponse(200, POLICY),
    brandOutput: () => {
      if (options.prompt === null) {
        return jsonResponse(404, { error: 'not_found', message: '未有這一版' });
      }

      return jsonResponse(200, options.prompt ?? PROMPT_PACK);
    },
    brandPage: (request) => {
      if (request.path.endsWith('/pages/home')) {
        return jsonResponse(200, {
          page: HOME,
          versions: [],
          current:
            fake.content === ''
              ? null
              : { ...detail(HOME, fake.content, fake.versionNo, fake.changed).current },
        });
      }

      if (request.path.endsWith('/pages/logo')) {
        return jsonResponse(200, detail(LOGO, LOGO_DOC, 1));
      }

      if (request.path.endsWith('/pages/color')) {
        return jsonResponse(200, detail(COLOR, COLOUR_DOC, 1));
      }

      if (request.path.endsWith('/pages/type')) {
        return jsonResponse(200, detail(TYPE, TYPE_DOC, 1));
      }

      if (request.path.endsWith('/pages/tone')) {
        return options.toneMissing === true
          ? jsonResponse(200, { page: { ...TONE, current: null }, versions: [], current: null })
          : jsonResponse(200, detail(TONE, TONE_DOC, 1));
      }

      return jsonResponse(200, detail(PACKAGING, '{}', 1));
    },
    brandPageSave: (request) => {
      const body = JSON.parse(request.body ?? '{}') as { content?: string };
      const before = JSON.parse(fake.content === '' ? '{}' : fake.content) as unknown;
      const after = JSON.parse(body.content ?? '{}') as unknown;

      fake.content = body.content ?? '';
      fake.versionNo += 1;
      fake.changed = changedPaths(before, after);

      return jsonResponse(201, {
        version: {
          id: `v${fake.versionNo}`,
          versionNo: fake.versionNo,
          createdAt: '2026-11-12T10:00:00.000Z',
          note: null,
          preview: fake.content.slice(0, 160),
          policyVersionNo: 1,
          content: fake.content,
          changed: fake.changed,
        },
      });
    },
    ...overrides,
  });

  render(<App />);

  return { api, fake };
}

function savedContent(api: ReturnType<typeof installFakeApi>): string {
  const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/versions'));
  const body = JSON.parse(call?.body ?? '{}') as { content?: string };

  return body.content ?? '';
}

function text(selector: string): string {
  return document.querySelector(selector)?.textContent ?? '';
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('品牌主頁：自己擁有的內容', () => {
  it('打開就是主頁：立場、是誰、關鍵詞、版面', async () => {
    openHome(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-home-stance]')).not.toBeNull();
    });

    expect((document.querySelector('[data-home-stance]') as HTMLTextAreaElement).value).toContain(
      '我們相信護理應該講得出理由',
    );
    expect((document.querySelector('[data-home-who]') as HTMLInputElement).value).toContain('滿月堂');

    // 關鍵詞是 chip 行：三個，逐個讀得到。
    expect(document.querySelectorAll('[data-home-keyword]').length).toBe(3);
    expect(text('[data-home-keyword="0"]')).toContain('中醫');

    // 版面兩塊，第一塊是重點，理由寫在同一行。
    expect(document.querySelectorAll('[data-home-layout]').length).toBe(2);
    expect((document.querySelector('[data-home-layout-emphasis="0"]') as HTMLInputElement).checked).toBe(true);
    expect(
      (document.querySelector('[data-home-layout-reason="0"]') as HTMLInputElement).value,
    ).toContain('先講相信什麼');
  });

  it('四塊引用即時由來源頁砌出來，這一頁不存色值與家族', async () => {
    openHome(BOSS);

    // 四頁是非同步讀的：等最後一塊（語氣）出現才逐項斷言，否則會抓到
    // 「還在讀」那一刻，把未讀完當成缺。
    await waitFor(() => {
      expect(text('[data-home-tone]')).toContain('請你星期三之前回覆。');
    });

    expect(text('[data-home-swatch="brand.primary"]')).toContain('#0057ff');
    expect(text('[data-home-type="heading"]')).toContain('Inter');
    expect(text('[data-home-type="display"]')).toContain('缺');
    expect(text('[data-home-tone]')).toContain('請你星期三之前回覆。');
    expect(text('[data-home-logo]')).toContain('主標誌（橫式）');
  });

  it('每一個引用都寫明來源頁與當時版本', async () => {
    openHome(BOSS);

    await waitFor(() => {
      expect(text('[data-home-ref="brand.primary"]')).toContain('色彩頁 v1');
    });

    expect(text('[data-home-ref="brand"]')).toContain('標誌頁 v1');
    expect(text('[data-home-ref="serif"]')).toContain('字體頁 v1');

    // 六條：兩色 + 標誌 + 兩字體 + 一句語氣。
    expect(document.querySelectorAll('[data-home-ref]').length).toBe(6);
    expect(
      Array.from(document.querySelectorAll('[data-home-ref]')).every(
        (node) => node.getAttribute('data-home-ref-state') === 'ok',
      ),
    ).toBe(true);
  });

  it('追不回來源頁的引用逐條標，不畫假色假字', async () => {
    openHome(BOSS, { toneMissing: true });

    await waitFor(() => {
      expect(document.querySelector('[data-home-ref="請你星期三之前回覆。"]')).not.toBeNull();
    });

    const toneRef = document.querySelector('[data-home-ref="請你星期三之前回覆。"]');

    expect(toneRef?.getAttribute('data-home-ref-state')).toBe('missing-page');
    expect(toneRef?.textContent).toContain('語氣頁未有一版');
  });
});

describe('品牌主頁：頁的入口', () => {
  it('三張自定義頁各自一條入口，不是一條「自定義頁」', async () => {
    openHome(BOSS);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-home-page]').length).toBe(7);
    });

    const custom = Array.from(document.querySelectorAll('[data-home-page]'))
      .map((node) => node.getAttribute('data-home-page'))
      .filter((key) => key === 'packaging' || key === 'photography' || key === 'naming');

    expect(custom).toEqual(['packaging', 'photography', 'naming']);
    expect(
      Array.from(document.querySelectorAll('[data-home-page]')).some((node) =>
        (node.textContent ?? '').includes('自定義頁'),
      ),
    ).toBe(false);
  });

  it('未有現行版本的頁標缺，有版本的寫版本號', async () => {
    openHome(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-home-page="naming"]')).not.toBeNull();
    });

    expect(text('[data-home-page="naming"]')).toContain('缺');
    expect(text('[data-home-page-version="color"]')).toContain('v1');
  });

  it('加了一張自定義頁之後，入口自動多一條（清單由後端來）', async () => {
    openHome(BOSS, { pages: [...PAGES, summary('stationery', '文具', 'custom', 90, false)] });

    await waitFor(() => {
      expect(document.querySelector('[data-home-page="stationery"]')).not.toBeNull();
    });

    expect(document.querySelectorAll('[data-home-page]').length).toBe(8);
  });
});

describe('品牌主頁：缺什麼逐項講', () => {
  it('空表：缺項是一個列表，一項一行', async () => {
    openHome(BOSS, { doc: null });

    await waitFor(() => {
      expect(document.querySelectorAll('[data-home-missing] li').length).toBeGreaterThanOrEqual(4);
    });

    const items = Array.from(document.querySelectorAll('[data-home-missing] li')).map(
      (node) => node.textContent ?? '',
    );

    expect(items.some((line) => line.includes('未寫立場句'))).toBe(true);
    expect(items.some((line) => line.includes('一個關鍵詞都未有'))).toBe(true);
    expect(items.some((line) => line.includes('一塊版面都未有'))).toBe(true);
    expect(items.every((line) => !line.includes('；'))).toBe(true);
  });

  it('版面有一塊未寫理由：當場標，因為那一塊不會出現在輸出', async () => {
    const doc = fullHomeDoc();

    doc.layout = [...doc.layout, { block: 'quotes', source: '', emphasis: 'normal', reason: '' }];

    openHome(BOSS, { doc: JSON.stringify(doc) });

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(document.querySelector('[data-home-layout-reason-gap="2"]')).not.toBeNull();
    });

    expect(text('[data-home-layout-reason-gap="2"]')).toContain('未寫理由');
    expect(text('[data-home-missing]')).toContain('#3');

    // 寫上理由就消失。
    await userEvent.type(
      document.querySelector('[data-home-layout-reason="2"]') as HTMLInputElement,
      '最後收一句客人的話。',
    );

    await waitFor(() => {
      expect(document.querySelector('[data-home-layout-reason-gap="2"]')).toBeNull();
    });
  });

  it('未揀標誌預設模式：標缺，不替人揀一個', async () => {
    openHome(BOSS, { doc: JSON.stringify({ ...fullHomeDoc(), logo_default: '' }) });

    await waitFor(() => {
      expect(text('[data-home-logo-missing]')).toContain('未揀');
    });
  });

  it('標誌頁未有版本：講「未有版本」，不是叫你去補主標誌', async () => {
    openHome(BOSS, {
      doc: null,
      pages: PAGES.map((item) => (item.key === 'logo' ? { ...item, current: null } : item)),
    });

    await waitFor(() => {
      expect(text('[data-home-logo-missing]')).toContain('標誌頁未有現行版本');
    });
  });
});

describe('品牌主頁：改與存', () => {
  it('改「是誰」再儲存：入版本鏈，重新載入仍然在', async () => {
    const { api } = openHome(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(document.querySelector('[data-home-who]')).not.toBeNull();
    });

    const who = document.querySelector('[data-home-who]') as HTMLInputElement;

    await userEvent.clear(who);
    await userEvent.type(who, '滿月堂是一間診所，專做皮膚與身體調理。');
    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as { who?: string; keywords?: string[] };

    expect(sent.who).toBe('滿月堂是一間診所，專做皮膚與身體調理。');
    // 主頁沒有把別人的東西一齊寫進去：關鍵詞原封不動。
    expect(sent.keywords).toEqual(['中醫', '美容', '香港']);

    await waitFor(() => {
      expect((document.querySelector('[data-home-who]') as HTMLInputElement).value).toBe(
        '滿月堂是一間診所，專做皮膚與身體調理。',
      );
    });
  });

  it('重編：新增一版，手改的欄位與版面原封不動', async () => {
    const { api } = openHome(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(document.querySelector('[data-home-regenerate]')).not.toBeNull();
    });

    await userEvent.click(document.querySelector('[data-home-regenerate]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as { stance?: string; layout?: unknown[] };

    expect(sent.stance).toContain('我們相信');
    expect(sent.layout?.length).toBe(2);
    expect(document.querySelector('[data-home-regenerated]')).not.toBeNull();
  });

  it('舊形狀（#39 的 intro ＋ logoMode）講讀不到，不會被當成空白主頁蓋掉', async () => {
    openHome(BOSS, { doc: JSON.stringify({ intro: '滿月堂是一間診所。', logoMode: 'brand' }) });

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(document.querySelector('[data-home-invalid]')).not.toBeNull();
    });

    expect(text('[data-home-invalid]')).toContain('讀不到');
    // 不會靜靜畫一份空表假裝已檢查。
    expect(document.querySelector('[data-home-stance]')).toBeNull();
    expect(document.querySelector('[data-home-reset]')).not.toBeNull();
  });
});

describe('品牌主頁：給 AI 用', () => {
  it('讀的是伺服器交出去的 prompt 包，逐字顯示', async () => {
    openHome(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-home-ai-prompt]')).not.toBeNull();
    });

    expect(text('[data-home-ai-prompt]')).toContain('## 版面');
    expect(text('[data-home-ai-composed]')).toContain('色彩');

    // 四個輸出都指向同一組路徑（不是前端另砌一份）。
    expect(
      document.querySelector('[data-home-ai-output="prompt"] a')?.getAttribute('href'),
    ).toBe('/api/brands/b-moonic/output/prompt.md');
    expect(
      document.querySelector('[data-home-ai-output="tokens"] a')?.getAttribute('href'),
    ).toBe('/api/brands/b-moonic/output/tokens.json');
  });

  it('伺服器未有 prompt 包：講未交出，不是顯示一個空框', async () => {
    openHome(BOSS, { prompt: null });

    await waitFor(() => {
      expect(document.querySelector('[data-home-ai-prompt-missing]')).not.toBeNull();
    });

    expect(document.querySelector('[data-home-ai-prompt]')).toBeNull();
  });
});

describe('品牌主頁：員工', () => {
  it('看得到，改不了（沒有儲存鍵、沒有重編鍵）', async () => {
    openHome(WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-home-stance]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-home-regenerate]')).toBeNull();
    expect((document.querySelector('[data-home-stance]') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});
