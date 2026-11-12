// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
 * 品牌模組的頁清單與自定義頁（issue #32）。
 *
 * 這一張不是關於內容，是關於**一個品牌有哪幾頁**：
 *
 *   1. 左側就是這一組頁，不是儀表板／渠道／版本。第一格是品牌主頁。
 *   2. 自定義頁是零到多張，次序＝建立次序，不是字母序。
 *   3. 建立要三樣齊（顯示名、slug、brief），缺一樣就當場講欠什麼。
 *   4. 建立時要答「這一頁是不是其實屬於標誌／色彩／字體／語氣」；選了就
 *      不開新頁，直接帶去那一頁並講明原因。
 *   5. slug 不可改；改名之後網址不變，舊網址仍然開得返同一張頁。
 *   6. 刪頁是軟刪除，但被已出街成品釘住就拒絕並講明釘在哪一件。
 *   7. 沒有編輯權的人看得到、改不了 —— 按鈕不出現，不是變灰。
 *
 * 後端是否真的拒絕，另有 `brand-custom-pages.integration.test.ts` 十一條；
 * 這一檔只證明畫面沒有替後端講假話。
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

type Page = {
  id: string;
  brandId: string;
  kind: 'fixed' | 'custom';
  key: string;
  name: string;
  brief: string | null;
  sortOrder: number;
  current: null;
};

function fixed(key: string, name: string, sortOrder: number): Page {
  return { id: `p-${key}`, brandId: 'b-moonic', kind: 'fixed', key, name, brief: null, sortOrder, current: null };
}

function custom(id: string, key: string, name: string, brief: string, sortOrder: number): Page {
  return { id, brandId: 'b-moonic', kind: 'custom', key, name, brief, sortOrder, current: null };
}

const FIVE = [
  fixed('home', '品牌主頁', 10),
  fixed('logo', '標誌', 20),
  fixed('color', '色彩', 30),
  fixed('type', '字體', 40),
  fixed('tone', '語氣', 50),
];

const PACKAGING = custom('p-pack', 'packaging', '包裝', '這一頁要決定盒子、標籤與外箱長什麼樣。', 60);
const PHOTO = custom('p-photo', 'photography', '攝影', '這一頁要決定產品照的光線、角度與背景。', 70);
const NAMING = custom('p-naming', 'naming', '命名', '這一頁要決定新產品線的命名規則。', 80);

/** 建立次序就是這個次序；字母序會變成「命名、包裝、攝影」。 */
const THREE_CUSTOM = [PACKAGING, PHOTO, NAMING];

function open(options: {
  user?: typeof BOSS | typeof WAI;
  hash?: string;
  pages?: Page[];
  canEdit?: boolean;
  brands?: typeof BRANDS;
  overrides?: FakeHandlers;
} = {}) {
  const user = options.user ?? BOSS;
  const pages = options.pages ?? FIVE;
  const canEdit = options.canEdit ?? user.role === 'owner';

  window.history.replaceState(null, '', options.hash ?? '/#/design/brand/home');

  const api = installFakeApi({
    state: () => jsonResponse(200, { setupRequired: false, signedIn: true, user }),
    modules: () => jsonResponse(200, { modules: [DESIGN] }),
    brands: () => jsonResponse(200, { items: options.brands ?? BRANDS }),
    brandFocus: () => jsonResponse(200, { brandId: (options.brands ?? BRANDS)[0]?.id ?? null }),
    brandPages: () => jsonResponse(200, { items: pages, canEdit }),
    // 一頁的詳情：由同一份 pages 找，所以建立／改名之後讀得返新狀態。
    brandPage: (request) => {
      const key = request.path.split('/').pop() ?? 'home';
      const page = pages.find((item) => item.key === key) ?? pages[0];

      return jsonResponse(200, { page, versions: [], current: null });
    },
    ...options.overrides,
  });

  render(<App />);

  return api;
}

/** 左側欄目前的頁名，按畫面次序。「缺」是同一顆按鈕裡的狀態小字，斷言名之前剝走。 */
function navText(node: Element): string {
  const clone = node.cloneNode(true) as Element;

  for (const badge of Array.from(clone.querySelectorAll('.frame-sidebar__badge'))) {
    badge.remove();
  }

  return (clone.textContent ?? '').trim();
}

function sidebarPages(): string[] {
  return Array.from(document.querySelectorAll('[data-frame-rail] .frame-sidebar__item')).map(navText);
}

afterEach(() => {
  cleanup();
  resetBrowserState();
  resetDirectoryCache();
});

