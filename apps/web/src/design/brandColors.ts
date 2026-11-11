/**
 * 品牌色彩的**角色名**（issue #35）。
 *
 * 這一支是角色名的唯一來源，而且刻意寫死在程式裡：
 *
 *   - 其他頁（標誌、字體、品牌主頁）只引用**名字**，所以名字必須穩定、公開。
 *     如果角色名可以由用戶自由新增，標誌頁寫 `brand.primary` 而色彩頁改叫
 *     「主色」，兩邊都覺得自己跟足規則，但接不上。
 *   - 角色分三組，**不准混用**（策略色彩槽原文）：品牌色（`brand.*`）、
 *     閱讀色（`ink`／`paper`／`muted`／`surface`）、功能色（`success` 等）。
 *     功能色不可用於標誌 —— 那是「系統在講話」的顏色，不是品牌的聲音。
 *   - 淺色與深色**共用同一批名字**，各有一套值。不發明 `light.ink`：標誌頁
 *     寫 `ink` 的時候，不會知道指哪一個。
 *   - 角色與階是兩件事：階只是同一個角色的深淺候選，不是第二套名字。
 *
 * 上面這幾條不是我自己想的，是 `brand_policy_version` 色彩槽的原文。策略正文
 * 只住在 Boss Portal（#34），這裡只有它的**結論**：哪幾個名字存在、哪兩個必須
 * 有值、哪一組不可以進標誌、對比門檻是多少。所以這一支要跟策略一起讀。
 *
 * **色值不住在這裡**。色值住在該品牌「色彩」頁的版本內容（#33 的版本鏈），
 * 所以換品牌不會互相污染，而舊版永遠讀得返。
 *
 * 注意：`apps/web/test/gates.test.ts` 不准 `src` 之內出現十六進位色碼或
 * 「r-g-b 括號」寫法（色碼只可以在 tokens.css）。所以這裡的色值一律是
 * **字串資料**：由人輸入、由版本內容讀入，不在原始碼裡寫死任何一個色。
 * RGB 也只輸出三個數字（`0 87 255`），前綴由畫面用標籤講。
 */

export type ColorGroup = 'brand' | 'reading' | 'function';

export type ColorRole = {
  /** 寫死的角色名。其他頁只准引用這一個字串。 */
  key: string;
  group: ColorGroup;
  /**
   * 冇值就一定要標「缺」的角色。`ink` 與 `paper` 是策略明講必須存在的兩個；
   * `surface` 只在深色要求（淺色由 `paper` 承擔）。
   */
  requiredIn: 'both' | 'dark';
};

export const COLOR_ROLES: readonly ColorRole[] = [
  { key: 'brand.primary', group: 'brand', requiredIn: 'both' },
  { key: 'brand.secondary', group: 'brand', requiredIn: 'both' },
  { key: 'ink', group: 'reading', requiredIn: 'both' },
  { key: 'paper', group: 'reading', requiredIn: 'both' },
  { key: 'muted', group: 'reading', requiredIn: 'both' },
  { key: 'surface', group: 'reading', requiredIn: 'dark' },
  { key: 'success', group: 'function', requiredIn: 'both' },
  { key: 'warning', group: 'function', requiredIn: 'both' },
  { key: 'danger', group: 'function', requiredIn: 'both' },
];

export const COLOR_GROUPS: readonly ColorGroup[] = ['brand', 'reading', 'function'];

export function isColorRole(key: string): boolean {
  return COLOR_ROLES.some((role) => role.key === key);
}

export function rolesOfGroup(group: ColorGroup): readonly ColorRole[] {
  return COLOR_ROLES.filter((role) => role.group === group);
}

/**
 * 可以進標誌的角色：品牌色與閱讀色。功能色一律不可以（策略原文）。
 *
 * 這一個判斷要出現在三個地方 —— 畫面不畫那個勾、儲存前不再收、讀入時當作
 * 沒有 —— 所以只寫一次。三處各寫一次，早晚有一處會忘記。
 */
export function logoEligibleRoles(): readonly ColorRole[] {
  return COLOR_ROLES.filter((role) => role.group !== 'function');
}

/** 一組色值。`cmyk` 由人填（印刷），RGB 由 HEX 算出來，所以不另存。 */
export type ColorValue = {
  hex: string;
  cmyk: string;
};

export type ColorPair = {
  /** `ink on paper` ＝ 前景 `ink` 放在底色 `paper` 上。 */
  text: string;
};

export type ColorDoc = {
  light: Record<string, ColorValue>;
  dark: Record<string, ColorValue>;
  /** 階：同一個角色的深淺候選，`{ step, hex }`。不是第二套名字。 */
  ramps: Record<string, { step: string; hex: string }[]>;
  allowed: ColorPair[];
  denied: ColorPair[];
  /** 標誌用到哪幾個角色。功能色不可以進來（策略明講）。 */
  logoRoles: string[];
};

export const EMPTY_DOC: ColorDoc = {
  light: {},
  dark: {},
  ramps: {},
  allowed: [],
  denied: [],
  logoRoles: [],
};

