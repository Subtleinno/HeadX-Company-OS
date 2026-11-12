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
 * 自定義頁（issue #41）。
 *
 * 這一張要證明五件事：
 *
 *   1. 打開任何一張自定義頁，見到的是**那一頁自己**的 brief 與內容 ——
 *      不是空白、不是另一張頁、也不是一份通用範本換了標題。
 *   2. brief 太空泛（例如只寫「關於包裝」）如實講「未寫這一頁要決定什麼」，
 *      不自己編一個方向。
 *   3. brief 要求通用槽禁止的事：停手，講明是哪兩句撞。
 *   4. 引用的角色只寫名字，值由色彩頁來；未定就標缺。
 *   5. 有編輯權的人改完重新載入仍然在；員工只讀。
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

const PACKAGING = {
  id: 'p-packaging',
  brandId: 'b-moonic',
  kind: 'custom',
  key: 'packaging',
  name: '包裝',
  brief: '包裝要決定盒型、紙材、印刷方式與最小落單量，以及盒上的資訊次序。',
  sortOrder: 60,
  current: null,
};

const PACKAGING_DOC = {
  decided: '這一頁決定盒型與紙材：單支裝、雙支裝，白卡 350g。',
  notDecided: '不決定品牌色與字體。',
  rules: ['盒面只放主標誌與產品名'],
  examples: ['單支裝：白卡 350g，主標誌置中。'],
  badExamples: ['盒面同時放三個標誌。'],
  colorRoles: ['brand.primary'],
  typeRoles: ['heading'],
};

const COLOUR_DOC = JSON.stringify(
  colourDoc({
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
    surface: { hex: '#17171d', cmyk: '0 0 0 90' },
  }),
);

const TONE_DOC = JSON.stringify({
  stance: '我們賣的是可以講清楚的療程。',
  traits: [],
  banned: [
    { term: '賦能', reason: '意思空，讀者不知道得到甚麼' },
    { term: '閉環', reason: '行業術語，客人不會用' },
  ],
  language_policy: '對外一律繁體中文。',
  contexts: { explain: '句', invite: '句', decline: '句', apologize: '句', incident: '句' },
  samples: { like: [], unlike: [] },
  hardest_line: { wrong: '', right: '' },
});

const TYPE_DOC = JSON.stringify({
  families: [
    { id: 'f-latin', script: 'latin', name: 'Inter', licence: '網頁嵌入', webEmbeddable: true },
  ],
  roles: {
    heading: { familyId: 'f-latin', size: '28px', leading: '1.3', weight: '600', minSize: '20px', colorRole: 'ink' },
  },
});

const POLICY = {
  slots: [
    {
      slot: 'custom',
      versions: [],
      current: {
        id: 'pv1',
        versionNo: 1,
        createdAt: '2026-11-10T10:00:00.000Z',
        note: null,
        preview: '先判斷這頁是不是其實屬於標誌',
        content:
          '不是的話，必須有：這頁決定什麼、不准決定什麼、規則、例子、錯誤例子、它如何引用既有角色、版本。\n\n不准發明新色、新字、新標誌。文字遵循語氣策略。不夠具體就標成缺。',
      },
    },
  ],
};

const V1 = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '{"decided":"這一頁決定盒型',
  policyVersionNo: 1,
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
    policyVersionNo: 1,
    content,
  };

  return { page, versions: [current, V1], current };
}

