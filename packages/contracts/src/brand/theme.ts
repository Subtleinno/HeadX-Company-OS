/**
 * 品牌主題（brand theme）：一整間公司 app 的皮膚。
 *
 * 為什麼要有這一支而不是多一頁品牌文件：
 *
 *   色彩頁、字體頁講的是「品牌決定咗咩」（色值、字體、用法），是給人讀的內容。
 *   主題講的是「呢啲決定點樣落到畫面」—— 底色、墨色、強調色、漸變、字體、
 *   圓角，逐個映射到 `--hx-*` token。兩件事分開，因為同一個品牌決定可以有
 *   多個主題（例如官網、內部系統、印刷），而文件只有一份。
 *
 * 形狀刻意小：八個色、一個漸變、兩組字體、一個圓角基準。多一個欄位就要多
 * 一個地方解釋它映射到哪個 token；在還沒有人真的需要之前，不加。
 *
 * 預設值 = 今日的畫面。沒有設定主題時，套用 DEFAULT_BRAND_THEME 與現在的畫面
 * 一模一樣 —— 這樣「未設主題」不會變成另一種設計。
 */

/** 字體選擇。id 對應的實際字體堆疊在 web 層（`packages/design-tokens/src/theme.ts`）。 */
/**
 * 可以選的字族。
 *
 * `canto` 與 `noto` 不是「好聽的名字」而是**實際隨 app 出貨的字體檔**
 * （`apps/web/public/fonts/brand/`，見 apps/web/src/styles/fonts.css）。
 * `serif` 是安全網：真的沒有 Canto 的時候，最少有明體，不要掉回無襯線。
 *
 * 為什麼不放「自訂字體名」自由輸入：填一個不存在的名字，畫面會靜默退回
 * 系統字，而設定看起來「已套用」—— 這種假成功比沒有選項更難查。
 */
export const BRAND_THEME_FONTS = ['system', 'canto', 'serif', 'noto', 'mono'] as const;
export type BrandThemeFontId = (typeof BRAND_THEME_FONTS)[number];

/** 頁面底漸變。兩個色就夠 —— 三個色會在 100% 之外多一段沒人控制的帶。 */
export type BrandThemeWash = {
  from: string;
  to: string;
  /** 度。0 = 由左至右，180 = 由上至下。 */
  angle: number;
};

export type BrandTheme = {
  version: 1;
  color: {
    /** 頁面底。 */
    paper: string;
    /** 卡片、次級底。 */
    surface: string;
    /** 主文字。 */
    ink: string;
    /** 次級文字、說明。 */
    muted: string;
    /** 線、邊框。 */
    line: string;
    /** 主要動作（畫面上唯一的藍／唯一的色）。 */
    accent: string;
    /** 主要動作上的字。 */
    accentInk: string;
    /** 主要動作的淡底：選中、橫幅。 */
    accentSoft: string;
  };
  /** 沒有漸變就 null —— 不要用「兩個一樣的色」假裝沒有。 */
  wash: BrandThemeWash | null;
  font: {
    /** 標題、頁名。 */
    display: BrandThemeFontId;
    /** 正文、介面。 */
    body: BrandThemeFontId;
  };
  shape: {
    /** 圓角基準（px）。0 = 全直腳，24 = 很圓。 */
    radius: number;
  };
  type: {
    /**
     * 標題相對於正文字級的倍數。
     *
     * 1 = 現況（44px 頁名）。越大，「大很大、小很小」越明顯 —— 這正是 brand
     * kit 的節奏來源。只在 0.85–1.3 之間：再大標題就會撞到右邊的動作，
     * 再小就與節題（22px）分不開。
     */
    headingScale: number;
  };
};

/**
 * 今日的畫面。值照 tokens.css，一個都沒有改 —— 這一支不是重新設計，
 * 是把現有的結果寫成一個可以覆寫的起點。
 */
export const DEFAULT_BRAND_THEME: BrandTheme = {
  version: 1,
  color: {
    paper: '#ffffff',
    surface: '#f5f6fa',
    ink: '#191919',
    muted: '#6e6e6e',
    line: '#e1e4e8',
    accent: '#0057ff',
    accentInk: '#ffffff',
    accentSoft: '#eaf0ff',
  },
  wash: null,
  font: { display: 'system', body: 'system' },
  shape: { radius: 8 },
  type: { headingScale: 1 },
};


/**
 * 三個起點。
 *
 * 為什麼放在 contracts 而不是畫面：預設主題是**資料**（一組色、一組字、一個
 * 圓角），不是畫面的一部分。放在 TSX 裡，`apps/web` 就出現了一堆寫死的色碼，
 * 而那個 repo 的規矩是「色碼只在 tokens.css」—— 那條規矩不是為了好看，是為了
 * 令「換一次色要改幾個地方」這個答案永遠是 1。
 *
 * 兩個非預設的性格：暮色（襯線標題 + 淡紫漸變 + 大圓角）、深墨（重墨 + 直腳）。
 * 它們不是「好看的色票」，是「一按就見到分別」的兩端，中間留給人自己調。
 */