/** 這一份表有沒有任何東西。全空的話不應該佔一版（後端也會拒收空白內容）。 */
export function hasAnyValue(doc: ColorDoc): boolean {
  return (
    Object.keys(doc.light).length > 0 ||
    Object.keys(doc.dark).length > 0 ||
    Object.keys(doc.ramps).length > 0 ||
    doc.allowed.length > 0 ||
    doc.denied.length > 0 ||
    doc.logoRoles.length > 0
  );
}

/**
 * 版本列表只拿到 160 字元的截斷內容，不是完整 JSON，所以解析不到。
 *
 * 但截斷的字串裡仍然有值得看的東西：那一版有哪幾個色。抽出來畫成色點，
 * 總好過把 `{"light":{"ink"...` 這種東西直接印給人看。抽不到就一個點都
 * 沒有 —— 不會假裝有。
 */
export function hexesInText(text: string): string[] {
  const found = text.match(/#[0-9a-fA-F]{6}\b/g) ?? [];

  return Array.from(new Set(found.map((value) => value.toLowerCase())));
}

/**
 * 版本內容是這一份 JSON 的字串。
 *
 * 為什麼不是自由 HTML：驗收要求「看到的是有角色的色」與「缺的角色標成缺」。
 * 自由文字裡沒有「哪個角色有值」這件事，畫面就只會把整段文字印出來 —— 那正是
 * 需要避免的「一排沒有名字的色塊」。舊版本（自由文字）解析不到就當作
 * `invalid`，畫面如實講讀不到，不假裝是「全部缺」。
 */
export type ParseColorResult =
  | { kind: 'ok'; doc: ColorDoc }
  | { kind: 'empty' }
  | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 讀一組角色值。
 *
 * HEX 與 CMYK 只要有一個非空就留著：先打 CMYK 再回頭打 HEX 是正常次序，
 * 如果這裡把「只有 CMYK」的丟掉，畫面下一次重繪就會把剛打的字吃掉 ——
 * 看起來像輸入框壞了。有沒有 HEX 是**另一個**判斷（`hasHex`），不是這一層。
 */
function readValues(raw: unknown): Record<string, ColorValue> {
  const record = asRecord(raw);
  const result: Record<string, ColorValue> = {};

  if (record === null) {
    return result;
  }

  for (const [key, value] of Object.entries(record)) {
    if (!isColorRole(key)) {
      continue;
    }

    const entry = asRecord(value);

    if (entry === null) {
      continue;
    }

    const hex = typeof entry.hex === 'string' ? entry.hex.trim() : '';
    const cmyk = typeof entry.cmyk === 'string' ? entry.cmyk.trim() : '';

    if (hex === '' && cmyk === '') {
      continue;
    }

    result[key] = { hex, cmyk };
  }

  return result;
}

function readPairs(raw: unknown): ColorPair[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      const entry = asRecord(item);

      if (entry === null || typeof entry.text !== 'string') {
        return null;
      }

      const text = entry.text.trim();

      return text === '' ? null : { text };
    })
    .filter((item): item is ColorPair => item !== null);
}

function readRamps(raw: unknown): Record<string, { step: string; hex: string }[]> {
  const record = asRecord(raw);
  const result: Record<string, { step: string; hex: string }[]> = {};

  if (record === null) {
    return result;
  }

  for (const [key, value] of Object.entries(record)) {
    if (!isColorRole(key) || !Array.isArray(value)) {
      continue;
    }

    const steps = value
      .map((item) => {
        const entry = asRecord(item);

        if (entry === null) {
          return null;
        }

        const step = typeof entry.step === 'string' ? entry.step.trim() : '';
        const hex = typeof entry.hex === 'string' ? entry.hex.trim() : '';

        return step === '' || hex === '' ? null : { step, hex };
      })
      .filter((item): item is { step: string; hex: string } => item !== null);

    if (steps.length > 0) {
      result[key] = steps;
    }
  }

  return result;
}

export function parseColorDoc(text: string): ParseColorResult {
  if (text.trim() === '') {
    return { kind: 'empty' };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'invalid' };
  }

  const record = asRecord(raw);

  if (record === null) {
    return { kind: 'invalid' };
  }

  // 認得這一份 JSON 的形狀才算「是色彩表」。一個任意 JSON（例如舊的
  // `{"note":"藍色"}`）雖然解析得到，但裡面沒有角色，硬當成空表就會畫出
  // 九行「缺」—— 那是假話：這一份根本不是表。
  const shapeOk =
    'light' in record || 'dark' in record || 'ramps' in record || 'allowed' in record;

  if (!shapeOk) {
    return { kind: 'invalid' };
  }

  const logoRoles = Array.isArray(record.logoRoles)
    ? record.logoRoles.filter(
        (item): item is string =>
          typeof item === 'string' && logoEligibleRoles().some((role) => role.key === item),
      )
    : [];

  return {
    kind: 'ok',
    doc: {
      light: readValues(record.light),
      dark: readValues(record.dark),
      ramps: readRamps(record.ramps),
      allowed: readPairs(record.allowed),
      denied: readPairs(record.denied),
      logoRoles,
    },
  };
}

