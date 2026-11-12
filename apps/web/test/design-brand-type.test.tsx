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
import { fullTypeDoc } from './fixtures/brandTypeface';
import { enterEditMode, whenEditable } from './helpers/brand-page';

/**
 * 字體頁（issue #63，取代 #38 的畫面）。
 *
 * 這一張要證明五件事，五件都是「打開畫面之後，眼睛看到什麼」：
 *
 *   1. 看到的是**有角色的層級**（display／heading／body／caption），每級都有
 *      家族、字級、行高、字重、最小 px、每行字數、文字色。
 *   2. 四個授權渠道（網頁、印刷、應用程式、桌面）逐一在畫面上；留空是
 *      「未寫明」，不是「沒有授權」。
 *   3. 缺可嵌入檔、缺中文，標成缺 —— 而且**沒有用系統字充數**：引用它的
 *      層級一併標缺。
 *   4. 字級要寫單位。打 `18` 會當場講，不是靜靜當成 18 像素。
 *   5. 文字色只引用色彩頁的角色名，沒有第二個放色值的地方。
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

/** 一份填齊的字體表：兩個家族（四個渠道有寫、有可嵌入檔）、四級都有值。 */
const DOC = fullTypeDoc();

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
    changed: [],
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

function role(name: string): HTMLElement | null {
  return document.querySelector(`[data-type-role="${name}"]`);
}

function input(selector: string): HTMLInputElement | null {
  return document.querySelector(selector);
}

