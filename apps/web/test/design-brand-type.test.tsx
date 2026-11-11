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
 * 字體頁（issue #38）。
 *
 * 這一張要證明四件事，四件都是「打開畫面之後，眼睛看到什麼」：
 *
 *   1. 看到的是**有角色的層級**（display／heading／body／caption），不是只有
 *      一個字體名稱。每個層級都有自己的尺寸、行距、字重、最小尺寸、文字顏色。
 *   2. 缺授權、缺中文，標成缺 —— 而且**沒有用系統字充數**：未授權的家族，
 *      引用它的層級一併標缺，不會靜靜用系統預設字頂上。
 *   3. 尺寸要寫單位。打 `18` 會當場講，不是靜靜當成 18 像素。
 *   4. 文字顏色只引用色彩頁的角色名，沒有第二個放色值的地方。
 *
 * 「改完重新載入仍然是改過的」與「員工只讀」兩條另驗：前者證明真的入了
 * 版本鏈（不是只留在畫面），後者是權限。
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

const TYPE_PAGE = {
  id: 'p-type',
  brandId: 'b-moonic',
  kind: 'fixed',
  key: 'type',
  name: '字體',
  brief: null,
  sortOrder: 40,
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
  TYPE_PAGE,
];

/** 一份填齊的字體表：兩個家族（有授權、可嵌入）、四個層級都有值。 */
const DOC = {
  families: [
    {
      id: 'f-latin',
      script: 'latin',
      name: 'Inter',
      licence: '網頁嵌入、印刷、應用程式',
      webEmbeddable: true,
    },
    {
      id: 'f-chinese',
      script: 'chinese',
      name: '思源黑體',
      licence: '網頁嵌入、印刷',
      webEmbeddable: true,
    },
  ],
  roles: {
    display: { familyId: 'f-chinese', size: '56px', leading: '64px', weight: '700', minSize: '32px', colorRole: 'ink' },
    heading: { familyId: 'f-chinese', size: '28px', leading: '36px', weight: '600', minSize: '20px', colorRole: 'ink' },
    body: { familyId: 'f-latin', size: '17px', leading: '26px', weight: '400', minSize: '14px', colorRole: 'ink' },
    caption: { familyId: 'f-latin', size: '13px', leading: '18px', weight: '400', minSize: '11px', colorRole: 'muted' },
  },
  pairing: '中文用思源黑體，拉丁與數字用 Inter；行高取兩者較大者。',
  fallbackLatin: 'system-ui, sans-serif',
  fallbackChinese: 'PingFang TC, sans-serif',
  measure: '32 字元',
  align: 'left',
  misuse: ['不拉寬、不壓扁', '不用低於最小尺寸的字'],
};

const DOC_TEXT = JSON.stringify(DOC);

const V1 = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '{"families":[{"id":"f-latin","name":"Inter"',
  policyVersionNo: 2,
};

type Fake = { content: string | null; versionNo: number };

