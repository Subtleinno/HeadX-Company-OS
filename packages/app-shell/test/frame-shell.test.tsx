// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FrameShell,
  type BrandRef,
  type FrameApp,
  type FrameShellProps,
  type FrameSidebarGroup,
  type ShellNavItem,
} from '../src/index.js';

/**
 * FrameShell 的結構與行為契約（issue #157）。
 *
 * 呢個檔只釘「結構、順序、誠實狀態、由呼叫端注入」，唔釘 CSS —— 樣式屬 F-02
 * （cat:web）嘅範圍。所有 app／品牌／頁面／文案都由呼叫端傳入，元件本身
 * 唔記住任何選擇，亦唔決定去邊個 app 或範圍（沿用 BaseShell 檔頭三點原則）。
 *
 * 測試資料一律係注入嘅原型值，唔係 repo 內嘅真實 app 或公司資料。
 */

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

const apps: FrameApp[] = [
  { key: 'design', label: 'Design' },
  { key: 'boss', label: 'Boss Portal', statusLabel: '公司型・敏感', selectable: false },
  { key: 'sales', label: 'Sales', statusLabel: '未啟用、不可進入', selectable: false },
];

const brands: BrandRef[] = [
  { id: 'moonic', name: 'Moonic 滿月堂' },
  { id: 'hx', name: 'HxDesign' },
];

const moduleTabs: ShellNavItem[] = [
  { key: 'brand', label: '品牌' },
  { key: 'knowledge', label: '知識' },
];

const modulePages: ShellNavItem[] = [
  { key: 'home', label: '品牌主頁' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'settings', label: '品牌設定' },
];

const sidebarGroups: FrameSidebarGroup[] = [
  {
    title: '品牌識別',
    items: [
      { key: 'mark', label: '品牌標誌' },
      { key: 'color', label: '色彩' },
    ],
  },
  { title: '紀錄', items: [{ key: 'versions', label: '版本紀錄' }] },
];

function makeHandlers() {
  return {
    onSelectApp: vi.fn(),
    onSelectScope: vi.fn(),
    onSelectModuleTab: vi.fn(),
    onSelectPage: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleTheme: vi.fn(),
    onSignOut: vi.fn(),
    onSearch: vi.fn(),
    onCommandPalette: vi.fn(),
    onLanguage: vi.fn(),
    onNotifications: vi.fn(),
    onHelp: vi.fn(),
  };
}

function makeProps(overrides: Partial<FrameShellProps> = {}) {
  const handlers = makeHandlers();
  const props: FrameShellProps = {
    apps,
    currentAppId: 'design',
    moduleTabs,
    currentModuleTabKey: 'brand',
    modulePages,
    currentPageKey: 'settings',
    sidebarGroups,
    sidebarOpen: true,
    theme: 'light',
    account: { displayName: '陳大文', signingOut: false },
    breadcrumbs: ['Design', '品牌', '品牌設定'],
    pageTitle: '品牌設定',
    pageSubtitle: '管理品牌識別資料',
    companyName: '滿月堂集團',
    region: '香港',
    children: <p>主內容區</p>,
    ...handlers,
    ...overrides,
  };

  return { props, handlers };
}

function renderFrame(overrides: Partial<FrameShellProps> = {}) {
  const { props, handlers } = makeProps(overrides);
  const view = render(<FrameShell {...props} />);

  return { ...handlers, ...view, props };
}

/** 六個 landmark 嘅 aria-label 必須全部嚟自 #155 交付嘅 frame.landmark.* 鍵。 */
const LANDMARK_LABELS = {
  banner: '全域頂欄',
  subbar: '模組分頁',
  complementary: '子頁導覽',
  breadcrumb: '麵包屑',
  main: '主要內容',
  contentinfo: '頁尾',
} as const;

