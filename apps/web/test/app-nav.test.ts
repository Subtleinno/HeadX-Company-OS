import { describe, expect, it } from 'vitest';
import { BOSS_NAV, DESIGN_NAV, resolveNav } from '../src/frame/appNav';

/**
 * 導覽對位：網址段落 → (模組, 頁, 章節)。
 *
 * 呢個函數係整個 Frame 的「我而家喺邊」。對錯一格，左側欄高亮、
 * 麵包屑同標題就會一齊錯，而三者都係用戶判斷位置的依據。
 *
 * 最重要的一條係退回路徑：手改網址、舊書籤指向已刪的頁，都要見到一個
 * 講得通的地方，唔可以白畫面。
 */

describe('resolveNav', () => {
  it('空路徑退回 Create／Projects', () => {
    const position = resolveNav(DESIGN_NAV, []);

    expect(position.navModule.key).toBe('create');
    expect(position.page.key).toBe('projects');
    expect(position.section).toBeNull();
  });

  it('模組同頁都對得上', () => {
    const position = resolveNav(DESIGN_NAV, ['material', 'library']);

    expect(position.page.key).toBe('library');
  });

  it('舊書籤指向已移走的頁（品牌設定）：退回品牌第一頁（品牌總覽），唔會白畫面', () => {
    const position = resolveNav(DESIGN_NAV, ['brand', 'settings']);

    expect(position.page.key).toBe('dashboard');
    expect(position.section).toBeNull();
  });

  it('自定義頁的鍵含斜線（p/<slug>），要拼返做一段才對得上', () => {
    const nav = {
      ...DESIGN_NAV,
      modules: DESIGN_NAV.modules.map((navModule) =>
        navModule.key === 'brand'
          ? {
              ...navModule,
              groups: [
                {
                  pages: [
                    { key: 'dashboard', labelKey: 'brandBuild.overview.nav' as const },
                    { key: 'p/packaging', label: '包裝' },
                  ],
                },
              ],
            }
          : navModule,
      ),
    };

    const position = resolveNav(nav, ['brand', 'p', 'packaging']);

    expect(position.page.key).toBe('p/packaging');
  });

  it('模組存在但頁唔存在：退回該模組第一頁', () => {
    const position = resolveNav(DESIGN_NAV, ['create', 'not-a-page']);

    expect(position.navModule.key).toBe('create');
    expect(position.page.key).toBe('projects');
  });

  it('完全對唔上（例如手改網址）：退回 Create／Projects，唔會拋錯', () => {
    const position = resolveNav(DESIGN_NAV, ['nonsense', 'nonsense', 'nonsense']);

    expect(position.navModule.key).toBe('create');
    expect(position.page.key).toBe('projects');
  });

  it('Boss Portal 冇品牌範圍（唔跟品牌切換），模組係總覽／品牌／據點與機器／人員／存取紀錄', () => {
    expect(BOSS_NAV.scoped).toBe(false);
    // 「品牌」是 2026-11-17 加的公司層模組：00 業務基礎與新增品牌都在這裡，
    // 但它是「全公司有哪幾個品牌」，不是 scoped 的品牌切換。
    expect(BOSS_NAV.modules.map((item) => item.key)).toEqual([
      'overview',
      'brand',
      // 行銷（2026-11-17 晚）：04F 行銷內容是全公司共用的策略，住在這裡，
      // 不屬於任何品牌，也只有老闆讀得到。
      'marketing',
      'sites',
      'people',
      'access',
    ]);
  });

  it('品牌模組永遠有「全部品牌」第一頁，連一個品牌都未有時都到得了', () => {
    const brand = BOSS_NAV.modules.find((item) => item.key === 'brand');
    const pages = brand?.groups.flatMap((group) => group.pages.map((page) => page.key)) ?? [];

    expect(pages).toEqual(['brands']);
  });

  it('「人員與部門」只出現在人員模組一次，唔會喺兩處各寫一次', () => {
    const pages = BOSS_NAV.modules.flatMap((item) =>
      item.groups.flatMap((group) => group.pages.map((page) => `${item.key}/${page.key}`)),
    );

    expect(pages.filter((path) => path.endsWith('/members'))).toEqual(['people/members']);
  });

  it('Design 有品牌範圍，v3 五個模組依 Create／Brand／Materials／Knowledge／Templates 排列', () => {
    expect(DESIGN_NAV.scoped).toBe(true);
    expect(DESIGN_NAV.modules.map((item) => item.key)).toEqual([
      'create',
      'brand',
      'material',
      'knowledge',
      'templates',
    ]);
  });

  it('Create 有 Library 與 Outputs；格式改為作品庫內的過濾器，唔再係獨立頁', () => {
    const create = DESIGN_NAV.modules.find((item) => item.key === 'create');

    expect(create?.groups.flatMap((group) => group.pages.map((page) => page.key))).toEqual([
      'projects',
      'outputs',
    ]);
    expect(DESIGN_NAV.modules.some((item) => item.key === 'needs')).toBe(false);
  });

  it('舊 Create 工作台深連結退回 Projects；舊 Brand 深連結退回品牌總覽', () => {
    expect(resolveNav(DESIGN_NAV, ['create', 'board']).page.key).toBe('projects');
    expect(resolveNav(DESIGN_NAV, ['brand', 'home']).page.key).toBe('dashboard');
    expect(resolveNav(DESIGN_NAV, ['brand', 'color']).page.key).toBe('dashboard');
    expect(resolveNav(DESIGN_NAV, ['brand', 'examples']).page.key).toBe('dashboard');
  });

  it('品牌模組兩頁：品牌總覽（01–03）與品牌集（04A–04H），但都不上第二行頁籤', () => {
    const brand = DESIGN_NAV.modules.find((item) => item.key === 'brand');
    const pages = brand?.groups.flatMap((group) => group.pages) ?? [];

    expect(pages.map((page) => page.key)).toEqual(['dashboard', 'sets']);
    // 第二行頁籤只收 subbar !== false 的頁；品牌集靠左欄的樹進出。
    expect(pages.every((page) => page.subbar === false)).toBe(true);
  });

  it('品牌集深連結屬於「品牌集」這一頁，不會被當成品牌總覽', () => {
    expect(resolveNav(DESIGN_NAV, ['brand', 'sets', 'abc']).page.key).toBe('sets');
    expect(resolveNav(DESIGN_NAV, ['brand', 'sets', 'abc', 'stage4a']).page.key).toBe('sets');
  });

  it('舊品牌多頁（主頁／標誌／色彩／字體／語氣／圖像／範例）都已經移走', () => {
    const pages = DESIGN_NAV.modules.flatMap((item) => item.groups.flatMap((group) => group.pages));
    const keys = pages.map((page) => page.key);

    for (const gone of ['build', 'home', 'logo', 'color', 'type', 'tone', 'image', 'examples', 'settings', 'page']) {
      expect(keys.includes(gone), gone).toBe(false);
    }
  });
});
