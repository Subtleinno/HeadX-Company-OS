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
import { fullExampleDoc, thinExampleDoc } from './fixtures/brandExamples';

/**
 * 已核准範例（issue #68）。
 *
 * 這一張要證明四件事：
 *
 *   1. 範例卡記得住「用了哪幾頁的哪一版」，品牌改過之後標「舊版」而不是改寫。
 *   2. 逐格標缺：冇檔案、冇格式、冇為咩好，各自講，不是一句「未齊」。
 *   3. 重用一定用現行版本，並逐頁講「由第幾版到第幾版」。
 *   4. 驗收：登記範例後，圖像頁與品牌主頁都引用得到。
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

function summary(key: string, name: string, order: number, versionNo: number | null) {
  return {
    id: `p-${key}`,
    brandId: 'b-moonic',
    kind: 'fixed' as const,
    key,
    name,
    brief: null,
    sortOrder: order,
    group: 'identity',
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

// 色彩與語氣都比範例記錄的版本新：所以範例一開就應該標「舊版」。
const PAGES = [
  summary('home', '品牌主頁', 10, 1),
  summary('logo', '標誌', 20, 1),
  summary('color', '色彩', 30, 3),
  summary('type', '字體', 40, 2),
  summary('tone', '語氣', 50, 2),
  summary('image', '圖像', 70, 1),
  summary('examples', '已核准範例', 90, 1),
];

const COLOUR_DOC = JSON.stringify(colourDoc({ 'brand.primary': { hex: '#0057ff' } }));

const IMAGE_DOC = JSON.stringify({
  stance: '照片是證明。',
  photo: { subject: '手與藥材', composition: '', light: '', tone: '', space: '', props: '' },
  approved_examples: [],
  like: [],
  unlike: [],
  color_link: [],
  illustration: '',
  rights: '',
  banned: [],
});

const PROMPT_PACK = '# Moonic\n\n## 已核准範例\n範例《春季療程社交貼文》（社交貼文 1080×1080）';

const POLICY = {
  slots: [
    {
      slot: 'apply',
      versions: [],
      current: {
        id: 'pv-apply',
        versionNo: 1,
        createdAt: '2026-11-10T10:00:00.000Z',
        note: null,
        preview: '應用層',
        content: '範例要連格式與當時的品牌版本一齊存。',
      },
    },
    {
      slot: 'home',
      versions: [],
      current: {
        id: 'pv-home',
        versionNo: 1,
        createdAt: '2026-11-10T10:00:00.000Z',
        note: null,
        preview: '主頁',
        content: '主頁要引用每一頁的現行版本。',
      },
    },
  ],
};

type Fake = { examples: string; versionNo: number; changed: unknown[] };

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

function open(
  user: typeof BOSS | typeof WAI,
  route: string,
  options: { doc?: string | null } = {},
  overrides: FakeHandlers = {},
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', `/#/design/brand/${route}`);

  const fake: Fake = {
    examples: options.doc === undefined ? JSON.stringify(fullExampleDoc()) : (options.doc ?? ''),
    versionNo: 1,
    changed: [],
  };

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: 'b-moonic' }),
    brandPages: () => jsonResponse(200, { items: PAGES, canEdit: user.role === 'owner' }),
    policy: () => jsonResponse(200, POLICY),
    brandOutput: () => jsonResponse(200, PROMPT_PACK),
    brandPage: (request) => {
      if (request.path.endsWith('/pages/examples')) {
        return jsonResponse(200, {
          page: PAGES[6],
          versions: [],
          current:
            fake.examples === ''
              ? null
              : { ...detail(PAGES[6], fake.examples, fake.versionNo, fake.changed).current },
        });
      }

      if (request.path.endsWith('/pages/image')) {
        return jsonResponse(200, detail(PAGES[5], IMAGE_DOC, 1));
      }

      if (request.path.endsWith('/pages/color')) {
        return jsonResponse(200, detail(PAGES[2], COLOUR_DOC, 3));
      }

      // 其餘頁（logo／type／tone／home）未有內容：主頁會逐項標缺，不影響斷言。
      return jsonResponse(200, { page: PAGES[0], versions: [], current: null });
    },
    brandPageSave: (request) => {
      const body = JSON.parse(request.body ?? '{}') as { content?: string };

      fake.examples = body.content ?? '';
      fake.versionNo += 1;

      return jsonResponse(201, {
        version: {
          id: `v${fake.versionNo}`,
          versionNo: fake.versionNo,
          createdAt: '2026-11-12T10:00:00.000Z',
          note: null,
          preview: fake.examples.slice(0, 160),
          policyVersionNo: 1,
          content: fake.examples,
          changed: fake.changed,
        },
      });
    },
    ...overrides,
  });

  render(<App />);

  return { api, fake };
}

function text(selector: string): string {
  return document.querySelector(selector)?.textContent ?? '';
}

function saved(api: ReturnType<typeof installFakeApi>): string {
  const call = api.calls.find((item) => item.method === 'POST' && item.path.endsWith('/versions'));
  const body = JSON.parse(call?.body ?? '{}') as { content?: string };

  return body.content ?? '';
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('已核准範例：登記與版本', () => {
  it('兩件範例、一個成功 prompt，各帶格式與當時版本', async () => {
    open(BOSS, 'examples');

    // 頁清單是非同步讀的（舊版判斷要對現行版本），所以等版本標記出現，
    // 而不是只等卡片出現 —— 卡片在讀到之前已經在，但那一刻全部都是「未有版本」。
    await waitFor(() => {
      expect(document.querySelector('[data-example-ref-stale="0-color"]')).not.toBeNull();
    });

    expect(document.querySelectorAll('[data-example]').length).toBe(2);
    expect((document.querySelector('[data-example-title="0"]') as HTMLInputElement).value).toBe(
      '春季療程社交貼文',
    );
    expect((document.querySelector('[data-example-format="0"]') as HTMLInputElement).value).toContain(
      '社交貼文',
    );
    expect(text('[data-example-versions="0"]')).toContain('色彩 v1');
    expect(text('[data-example-versions="0"]')).toContain('語氣 v1');

    // 品牌已經改到色彩 v3／語氣 v2：舊版要標，而版本仍然寫它當時那一版。
    expect(document.querySelector('[data-example="0"]')?.getAttribute('data-example-stale')).toBe(
      'true',
    );
    expect(text('[data-example-stale-tag="0"]')).toContain('舊版');
    expect(document.querySelector('[data-example-ref-stale="0-color"]')).not.toBeNull();

    // 第二件只用標誌，而標誌仍是 v1：不算舊版。
    expect(document.querySelector('[data-example="1"]')?.getAttribute('data-example-stale')).toBe(
      'false',
    );

    expect(document.querySelectorAll('[data-prompt]').length).toBe(1);
    expect(text('[data-prompt-stale-tag="0"]')).toContain('色彩 v1');
  });

  it('逐格標缺：冇檔案、冇格式、冇為咩好、冇版本', async () => {
    open(BOSS, 'examples', { doc: JSON.stringify(thinExampleDoc()) });

    await waitFor(() => {
      expect(document.querySelector('[data-example-gap="0"]')).not.toBeNull();
    });

    const gap = text('[data-example-gap="0"]');

    expect(gap).toContain('檔案');
    expect(gap).toContain('格式');
    expect(gap).toContain('為咩好');
    expect(gap).toContain('用了哪幾頁版本');

    // 冇檔案就唔畫一個灰框假裝有圖。
    expect(text('[data-example-thumb="0"]')).toContain('未有檔案');
  });

  it('加一件範例、勾一頁版本，儲存之後兩樣都在', async () => {
    const { api } = open(BOSS, 'examples');

    await waitFor(() => {
      expect(document.querySelector('[data-example-add]')).not.toBeNull();
    });

    await userEvent.click(document.querySelector('[data-example-add]') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-example]').length).toBe(3);
    });

    await userEvent.type(
      document.querySelector('[data-example-title="2"]') as HTMLInputElement,
      '名片背面',
    );
    await userEvent.click(document.querySelector('[data-example-ref="2-color"]') as HTMLElement);

    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(saved(api)) as ReturnType<typeof fullExampleDoc>;

    expect(sent.examples.length).toBe(3);
    expect(sent.examples[2]?.title).toBe('名片背面');
    // 勾頁時版本預設現行（色彩 v3），不是 0 也不是 1。
    expect(sent.examples[2]?.page_refs).toEqual([{ page: 'color', version: 3 }]);
  });

  it('任意 JSON 判 invalid，講讀不到並給重設', async () => {
    open(BOSS, 'examples', { doc: '{"intro":"舊形狀"}' });

    await waitFor(() => {
      expect(document.querySelector('[data-examples-invalid]')).not.toBeNull();
    });

    expect(text('[data-examples-invalid]')).toContain('讀不到');
    expect(document.querySelector('[data-examples-reset]')).not.toBeNull();
  });
});

describe('已核准範例：重用', () => {
  it('重用面板講「這次用哪一版」與逐頁差在哪', async () => {
    open(BOSS, 'examples');

    await waitFor(() => {
      expect(document.querySelector('[data-prompt-reuse="0"]')).not.toBeNull();
    });

    await userEvent.click(document.querySelector('[data-prompt-reuse="0"]') as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector('[data-prompt-reuse-panel="0"]')).not.toBeNull();
    });

    expect(text('[data-prompt-reuse-panel="0"]')).toContain('色彩 v3');
    expect(text('[data-prompt-reuse-moved="color"]')).toContain('v1');
    expect(text('[data-prompt-reuse-moved="color"]')).toContain('v3');
    expect(text('[data-prompt-reuse-moved="tone"]')).toContain('v2');
    // 當時的 prompt 原封不動顯示出來，可以照用。
    expect(text('[data-prompt-reuse-panel="0"]')).toContain('正方形貼文');
  });

  it('「填入現行版本」把各頁現行版本寫成一組', async () => {
    const { api } = open(BOSS, 'examples');

    await waitFor(() => {
      expect(document.querySelector('[data-prompt-brand-fill="0"]')).not.toBeNull();
    });

    await userEvent.click(document.querySelector('[data-prompt-brand-fill="0"]') as HTMLElement);
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(saved(api)) as ReturnType<typeof fullExampleDoc>;

    expect(sent.prompts[0]?.brand_ref).toContain('色彩 v3');
    expect(sent.prompts[0]?.brand_ref).toContain('語氣 v2');
  });
});

describe('已核准範例：載體與輸出', () => {
  it('載體示範三種，輸出四條路徑與主頁同一組', async () => {
    open(BOSS, 'examples');

    await waitFor(() => {
      expect(document.querySelector('[data-carrier="social"]')).not.toBeNull();
    });

    expect(document.querySelectorAll('[data-carrier]').length).toBe(3);
    expect(
      document.querySelector('[data-examples-ai-output="prompt"] a')?.getAttribute('href'),
    ).toBe('/api/brands/b-moonic/output/prompt.md');
    // prompt 包是非同步讀的：等它真的到了才斷言，否則會抓到「還在讀」那一刻。
    await waitFor(() => {
      expect(text('[data-examples-ai-prompt]')).toContain('已核准範例');
    });
  });
});

describe('已核准範例：員工', () => {
  it('看得到，改不了', async () => {
    open(WAI, 'examples');

    await waitFor(() => {
      expect(document.querySelector('[data-example-title="0"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-example-add]')).toBeNull();
    expect((document.querySelector('[data-example-title="0"]') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});

describe('驗收：登記範例後，其他頁引用得到', () => {
  it('圖像頁引用得到，並帶當時版本', async () => {
    open(BOSS, 'image');

    await waitFor(() => {
      expect(document.querySelector('[data-image-approved="0"]')).not.toBeNull();
    });

    expect(text('[data-image-approved="0"]')).toContain('春季療程社交貼文');
    expect(text('[data-image-approved-version="0"]')).toContain('色彩 v1');
    // 品牌已改到色彩 v3：引用照樣標舊版，不改寫。
    expect(document.querySelector('[data-image-approved="0"]')?.getAttribute('data-image-approved-stale')).toBe(
      'true',
    );
    expect(text('[data-image-approved="0"]')).toContain('舊版');
  });

  it('品牌主頁引用得到，並連去範例頁', async () => {
    open(BOSS, 'home');

    await waitFor(() => {
      expect(document.querySelector('[data-home-example="0"]')).not.toBeNull();
    });

    expect(text('[data-home-example="0"]')).toContain('春季療程社交貼文');
    expect(text('[data-home-example-versions="0"]')).toContain('色彩 v1');
    expect(document.querySelector('[data-home-example="0"]')?.getAttribute('data-home-example-stale')).toBe(
      'true',
    );
    expect(document.querySelector('[data-home-examples-link]')?.getAttribute('href')).toBe(
      '#/design/brand/examples',
    );
  });
});
