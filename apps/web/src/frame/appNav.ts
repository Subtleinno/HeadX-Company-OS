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
      groups: [{ pages: [{ key: 'members', labelKey: 'boss.page.people' }] }],
    },
    {
      /**
       * 策略獨立成一個模組（issue #34）。
       *
       * 它不屬於任何一個品牌：策略講的是「這一類頁要怎樣做」，同一套專業標準
       * 用於所有品牌。所以放在公司範圍的 Boss Portal，而不是品牌模組。
       * 放在「人員」之後、「存取紀錄」之前：前者是工作區，後者是唯讀紀錄。
       */
      key: 'policy',
      labelKey: 'boss.module.policy',
      groups: [{ pages: [{ key: 'brand', labelKey: 'boss.page.brandPolicy' }] }],
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
            /**
             * 五個固定頁（issue #32）。鍵固定，唔可以改名：鍵係網址的一部分。
             *
             * 這一組只是**未讀到品牌頁清單之前**的骨架 —— 真正列在左側的
             * 是後端回的清單（自定義頁幾張、叫什麼，只有資料庫知）。
             * `withBrandPages()` 讀到之後會整組換走，包括這五頁的名。
             *
             * 移走的三頁各有原因：儀表板與渠道沒有一頁定義它們；版本住在
             * 各頁自己裡面（#33），不再是獨立一頁；「品牌識別」不在五頁之內，
             * 留一個空殼當第六頁只會令人以為它存在。
             */
            { key: 'home', labelKey: 'design.page.brandHome' },
            { key: 'logo', labelKey: 'design.page.brandLogo' },
            { key: 'color', labelKey: 'design.page.brandColor' },
            { key: 'type', labelKey: 'design.page.brandType' },
            { key: 'tone', labelKey: 'design.page.brandTone' },
            { key: 'image', labelKey: 'design.page.brandImage' },
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

/* ── 品牌頁清單（issue #32） ─────────────────────────────────── */

/** 後端回的一頁，只取導覽要用的欄位 —— 這樣這一支仍然是純資料轉換。 */
export type BrandNavPage = {
  key: string;
  name: string;
  kind: 'fixed' | 'custom';
  /** 左側欄分組（#60）：品牌主頁、識別、品牌專屬、應用。 */
  group?: 'home' | 'identity' | 'custom' | 'apply';
  /** 這一頁未有版本。名稱右側顯示「缺」。 */
  missing?: boolean;
};

/**
 * 把導覽裡品牌模組的頁，換成後端真正有的那些頁。
 *
 * **次序不重排**：後端按 `sort_order` 回，那是一條建立時就固定的數（固定頁
 * 10–50，自定義頁由 60 起遞增）。按最後修改時間排會令改完一頁就跳位，人會
 * 以為自己按錯；按字母排則會令「包裝／攝影／命名」變成「命名／包裝／攝影」。
 *
 * 自定義頁的鍵是 `p/<slug>`，不是 `<slug>`：五頁的網址是
 * `#/design/brand/<鍵>`，自定義頁是 `#/design/brand/p/<slug>`，兩者永遠
 * 不會撞 —— 就算有人把頁改名做 `logo`，技術上也撞不入（後端另外會擋）。
 */
export function withBrandPages(
  nav: AppNav,
  pages: readonly BrandNavPage[],
): AppNav {
  if (pages.length === 0) {
    return nav;
  }

  const mapped: NavPage[] = pages.map((page) => ({
    key: page.kind === 'custom' ? `p/${page.key}` : page.key,
    label: page.name,
    ...(page.missing === true ? { badge: t('brand.nav.missing'), badgeTone: 'warning' as const } : {}),
  }));

  // 四組（#60）：品牌主頁／識別 IDENTITY／品牌專屬 CUSTOM／應用 APPLY。
  // 空組不畫 —— 一個沒有頁的分組標題只是一個問題。次序寫死在這裡而不是由
  // 後端的 `sort_order` 推：分組是一個決定，不是一個數。
  const order = ['home', 'identity', 'custom', 'apply'] as const;
  const titles: Record<(typeof order)[number], MessageKey | null> = {
    home: null,
    identity: 'design.group.identity',
    custom: 'design.group.custom',
    apply: 'design.group.apply',
  };

  const groups = order
    .map((group) => {
      const inGroup = pages
        .map((page, index) => ({ page, nav: mapped[index] }))
        .filter((entry) => (entry.page.group ?? (entry.page.kind === 'custom' ? 'custom' : 'identity')) === group)
        .map((entry) => entry.nav as NavPage);

      const titleKey = titles[group];

      return { ...(titleKey === null ? {} : { titleKey }), pages: inGroup };
    })
    .filter((group) => group.pages.length > 0);

  return {
    ...nav,
    modules: nav.modules.map((navModule) =>
      navModule.key === 'brand' ? { ...navModule, groups } : navModule,
    ),
  };
}

/** 導覽鍵 → 後端路徑上的頁鍵。`p/packaging` → `packaging`；`logo` → `logo`。 */
export function pageApiKey(navKey: string): string {
  return navKey.startsWith('p/') ? navKey.slice(2) : navKey;
}
