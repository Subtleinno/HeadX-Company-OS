// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import './helpers/rtl';
import { App } from '../src/App';
import { resetDirectoryCache } from '../src/frame/useDirectory';
import { DESIGN_NAV, withBrandPages } from '../src/frame/appNav';
import { installFakeApi, jsonResponse, resetBrowserState } from './helpers/fake-api';
import { colourDoc } from './fixtures/brandColour';
import { typeDoc, fullFamily } from './fixtures/brandTypeface';
import { fullHomeDoc } from './fixtures/brandHome';
import { emptyToneDoc } from '../src/design/brandTone';
import { emptyLogoDoc } from '../src/design/brandLogo';

/**
 * 跨畫面整合（issue #69 第 2 點）。
 *
 * 七頁做完之後，最容易壞的不是規則，是**一致性**：某一頁沒有版本抽屜、
 * 某一頁的 Needs 欄不見了、某一頁的檢查摘要不畫。所以這裡逐頁打開，用同一組
 * 選擇器問同一組問題 —— 有一頁答不出就是不一致。
 *
 * 側欄的頁清單與「缺」標記是純函式（`withBrandPages`），所以另外直接驗它：
 * 分組、次序、缺頁 badge。
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

function summary(
  key: string,
  name: string,
  order: number,
  group: string,
  versionNo: number | null,
  kind: 'fixed' | 'custom' = 'fixed',
) {
  return {
    id: `p-${key}`,
    brandId: 'b-moonic',
    kind,
    key,
    name,
    brief: null,
    sortOrder: order,
    group,
    current:
      versionNo === null
        ? null
        : {
            id: `v-${key}`,
            versionNo,
            createdAt: '2026-11-11T10:00:00.000Z',
            note: null,
            preview: '',
            policyVersionNo: 1,
            changed: [],
          },
  };
}

const PAGES = [
  summary('home', '品牌主頁', 10, 'home', 2),
  summary('logo', '標誌', 20, 'identity', 1),
  summary('color', '色彩', 30, 'identity', 1),
  summary('type', '字體', 40, 'identity', 1),
  summary('tone', '語氣', 50, 'identity', 1),
  summary('image', '圖像', 60, 'identity', 1),
  summary('examples', '已核准範例', 90, 'apply', 1),
  // 這一頁未有版本：側欄要標「缺」，而這一頁自己仍要開得到。
  summary('packaging', '包裝', 70, 'custom', null, 'custom'),
];

const LOGO_DOC = JSON.stringify({
  ...emptyLogoDoc(),
  assets: [{ class: 'logo', label: '主標誌', file_ref: 'logo.svg', version: 'v1' }],
  modes: [{ mode: 'brand', color_role: 'brand.primary', note: '' }],
  min_size: { screen_px: 24, print_mm: 12 },
});

const TYPE_DOC = JSON.stringify({
  ...typeDoc({ heading: { family: 'f-latin' } }),
  families: [fullFamily('f-latin', 'Inter', 'latin')],
});

const IMAGE_DOC = JSON.stringify({
  stance: '',
  photo: { subject: '', composition: '', light: '', tone: '', space: '', props: '' },
  approved_examples: [],
  like: [],
  unlike: [],
  color_link: [],
  illustration: '',
  rights: '',
  banned: [],
});

/** 每一頁都有一段合法內容：這樣七頁都會畫出表身，而不是七個「未開始」。 */
const CONTENT: Record<string, string> = {
  home: JSON.stringify(fullHomeDoc()),
  logo: LOGO_DOC,
  color: JSON.stringify(colourDoc({ 'brand.primary': { hex: '#0057ff' } })),
  type: TYPE_DOC,
  tone: JSON.stringify({ ...emptyToneDoc(), traits: [] }),
  image: IMAGE_DOC,
  examples: JSON.stringify({ examples: [], prompts: [] }),
  packaging: JSON.stringify({ decided: '包裝要決定什麼', notDecided: '', rules: [], examples: [], badExamples: [], colorRoles: [], typeRoles: [] }),
};

const POLICY = {
  slots: ['home', 'apply'].map((slot) => ({
    slot,
    versions: [],
    current: {
      id: `pv-${slot}`,
      versionNo: 1,
      createdAt: '2026-11-10T10:00:00.000Z',
      note: null,
      preview: slot,
      content: '這一頁要照規矩編。',
    },
  })),
};

function page(key: string) {
  return PAGES.find((item) => item.key === key) ?? PAGES[0];
}

