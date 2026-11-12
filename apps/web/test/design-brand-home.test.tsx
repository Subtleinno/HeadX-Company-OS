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
 * 品牌主頁（issue #39）。
 *
 * 這一張要證明四件事：
 *
 *   1. 打開品牌模組的第一位就是主頁（不是另一個入口）。
 *   2. 主頁讀得到每一個現行頁的入口 —— 三張自定義頁三條獨立入口，不是一條
 *      「自定義頁」。
 *   3. 未有現行版本的頁如實標缺，寫明缺什麼，不畫示意圖、假色、假字。
 *   4. 手改（這一段、標誌預設模式）儲存之後重新載入仍在；重編不被蓋；員工只讀。
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
    current: current
      ? { id: `v-${key}`, versionNo: 1, createdAt: '2026-11-11T10:00:00.000Z', note: null, preview: '', policyVersionNo: 1 }
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

const HOME_DOC = {
  intro: '滿月堂是一間用中醫調理皮膚與身體的診所，在香港銅鑼灣。',
  logoMode: 'brand',
};

const COLOUR_DOC = JSON.stringify(
  colourDoc({
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
  }),
);

const LOGO_DOC = JSON.stringify({
  assets: [{ class: 'logo', label: '主標誌（橫式）', file_ref: 'logo.svg', version: 'v1' }],
  modes: [{ mode: 'brand', color_role: 'brand.primary', note: '' }],
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
  traits: [
    {
      id: 't-1',
      name: '直接',
      does: '講清楚要對方做甚麼',
      doesExample: '請你星期三之前回覆。',
      doesNot: '轉彎',
      doesNotExample: '唔知你方唔方便呢。',
    },
  ],
  banned: [],
  bilingual: 'zhFirst',
  bilingualNote: '',
  situations: { explain: '', invite: '', refuse: '', apologise: '', incident: '' },
});

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

type Fake = { content: string; versionNo: number; pages: typeof PAGES };

function detail(page: unknown, content: string, versionNo: number) {
  const current = {
    id: `v${versionNo}`,
    versionNo,
    createdAt: '2026-11-12T09:00:00.000Z',
    note: null,
    preview: content.slice(0, 120),
    policyVersionNo: 1,
    content,
  };

  return { page, versions: [current], current };
}

