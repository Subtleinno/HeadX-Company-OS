import { t, type MessageKey } from '@company-os/i18n';

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

export type NavLeaf = {
  key: string;
  /**
   * 翻譯鍵。靜態頁一定有；**自定義品牌頁**冇 —— 它的名由用戶輸入，住在資料庫
   * （`brand_page.name`），所以用下面的 `label`。兩者只有一個會有。
   */
  labelKey?: MessageKey;
  /** 已經是人看得懂的字（自定義頁的顯示名）。與 `labelKey` 二選一。 */
  label?: string;
  /**
   * 名稱右側的狀態小字（#60 的「缺」）。缺內容的頁不畫灰色假內容，但也不
   * 從清單消失 —— 消失會令人以為這一頁不存在。
   */
  badge?: string;
  badgeTone?: 'warning' | 'muted';
};

export type NavPage = NavLeaf & {
  /** 呢一頁之下的章節。冇就唔會有第二層。 */
  sections?: readonly NavLeaf[];
  /** false = 只做左欄入口；Create 的第二行因此可專心切換作品格式。 */
  subbar?: boolean;
};

export type NavGroup = {
  titleKey?: MessageKey;
  pages: readonly NavPage[];
};

/**
 * 一個節點在畫面上叫什麼。
 *
 * 只有一個來源：有 `label` 就用它（自定義品牌頁，名在資料庫），否則查
 * `labelKey`。兩處各寫一份名，早晚會有一邊過時，而用戶一眼就見到。
 */
export function navLabel(leaf: NavLeaf): string {
  if (leaf.label !== undefined) {
    return leaf.label;
  }

  return leaf.labelKey === undefined ? leaf.key : t(leaf.labelKey);
}

export type NavModule = NavLeaf & {
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
      /**
       * 品牌：一頁「全部品牌」＋ 每個品牌一頁。
       *
       * 這一條是常駐的（2026-11-17 老闆：新增品牌的入口屬於公司層，不放在
       * Design）。常駐的另一個好處是：一個品牌都未有時，`#/boss/brand` 仍然
       * 到得了 —— 否則連第一個品牌都無處可開。
       *
       * 每個品牌那一頁由 `BossPortal` 依 `/brands` 清單即時接在「全部品牌」
       * 之後（`brand` 模組的 groups 會被換掉），所以這裡只列固定的第一頁。
       */
      key: 'brand',
      labelKey: 'boss.module.brand',
      groups: [{ pages: [{ key: 'brands', labelKey: 'boss.page.brands' }] }],
    },
    {
      /**
       * 行銷（2026-11-17 晚老闆加）：04F 行銷內容由老闆自己定、全公司共用，
       * 其他同事不應該看到。所以它有一個自己的模組，而不是躲在品牌之下 ——
       * 品牌是「這個品牌是誰」，行銷策略是「公司怎麼賣」，兩件事。
       *
       * 資料在 `brand_id is null` 那一列（見 `apps/platform/src/marketing`），
       * 只有一個 stage（04F），所以這一頁是固定的，不隨品牌清單變。
       */
      key: 'marketing',
      labelKey: 'boss.module.marketing',
      groups: [{ pages: [{ key: 'marketing', labelKey: 'boss.page.marketing' }] }],
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
      groups: [{ pages: [{ key: 'members', labelKey: 'boss.page.people' }] }],
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
      key: 'create',
      labelKey: 'design.module.create',
      groups: [
        {
          titleKey: 'design.group.library',
          pages: [
            { key: 'projects', labelKey: 'design.page.projects', subbar: false },
            { key: 'outputs', labelKey: 'design.page.outputs', subbar: false },
          ],
        },
      ],
    },
    {
      key: 'brand',
      labelKey: 'design.module.brand',
      groups: [
        {
          /*
           * 兩頁，但都不出現在第二行頁籤（`subbar: false`）：品牌模組左欄
           * 是一棵「資料夾 → 品牌集」的樹，在頁籤再加一次只會兩處講同一件事。
           *
           * `sets` 這一頁存在的理由是麵包屑與深連結：04A–04H 的品牌集不是
           * 品牌總覽，標題不可以寫成「品牌總覽」。
           */
          pages: [
            { key: 'dashboard', labelKey: 'brandBuild.overview.nav', subbar: false },
            { key: 'sets', labelKey: 'brandBuild.set.title', subbar: false },
          ],
        },
      ],
    },
    {
      key: 'material',
      labelKey: 'design.module.material',
      groups: [
        {
          titleKey: 'design.group.library',
          pages: [{ key: 'library', labelKey: 'design.page.materialLibrary' }],
        },
        {
          titleKey: 'design.group.sources',
          pages: [
            { key: 'human', labelKey: 'design.page.materialHuman', subbar: false },
            { key: 'ai', labelKey: 'design.page.materialAi', subbar: false },
            { key: 'stock', labelKey: 'design.page.materialStock', subbar: false },
            { key: 'client', labelKey: 'design.page.materialClient', subbar: false },
          ],
        },
      ],
    },
    {
      key: 'knowledge',
      labelKey: 'design.module.knowledge',
      groups: [
        {
          titleKey: 'design.group.library',
          pages: [{ key: 'list', labelKey: 'design.page.knowledgeList' }],
        },
        {
          titleKey: 'design.group.status',
          pages: [
            { key: 'unverified', labelKey: 'design.page.knowledgeUnverified', subbar: false },
            { key: 'verified', labelKey: 'design.page.knowledgeVerified', subbar: false },
            { key: 'outdated', labelKey: 'design.page.knowledgeOutdated', subbar: false },
          ],
        },
      ],
    },
    {
      key: 'templates',
      labelKey: 'design.module.templates',
      groups: [
        {
          titleKey: 'design.group.formats',
          pages: [
            { key: 'library', labelKey: 'design.page.templates' },
            { key: 'carousel', labelKey: 'design.page.carousel', subbar: false },
            { key: 'presentation', labelKey: 'design.page.presentation', subbar: false },
            { key: 'video', labelKey: 'design.page.video', subbar: false },
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
  // 頁鍵可以含斜線：自定義品牌頁是 `p/<slug>`，在網址上佔兩段。先拼返做
  // 一段比對，再退回逐段比對 —— 手改網址、舊書籤都要對得返。
  const joined = segments.slice(1).join('/');
  const page =
    pages.find((item) => item.key === joined) ??
    pages.find((item) => item.key === segments[1]) ??
    pages[0];

  if (page === undefined) {
    throw new Error(`module ${navModule.key} has no pages`);
  }

  const section = page.sections?.find((item) => item.key === segments[2]) ?? page.sections?.[0] ?? null;

  return { navModule, page, section };
}
