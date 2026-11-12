/**
 * 「這一頁」面板的純資料（issue #53，v2.1 重做）。
 *
 * 三段之中只有「現況」與「標準」讀真實資料；第三段「給 agent」是這一頁對外
 * 承諾的接口，所以寫成常數，不散落在畫面裡。
 *
 * **這裡不放任何 UI 文案。** 畫面字串全部住 `packages/i18n`；這裡只給鍵
 * 與形狀，所以它可以在 node 裡被測試，不會拉進 React。
 *
 * v2.1 修的三件事（見 `brand-common-fixes.md` 第 1–3 節）：
 *   1. 槽由六個變九個；固定頁由五頁變八頁。少一個就會令平台／圖像／範例
 *      被當成自定義頁 —— 頁頂說「這一張自定義頁自己決定的事」，策略讀到
 *      「自定義頁通用」全文。
 *   2. 引用表補齊三頁，並且**每一條都要對稱**（A 用了 B，B 就要說被 A 用）。
 *   3. 給 agent 的段落不再顯示 HTTP 方法、路徑與 JSON —— 那三樣是給開發者
 *      的，畫面只給一句人話指令。
 */

import { t } from '@company-os/i18n';

/** 策略槽。與後端 `brand-policy/store.ts` 的 `POLICY_SLOTS` 同一組，不多不少。 */
export type GuideSlot =
  | 'home'
  | 'platform'
  | 'color'
  | 'type'
  | 'logo'
  | 'tone'
  | 'image'
  | 'apply'
  | 'custom';

/**
 * 八個固定頁的鍵，次序與 `@company-os/contracts` 的 `BRAND_FIXED_PAGES` 一致。
 *
 * 次序就是左側欄的次序：主頁 → 識別（平台、色彩、字體、標誌、語氣、圖像）
 * → 應用（已核准範例）。改一個字就會令舊書籤 404。
 */
export const FIXED_PAGE_KEYS = [
  'home',
  'platform',
  'color',
  'type',
  'logo',
  'tone',
  'image',
  'examples',
] as const;

/**
 * 一頁屬於哪一個槽。
 *
 * 與後端 `slotForPageKey` 同一條規則：固定頁用自己的鍵（`examples` 用 `apply`），
 * 其餘（自定義頁）一律 `custom`。前端要它只是為了在這一頁上標「這是哪一類頁的
 * 標準」，寫入時仍然由後端自己再判斷一次。
 */
export function slotOfPageKey(pageKey: string): GuideSlot {
  if (pageKey === 'examples') {
    return 'apply';
  }

  return (FIXED_PAGE_KEYS as readonly string[]).includes(pageKey)
    ? (pageKey as GuideSlot)
    : 'custom';
}

/** 頁名。鍵→文案只有一份，畫面各處都叫這一個。 */
export function pageLabel(pageKey: string): string {
  switch (pageKey) {
    case 'home':
      return t('design.page.brandHome');
    case 'platform':
      return t('design.page.brandPlatform');
    case 'color':
      return t('design.page.brandColor');
    case 'type':
      return t('design.page.brandType');
    case 'logo':
      return t('design.page.brandLogo');
    case 'tone':
      return t('design.page.brandTone');
    case 'image':
      return t('design.page.brandImage');
    case 'examples':
      return t('design.page.brandExamples');
    // 自定義頁在引用清單裡用概括的名，不逐頁列：一個品牌可以有十張。
    case 'custom':
      return t('brand.guide.pageCustom');
    default:
      return pageKey;
  }
}

/**
 * 引用的是這一頁的哪一類東西。
 *
 * `stance` 只在平台頁出現：立場句的唯一擁有者是平台頁，其他每一頁的第一屏
 * 都是讀它，不是各存一份。
 */
export type LinkWhat =
  | 'stance'
  | 'keywords'
  | 'essence'
  | 'roles'
  | 'families'
  | 'assets'
  | 'traits'
  | 'photos'
  | 'examples'
  | 'systems';

export type PageLink = {
  /** 對方的頁鍵。 */
  page: string;
  what: LinkWhat;
};

export type PageRefs = {
  /** 這一頁用了誰的東西。 */
  uses: readonly PageLink[];
  /** 誰用了這一頁的東西。 */
  usedBy: readonly PageLink[];
};

/**
 * 跨頁引用。對稱是硬要求：A 說用了 B，B 就要說被 A 用 —— 否則老闆在
 * 色彩頁見到「被標誌引用」，跳到標誌頁卻見不到自己，兩頁講兩個版本。
 * `brand-guide.test.ts` 兩邊都驗。
 *
 * 只寫「真的讀了那個值」的關係，不寫「概念上相關」：
 *   - 每一頁的第一屏讀平台頁的立場句，所以每一頁都用平台。
 *   - 主頁把各頁的現行版本編成總覽，所以它用了其餘七頁（自定義頁用 `systems`）。
 *   - 圖像頁的範例引用應用層的已核准範例。
 *   - 自定義頁照語氣頁寫字（禁用詞檢查），所以它用語氣頁。
 */
