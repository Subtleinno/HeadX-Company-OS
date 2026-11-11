import type { MessageKey } from '@company-os/i18n';

/**
 * Frame 的導覽模型：app → 模組 → 頁 → 章節。
 *
 * 四層各有各講嘢，唔可以合併：
 *   app    = 你喺邊個部門（Boss Portal、Design、Sales…）
 *   模組   = 呢個 app 之下的大區（品牌、素材、知識、創作）
 *   頁     = 模組之下的一張頁（品牌主頁、品牌設定）
 *   章節   = 頁之下的分段（品牌標誌、色彩、字體）
 *
 * 老闆 2026-11-11 定：**還原第二層模組頁頂欄**。頁同時出現喺第二行同
 * 左側欄，兩邊都由呢份 `AppNav` 推出（見 `AppFrame.tsx`），唔各寫一份；
 * 章節只喺被選中嗰頁之下展開（見 `FrameSidebarItem.sections`）。
 * 非 app 畫面（首頁、帳戶、Needs 等）冇頁可列，傳空陣列，外殼照舊唔畫
 * 一條空白 bar。
 *
 * 呢一份係純資料，冇 React、冇 fetch：加一個 app 唔應該要改外殼。
 */

export type NavLeaf = { key: string; labelKey: MessageKey };

export type NavPage = NavLeaf & {
  /** 呢一頁之下的章節。冇就唔會有第二層。 */
  sections?: readonly NavLeaf[];
};

export type NavGroup = {
  titleKey?: MessageKey;
  pages: readonly NavPage[];
};

export type NavModule = {
  key: string;
  labelKey: MessageKey;
  groups: readonly NavGroup[];
};

export type AppNav = {
  /** 呢個 app 喺網址上嘅根路徑（`/boss`）。唔用 app id 做鍵：
   *  id 屬於 manifest，前端唔應該自己寫死一份。 */
  base: string;
  /**
   * 刻意**冇** app 名稱欄位。
   *
   * 名稱只有一個來源：後端 manifest 嘅 `title`（`/modules` 回傳）。之前呢度
   * 有一個 `rootKey`，於是同一個 app 喺畫面出現兩個名 —— 左上角 selector 講
   * 「老闆台」，麵包屑第一格講「Boss Portal」。兩份事實總有一份會過時，
   * 而用戶一眼就見到。所以麵包屑第一格由 `FrameApps` 用 manifest 名稱補上。
   */
  modules: readonly NavModule[];
  /** 有品牌 selector（Design 有，Boss Portal 冇：佢係公司範圍）。 */
  scoped: boolean;
};

export const BOSS_NAV: AppNav = {
  base: '/boss',
  scoped: false,
  modules: [
    {
      key: 'overview',
      labelKey: 'boss.module.overview',
      groups: [{ pages: [{ key: 'overview', labelKey: 'boss.page.overview' }] }],
    },
    {
      key: 'sites',
      labelKey: 'boss.module.sites',
      groups: [
        {
          titleKey: 'boss.group.machines',
          pages: [
            { key: 'directory', labelKey: 'boss.page.directory' },
            { key: 'add', labelKey: 'boss.page.addSite' },
            { key: 'credentials', labelKey: 'boss.page.credentials' },
            { key: 'approvals', labelKey: 'boss.page.approvals' },
          ],
        },
      ],
    },
    {
      /**
       * 人員獨立成一個模組（issue #13）。
       *
       * 之前「管理級成員」同時掛在「據點與機器 › 權限與稽核」同「存取紀錄 ›
       * 權限與稽核」之下，同一頁在左側欄出現兩次、網址卻有兩個 —— 用戶點哪
       * 一個都去到同一頁，但麵包屑會不同。指派的對象是人，不是機器，所以
       * 它有自己的模組。
       */
      key: 'people',
      labelKey: 'boss.module.people',
      groups: [{ pages: [{ key: 'members', labelKey: 'boss.page.members' }] }],
    },
    {
      key: 'access',
      labelKey: 'boss.module.access',
      groups: [
        {
          titleKey: 'boss.group.governance',
          pages: [{ key: 'actions', labelKey: 'boss.page.actions' }],
        },
      ],
    },
  ],
};

export const DESIGN_NAV: AppNav = {
  base: '/design',
  scoped: true,
  modules: [
    {
      key: 'brand',
      labelKey: 'design.module.brand',
      groups: [
        {
          // 冇分組標題：一個模組只有一組頁時，標題只會重複上面個模組名
          // （或重複左側欄最頂嘅「頁面 PAGES」）。分組標題留返俾真正
          // 有兩組以上嘅模組（Boss Portal 嘅據點／權限與稽核）。
          pages: [
            { key: 'home', labelKey: 'design.page.brandHome' },
            { key: 'dashboard', labelKey: 'design.page.brandDashboard' },
            {
              key: 'settings',
              labelKey: 'design.page.brandSettings',
              sections: [
                { key: 'logo', labelKey: 'design.section.logo' },
                { key: 'identity', labelKey: 'design.section.identity' },
                { key: 'color', labelKey: 'design.section.color' },
                { key: 'type', labelKey: 'design.section.type' },
              ],
            },
            { key: 'channel', labelKey: 'design.page.channel' },
            { key: 'versions', labelKey: 'design.page.versions' },
          ],
        },
      ],
    },
    {
      key: 'material',
      labelKey: 'design.module.material',
      groups: [
        {
          pages: [
            { key: 'library', labelKey: 'design.page.materialLibrary' },
            { key: 'categories', labelKey: 'design.page.materialCategories' },
            { key: 'licence', labelKey: 'design.page.materialLicence' },
          ],
        },
      ],
    },
    {
      key: 'knowledge',
      labelKey: 'design.module.knowledge',
      groups: [
        {
          pages: [
            { key: 'list', labelKey: 'design.page.knowledgeList' },
            { key: 'register', labelKey: 'design.page.knowledgeRegister' },
            { key: 'cta', labelKey: 'design.page.knowledgeCta' },
          ],
        },
      ],
    },
    {
      key: 'create',
      labelKey: 'design.module.create',
      groups: [
        {
          pages: [
            { key: 'board', labelKey: 'design.page.createBoard' },
            { key: 'outputs', labelKey: 'design.page.createOutputs' },
          ],
        },
      ],
    },
  ],
};

export type NavPosition = {
  navModule: NavModule;
  page: NavPage;
  /** 頁之下的章節；頁冇章節就係 null。 */
  section: NavLeaf | null;
};

/**
 * 由網址段落（`['brand', 'settings', 'color']`）對返一個位置。
 *
 * 對唔到一律退回第一個模組第一頁，而唔係拋錯：用戶手動改網址、
 * 或者舊書籤指向已刪的頁，都應該見到一個講得通的地方，而唔係白畫面。
 * 退回係靜默的，但畫面本身會顯示「我而家喺邊」，所以用戶睇得見。
 */
export function resolveNav(nav: AppNav, segments: readonly string[]): NavPosition {
  const navModule =
    nav.modules.find((item) => item.key === segments[0]) ?? nav.modules[0];

  if (navModule === undefined) {
    throw new Error(`app nav ${nav.base} has no modules`);
  }

  const pages = navModule.groups.flatMap((group) => group.pages);
  const page = pages.find((item) => item.key === segments[1]) ?? pages[0];

  if (page === undefined) {
    throw new Error(`module ${navModule.key} has no pages`);
  }

  const section = page.sections?.find((item) => item.key === segments[2]) ?? page.sections?.[0] ?? null;

  return { navModule, page, section };
}