function detailFor(fake: Fake) {
  if (fake.content === null) {
    return { page: TYPE_PAGE, versions: [], current: null };
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

  return { page: TYPE_PAGE, versions: [current, V1], current };
}

function openType(
  user: typeof BOSS | typeof WAI,
  overrides: FakeHandlers = {},
  initial: string | null = DOC_TEXT,
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/type');

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
  return document.querySelector(`[data-type-role="${name}"]`);
}

function field(name: string, fieldName: string): HTMLInputElement | null {
  return document.querySelector(`[data-type-${fieldName}="${name}"]`);
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

describe('字體頁', () => {
  it('看到的是有角色的層級：四行，每行有尺寸、行距、字重、最小尺寸、文字顏色', async () => {
    openType(BOSS);

    await waitFor(() => {
      expect(role('display')).not.toBeNull();
    });

    expect(document.querySelectorAll('[data-type-role]').length).toBe(4);

    for (const key of ['display', 'heading', 'body', 'caption']) {
      expect(role(key), key).not.toBeNull();
    }

    // 不是只有一個字體名：每一層都有自己的數值。
    expect(field('display', 'size')?.value).toBe('56px');
    expect(field('display', 'leading')?.value).toBe('64px');
    expect(field('display', 'weight')?.value).toBe('700');
    expect(field('display', 'min-size')?.value).toBe('32px');

    // 文字顏色是一個角色名，不是色值。
    expect(
      (document.querySelector('[data-type-color="display"]') as HTMLSelectElement).value,
    ).toBe('ink');
    expect(document.body.textContent).not.toContain('#');

    expect(role('display')?.getAttribute('data-missing')).toBe('false');
  });

  it('一套品牌最多兩個家族：第三個加不到', async () => {
    openType(BOSS);

    await waitFor(() => {
      expect(document.querySelectorAll('[data-type-family]').length).toBe(2);
    });

    // 已經兩個：加家族那一個掣不出現（不是變灰等人等）。
    expect(document.querySelector('[data-type-family-add]')).toBeNull();
    expect(document.querySelector('[data-type-family-limit]')?.textContent).toContain('最多兩個');
  });

  it('缺授權：家族標缺，引用它的層級一併標缺，沒有用系統字充數', async () => {
    openType(BOSS, {}, JSON.stringify({ ...DOC, families: [{ ...DOC.families[0], licence: '' }, DOC.families[1]] }));

    await waitFor(() => {
      expect(document.querySelector('[data-type-family="f-latin"]')).not.toBeNull();
    });

    const latin = document.querySelector('[data-type-family="f-latin"]');
    expect(latin?.getAttribute('data-missing')).toBe('true');
    expect(latin?.textContent).toContain('缺授權');

    // body 與 caption 用拉丁家族：一併標缺。
    expect(role('body')?.getAttribute('data-missing')).toBe('true');
    expect(role('caption')?.getAttribute('data-missing')).toBe('true');
    // display 與 heading 用中文家族：不受影響。
    expect(role('display')?.getAttribute('data-missing')).toBe('false');
  });

  it('缺中文：標成缺，並講明不會用系統預設字充當品牌字', async () => {
    openType(BOSS, {}, JSON.stringify({ ...DOC, families: [DOC.families[0]] }));

    await waitFor(() => {
      expect(document.querySelector('[data-type-family-gap]')).not.toBeNull();
    });

    const gap = document.querySelector('[data-type-family-gap]');
    expect(gap?.textContent).toContain('缺中文字家族');
    expect(gap?.textContent).toContain('系統預設字');
  });

  it('尺寸要寫單位：打 18 當場講，打 18px 才算', async () => {
    openType(BOSS);

    await waitFor(() => {
      expect(field('heading', 'size')).not.toBeNull();
    });

    await userEvent.clear(field('heading', 'size') as HTMLInputElement);
    await userEvent.type(field('heading', 'size') as HTMLInputElement, '18');

    expect(role('heading')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-type-unit-error="heading"]')?.textContent).toContain(
      '要寫單位',
    );

    await userEvent.type(field('heading', 'size') as HTMLInputElement, 'px');

    expect(role('heading')?.getAttribute('data-missing')).toBe('false');
    expect(document.querySelector('[data-type-unit-error="heading"]')).toBeNull();
  });

  it('有編輯權的人改完：入了版本鏈，重新載入仍然是改過的', async () => {
    const { api } = openType(BOSS);

    await waitFor(() => {
      expect(field('body', 'size')).not.toBeNull();
    });

    await userEvent.clear(field('body', 'size') as HTMLInputElement);
    await userEvent.type(field('body', 'size') as HTMLInputElement, '18px');
    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof DOC;
    expect(sent.roles.body.size).toBe('18px');
    expect(sent.roles.display.size).toBe('56px');

    await waitFor(() => {
      expect(field('body', 'size')?.value).toBe('18px');
    });
  });

  it('現行內容不是字體表（舊的自由文字）：講讀不到，不畫假層級', async () => {
    openType(BOSS, {}, '主標用思源黑體，內文用 Inter。');

    expect(await screen.findByText('這一版內容不是字體表，所以讀不到當中的層級。')).toBeTruthy();
    expect(document.querySelectorAll('[data-type-role]').length).toBe(0);
  });

  it('員工：看得到層級，改不了（沒有儲存鍵，欄位唯讀）', async () => {
    openType(WAI);

    await waitFor(() => {
      expect(field('display', 'size')).not.toBeNull();
    });

    expect(field('display', 'size')?.readOnly).toBe(true);
    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-type-family-remove]')).toBeNull();
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});