function openHome(
  user: typeof BOSS | typeof WAI,
  options: { doc?: string | null; pages?: typeof PAGES; toneMissing?: boolean } = {},
  overrides: FakeHandlers = {},
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/home');

  const fake: Fake = {
    content: options.doc === undefined ? JSON.stringify(HOME_DOC) : (options.doc ?? ''),
    versionNo: 3,
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
    brandPage: (request) => {
      if (request.path.endsWith('/pages/home')) {
        return jsonResponse(200, {
          page: HOME,
          versions: [],
          current:
            fake.content === ''
              ? null
              : { ...detail(HOME, fake.content, fake.versionNo).current },
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
          ? jsonResponse(200, {
              page: { ...TONE, current: null },
              versions: [],
              current: null,
            })
          : jsonResponse(200, detail(TONE, TONE_DOC, 1));
      }

      return jsonResponse(200, detail(PACKAGING, '{}', 1));
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
          preview: fake.content.slice(0, 160),
          policyVersionNo: 1,
          content: fake.content,
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

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('品牌主頁', () => {
  it('打開就是主頁：這段是誰、四塊樣本、每一頁的入口', async () => {
    openHome(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-home-intro]')).not.toBeNull();
    });

    expect((document.querySelector('[data-home-intro]') as HTMLTextAreaElement).value).toContain(
      '滿月堂',
    );

    // 色彩樣本：只有色彩頁有值的角色。
    await waitFor(() => {
      expect(document.querySelector('[data-home-swatch="brand.primary"]')?.textContent).toContain(
        '#0057ff',
      );
    });

    // 字體樣本：heading 有家族，其餘標缺。
    expect(document.querySelector('[data-home-type="heading"]')?.textContent).toContain('Inter');
    expect(document.querySelector('[data-home-type="display"]')?.textContent).toContain('缺');

    // 語氣短例：拿句子，不是拿形容詞。
    expect(document.querySelector('[data-home-tone]')?.textContent).toContain(
      '請你星期三之前回覆。',
    );

    // 標誌預設用法：主標誌名、模式對應的角色與值。
    expect(document.querySelector('[data-home-logo]')?.textContent).toContain('主標誌（橫式）');
  });

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

  it('未有現行版本的頁標缺，並寫明缺什麼', async () => {
    openHome(BOSS, { toneMissing: true });

    await waitFor(() => {
      expect(document.querySelector('[data-home-page="type"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-home-page="tone"]')?.textContent).toContain('缺');
    expect(document.querySelector('[data-home-page="naming"]')?.textContent).toContain('缺');

    // 語氣頁未有版本（整塊缺）、字體頁有版本但三個層級未有家族（逐項缺）：
    // 兩種缺講法不同，因為要做的事不同。
    const missing = document.querySelector('[data-home-missing]')?.textContent ?? '';

    // 語氣頁整頁未有版本：由那一句「未有現行版本：語氣、命名」講，
    // 不在上面另開一項重複。
    expect(missing).toContain('未有現行版本：語氣');
    expect(missing).toContain('字體頁有層級未指定家族');
    expect(document.querySelector('[data-home-tone]')).toBeNull();
    expect(document.querySelector('[data-home-tone-missing]')).not.toBeNull();
  });

  it('缺項是一個列表：一項一行，不是用「；」串成的長句', async () => {
    openHome(BOSS, { doc: null, toneMissing: true });

    await waitFor(() => {
      expect(document.querySelectorAll('[data-home-missing] li').length).toBeGreaterThanOrEqual(4);
    });

    const items = Array.from(document.querySelectorAll('[data-home-missing] li')).map(
      (node) => node.textContent ?? '',
    );

    // 每一項自己完整講一件事，不是靠上一項的句式接下去。
    expect(items.some((line) => line.includes('「這個品牌是誰」未寫'))).toBe(true);
    expect(items.some((line) => line.includes('未有現行版本：語氣'))).toBe(true);
    expect(items.every((line) => !line.includes('；'))).toBe(true);
  });

  it('加了一張自定義頁之後，入口自動多一條（清單由後端來，不寫死）', async () => {
    openHome(BOSS, {
      pages: [...PAGES, summary('stationery', '文具', 'custom', 90, false)],
    });

    await waitFor(() => {
      expect(document.querySelector('[data-home-page="stationery"]')).not.toBeNull();
    });

    expect(document.querySelectorAll('[data-home-page]').length).toBe(8);
  });

  it('改「這段是誰」再儲存：入版本鏈，重新載入仍然在', async () => {
    const { api } = openHome(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-home-intro]')).not.toBeNull();
    });

    const intro = document.querySelector('[data-home-intro]') as HTMLTextAreaElement;

    await userEvent.clear(intro);
    await userEvent.type(intro, '滿月堂是一間診所，專做皮膚與身體調理。');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as { intro?: string };

    expect(sent.intro).toBe('滿月堂是一間診所，專做皮膚與身體調理。');

    await waitFor(() => {
      expect((document.querySelector('[data-home-intro]') as HTMLTextAreaElement).value).toBe(
        '滿月堂是一間診所，專做皮膚與身體調理。',
      );
    });
  });

  it('重編：新增一版，手改這一段原封不動', async () => {
    const { api } = openHome(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-home-regenerate]')).not.toBeNull();
    });

    await userEvent.click(document.querySelector('[data-home-regenerate]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as { intro?: string; logoMode?: string };

    expect(sent.intro).toContain('滿月堂');
    expect(sent.logoMode).toBe('brand');
    expect(document.querySelector('[data-home-regenerated]')).not.toBeNull();
  });

  it('未揀標誌預設模式：標缺，不替人揀一個', async () => {
    openHome(BOSS, { doc: JSON.stringify({ intro: HOME_DOC.intro, logoMode: '' }) });

    // 標誌頁是非同步讀的：等元素出現只會抓到「正在讀」那一刻（那時頁讀不到，
    // 講的是「標誌頁未有現行版本」），要等真正的句子。
    await waitFor(() => {
      expect(document.querySelector('[data-home-logo-missing]')?.textContent).toContain('未揀');
    });
  });

  it('標誌頁未有版本：講「未有版本」，不是叫你去補主標誌', async () => {
    // 空字串解出來是一份「零資產」的合法文件，所以這一格很容易寫成
    // 「標誌頁未有主標誌」—— 那會叫設計師去補一個他其實要先開頁的洞。
    openHome(BOSS, {
      doc: null,
      pages: PAGES.map((item) => (item.key === 'logo' ? { ...item, current: null } : item)),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-home-logo-missing]')?.textContent).toContain(
        '標誌頁未有現行版本',
      );
    });
  });

  it('員工：看得到主頁，改不了（沒有儲存鍵、沒有重編鍵）', async () => {
    openHome(WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-home-intro]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-home-regenerate]')).toBeNull();
    expect((document.querySelector('[data-home-intro]') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});
