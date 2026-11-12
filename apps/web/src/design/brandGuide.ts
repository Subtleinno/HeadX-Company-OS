/**
 * 「這一頁」面板的純資料（issue #53）。
 *
 * 三段之中只有「現況」與「策略」讀真實資料；第三段「用 AI Agent 管理」
 * 是這一頁對外承諾的接口，所以寫成常數，不散落在畫面裡 —— 改接口的人
 * 會見到這一份，不會只改後端然後留下一句講錯的說明。
 *
 * **這裡不放任何 UI 文案。** 畫面字串全部住 `packages/i18n`；這裡只給鍵
 * 與形狀，所以它可以在 node 裡被測試，不會拉進 React。
 */

/** 策略槽。與後端 `brand-policy/store.ts` 的 `POLICY_SLOTS` 同一組，不多不少。 */
export type GuideSlot = 'home' | 'logo' | 'color' | 'type' | 'tone' | 'custom';

export const FIXED_PAGE_KEYS = ['home', 'logo', 'color', 'type', 'tone'] as const;

/**
 * 一頁屬於哪一個槽。
 *
 * 與後端 `slotForPageKey` 同一條規則：五個固定頁用自己的鍵，其餘（自定義頁）
 * 一律 `custom`。前端要它只是為了在這一頁上標「這是哪一類頁的標準」，
 * 寫入時仍然由後端自己再判斷一次。
 */
export function slotOfPageKey(pageKey: string): GuideSlot {
  return (FIXED_PAGE_KEYS as readonly string[]).includes(pageKey)
    ? (pageKey as GuideSlot)
    : 'custom';
}

/** 引用的是這一頁的哪一類東西。 */
export type LinkWhat = 'roles' | 'families' | 'assets' | 'traits';

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
 *   - 標誌頁的四種顏色模式取值於色彩頁的角色（`brand.primary`／`ink`／
 *     `paper`／深色 `surface`）。
 *   - 字體頁每一個角色的文字顏色取自色彩頁的角色。
 *   - 主頁要標誌、色票、字階、語氣樣本各取一點，所以它用了四頁。
 *   - 自定義頁只寫自己的內容與禁用詞，不引用別頁的值。
 */
const REFS: Record<string, PageRefs> = {
  home: {
    uses: [
      { page: 'logo', what: 'assets' },
      { page: 'color', what: 'roles' },
      { page: 'type', what: 'families' },
      { page: 'tone', what: 'traits' },
    ],
    usedBy: [],
  },
  logo: {
    uses: [{ page: 'color', what: 'roles' }],
    usedBy: [{ page: 'home', what: 'assets' }],
  },
  color: {
    uses: [],
    usedBy: [
      { page: 'logo', what: 'roles' },
      { page: 'type', what: 'roles' },
      { page: 'home', what: 'roles' },
    ],
  },
  type: {
    uses: [{ page: 'color', what: 'roles' }],
    usedBy: [{ page: 'home', what: 'families' }],
  },
  tone: {
    uses: [],
    usedBy: [{ page: 'home', what: 'traits' }],
  },
};

/** 自定義頁沒有跨頁引用，回一個固定的空物件：呼叫方不用判空。 */
const NO_REFS: PageRefs = { uses: [], usedBy: [] };

export function refsOf(pageKey: string): PageRefs {
  return REFS[pageKey] ?? NO_REFS;
}

export type AgentAbilityKey = 'read' | 'write' | 'readPolicy' | 'noPolicy' | 'noDelete';

export type AgentAbility = {
  key: AgentAbilityKey;
  /** 能不能做。`false` 的那幾條要寫得比 `true` 的更清楚。 */
  allowed: boolean;
};

/**
 * 每一頁對 agent 的開放範圍。六個槽都一樣 —— 分別不在能力，在內容形狀；
 * 所以這是一份，不是六份。
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

export type AgentExample = {
  method: 'POST';
  path: string;
  body: string;
};

/**
 * 一句可以照講的指令所對應的請求。
 *
 * 路徑寫真的是因為要對得上：`POST /api/brands/:brandId/pages/:pageKey/versions`，
 * body 只有 `content` 一個欄位（後端 `parseVersionInput` 只認它與 `note`）。
 * 寫一條打不中的路，等於叫 agent 撞牆。
 */
export function agentExample(pageKey: string): AgentExample {
  return {
    method: 'POST',
    path: `/api/brands/{brandId}/pages/${pageKey}/versions`,
    body: JSON.stringify({ content: '<JSON>' }),
  };
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