describe('品牌模組的頁清單', () => {
  it('左側就是五頁：品牌主頁、標誌、色彩、字體、語氣', async () => {
    open();

    await waitFor(() => {
      expect(sidebarPages()).toEqual(['品牌主頁', '標誌', '色彩', '字體', '語氣']);
    });
  });

  it('左側沒有儀表板、渠道、版本，也沒有「品牌識別」', async () => {
    open();

    await waitFor(() => {
      expect(sidebarPages().length).toBe(5);
    });

    const labels = sidebarPages().join('');

    for (const gone of ['儀表板', 'Dashboard', '渠道', '版本', '品牌識別', '品牌設定']) {
      expect(labels.includes(gone), gone).toBe(false);
    }
  });

  it('第一格是品牌主頁，而且是真的主頁（不是「仲未做好」的佔位）', async () => {
    open();

    // #39 之後主頁有內容：#32 年代那個「品牌主頁仲未做好」的佔位已經拆走，
    // 所以這一格驗的是「第一格打開就是主頁本身」。
    await waitFor(() => {
      expect(document.querySelector('[data-brand-page="home"]')).not.toBeNull();
    });

    expect(sidebarPages()[0]).toBe('品牌主頁');
    expect(window.location.hash).toBe('#/design/brand/home');
  });

  it('三張自定義頁都在左側，次序是建立次序，不是字母序', async () => {
    // 建立次序是包裝 → 攝影 → 命名；字母序會變成 命名 → 包裝 → 攝影。
    open({ pages: [...FIVE, ...THREE_CUSTOM] });

    await waitFor(() => {
      expect(sidebarPages()).toEqual(['品牌主頁', '標誌', '色彩', '字體', '語氣', '包裝', '攝影', '命名']);
    });
  });
});

describe('建立自定義頁', () => {
  it('只給名字、不給 brief：當場拒絕，不送 POST，並講明欠什麼', async () => {
    const api = open();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '新增頁' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '新增頁' }));
    await userEvent.type(screen.getByLabelText('顯示名'), '包裝');

    await userEvent.click(screen.getByRole('button', { name: '建立這一頁' }));

    expect(api.count('brandPageCreate')).toBe(0);
    expect(await screen.findByText('要填齊三樣：顯示名、slug、一句「這一頁要決定什麼」。')).toBeTruthy();
  });

  it('選了「屬於色彩」：不開新頁，帶去色彩頁並講明原因', async () => {
    const api = open();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '新增頁' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '新增頁' }));
    await userEvent.type(screen.getByLabelText('顯示名'), '主色');
    await userEvent.type(screen.getByLabelText('slug（網址）'), 'main-color');
    await userEvent.type(screen.getByLabelText('這一頁要決定什麼'), '主色與輔色。');
    await userEvent.selectOptions(screen.getByLabelText('這一頁是不是其實屬於其中一頁？'), 'color');

    await userEvent.click(screen.getByRole('button', { name: '建立這一頁' }));

    expect(api.count('brandPageCreate')).toBe(0);
    expect(window.location.hash).toBe('#/design/brand/color');
    expect(await screen.findByText('這一張其實係「色彩」，所以冇開新頁。內容喺嗰一頁做。')).toBeTruthy();
  });

  it('撞名：原樣講伺服器那句，不會靜靜改名', async () => {
    open({
      overrides: {
        brandPageCreate: () =>
          jsonResponse(409, {
            error: 'page_key_taken',
            key: 'naming',
            name: '命名',
            message: '已經有一張頁用 naming：命名。名或 slug 撞了都不會自動改名。',
          }),
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '新增頁' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '新增頁' }));
    await userEvent.type(screen.getByLabelText('顯示名'), '命名規則');
    await userEvent.type(screen.getByLabelText('slug（網址）'), 'naming');
    await userEvent.type(screen.getByLabelText('這一頁要決定什麼'), '新產品線的命名規則。');
    await userEvent.click(screen.getByRole('button', { name: '建立這一頁' }));

    expect(
      await screen.findByText('已經有一張頁用 naming：命名。名或 slug 撞了都不會自動改名。'),
    ).toBeTruthy();
  });

  it('建立成功：左側即刻多一張，而且帶去新那一頁', async () => {
    const pages = [...FIVE];

    open({
      pages,
      overrides: {
        brandPageCreate: () => {
          const created = custom('p-pack', 'packaging', '包裝', '盒子與標籤。', 60);
          pages.push(created);
          return jsonResponse(201, { page: created });
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '新增頁' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '新增頁' }));
    await userEvent.type(screen.getByLabelText('顯示名'), '包裝');
    await userEvent.type(screen.getByLabelText('slug（網址）'), 'packaging');
    await userEvent.type(screen.getByLabelText('這一頁要決定什麼'), '盒子與標籤。');
    await userEvent.click(screen.getByRole('button', { name: '建立這一頁' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/design/brand/p/packaging');
    });

    await waitFor(() => {
      expect(sidebarPages()).toContain('包裝');
    });
  });
});