/**
 * 存進版本的內容。
 *
 * 刻意**不**縮排：版本列表只拿到內容的頭 160 字元做預覽
 * （`left(content, 160)`），每一行兩個空格縮排等於把預覽的一半用來裝空白，
 * 一版十幾個色就只看得到第一個。單行之後同樣 160 字元可以帶到六七個色。
 * 這一份是給機器讀的，人看的是畫面那一張表。
 */
export function serializeColorDoc(doc: ColorDoc): string {
  return JSON.stringify({
    light: doc.light,
    dark: doc.dark,
    ramps: doc.ramps,
    allowed: doc.allowed,
    denied: doc.denied,
    logoRoles: doc.logoRoles,
  });
}

/* ── 顏色計算 ─────────────────────────────────────────────── */

/** 三碼或六碼。三碼會在 `normalizeHex` 展開。 */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value.trim());
}

/** 三碼展開成六碼；不是 hex 就回 `null`。 */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim();

  if (!HEX.test(trimmed)) {
    return null;
  }

  const body = trimmed.slice(1).toLowerCase();

  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`;
  }

  return `#${body}`;
}

export function hexToRgb(value: string): { r: number; g: number; b: number } | null {
  const hex = normalizeHex(value);

  if (hex === null) {
    return null;
  }

  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * 畫面上寫的 `0 87 255`（RGB 三個數字）。由 HEX 算，不另存一份會過時的數字。
 *
 * 這裡刻意不砌成 CSS 函式字串：色碼只可以在 tokens.css，而這一個是**資料**
 * 不是樣式。要貼進 CSS 的人，貼 HEX 那一個。
 */
export function rgbChannels(value: string): string | null {
  const rgb = hexToRgb(value);

  return rgb === null ? null : `${rgb.r} ${rgb.g} ${rgb.b}`;
}

function channel(value: number): number {
  const ratio = value / 255;

  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(value: string): number | null {
  const rgb = hexToRgb(value);

  if (rgb === null) {
    return null;
  }

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * 對比（WCAG 2.1）。策略明講：內文至少 4.5:1、大字至少 3:1。
 *
 * 算出來給人看的，不是用來擋儲存的：低於標準是事實，畫面要講，但要不要
 * 還是一個設計決定 —— 把它變成「不可以儲存」只會令人亂填一個色。
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);

  if (a === null || b === null) {
    return null;
  }

  const light = Math.max(a, b);
  const dark = Math.min(a, b);

  return (light + 0.05) / (dark + 0.05);
}

export const BODY_CONTRAST = 4.5;
export const LARGE_CONTRAST = 3;

/** `ink on paper` → `{ foreground: 'ink', background: 'paper' }`；格式不對回 `null`。 */
export function parsePair(text: string): { foreground: string; background: string } | null {
  const match = /^(\S+)\s+on\s+(\S+)$/.exec(text.trim());

  if (match === null) {
    return null;
  }

  const foreground = match[1];
  const background = match[2];

  if (foreground === undefined || background === undefined) {
    return null;
  }

  return { foreground, background };
}

export function valuesOf(doc: ColorDoc, mode: 'light' | 'dark'): Record<string, ColorValue> {
  return mode === 'light' ? doc.light : doc.dark;
}

/**
 * 這個模式要求而未有值的角色 —— 畫面逐個標「缺」，不填近似色。
 *
 * 只算「有 HEX」：CMYK 是印刷數值，沒有 HEX 就沒有 RGB、沒有對比，
 * 對這一頁的用途（螢幕）來說仍然是缺。
 */
export function missingRoles(doc: ColorDoc, mode: 'light' | 'dark'): string[] {
  const values = valuesOf(doc, mode);

  return COLOR_ROLES.filter((role) => {
    if (role.requiredIn === 'dark' && mode === 'light') {
      return false;
    }

    return (values[role.key]?.hex ?? '') === '';
  }).map((role) => role.key);
}

/**
 * 策略與 issue 都明講「至少要有」的角色。少了就要用另一句話講（見
 * `missingMustHave`），但**仍然可以儲存** —— 見下面那個函式的註解。
 */
const MUST_HAVE_ROLES = ['brand.primary', 'ink', 'paper'] as const;
const MUST_HAVE_DARK_ROLES = ['surface'] as const;

/**
 * 「最少要有」而真的缺了的角色。
 *
 * 為什麼不是擋儲存：一個品牌剛開，第一個設計師可能今晚只決定了主色。
 * 擋住只會令人隨便填一個色交差 —— 那正是策略禁止的事（「不要填一個差不多
 * 的色」）。所以留白是合法狀態，畫面如實講缺，版本照樣留得住。
 */
export function missingMustHave(doc: ColorDoc, mode: 'light' | 'dark'): string[] {
  const values = valuesOf(doc, mode);
  const required: readonly string[] =
    mode === 'dark' ? [...MUST_HAVE_ROLES, ...MUST_HAVE_DARK_ROLES] : MUST_HAVE_ROLES;

  return required.filter((key) => (values[key]?.hex ?? '') === '');
}
