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
  it('空路徑退回第一個模組第一頁', () => {
    const position = resolveNav(DESIGN_NAV, []);

    expect(position.navModule.key).toBe('brand');
    expect(position.page.key).toBe('home');
    expect(position.section).toBeNull();
  });

  it('模組同頁都對得上', () => {
    const position = resolveNav(DESIGN_NAV, ['material', 'licence']);

    expect(position.page.key).toBe('licence');
  });

  it('舊書籤指向已移走的頁（品牌設定）：退回品牌主頁，唔會白畫面', () => {
    const position = resolveNav(DESIGN_NAV, ['brand', 'settings']);

    expect(position.page.key).toBe('home');
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
                    { key: 'home', labelKey: 'design.page.brandHome' as const },
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
    expect(position.page.key).toBe('board');
  });

  it('完全對唔上（例如手改網址）：退回第一個模組第一頁，唔會拋錯', () => {
    const position = resolveNav(DESIGN_NAV, ['nonsense', 'nonsense', 'nonsense']);

    expect(position.navModule.key).toBe('brand');
    expect(position.page.key).toBe('home');
  });

  it('Boss Portal 冇品牌範圍，模組係總覽／據點與機器／人員／策略／存取紀錄', () => {
    expect(BOSS_NAV.scoped).toBe(false);
    expect(BOSS_NAV.modules.map((item) => item.key)).toEqual([
      'overview',
      'sites',
      'people',
      'policy',
      'access',
    ]);
  });

  it('「人員與部門」只出現在人員模組一次，唔會喺兩處各寫一次', () => {
    const pages = BOSS_NAV.modules.flatMap((item) =>
      item.groups.flatMap((group) => group.pages.map((page) => `${item.key}/${page.key}`)),
    );

    expect(pages.filter((path) => path.endsWith('/members'))).toEqual(['people/members']);
  });

  it('Design 有品牌範圍，四個模組齊全', () => {
    expect(DESIGN_NAV.scoped).toBe(true);
    expect(DESIGN_NAV.modules.map((item) => item.key)).toEqual([
      'brand',
      'material',
      'knowledge',
      'create',
    ]);
  });

  it('品牌模組七頁：品牌主頁、標誌、色彩、字體、語氣、圖像、已核准範例（#32、#66、#68）', () => {
    const brand = DESIGN_NAV.modules.find((item) => item.key === 'brand');

    expect(brand?.groups.flatMap((group) => group.pages.map((page) => page.key))).toEqual([
      'home',
      'logo',
      'color',
      'type',
      'tone',
      'image',
      'examples',
    ]);
  });

  it('儀表板、渠道、版本、品牌設定、品牌識別都已經移走（issue #32）', () => {
    const pages = DESIGN_NAV.modules.flatMap((item) => item.groups.flatMap((group) => group.pages));
    const keys = pages.map((page) => page.key);
    const sections = pages.flatMap((page) => page.sections ?? []).map((section) => section.key);

    for (const gone of ['dashboard', 'channel', 'versions', 'settings', 'page']) {
      expect(keys.includes(gone), gone).toBe(false);
    }

    expect(sections.includes('identity'), 'identity').toBe(false);
  });
});
