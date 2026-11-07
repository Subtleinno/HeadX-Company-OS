// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BaseShell,
  type BrandRef,
  type PrototypeApp,
  type ScopeTarget,
} from '../src/index.js';

/**
 * 外殼結構的契約（#118 切片 B）。
 *
 * 呢個檔只釘「結構、順序、誠實空狀態、三種模式的入口」同「深色主題」。
 * 切換矩陣、第二步選範圍、競態、未保存等行為屬切片 C，唔會在呢度假裝做完。
 *
 * 測試資料一律係原型 fixture（C50）：App A／B／C 同品牌甲／乙，
 * 唔會出現任何真實 app id 或品牌資料。
 */

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

const apps: PrototypeApp[] = [
  { id: 'a', title: 'App A', mode: 'company', menu: [{ key: 'a.overview', label: '總覽' }] },
  { id: 'b', title: 'App B', mode: 'brand', menu: [{ key: 'b.overview', label: '品牌總覽' }] },
  { id: 'c', title: 'App C', mode: 'mixed', menu: [{ key: 'c.workbench', label: '工作台' }] },
];

const brands: BrandRef[] = [
  { id: 'jia', name: '品牌甲' },
  { id: 'yi', name: '品牌乙' },
];

function renderShell(overrides: Partial<Parameters<typeof BaseShell>[0]> = {}) {
  const handlers = {
    onSelectApp: vi.fn(),
    onSelectScope: vi.fn(),
    onSelectPage: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleTheme: vi.fn(),
    onSignOut: vi.fn(),
  };

  render(
    <BaseShell
      apps={apps}
      currentAppId="a"
      scope={{ kind: 'company' }}
      brands={brands}
      theme="light"
      sidebarOpen
      account={{ displayName: '陳大文', signingOut: false }}
      subMenuItems={[]}
      railItems={[]}
      currentPageKey={null}
      prototype
      {...handlers}
      {...overrides}
    >
      <p>主內容</p>
    </BaseShell>,
  );

  return handlers;
}