function openPage(key: string): void {
  // 自定義頁走 `p/<slug>`：這是網址的一部分，不是顯示名。
  const route = key === 'packaging' ? 'p/packaging' : key;

  window.history.replaceState(null, '', `/#/design/brand/${route}`);

  installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user: BOSS }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: true }),
    policy: () => jsonResponse(200, POLICY),
    brandOutput: () => jsonResponse(200, '# prompt'),
    brandPage: (request) => {
      const at = request.path.lastIndexOf('/pages/');
      const wanted = at < 0 ? '' : request.path.slice(at + '/pages/'.length);

      if (!(wanted in CONTENT)) {
        return jsonResponse(404, { error: 'not_found' });
      }

      const content = CONTENT[wanted] ?? '';

      return jsonResponse(200, {
        page: page(wanted),
        versions: [],
        current: {
          id: `v-${wanted}`,
          versionNo: 1,
          createdAt: '2026-11-12T09:00:00.000Z',
          note: null,
          preview: content.slice(0, 120),
          policyVersionNo: 1,
          content,
          changed: [],
        },
      });
    },
  });

  render(<App />);
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('七頁一致性：同一組選擇器，同一組答案', () => {
  const KEYS = ['home', 'logo', 'color', 'type', 'tone', 'image', 'examples'];

  for (const key of KEYS) {
    it(`${key}：表身、版本抽屜、Needs 欄、檢查摘要四樣都在`, async () => {
      openPage(key);

      await waitFor(() => {
        expect(document.querySelector(`[data-brand-page-body="${key}"]`)).not.toBeNull();
      });

      // 版本抽屜（#33）：每一頁都可以回到舊版。
      await waitFor(() => {
        expect(document.querySelector('[data-brand-page-versions]')).not.toBeNull();
      });

      // 右側 Needs 欄（#58）：缺口在每一頁都見得到，不是只在主頁。
      expect(document.querySelector('[data-gap-rail]')).not.toBeNull();

      // 檢查摘要（#59）：loading 也是一個狀態，所以一定有這一個節點。
      expect(document.querySelector('[data-brand-check]')).not.toBeNull();
    });
  }

  it('未有版本的頁：畫面講「缺」，而側欄的 badge 由同一份清單來', async () => {
    openPage('packaging');

    // 自定義頁共用一個表身（`custom`）：內容由 payload 決定，不是每張頁一套。
    await waitFor(() => {
      expect(document.querySelector('[data-brand-page-body="custom"]')).not.toBeNull();
    });

    // 側欄 / 頁籤的「缺」是同一個來源（`page.current === null`），
    // 所以這裡驗純函式：同一份清單餵給導覽，缺的那一頁就有 badge。
    const nav = withBrandPages(
      DESIGN_NAV,
      PAGES.map((item) => ({
        key: item.key,
        name: item.name,
        kind: item.kind,
        group: item.group as 'home' | 'identity' | 'apply' | 'custom',
        missing: item.current === null,
      })),
    );
    const brand = nav.modules.find((item) => item.key === 'brand');
    const pages = brand?.groups.flatMap((group) => group.pages) ?? [];
    const packaging = pages.find((item) => item.key === 'p/packaging');

    expect(packaging?.badge).toBe('缺');
    // 其他六頁有版本，所以冇 badge —— 缺頁標記唔會傳染。
    expect(pages.filter((item) => item.badge !== undefined).length).toBe(1);
  });
});

describe('側欄頁清單：由後端來，分四組，次序固定', () => {
  it('七頁分成 主頁／識別／應用 三組（空組不畫），自定義頁在品牌專屬', () => {
    const nav = withBrandPages(
      DESIGN_NAV,
      PAGES.map((item) => ({
        key: item.key,
        name: item.name,
        kind: item.kind,
        group: item.group as 'home' | 'identity' | 'apply' | 'custom',
        missing: item.current === null,
      })),
    );
    const brand = nav.modules.find((item) => item.key === 'brand');
    const groups = (brand?.groups ?? []).map((group) => ({
      title: group.titleKey ?? null,
      pages: group.pages.map((item) => item.key),
    }));

    expect(groups.map((group) => group.title)).toEqual([
      null,
      'design.group.identity',
      'design.group.custom',
      'design.group.apply',
    ]);
    expect(groups[0]?.pages).toEqual(['home']);
    expect(groups[1]?.pages).toEqual(['logo', 'color', 'type', 'tone', 'image']);
    expect(groups[2]?.pages).toEqual(['p/packaging']);
    expect(groups[3]?.pages).toEqual(['examples']);
  });

  it('後端未讀到之前，骨架也有七頁（不會閃走一頁）', () => {
    const brand = DESIGN_NAV.modules.find((item) => item.key === 'brand');
    const keys = brand?.groups.flatMap((group) => group.pages.map((item) => item.key)) ?? [];

    expect(keys).toEqual(['home', 'logo', 'color', 'type', 'tone', 'image', 'examples']);
  });
});