function familyField(id: string, field: string): HTMLInputElement | null {
  return document.querySelector(`[data-type-family-${field}="${id}"]`);
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
  it('看到的是有角色的層級：四行，每行有家族、字級、行高、字重、最小 px、文字色', async () => {
    openType(BOSS);

    await waitFor(() => {
      expect(role('display')).not.toBeNull();
    });

    expect(document.querySelectorAll('[data-type-role]').length).toBe(4);

    for (const key of ['display', 'heading', 'body', 'caption']) {
      expect(role(key), key).not.toBeNull();
    }

    // 不是只有一個字體名：每一級都有自己的數值。
    expect(input('[data-type-role-size="display"]')?.value).toBe('56px');
    expect(input('[data-type-role-leading="display"]')?.value).toBe('64px');
    expect(input('[data-type-role-weight="display"]')?.value).toBe('700');
    expect(input('[data-type-role-min="display"]')?.value).toBe('32');
    expect(input('[data-type-role-measure="display"]')?.value).toBe('32 字元');

    // 文字色是一個角色名，不是色值。
    expect(
      (document.querySelector('[data-type-role-color="display"]') as HTMLSelectElement).value,
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

  it('四個授權渠道逐一在畫面上：網頁、印刷、應用程式、桌面', async () => {
    openType(BOSS);

    await waitFor(() => {
      expect(familyField('f-latin', 'licence-web')).not.toBeNull();
    });

    expect(familyField('f-latin', 'licence-web')?.value).toContain('OFL');
    expect(familyField('f-latin', 'licence-print')?.value).toContain('OFL');
    expect(familyField('f-latin', 'licence-app')).not.toBeNull();
    expect(familyField('f-latin', 'licence-desktop')).not.toBeNull();

    // 留空＝未寫明，不是「沒有授權」：上面那句要講清楚。
    expect(document.body.textContent).toContain('留空＝未寫明');
  });

  it('只有應用程式授權也算有授權：不在網頁那一格填東西就不算缺', async () => {
    openType(
      BOSS,
      {},
      JSON.stringify({
        ...DOC,
        families: [
          {
            ...DOC.families[0],
            license_web: '',
            license_print: '',
            license_app: 'App Store 內嵌',
          },
          DOC.families[1],
        ],
      }),
    );

    await waitFor(() => {
      expect(document.querySelector('[data-type-family="f-latin"]')).not.toBeNull();
    });

    expect(
      document.querySelector('[data-type-family="f-latin"]')?.getAttribute('data-missing'),
    ).toBe('false');
    expect(role('body')?.getAttribute('data-missing')).toBe('false');
  });

  it('缺可嵌入檔：家族標缺，引用它的層級一併標缺，沒有用系統字充數', async () => {
    openType(
      BOSS,
      {},
      JSON.stringify({ ...DOC, families: [{ ...DOC.families[0], file_ref: '' }, DOC.families[1]] }),
    );

    await waitFor(() => {
      expect(document.querySelector('[data-type-family="f-latin"]')).not.toBeNull();
    });

    const latin = document.querySelector('[data-type-family="f-latin"]');
    expect(latin?.getAttribute('data-missing')).toBe('true');
    expect(latin?.textContent).toContain('缺可嵌入檔');

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

  it('字級要寫單位：打 18 當場講，打 18px 才算', async () => {
    openType(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(input('[data-type-role-size="heading"]')).not.toBeNull();
    });

    const size = input('[data-type-role-size="heading"]') as HTMLInputElement;

    await userEvent.clear(size);
    await userEvent.type(size, '18');

    expect(role('heading')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-type-unit-error="heading"]')?.textContent).toContain(
      '要寫單位',
    );

    await userEvent.type(size, 'px');

    expect(role('heading')?.getAttribute('data-missing')).toBe('false');
    expect(document.querySelector('[data-type-unit-error="heading"]')).toBeNull();
  });

  it('有編輯權的人改完：入了版本鏈，重新載入仍然是改過的', async () => {
    const { api } = openType(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(input('[data-type-role-size="body"]')).not.toBeNull();
    });

    const size = input('[data-type-role-size="body"]') as HTMLInputElement;

    await userEvent.clear(size);
    await userEvent.type(size, '18px');
    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof DOC;
    const body = sent.roles.find((row) => row.role === 'body');

    expect(body?.size).toBe('18px');
    expect(sent.roles.find((row) => row.role === 'display')?.size).toBe('56px');

    await waitFor(() => {
      expect(input('[data-type-role-size="body"]')?.value).toBe('18px');
    });
  });

  it('刪走家族：指向它的層級一併清空，不留一個指去不存在的家族的值', async () => {
    const { api } = openType(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(document.querySelector('[data-type-family-remove="f-latin"]')).not.toBeNull();
    });

    await userEvent.click(
      document.querySelector('[data-type-family-remove="f-latin"]') as HTMLElement,
    );
    await userEvent.click(screen.getByRole('button', { name: '儲存為新版本' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof DOC;

    expect(sent.families.map((family) => family.id)).toEqual(['f-chinese']);
    expect(sent.roles.find((row) => row.role === 'body')?.family).toBe('');
    expect(sent.roles.find((row) => row.role === 'display')?.family).toBe('f-chinese');
  });

  it('印刷矩陣與錯誤用法：要填齊才加得入，加完看得到', async () => {
    openType(BOSS);

    await whenEditable();
    await enterEditMode();

    await waitFor(() => {
      expect(input('[data-type-print-item]')).not.toBeNull();
    });

    // 只寫項目、沒有規格：講清楚，不靜靜加一行空的。
    await userEvent.type(input('[data-type-print-item]') as HTMLInputElement, '海報');
    await userEvent.click(document.querySelector('[data-type-print-add]') as HTMLElement);

    expect(document.querySelector('[data-type-print-error]')?.textContent).toContain('規格');

    await userEvent.type(input('[data-type-print-spec-input]') as HTMLInputElement, 'A1／300dpi');
    await userEvent.click(document.querySelector('[data-type-print-add]') as HTMLElement);

    expect(document.querySelector('[data-type-print-row="海報"]')).not.toBeNull();
    expect(document.querySelector('[data-type-print-spec="海報"]')?.textContent).toBe('A1／300dpi');

    // 錯誤用法一樣要寫為咩不可以。
    await userEvent.type(input('[data-type-misuse-input]') as HTMLInputElement, '拉寬');
    await userEvent.click(document.querySelector('[data-type-misuse-add]') as HTMLElement);

    expect(document.querySelector('[data-type-misuse-error]')?.textContent).toContain('理由');

    await userEvent.type(
      input('[data-type-misuse-reason-input]') as HTMLInputElement,
      '字骨架會歪，遠處看是扁的',
    );
    await userEvent.click(document.querySelector('[data-type-misuse-add]') as HTMLElement);

    expect(document.querySelector('[data-type-misuse-row="拉寬"]')).not.toBeNull();
    expect(document.querySelector('[data-type-misuse-reason="拉寬"]')?.textContent).toContain('歪');
  });

  it('現行內容不是字體表：講讀不到，不畫假層級', async () => {
    openType(BOSS, {}, '主標用思源黑體，內文用 Inter。');

    expect(
      await screen.findByText('這一版內容不是字體表，所以讀不到當中的家族與層級。'),
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-type-role]').length).toBe(0);
  });

  it('#38 的舊形狀（roles 是一個物件）一樣講讀不到，不會無中生有一張齊全表', async () => {
    openType(
      BOSS,
      {},
      JSON.stringify({
        families: [{ id: 'f', name: 'Inter', licence: '網頁嵌入', webEmbeddable: true }],
        roles: { body: { familyId: 'f', size: '17px' } },
      }),
    );

    expect(
      await screen.findByText('這一版內容不是字體表，所以讀不到當中的家族與層級。'),
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-type-role]').length).toBe(0);
  });

  it('員工：看得到層級，改不了（沒有儲存鍵，欄位唯讀）', async () => {
    openType(WAI);

    await waitFor(() => {
      expect(input('[data-type-role-size="display"]')).not.toBeNull();
    });

    expect(input('[data-type-role-size="display"]')?.readOnly).toBe(true);
    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-type-family-remove]')).toBeNull();
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });
});