describe('改顯示名與刪頁', () => {
  it('改名：送出的是新名，網址一動不動', async () => {
    const api = open({ hash: '/#/design/brand/p/packaging', pages: [...FIVE, PACKAGING] });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '改顯示名' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '改顯示名' }));

    const input = screen.getByLabelText('顯示名');
    await userEvent.clear(input);
    await userEvent.type(input, '包裝與外箱');
    await userEvent.click(screen.getByRole('button', { name: '儲存名稱' }));

    await waitFor(() => {
      expect(api.count('brandPageRename')).toBe(1);
    });

    const call = api.calls.find((item) => item.method === 'PATCH');
    expect(JSON.parse(call?.body ?? '{}')).toEqual({ name: '包裝與外箱' });
    expect(window.location.hash).toBe('#/design/brand/p/packaging');
  });

  it('slug 不可改：畫面上講明，沒有可改的欄位', async () => {
    open({ hash: '/#/design/brand/p/packaging', pages: [...FIVE, PACKAGING] });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '改顯示名' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '改顯示名' }));

    expect(screen.queryByLabelText('slug（網址）')).toBeNull();
    expect(
      screen.getByText('網址（slug）建立之後不可以改；要搬就新建一張再刪舊那張。'),
    ).toBeTruthy();
  });

  it('刪頁要按兩次：第一次只是問，第二次才送 DELETE，之後回品牌主頁', async () => {
    const api = open({ hash: '/#/design/brand/p/packaging', pages: [...FIVE, PACKAGING] });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '刪除這一頁' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '刪除這一頁' }));

    expect(api.count('brandPageDeletePage')).toBe(0);
    expect(screen.getByRole('button', { name: '再按一次確定刪除這一頁' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '再按一次確定刪除這一頁' }));

    await waitFor(() => {
      expect(api.count('brandPageDeletePage')).toBe(1);
    });
  });

  it('被已出街成品釘住：拒絕，並講明釘在哪一件成品', async () => {
    open({
      hash: '/#/design/brand/p/packaging',
      pages: [...FIVE, PACKAGING],
      overrides: {
        brandPageDeletePage: () =>
          jsonResponse(409, {
            error: 'page_pinned',
            key: 'packaging',
            pinnedBy: ['2026 秋季包裝盒 v2'],
            message: '包裝有版本被已出街成品釘住（2026 秋季包裝盒 v2）。要刪，先改那一件成品。',
          }),
      },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '刪除這一頁' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: '刪除這一頁' }));
    await userEvent.click(screen.getByRole('button', { name: '再按一次確定刪除這一頁' }));

    expect(
      await screen.findByText(
        '包裝有版本被已出街成品釘住（2026 秋季包裝盒 v2）。要刪，先改那一件成品。',
      ),
    ).toBeTruthy();
  });
});

describe('權限', () => {
  it('沒有編輯權的員工：看得到五頁，但沒有新增、改名、刪除', async () => {
    open({ user: WAI, hash: '/#/design/brand/p/packaging', pages: [...FIVE, PACKAGING], canEdit: false });

    await waitFor(() => {
      expect(sidebarPages().length).toBe(6);
    });

    expect(screen.queryByRole('button', { name: '新增頁' })).toBeNull();
    expect(screen.queryByRole('button', { name: '改顯示名' })).toBeNull();
    expect(screen.queryByRole('button', { name: '刪除這一頁' })).toBeNull();
  });
});

describe('一個品牌都未有', () => {
  it('老闆：講明還沒有品牌、只有老闆可以開第一個，並有建立表單', async () => {
    open({ brands: [], hash: '/#/design/brand/home' });

    expect(await screen.findByText('還沒有品牌，只有老闆可以開第一個。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '建立' })).toBeTruthy();
  });

  it('員工：同一句話，但沒有建立表單', async () => {
    open({ user: WAI, brands: [], hash: '/#/design/brand/home' });

    expect(await screen.findByText('還沒有品牌，只有老闆可以開第一個。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '建立' })).toBeNull();
  });
});

describe('品牌頁的版本鏈仍然在', () => {
  it('標誌頁看得到版本列表：這一張只搬導覽，不搬版本', async () => {
    open({
      hash: '/#/design/brand/logo',
      overrides: {
        brandPage: () =>
          jsonResponse(200, {
            page: FIVE[1],
            versions: [
              {
                id: 'v1',
                versionNo: 1,
                createdAt: '2026-11-10T10:00:00.000Z',
                note: null,
                preview: '第一版內容',
                policyVersionNo: 1,
              },
            ],
            current: {
              id: 'v1',
              versionNo: 1,
              createdAt: '2026-11-10T10:00:00.000Z',
              note: null,
              preview: '第一版內容',
              policyVersionNo: 1,
              content: '第一版內容',
            },
          }),
      },
    });

    await waitFor(() => {
      expect(document.querySelectorAll('[data-brand-page-version]').length).toBe(1);
    });

    const versions = document.querySelector('[data-brand-page-versions]');
    expect(versions).not.toBeNull();
    expect(within(versions as HTMLElement).getByText('第 1 版')).toBeTruthy();
  });
});