function openCustom(
  user: typeof BOSS | typeof WAI,
  options: { doc?: string | null; brief?: string; colour?: string | null } = {},
  overrides: FakeHandlers = {},
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/p/packaging');

  const page = { ...PACKAGING, brief: options.brief ?? PACKAGING.brief };
  const fake: Fake = {
    content: options.doc === undefined ? JSON.stringify(PACKAGING_DOC) : options.doc,
    versionNo: 2,
  };

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: [page], canEdit: user.role === 'owner' }),
    policy: () => jsonResponse(200, POLICY),
    brandPage: (request) => {
      if (request.path.endsWith('/pages/color')) {
        return jsonResponse(
          200,
          detail(
            { ...PACKAGING, id: 'p-color', kind: 'fixed', key: 'color', name: '色彩' },
            options.colour === undefined ? COLOUR_DOC : options.colour,
            1,
          ),
        );
      }

      if (request.path.endsWith('/pages/type')) {
        return jsonResponse(
          200,
          detail({ ...PACKAGING, id: 'p-type', kind: 'fixed', key: 'type', name: '字體' }, TYPE_DOC, 1),
        );
      }

      if (request.path.endsWith('/pages/tone')) {
        return jsonResponse(
          200,
          detail({ ...PACKAGING, id: 'p-tone', kind: 'fixed', key: 'tone', name: '語氣' }, TONE_DOC, 1),
        );
      }

      return jsonResponse(200, detail(page, fake.content, fake.versionNo));
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

describe('自定義頁', () => {
  it('見到的是那一頁自己的 brief 與六個欄目', async () => {
    openCustom(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-custom-decided]')).not.toBeNull();
    });

    // brief 原文照登 —— 不是標題換一換。
    expect(document.querySelector('[data-custom-brief]')?.textContent).toContain('盒型、紙材');
    expect((document.querySelector('[data-custom-decided]') as HTMLTextAreaElement).value).toContain(
      '單支裝',
    );
    expect(document.querySelectorAll('[data-custom-rule]').length).toBe(1);
    expect(document.querySelector('[data-custom-bad-example]')).not.toBeNull();
    expect(document.querySelectorAll('[data-custom-type-role]').length).toBeGreaterThan(0);
  });

  it('brief 太空泛：如實講「未寫這一頁要決定什麼」，不自己編方向', async () => {
    openCustom(BOSS, { brief: '關於包裝' });

    await waitFor(() => {
      expect(document.querySelector('[data-custom-brief-gap]')).not.toBeNull();
    });

    expect(document.querySelector('[data-custom-brief-gap]')?.textContent).toContain(
      '未寫這一頁要決定什麼',
    );
  });

  it('引用的色彩角色只寫名字，值由色彩頁來；未定就標缺', async () => {
    openCustom(BOSS, {
      doc: JSON.stringify({ ...PACKAGING_DOC, colorRoles: ['brand.primary', 'ink'] }),
    });

    // 色彩頁是非同步讀的：等有值才算數，不是等元素出現。

    await waitFor(() => {
      expect(document.querySelector('[data-custom-role="brand.primary"]')?.textContent).toContain(
        '#0057ff',
      );
    });
    // ink 在色彩頁未定：不畫假色，標缺。
    expect(document.querySelector('[data-custom-role="ink"]')?.textContent).toContain('缺');
    expect(document.querySelector('[data-custom-role-gap]')?.textContent).toContain('ink');
  });

  it('例子用了語氣頁的禁用詞：當場指出是哪一個', async () => {
    openCustom(BOSS, {
      doc: JSON.stringify({ ...PACKAGING_DOC, examples: ['盒面寫「賦能品牌增長」。'] }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-custom-banned]')?.textContent).toContain('賦能');
    });

    // 不只知道「有犯」，要知道是**哪一句**犯：標在那一句本身。
    expect(document.querySelector('[data-custom-example-banned]')?.textContent).toContain('賦能');
    expect(document.querySelectorAll('[data-custom-example-banned]').length).toBe(1);

    // 錯誤例子是故意示範錯的東西，所以不查。
    expect(document.querySelector('[data-custom-bad-example-banned]')).toBeNull();
  });

  it('brief 要發明新色：停手，並講明撞通用槽哪一句', async () => {
    openCustom(BOSS, { brief: '包裝要發明一套自己的顏色，用來做禮盒。' });

    await waitFor(() => {
      expect(document.querySelector('[data-custom-conflict]')?.textContent).toContain(
        '不准發明新色、新字、新標誌',
      );
    });

    const text = document.querySelector('[data-custom-conflict]')?.textContent ?? '';

    expect(text).toContain('發明');
    expect(text).toContain('不准發明新色、新字、新標誌');
  });

  it('有編輯權的人改完：入了版本鏈，重新載入仍然是改過的', async () => {
    const { api } = openCustom(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-custom-decided]')).not.toBeNull();
    });

    const decided = document.querySelector('[data-custom-decided]') as HTMLTextAreaElement;

    await userEvent.clear(decided);
    await userEvent.type(decided, '這一頁決定盒型。');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof PACKAGING_DOC;

    expect(sent.decided).toBe('這一頁決定盒型。');
    // 手寫的其他欄位不會被蓋走。
    expect(sent.rules).toEqual(PACKAGING_DOC.rules);

    await waitFor(() => {
      expect((document.querySelector('[data-custom-decided]') as HTMLTextAreaElement).value).toBe(
        '這一頁決定盒型。',
      );
    });
  });

  it('重編：按一下就新增一版，手改的文字原封不動', async () => {
    const { api } = openCustom(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-custom-regenerate]')).not.toBeNull();
    });

    await userEvent.click(document.querySelector('[data-custom-regenerate]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof PACKAGING_DOC;

    expect(sent.decided).toBe(PACKAGING_DOC.decided);
    expect(sent.rules).toEqual(PACKAGING_DOC.rules);
    expect(document.querySelector('[data-custom-regenerated]')).not.toBeNull();
  });

  it('未有任何版本：六欄各自講自己未有內容，不是同一句抄三次', async () => {
    openCustom(BOSS, { doc: null });

    await waitFor(() => {
      expect(document.querySelector('[data-custom-decided]')).not.toBeNull();
    });

    expect((document.querySelector('[data-custom-decided]') as HTMLTextAreaElement).value).toBe('');
    expect(document.querySelector('[data-custom-rule-empty]')?.textContent).toBe('未有一條規則。');
    expect(document.querySelector('[data-custom-example-empty]')?.textContent).toBe('未有一個例子。');
    expect(document.querySelector('[data-custom-bad-example-empty]')?.textContent).toBe(
      '未有一個錯誤例子。',
    );
    expect(document.querySelector('[data-brand-page-save]')?.hasAttribute('disabled')).toBe(true);
  });

  it('重編不會清走「那一頁未有值」的引用 —— 缺不是失效', async () => {
    // TYPE_DOC 只定義了 heading；caption 是有效的層級名，但字體頁未指定家族。
    const { api } = openCustom(BOSS, {
      doc: JSON.stringify({ ...PACKAGING_DOC, typeRoles: ['caption'] }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-custom-regenerate]')).not.toBeNull();
    });

    await userEvent.click(document.querySelector('[data-custom-regenerate]') as HTMLElement);

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof PACKAGING_DOC;

    expect(sent.typeRoles).toEqual(['caption']);
    expect(sent.colorRoles).toEqual(PACKAGING_DOC.colorRoles);
  });

  it('員工：看得到這一頁，改不了（沒有儲存鍵、沒有重編鍵）', async () => {
    openCustom(WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-custom-decided]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-custom-regenerate]')).toBeNull();
    expect((document.querySelector('[data-custom-decided]') as HTMLTextAreaElement).readOnly).toBe(
      true,
    );
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});