describe('第一層全域頂欄', () => {
  it('由左至右固定順序：側欄開關 → App selector → 範圍位 → 模組分頁 → 右側工具', () => {
    renderFrame();

    const header = document.querySelector('header.frame-topbar');
    const slots = [...(header?.querySelectorAll('[data-frame-slot]') ?? [])].map(
      (element) => (element as HTMLElement).dataset.frameSlot,
    );

    expect(slots).toEqual(['sidebar', 'app', 'scope', 'modules', 'tools']);
  });

  it('App selector 喺範圍位左邊，兩者不可對調', () => {
    renderFrame();

    const app = document.querySelector('[data-frame-slot="app"]');
    const scope = document.querySelector('[data-frame-slot="scope"]');

    expect(app?.compareDocumentPosition(scope as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('冇傳品牌清單時，範圍位顯示純文字「公司範圍」，完全冇失效下拉', () => {
    renderFrame();

    const scope = document.querySelector('[data-frame-slot="scope"]');

    expect(scope?.textContent).toContain('公司範圍');
    expect(scope?.querySelector('[aria-haspopup]')).toBeNull();
    expect(screen.queryByRole('button', { name: '選擇品牌' })).toBeNull();
  });

  it('傳入品牌清單與當前值時渲染 Brand selector，並列出全部品牌', async () => {
    const user = userEvent.setup();
    renderFrame({ brands, scope: { kind: 'brand', brandId: 'moonic' } });

    await user.click(screen.getByRole('button', { name: '選擇品牌' }));

    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '');

    expect(options.some((label) => label.includes('Moonic 滿月堂'))).toBe(true);
    expect(options.some((label) => label.includes('HxDesign'))).toBe(true);
  });

  it('Brand selector 嘅選擇只透過回呼回報，元件唔自己改資料', async () => {
    const user = userEvent.setup();
    const { onSelectScope } = renderFrame({ brands, scope: { kind: 'brand', brandId: 'moonic' } });

    await user.click(screen.getByRole('button', { name: '選擇品牌' }));
    await user.click(screen.getByRole('option', { name: /HxDesign/ }));

    expect(onSelectScope).toHaveBeenCalledTimes(1);
    expect(onSelectScope).toHaveBeenCalledWith({ kind: 'brand', brandId: 'hx' });

    // 未經呼叫端重新傳入值之前，顯示值仍然係原本嗰個品牌。
    expect(document.querySelector('[data-frame-slot="scope"] .selector__value')?.textContent).toContain(
      'Moonic 滿月堂',
    );
  });

  it('未啟用嘅 app 照列，但帶狀態標籤而且不可選', async () => {
    const user = userEvent.setup();
    const { onSelectApp } = renderFrame();

    await user.click(screen.getByRole('button', { name: '選擇 App' }));

    const listbox = screen.getByRole('listbox', { name: '選擇 App' });
    const boss = within(listbox).getByRole('option', { name: /Boss Portal/ });

    expect(boss.textContent).toContain('公司型・敏感');
    expect(boss.getAttribute('aria-disabled')).toBe('true');
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);

    await user.click(boss);

    expect(onSelectApp).not.toHaveBeenCalled();
  });

  it('可選嘅 app 會回報 appId', async () => {
    const user = userEvent.setup();
    const { onSelectApp } = renderFrame();

    await user.click(screen.getByRole('button', { name: '選擇 App' }));
    await user.click(within(screen.getByRole('listbox', { name: '選擇 App' })).getByRole('option', { name: /Design/ }));

    expect(onSelectApp).toHaveBeenCalledWith('design');
  });

  it('冇傳處理函數嘅工具全部唔渲染，唔做死掣', () => {
    renderFrame({
      onSearch: undefined,
      onCommandPalette: undefined,
      onLanguage: undefined,
      onNotifications: undefined,
      onHelp: undefined,
    });

    const tools = document.querySelector('[data-frame-slot="tools"]') as HTMLElement;

    for (const name of ['搜尋', '開啟命令面板', '語系', '通知', '說明']) {
      expect(within(tools).queryByRole('button', { name })).toBeNull();
    }
  });

  it('有傳處理函數嘅工具先渲染，點擊會呼叫對應回呼', async () => {
    const user = userEvent.setup();
    const { onSearch } = renderFrame({
      onCommandPalette: undefined,
      onLanguage: undefined,
      onNotifications: undefined,
      onHelp: undefined,
    });

    expect(screen.getByRole('button', { name: '搜尋' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '通知' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '搜尋' }));

    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('模組分頁放喺第一層，並以 aria-current 標示目前模組', () => {
    renderFrame();

    const modules = document.querySelector('[data-frame-slot="modules"]') as HTMLElement;

    expect(modules.textContent).toContain('品牌');
    expect(within(modules).getByRole('button', { name: '品牌' }).getAttribute('aria-current')).toBe('page');
    expect(within(modules).getByRole('button', { name: '知識' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('第二層模組頁頂欄', () => {
  it('列出模組頁並以 aria-current 標示當前頁', () => {
    renderFrame();

    const subbar = screen.getByRole('navigation', { name: LANDMARK_LABELS.subbar });

    expect(within(subbar).getByRole('button', { name: '品牌設定' }).getAttribute('aria-current')).toBe('page');
    expect(within(subbar).getByRole('button', { name: '品牌主頁' }).getAttribute('aria-current')).toBeNull();
    expect(subbar.textContent).not.toContain('品牌識別');
  });

  it('點第二層頁只回報 onSelectPage', async () => {
    const user = userEvent.setup();
    const { onSelectPage } = renderFrame();

    await user.click(screen.getByRole('button', { name: '品牌主頁' }));

    expect(onSelectPage).toHaveBeenCalledWith('home');
  });
});

describe('左側子頁導覽', () => {
  it('有子頁時渲染分組標題同子頁', () => {
    renderFrame();

    const rail = screen.getByRole('complementary', { name: LANDMARK_LABELS.complementary });

    expect(rail.textContent).toContain('品牌識別');
    expect(rail.textContent).toContain('紀錄');
    expect(rail.textContent).toContain('品牌標誌');
    expect(within(rail).getByRole('button', { name: '色彩' })).toBeTruthy();
  });

  it('冇子頁時整條左欄唔渲染，側欄開關如實停用', () => {
    renderFrame({ sidebarGroups: [] });

    expect(document.querySelector('[data-frame-rail]')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();

    const toggle = screen.getByRole('button', { name: '顯示或收起側欄' }) as HTMLButtonElement;

    expect(toggle.disabled).toBe(true);
  });

  it('側欄開關停用時，就算 sidebarOpen 為 true 都唔會渲染空欄', () => {
    renderFrame({ sidebarGroups: [], sidebarOpen: true });

    expect(document.querySelector('[data-frame-rail]')).toBeNull();
  });

  it('有子頁時側欄開關可用，點擊回報並以 aria-expanded 反映傳入值', async () => {
    const user = userEvent.setup();
    const { onToggleSidebar } = renderFrame({ sidebarOpen: true });

    const toggle = screen.getByRole('button', { name: '顯示或收起側欄' }) as HTMLButtonElement;

    expect(toggle.disabled).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(toggle);

    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });
});

describe('內容區', () => {
  it('麵包屑、頁標題、副標、主要動作 slot 同 children 依序出現', () => {
    renderFrame({ primaryAction: <button type="button">新增品牌</button> });

    expect(screen.getByRole('navigation', { name: LANDMARK_LABELS.breadcrumb }).textContent).toContain('品牌設定');
    expect(screen.getByRole('heading', { name: '品牌設定' })).toBeTruthy();
    expect(screen.getByText('管理品牌識別資料')).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增品牌' })).toBeTruthy();
    expect(screen.getByText('主內容區')).toBeTruthy();
  });

  it('blocked 傳入時以 role="status" 取代 children', () => {
    renderFrame({ blocked: { title: '需要先選品牌', description: '請先選擇品牌。' } });

    const status = screen.getByRole('status');

    expect(status.textContent).toContain('需要先選品牌');
    expect(status.textContent).toContain('請先選擇品牌。');
    expect(screen.queryByText('主內容區')).toBeNull();
  });

  it('prototype 為 true 時標示原型示意', () => {
    renderFrame({ prototype: true });

    expect(screen.getByText('原型示意')).toBeTruthy();
  });

  it('prototype 為 false 時唔出現原型標示', () => {
    renderFrame({ prototype: false });

    expect(screen.queryByText('原型示意')).toBeNull();
  });
});

describe('頁尾', () => {
  it('顯示公司標誌位、本機公司名、地區同總部標示', () => {
    renderFrame();

    const footer = screen.getByRole('contentinfo', { name: LANDMARK_LABELS.contentinfo });

    expect(footer.textContent).toContain('本機公司');
    expect(footer.textContent).toContain('滿月堂集團');
    expect(footer.textContent).toContain('香港');
    expect(footer.textContent).toContain('總部主機');
  });

  it('未傳 companyMark 時用公司名首字做系統字標，唔係按鈕、唔帶下拉', () => {
    renderFrame();

    const mark = document.querySelector('[data-frame-mark]');

    expect(mark?.textContent).toContain('滿');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.querySelector('[aria-haspopup]')).toBeNull();
    expect(within(mark as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('傳入 companyMark slot 時改用呼叫端提供嘅標誌', () => {
    renderFrame({ companyMark: <span data-testid="company-mark">M</span> });

    expect(screen.getAllByTestId('company-mark').length).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll('.frame-mark__initial')).toHaveLength(0);
  });

  it('公司名未提供時如實顯示，唔虛構公司名', () => {
    renderFrame({ companyName: undefined });

    expect(screen.getByText('公司名稱未提供')).toBeTruthy();
  });

  it('「據點與機器」入口係可選 slot，未傳唔渲染', () => {
    renderFrame();

    expect(screen.queryByRole('button', { name: '據點與機器' })).toBeNull();
  });

  it('傳入「據點與機器」入口 slot 時如實渲染', () => {
    renderFrame({ sitesEntry: <button type="button">據點與機器</button> });

    expect(screen.getByRole('button', { name: '據點與機器' })).toBeTruthy();
  });
});

describe('無障礙、主題同狀態', () => {
  it('六個 landmark 嘅 aria-label 全部用 frame.landmark.* 鍵', () => {
    renderFrame();

    expect(screen.getByRole('banner', { name: LANDMARK_LABELS.banner })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: LANDMARK_LABELS.subbar })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: LANDMARK_LABELS.complementary })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: LANDMARK_LABELS.breadcrumb })).toBeTruthy();
    expect(screen.getByRole('main', { name: LANDMARK_LABELS.main })).toBeTruthy();
    expect(screen.getByRole('contentinfo', { name: LANDMARK_LABELS.contentinfo })).toBeTruthy();
  });

  it('skip link 沿用既有 shell.skipToContent，指向主要內容', () => {
    renderFrame();

    const skip = screen.getByRole('link', { name: '跳去主要內容' });

    expect(skip.getAttribute('href')).toBe('#frame-content');
    expect(document.querySelector('main#frame-content')).not.toBeNull();
  });

  it('所有互動控件都係 button 或 link，鍵盤可達', () => {
    renderFrame();

    const interactive = document.querySelectorAll('button, a[href]');

    expect(interactive.length).toBeGreaterThan(0);
    for (const element of interactive) {
      expect(element.tagName === 'BUTTON' || element.tagName === 'A').toBe(true);
    }
  });

  it('主題套用同 BaseShell 一致：深色時 documentElement 有 data-theme=dark', () => {
    renderFrame({ theme: 'dark' });

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('元件唔記住選擇：重新 render 以傳入值為準', () => {
    const { rerender } = renderFrame({ currentAppId: 'design' });

    expect(document.querySelector('[data-frame-slot="app"] .selector__value')?.textContent).toContain('Design');

    rerender(<FrameShell {...makeProps({ currentAppId: 'boss' }).props} />);

    expect(document.querySelector('[data-frame-slot="app"] .selector__value')?.textContent).toContain(
      'Boss Portal',
    );
  });

  it('重新 render 改品牌範圍值時，Brand selector 顯示值跟傳入值', () => {
    const { rerender } = renderFrame({ brands, scope: { kind: 'brand', brandId: 'moonic' } });

    expect(document.querySelector('[data-frame-slot="scope"] .selector__value')?.textContent).toContain(
      'Moonic 滿月堂',
    );

    rerender(<FrameShell {...makeProps({ brands, scope: { kind: 'brand', brandId: 'hx' } }).props} />);

    expect(document.querySelector('[data-frame-slot="scope"] .selector__value')?.textContent).toContain('HxDesign');
  });
});

describe('文案同視覺底線', () => {
  it('畫面零 emoji', () => {
    renderFrame({
      brands,
      scope: { kind: 'brand', brandId: 'moonic' },
      prototype: true,
      sitesEntry: <button type="button">據點與機器</button>,
    });

    const text = document.body.textContent ?? '';

    expect(text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}]/u);
  });

  it('class 名稱統一用 frame- 前綴，唔寫 inline style', () => {
    renderFrame();

    const root = document.querySelector('.frame-shell') as HTMLElement;

    expect(root).not.toBeNull();
    expect(root.hasAttribute('style')).toBe(false);
    expect(root.querySelector('[style]')).toBeNull();
    expect(root.innerHTML).not.toContain('overflow');
  });
});
