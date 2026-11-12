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
import { fullImageDoc } from './fixtures/brandImage';

/**
 * 圖像頁（issue #66）。
 *
 * 這一張要證明四件事：
 *
 *   1. 打開見到的是**六格攝影、一件件真範例、要與不要、顏色引用**，不是一段
 *      自由文字。
 *   2. 冇一件有檔案的真照片就標缺 —— 不用圖庫圖假扮；色彩頁未定值的角色標
 *      「色彩頁未定值」，不畫一個假色。
 *   3. 有編輯權的人改完，入了版本鏈，差異指出改了哪一欄；員工只讀。
 *   4. 這一頁不決定色值、字體、標誌。
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

const IMAGE_PAGE = {
  id: 'p-image',
  brandId: 'b-moonic',
  kind: 'fixed',
  key: 'image',
  name: '圖像',
  brief: null,
  sortOrder: 70,
  current: null,
};

const PAGES = [IMAGE_PAGE];

const DOC = fullImageDoc();

const DOC_TEXT = JSON.stringify(DOC);

const COLOUR_TEXT = JSON.stringify(
  colourDoc({
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
  }),
);

const V1 = {
  id: 'v1',
  versionNo: 1,
  createdAt: '2026-11-11T10:00:00.000Z',
  note: null,
  preview: '{"stance":"我們只拍真實做完療程的人",',
  policyVersionNo: 2,
};

type Fake = { content: string | null; versionNo: number; changed: string[] };

function detail(page: unknown, content: string | null, versionNo: number, changed: string[] = []) {
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
    // 後端就是這樣算的：逐層落到欄位。
    changed,
  };

  return { page, versions: [current, V1], current };
}

function openImage(
  user: typeof BOSS | typeof WAI,
  options: { doc?: string | null; colour?: string | null } = {},
  overrides: FakeHandlers = {},
): { api: ReturnType<typeof installFakeApi>; fake: Fake } {
  window.history.replaceState(null, '', '/#/design/brand/image');

  const fake: Fake = {
    content: options.doc === undefined ? DOC_TEXT : options.doc,
    versionNo: 2,
    changed: [],
  };

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
            { ...IMAGE_PAGE, id: 'p-color', key: 'color', name: '色彩' },
            options.colour === undefined ? COLOUR_TEXT : options.colour,
            1,
          ),
        );
      }

      return jsonResponse(200, detail(IMAGE_PAGE, fake.content, fake.versionNo, fake.changed));
    },
    brandPageSave: (request) => {
      const body = JSON.parse(request.body ?? '{}') as { content?: string };
      const before = JSON.parse(fake.content ?? '{}') as unknown;
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
          preview: fake.content.slice(0, 120),
          policyVersionNo: 3,
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

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('圖像頁', () => {
  it('看到的是六格攝影、真範例、要與不要、顏色引用', async () => {
    openImage(BOSS);

    // 六格永遠都在（欄位固定），所以「元素存在」不代表內容已讀到；要等值。
    await waitFor(() => {
      expect(
        (document.querySelector('[data-image-photo="light"]') as HTMLTextAreaElement | null)?.value,
      ).toContain('窗光');
    });

    // 六格，每格都有值。
    expect(document.querySelectorAll('[data-image-photo]').length).toBe(6);
    expect((document.querySelector('[data-image-photo="light"]') as HTMLTextAreaElement).value).toContain(
      '窗光',
    );

    // 範例兩件，每件有檔案。
    expect(document.querySelectorAll('[data-image-example]').length).toBe(2);
    expect(
      (document.querySelector('[data-image-example-file="0"]') as HTMLInputElement).value,
    ).toBe('photos/room-window.jpg');

    // 要與不要。
    expect(document.querySelectorAll('[data-image-line^="like-"]').length).toBe(3);
    expect(document.querySelectorAll('[data-image-line^="unlike-"]').length).toBe(3);

    // 顏色：角色名加色彩頁的值。等色彩頁讀到才算數。
    await waitFor(() => {
      expect(document.querySelector('[data-image-color-hex="brand.primary"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-image-color-link="brand.primary"]')?.textContent).toContain(
      '#0057ff',
    );

    // 授權與禁止。
    expect((document.querySelector('[data-image-rights]') as HTMLTextAreaElement).value).toContain(
      '買斷',
    );
    expect(document.querySelectorAll('[data-image-banned-row]').length).toBe(2);
  });

  it('冇一件有檔案的真照片：標缺，不用圖庫圖假扮（驗收第一條）', async () => {
    openImage(BOSS, {
      doc: JSON.stringify({
        ...DOC,
        approved_examples: [{ label: '暖調自然光', file_ref: '', use: '官網' }],
      }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-image-real-example]')).not.toBeNull();
    });

    expect(document.querySelector('[data-image-real-example]')?.textContent).toContain('圖庫');
    expect(document.querySelector('[data-image-missing]')?.textContent).toContain('真照片');
    expect(document.querySelector('[data-image-example="0"]')?.getAttribute('data-missing')).toBe('true');
    expect(document.querySelector('[data-image-example-gap="0"]')?.textContent).toContain('檔案');
  });

  it('六格缺一格：講得出缺邊一格', async () => {
    openImage(BOSS, { doc: JSON.stringify({ ...DOC, photo: { ...DOC.photo, light: '' } }) });

    await waitFor(() => {
      expect(document.querySelector('[data-image-missing]')).not.toBeNull();
    });

    expect(document.querySelector('[data-image-missing]')?.textContent).toContain('光線');
    expect(document.querySelector('[data-image-photo-field="light"]')?.getAttribute('data-missing')).toBe(
      'true',
    );
    expect(
      document.querySelector('[data-image-photo-field="tone"]')?.getAttribute('data-missing'),
    ).toBe('false');
  });

  it('色彩頁未定值：標明未定，不畫一個假色', async () => {
    openImage(BOSS, { colour: JSON.stringify(colourDoc({ ink: { hex: '#191919' } })) });

    await waitFor(() => {
      expect(document.querySelector('[data-image-color-link="brand.primary"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-image-color-link="brand.primary"]')?.textContent).toContain(
      '色彩頁未定值',
    );
    expect(document.querySelector('[data-image-color-link="brand.primary"]')?.getAttribute('data-missing')).toBe(
      'true',
    );
  });

  it('色彩頁認不到的角色：講明認不到', async () => {
    openImage(BOSS, {
      doc: JSON.stringify({ ...DOC, color_link: ['brand.primary', 'brand.tertiary'] }),
    });

    await waitFor(() => {
      expect(document.querySelector('[data-image-color-unknown="brand.tertiary"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-image-missing]')?.textContent).toContain('brand.tertiary');
  });

  it('新增一句「要的樣子」：入了版本鏈，差異指出改了哪一欄', async () => {
    const { api } = openImage(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-image-line-input="like"]')).not.toBeNull();
    });

    const input = document.querySelector('[data-image-line-input="like"]') as HTMLInputElement;

    await userEvent.type(input, '背景是診所自己的牆');
    await userEvent.click(document.querySelector('[data-image-line-add="like"]') as HTMLElement);

    expect(document.querySelectorAll('[data-image-line^="like-"]').length).toBe(4);

    await userEvent.click(screen.getByRole('button', { name: '儲存（新增一版）' }));

    await waitFor(() => {
      expect(api.count('brandPageSave')).toBe(1);
    });

    const sent = JSON.parse(savedContent(api)) as typeof DOC;
    expect(sent.like).toContain('背景是診所自己的牆');
    expect(sent.approved_examples).toHaveLength(2);

    // 差異講「要的樣子」，不是印一次內容。
    await waitFor(() => {
      expect(document.querySelector('[data-brand-page-changed-item]')?.textContent).toContain('要的樣子');
    });
  });

  it('現行內容是自由文字：講讀不到，不畫六格空的假規格', async () => {
    openImage(BOSS, { doc: '照片要暖調、自然光，不要用閃光。' });

    expect(await screen.findByText('這一版內容不是圖像表，所以讀不到當中的攝影規格與範例。')).toBeTruthy();
    expect(document.querySelectorAll('[data-image-photo]').length).toBe(0);
  });

  it('員工：看得到圖像頁，改不了（沒有儲存鍵、沒有新增範例）', async () => {
    openImage(WAI);

    await waitFor(() => {
      expect(document.querySelector('[data-image-photo="subject"]')).not.toBeNull();
    });

    expect(document.querySelector('[data-brand-page-save]')).toBeNull();
    expect(document.querySelector('[data-image-example-add]')).toBeNull();
    expect((document.querySelector('[data-image-photo="subject"]') as HTMLTextAreaElement).readOnly).toBe(
      true,
    );
    expect(screen.getByText('你只可以看這一頁。要改，請找老闆。')).toBeTruthy();
  });

  it('這一頁不決定色值、字體、標誌', async () => {
    openImage(BOSS);

    await waitFor(() => {
      expect(document.querySelector('[data-image-photo="subject"]')).not.toBeNull();
    });

    const colourInputs = Array.from(document.querySelectorAll('input')).filter(
      (input) => input.type === 'color',
    );

    expect(colourInputs.length).toBe(0);
    expect(document.querySelector('[data-color-role]')).toBeNull();
    expect(document.querySelector('[data-type-family]')).toBeNull();
    expect(document.querySelector('[data-logo-asset]')).toBeNull();
  });
});