export const BRAND_THEME_PRESETS: readonly { id: string; theme: BrandTheme }[] = [
  { id: 'current', theme: DEFAULT_BRAND_THEME },
  {
    id: 'dusk',
    theme: {
      version: 1,
      color: {
        paper: '#f6f3fe',
        surface: '#ffffff',
        ink: '#1f1b2d',
        muted: '#5e5970',
        line: '#e3dfee',
        accent: '#4a5396',
        accentInk: '#ffffff',
        accentSoft: '#dadef8',
      },
      wash: { from: '#faf8ff', to: '#efeafb', angle: 175 },
      /* brand kit v2 的組合：Canto 排標題、Noto Sans HK 排正文。
         這一版沒有用真的字體檔之前，「襯線標題」在別人的機上排出來是明體，
         氣質差很遠 —— 所以這一支直接指到已出貨的字。 */
      font: { display: 'canto', body: 'noto' },
      shape: { radius: 16 },
      /* kit 的標題比內文大得多；16px 的內文配 46px 的頁名。 */
      type: { headingScale: 1.06 },
    },
  },
  {
    id: 'ink',
    theme: {
      version: 1,
      color: {
        paper: '#ffffff',
        surface: '#f4f2ee',
        ink: '#111111',
        muted: '#5c5a55',
        line: '#dedad2',
        accent: '#111111',
        accentInk: '#ffffff',
        accentSoft: '#efedea',
      },
      wash: null,
      font: { display: 'serif', body: 'system' },
      shape: { radius: 2 },
      type: { headingScale: 1.02 },
    },
  },
];

export type ThemeParse = { ok: true; value: BrandTheme } | { ok: false; reason: string };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value.trim());
}

/** 讀一個色值。標籤由呼叫端放進錯誤訊息，這裡不需要。 */
function readHex(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];

  return isHex(value) ? value.trim().toLowerCase() : null;
}

/**
 * 寫入前的驗證。
 *
 * 缺欄位就補預設（前端送半份主題不應該失敗：那是最常見的「只改一個色」）；
 * 但**打錯的色碼一定要拒絕** —— 靜靜換成預設，人會以為改咗，畫面卻冇反應。
 */
export function parseBrandTheme(input: unknown): ThemeParse {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'theme 必須是物件' };
  }

  const record = input as Record<string, unknown>;
  const colorRaw = record.color;
  const colorSource =
    typeof colorRaw === 'object' && colorRaw !== null ? (colorRaw as Record<string, unknown>) : {};

  const color: BrandTheme['color'] = { ...DEFAULT_BRAND_THEME.color };
  const labels: Record<keyof BrandTheme['color'], string> = {
    paper: '頁面底色',
    surface: '卡片底色',
    ink: '主文字色',
    muted: '次級文字色',
    line: '線色',
    accent: '強調色',
    accentInk: '強調色上的字',
    accentSoft: '強調色淡底',
  };

  for (const key of Object.keys(labels) as (keyof BrandTheme['color'])[]) {
    const raw = colorSource[key];

    if (raw === undefined || raw === null) {
      continue;
    }

    const parsed = readHex(colorSource, key);

    if (parsed === null) {
      return { ok: false, reason: `color.${key}（${labels[key]}）必須是 #RGB 或 #RRGGBB` };
    }

    color[key] = parsed;
  }

  const washRaw = record.wash;
  let wash: BrandThemeWash | null = null;

  if (washRaw !== undefined && washRaw !== null) {
    if (typeof washRaw !== 'object') {
      return { ok: false, reason: 'wash 必須是 { from, to, angle } 或者 null' };
    }

    const source = washRaw as Record<string, unknown>;
    const from = readHex(source, 'from');
    const to = readHex(source, 'to');

    if (from === null || to === null) {
      return { ok: false, reason: 'wash.from 與 wash.to 都必須是 #RGB 或 #RRGGBB' };
    }

    const angleRaw = source.angle ?? 180;
    const angle = typeof angleRaw === 'number' ? angleRaw : Number.NaN;

    if (!Number.isFinite(angle) || angle < 0 || angle > 360) {
      return { ok: false, reason: 'wash.angle 必須是 0 至 360 的數字' };
    }

    wash = { from, to, angle: Math.round(angle) };
  }

  const fontRaw = record.font;
  const fontSource =
    typeof fontRaw === 'object' && fontRaw !== null ? (fontRaw as Record<string, unknown>) : {};
  const font: BrandTheme['font'] = { ...DEFAULT_BRAND_THEME.font };

  for (const key of ['display', 'body'] as const) {
    const value = fontSource[key];

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== 'string' || !BRAND_THEME_FONTS.includes(value as BrandThemeFontId)) {
      return { ok: false, reason: `font.${key} 只可以是 ${BRAND_THEME_FONTS.join('、')}` };
    }

    font[key] = value as BrandThemeFontId;
  }

  const shapeRaw = record.shape;
  const shapeSource =
    typeof shapeRaw === 'object' && shapeRaw !== null ? (shapeRaw as Record<string, unknown>) : {};
  const radiusRaw = shapeSource.radius ?? DEFAULT_BRAND_THEME.shape.radius;
  const radius = typeof radiusRaw === 'number' ? radiusRaw : Number.NaN;

  if (!Number.isFinite(radius) || radius < 0 || radius > 24) {
    return { ok: false, reason: 'shape.radius 必須是 0 至 24 的數字' };
  }

  const typeRaw = record.type;
  const typeSource =
    typeof typeRaw === 'object' && typeRaw !== null ? (typeRaw as Record<string, unknown>) : {};
  const scaleRaw = typeSource.headingScale ?? DEFAULT_BRAND_THEME.type.headingScale;
  const headingScale = typeof scaleRaw === 'number' ? scaleRaw : Number.NaN;

  if (!Number.isFinite(headingScale) || headingScale < 0.85 || headingScale > 1.3) {
    return { ok: false, reason: 'type.headingScale 必須是 0.85 至 1.3 的數字' };
  }

  return {
    ok: true,
    value: {
      version: 1,
      color,
      wash,
      font,
      shape: { radius: Math.round(radius) },
      type: { headingScale: Math.round(headingScale * 100) / 100 },
    },
  };
}

/** 兩份主題是否一樣。畫面用它決定「有沒有未儲存的改動」。 */
export function sameBrandTheme(left: BrandTheme, right: BrandTheme): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