describe('第一行：全局頂欄的順序', () => {
  it('由左至右是 側欄開關 → app 選擇器 → 工作範圍 → app 主選單 → 全局工具', () => {
    renderShell();

    const header = document.querySelector('header');
    const slots = [...(header?.querySelectorAll('[data-shell-slot]') ?? [])].map(
      (element) => (element as HTMLElement).dataset.shellSlot,
    );

    expect(slots).toEqual(['sidebar', 'app', 'scope', 'app-menu', 'tools']);
  });

  it('app 選擇器在品牌／工作範圍選擇器左邊（兩者不可對調）', () => {
    renderShell();

    const appSlot = document.querySelector('[data-shell-slot="app"]');
    const scopeSlot = document.querySelector('[data-shell-slot="scope"]');

    expect(appSlot).not.toBeNull();
    expect(scopeSlot).not.toBeNull();
    // Node.compareDocumentPosition：4 = appSlot 在 scopeSlot 之後；2 = 之前。
    expect(appSlot?.compareDocumentPosition(scopeSlot as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('目前 app 的主選單會出現在第一行，而且是用目前 app 的項目', () => {
    renderShell({ currentAppId: 'b', scope: { kind: 'brand', brandId: 'jia' } });

    const appMenu = document.querySelector('[data-shell-slot="app-menu"]');

    expect(appMenu?.textContent).toContain('品牌總覽');
    expect(appMenu?.textContent).not.toContain('總覽總覽');
  });

  it('全局工具區顯示帳戶名稱與登出', () => {
    renderShell();

    const tools = document.querySelector('[data-shell-slot="tools"]');

    expect(tools?.textContent).toContain('陳大文');
    expect(screen.getByRole('button', { name: '登出' })).toBeTruthy();
  });
});

describe('第二行：子選單／操作列', () => {
  it('第二行存在，而且不重複第一行的 app 主選單', () => {
    renderShell({
      subMenuItems: [
        { key: 'a.sub.one', label: '子頁一' },
        { key: 'a.sub.two', label: '子頁二' },
      ],
    });

    const subnav = document.querySelector('[data-shell-row="subnav"]');

    expect(subnav).not.toBeNull();
    expect(subnav?.textContent).toContain('子頁一');

    const appMenuLabels = [...document.querySelectorAll('[data-shell-slot="app-menu"] *')]
      .map((element) => element.textContent)
      .filter((text): text is string => typeof text === 'string' && text.length > 0);

    expect(appMenuLabels).not.toContain('子頁一');
  });

  it('沒有子選單時不製造假項目：第二行不渲染任何項目', () => {
    renderShell({ subMenuItems: [] });

    const subnav = document.querySelector('[data-shell-row="subnav"]') as HTMLElement;

    expect(subnav.childElementCount).toBe(0);
    expect(within(subnav).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('左側工作欄', () => {
  it('有索引時列出工作索引項目', () => {
    renderShell({ railItems: [{ key: 'a.rail.one', label: '待處理' }] });

    const rail = document.querySelector('[data-shell-rail]');

    expect(rail).not.toBeNull();
    expect(rail?.textContent).toContain('待處理');
  });

  it('沒有索引時不渲染工作欄，也不製造假項目；側欄開關如實停用', () => {
    renderShell({ railItems: [], sidebarOpen: true });

    expect(document.querySelector('[data-shell-rail]')).toBeNull();
    expect(document.querySelectorAll('[data-shell-rail] li')).toHaveLength(0);

    const toggle = screen.getByRole('button', { name: '顯示或收起工作欄' }) as HTMLButtonElement;

    expect(toggle.disabled).toBe(true);
  });

  it('側欄開關會通知呼叫端，並回報 aria-expanded', async () => {
    const user = userEvent.setup();
    const { onToggleSidebar } = renderShell({ railItems: [{ key: 'a.rail.one', label: '待處理' }] });

    await user.click(screen.getByRole('button', { name: '顯示或收起工作欄' }));

    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: '顯示或收起工作欄' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });
});

describe('三種模式的範圍入口', () => {
  it('公司型：不要求品牌，範圍顯示為公司資訊而不是失效的下拉', () => {
    renderShell({ currentAppId: 'a', scope: { kind: 'company' } });

    const scopeSlot = document.querySelector('[data-shell-slot="scope"]');

    expect(scopeSlot?.getAttribute('data-scope-kind')).toBe('company');
    expect(scopeSlot?.textContent).toContain('公司');
    // 公司型不提供品牌切換：沒有一個叫「工作範圍」的下拉按鈕。
    expect(screen.queryByRole('button', { name: '工作範圍' })).toBeNull();
  });

  it('品牌型：已選品牌時顯示品牌名稱', () => {
    renderShell({ currentAppId: 'b', scope: { kind: 'brand', brandId: 'jia' } });

    const scopeSlot = document.querySelector('[data-shell-slot="scope"]');

    expect(scopeSlot?.getAttribute('data-scope-kind')).toBe('brand');
    expect(scopeSlot?.textContent).toContain('品牌甲');
  });

  it('品牌型：未選品牌時不接受含糊目標，主內容不顯示成功畫面', () => {
    renderShell({ currentAppId: 'b', scope: null });

    expect(screen.queryByText('主內容')).toBeNull();
    expect(document.querySelector('[data-shell-main]')?.textContent).toContain('請選擇品牌');
  });

  it('混合型：明確提供公司與品牌兩個入口', async () => {
    const user = userEvent.setup();
    renderShell({ currentAppId: 'c', scope: { kind: 'company' } });

    await user.click(screen.getByRole('button', { name: '工作範圍' }));

    const labels = screen.getAllByRole('option').map((option) => option.textContent ?? '');

    expect(labels.some((label) => label.includes('公司'))).toBe(true);
    expect(labels.some((label) => label.includes('品牌甲'))).toBe(true);
    expect(labels.some((label) => label.includes('品牌乙'))).toBe(true);
  });

  it('選一個品牌會回報 brand scope，而不是另一個 app 或 UnitScope.all', async () => {
    const user = userEvent.setup();
    const { onSelectScope } = renderShell({ currentAppId: 'c', scope: { kind: 'company' } });

    await user.click(screen.getByRole('button', { name: '工作範圍' }));
    await user.click(screen.getByRole('option', { name: /品牌甲/ }));

    expect(onSelectScope).toHaveBeenCalledWith({ kind: 'brand', brandId: 'jia' } satisfies ScopeTarget);
  });

  it('切去公司型 app 時不會替呼叫端建立品牌授權或改變 scope', () => {
    const { onSelectScope, onSelectApp } = renderShell({ currentAppId: 'b', scope: { kind: 'brand', brandId: 'jia' } });

    screen.getByRole('button', { name: '選擇 app' }).click();

    expect(onSelectApp).not.toHaveBeenCalled();
    expect(onSelectScope).not.toHaveBeenCalled();
  });
});

describe('主內容區', () => {
  it('主內容區由第二行下方開始，承接 children', () => {
    renderShell();

    const main = document.querySelector('[data-shell-main]');

    expect(main?.textContent).toContain('主內容');
    expect(main?.closest('[data-shell-row="subnav"]')).toBeNull();
  });
});

describe('深色模式（C49）', () => {
  it('淺色時 documentElement 沒有 data-theme=dark', () => {
    renderShell({ theme: 'light' });

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('深色時把 data-theme=dark 放到 documentElement，切回淺色會移除', () => {
    const { rerender } = render(
      <BaseShell
        apps={apps}
        currentAppId="a"
        scope={{ kind: 'company' }}
        brands={brands}
        theme="dark"
        sidebarOpen
        account={{ displayName: '陳大文', signingOut: false }}
        subMenuItems={[]}
        railItems={[]}
        currentPageKey={null}
        prototype
        onSelectApp={vi.fn()}
        onSelectScope={vi.fn()}
        onSelectPage={vi.fn()}
        onToggleSidebar={vi.fn()}
        onToggleTheme={vi.fn()}
        onSignOut={vi.fn()}
      >
        <p>主內容</p>
      </BaseShell>,
    );

    expect(document.documentElement.dataset.theme).toBe('dark');

    rerender(
      <BaseShell
        apps={apps}
        currentAppId="a"
        scope={{ kind: 'company' }}
        brands={brands}
        theme="light"
        sidebarOpen
        account={{ displayName: '陳大文', signingOut: false }}
        subMenuItems={[]}
        railItems={[]}
        currentPageKey={null}
        prototype
        onSelectApp={vi.fn()}
        onSelectScope={vi.fn()}
        onSelectPage={vi.fn()}
        onToggleSidebar={vi.fn()}
        onToggleTheme={vi.fn()}
        onSignOut={vi.fn()}
      >
        <p>主內容</p>
      </BaseShell>,
    );

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('主題切換按鈕的名稱會講清楚下一步會變成甚麼', async () => {
    const user = userEvent.setup();
    const { onToggleTheme } = renderShell({ theme: 'light' });

    await user.click(screen.getByRole('button', { name: '切換到深色模式' }));

    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });
});

describe('原型標示（C50）', () => {
  it('prototype 為 true 時，畫面明確標明資料是原型，不是已安裝的 app', () => {
    renderShell({ prototype: true });

    // 2026-11-07 視覺對齊後：一個小標籤 + 一句說明，不再是一整塊警告。
    expect(screen.getByText('原型')).toBeTruthy();
    expect(screen.getByText(/未安裝、未授權/)).toBeTruthy();
  });

  it('prototype 為 false 時不會出現原型標示', () => {
    renderShell({ prototype: false });

    expect(screen.queryByText(/未安裝、未授權/)).toBeNull();
    expect(screen.queryByText('原型')).toBeNull();
  });
});

/*
 * 2026-11-07 視覺對齊（HxDesign commit eb079b6）：
 * 這幾條釘住「畫面上要有什麼」，不是「CSS 寫成怎樣」。間距與尺寸由
 * apps/web/test/base-shell-layout.test.ts 讀 CSS 驗。
 */
describe('對齊 HxDesign 的外殼元素', () => {
  it('帳戶區有一個頭像，文字是名字第一個字，而不是純文字名字', () => {
    renderShell();

    const tools = document.querySelector('[data-shell-slot="tools"]');
    const avatar = tools?.querySelector('.shell-avatar');

    expect(avatar?.textContent).toBe('陳');
    expect(tools?.textContent).toContain('陳大文');
  });

  it('頂欄的鍵都是圖示鍵，圖示是 inline SVG（不是 emoji、不是字元圖案）', () => {
    renderShell();

    const toggle = screen.getByRole('button', { name: '顯示或收起工作欄' });

    expect(toggle.className).toContain('shell-iconbtn');
    expect(toggle.querySelector('svg.ic')).not.toBeNull();
    expect(toggle.textContent).toBe('');
  });

  it('app 選擇器的每個選項都帶圖示，選中時顯示在名字左邊', () => {
    renderShell();

    const appSlot = document.querySelector('[data-shell-slot="app"]');

    expect(appSlot?.querySelector('.selector__icon svg')).not.toBeNull();
  });

  it('原型標示是一個小標籤加一句話，佔的不是一整塊主內容', () => {
    renderShell({ prototype: true });

    const badge = document.querySelector('.shell-proto__badge');

    expect(badge?.textContent).toBe('原型');
    expect(document.querySelector('.shell-proto')?.textContent).toContain('未安裝、未授權');
  });
});