const REFS: Record<string, PageRefs> = {
  platform: {
    uses: [],
    usedBy: [
      { page: 'home', what: 'keywords' },
      { page: 'home', what: 'essence' },
      { page: 'color', what: 'stance' },
      { page: 'type', what: 'stance' },
      { page: 'logo', what: 'stance' },
      { page: 'tone', what: 'stance' },
      { page: 'image', what: 'stance' },
      // 自定義頁的第一屏也讀平台頁的立場句。用 `custom` 概括，不逐頁列：
      // 一個品牌可以有十張自定義頁，逐頁列會令這一行長到讀不下去。
      { page: 'custom', what: 'stance' },
    ],
  },
  home: {
    uses: [
      { page: 'platform', what: 'keywords' },
      { page: 'platform', what: 'essence' },
      { page: 'color', what: 'roles' },
      { page: 'type', what: 'families' },
      { page: 'logo', what: 'assets' },
      { page: 'tone', what: 'traits' },
      { page: 'image', what: 'photos' },
      { page: 'examples', what: 'examples' },
      { page: 'custom', what: 'systems' },
    ],
    usedBy: [],
  },
  color: {
    uses: [{ page: 'platform', what: 'stance' }],
    usedBy: [
      { page: 'logo', what: 'roles' },
      { page: 'type', what: 'roles' },
      { page: 'home', what: 'roles' },
      { page: 'image', what: 'roles' },
      { page: 'custom', what: 'roles' },
    ],
  },
  type: {
    uses: [
      { page: 'platform', what: 'stance' },
      { page: 'color', what: 'roles' },
    ],
    usedBy: [
      { page: 'home', what: 'families' },
      { page: 'custom', what: 'families' },
    ],
  },
  logo: {
    uses: [
      { page: 'platform', what: 'stance' },
      { page: 'color', what: 'roles' },
    ],
    usedBy: [{ page: 'home', what: 'assets' }],
  },
  tone: {
    uses: [{ page: 'platform', what: 'stance' }],
    usedBy: [
      { page: 'home', what: 'traits' },
      { page: 'custom', what: 'traits' },
    ],
  },
  image: {
    uses: [
      { page: 'platform', what: 'stance' },
      { page: 'color', what: 'roles' },
      { page: 'examples', what: 'examples' },
    ],
    usedBy: [{ page: 'home', what: 'photos' }],
  },
  examples: {
    uses: [],
    usedBy: [
      { page: 'image', what: 'examples' },
      { page: 'home', what: 'examples' },
    ],
  },
};

/**
 * 自定義頁的引用：永遠用語氣（禁用詞檢查），被主頁的「品牌專屬系統」引用。
 *
 * `colors`／`types` 由這一頁 payload 有沒有引用角色決定 —— 只寫了句 brief 的
 * 新頁不應該聲稱自己用了色彩頁。
 */
const CUSTOM_BASE: PageRefs = {
  uses: [
    { page: 'platform', what: 'stance' },
    { page: 'tone', what: 'traits' },
  ],
  usedBy: [{ page: 'home', what: 'systems' }],
};

export type CustomRefs = { colors: boolean; types: boolean };

export function refsOf(pageKey: string, custom?: CustomRefs): PageRefs {
  const fixed = REFS[pageKey];

  if (fixed !== undefined) {
    return fixed;
  }

  return {
    uses: [
      ...CUSTOM_BASE.uses,
      ...(custom?.colors === true ? [{ page: 'color', what: 'roles' as const }] : []),
      ...(custom?.types === true ? [{ page: 'type', what: 'families' as const }] : []),
    ],
    usedBy: CUSTOM_BASE.usedBy,
  };
}

export type AgentAbilityKey = 'read' | 'write' | 'readPolicy' | 'noPolicy' | 'noDelete';

export type AgentAbility = {
  key: AgentAbilityKey;
  /** 能不能做。`false` 的那幾條要寫得比 `true` 的更清楚。 */
  allowed: boolean;
};

/**
 * 每一頁都一樣 —— 分別不在能力，在內容形狀；所以這是一份，不是九份。
 *
 * 三件可以做：讀現行版本、交新版本（要品牌授權）、讀策略。
 * 兩件不可以：改策略（只有老闆）、刪版本（只有人按）。
 */
export const AGENT_ABILITIES: readonly AgentAbility[] = [
  { key: 'read', allowed: true },
  { key: 'write', allowed: true },
  { key: 'readPolicy', allowed: true },
  { key: 'noPolicy', allowed: false },
  { key: 'noDelete', allowed: false },
];

/**
 * 一句可以直接照講的指令。
 *
 * v2.1 起畫面**不再顯示** HTTP 方法、路徑與 JSON：那些是給開發者的，老闆與
 * 設計師要的是一句可以貼給 agent 的話。端點寫在 `docs/`。
 *
 * 品牌名可以沒有（未讀到品牌時）—— 少一個名不影響指令說得通。
 */
export function agentInstruction(pageKey: string, brandName: string | null): string {
  return t('brand.guide.agentInstruction', {
    brand: brandName ?? t('brand.guide.agentBrandFallback'),
    page: pageLabel(pageKey),
  });
}

/**
 * 時間顯示。版本列表與「這一頁」面板用同一個格式 —— 兩處各寫一份，
 * 早晚會一個帶年份、一個不帶，老闆對著兩個時間對不上。
 */
export function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
