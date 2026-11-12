/**
 * 品牌色彩頁的**資料層**（issue #62，取代 #35 的舊形狀）。
 *
 * 這一支不再是「自己一套表」，而是 `@company-os/contracts` 色彩 payload 的
 * **編輯器轉接層**：儲存的是同一個 `ColorPayload`，所以 tokens.json、prompt
 * 包、HTML 與這一頁看到的必然是同一份資料。舊版（#35）用 `light`／`dark`
 * 兩張表加 `ramps`、`denied`、`logoRoles`，與 payload 對不上，四種輸出要靠
 * 另一段程式翻譯 —— 翻譯一日存在，就有一日會不同步。
 *
 * 三條界線：
 *   1. **色值只住在這一頁。** 其他頁（標誌、字體、品牌主頁）只引用角色**名字**。
 *      所以「標誌用哪幾個色」不在這裡 —— 那是標誌頁的 `color_link`（#64）。
 *   2. **角色名公開而且寫死。** 名字可以自由新增的話，標誌頁寫 `brand.primary`
 *      而色彩頁改叫「主色」，兩邊都覺得自己跟足規則，但接不上。
 *   3. **缺就是缺。** 沒有 HEX 就標缺，不填一個「差不多」的色；留白不擋儲存。
 *
 * 對比公式不在這裡重寫：`contrastRatio` 由 contracts 來，與後端 checker 用
 * 同一條算式。兩邊各寫一次，早晚有一邊算錯而沒有人發現。
 *
 * 注意：`apps/web/test/gates.test.ts` 不准 `src` 之內出現十六進位色碼。
 * 所以這裡一個色都沒有：值由人輸入或由版本內容讀入，建議色由數字算出來。
 */

import {
  BODY_FLOOR,
  LARGE_FLOOR,
  contrastRatio,
  hexToRgb,
  isHex,
  schemaForPage,
  type ColorGroup,
  type ColorPayload,
} from '@company-os/contracts';

export type { ColorGroup };
/*
 * 對比與色值工具由 contracts 轉出，不在這裡再寫一份。
 *
 * 有三個舊呼叫者（標誌、主頁、自定義頁）本來由這一支拿這些函式，所以這裡
 * 保留同一個名字 —— 換的是來源，不是介面，那三頁一行都不用改。
 */
export { contrastRatio, hexToRgb, isHex };
export type ColorDoc = ColorPayload;

/** 一個角色在這一頁的身份。 */
export type ColorRoleSpec = {
  /** 寫死的角色名。其他頁只准引用這一個字串。 */
  key: string;
  group: ColorGroup;
  /** 一定要有值（`always`），還是只在深色模式要求（`dark`）。 */
  requiredIn: 'always' | 'dark';
};

/**
 * 九個角色。三組不准混用（策略色彩槽原文）：品牌色、閱讀色、功能色。
 * 功能色是「系統在講話」的顏色，不是品牌的聲音 —— 所以它不會進標誌。
 */
export const COLOR_ROLES: readonly ColorRoleSpec[] = [
  { key: 'brand.primary', group: 'brand', requiredIn: 'always' },
  { key: 'brand.secondary', group: 'brand', requiredIn: 'dark' },
  { key: 'ink', group: 'reading', requiredIn: 'always' },
  { key: 'paper', group: 'reading', requiredIn: 'always' },
  { key: 'muted', group: 'reading', requiredIn: 'dark' },
  { key: 'surface', group: 'reading', requiredIn: 'always' },
  { key: 'success', group: 'function', requiredIn: 'dark' },
  { key: 'warning', group: 'function', requiredIn: 'dark' },
  { key: 'danger', group: 'function', requiredIn: 'dark' },
];

export const COLOR_GROUPS: readonly ColorGroup[] = ['brand', 'reading', 'function'];

/** 策略明講必須有的四個 —— 與 `color.r1` 一字不差。 */
export const MUST_HAVE_ROLES: readonly string[] = ['brand.primary', 'ink', 'paper', 'surface'];

export function isColorRole(key: string): boolean {
  return COLOR_ROLES.some((role) => role.key === key);
}

export function roleSpec(key: string): ColorRoleSpec | undefined {
  return COLOR_ROLES.find((role) => role.key === key);
}

export function rolesOfGroup(group: ColorGroup): readonly ColorRoleSpec[] {
  return COLOR_ROLES.filter((role) => role.group === group);
}

export function groupOfRole(key: string): ColorGroup | null {
  return roleSpec(key)?.group ?? null;
}

const COLOR_SCHEMA = schemaForPage('color', 'fixed');

export const EMPTY_DOC: ColorDoc = {
  stance: '',
  roles: [],
  order: { text: '', reason: '' },
  ratios: [],
  contrast_floor: BODY_FLOOR,
  large_floor: LARGE_FLOOR,
  pairs: { allowed: [], forbidden: [] },
  tints: [],
};

/* ── 讀寫 ─────────────────────────────────────────────────────── */

export type ParseColorResult = { kind: 'ok'; doc: ColorDoc } | { kind: 'empty' } | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 認得這份 JSON 是不是一張色彩表。
 *
 * 一個任意 JSON（例如舊的 `{"note":"藍色"}`）雖然解析得到，但裡面沒有角色，
 * 硬當成空表就會畫出九行「缺」—— 那是假話：這一份根本不是表。所以形狀不認
 * 就講讀不到，不假裝是「全部缺」。
 */
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

  const shapeOk =
    'roles' in record ||
    'pairs' in record ||
    'order' in record ||
    'tints' in record ||
    'ratios' in record ||
    'contrast_floor' in record;

  if (!shapeOk) {
    return { kind: 'invalid' };
  }

  return { kind: 'ok', doc: COLOR_SCHEMA.normalize(raw) as ColorDoc };
}

/**
 * 存進版本的內容。
 *
 * 刻意**不**縮排：版本列表只拿到內容的頭 160 字元做預覽，每一行兩個空格
 * 等於把預覽的一半用來裝空白。單行之後同樣 160 字元可以帶到幾個角色。
 */
export function serializeColorDoc(doc: ColorDoc): string {
  return JSON.stringify(COLOR_SCHEMA.normalize(doc));
}

/** 這一份表有沒有任何東西。全空就不應該佔一版（後端也會拒收空白內容）。 */
export function hasAnyValue(doc: ColorDoc): boolean {
  return (
    doc.roles.some(
      (role) => role.hex.trim() !== '' || role.cmyk.trim() !== '' || role.dark.trim() !== '',
    ) ||
    doc.order.text.trim() !== '' ||
    doc.ratios.length > 0 ||
    doc.pairs.allowed.length > 0 ||
    doc.pairs.forbidden.length > 0 ||
    doc.tints.length > 0
  );
}

/** 版本列表只拿到截斷內容，抽得出色值就畫色點，抽不到就一個都不畫。 */
export function hexesInText(text: string): string[] {
  const found = text.match(/#[0-9a-fA-F]{6}\b/g) ?? [];

  return Array.from(new Set(found.map((value) => value.toLowerCase())));
}

/* ── 角色 ─────────────────────────────────────────────────────── */

export type RoleEntry = ColorDoc['roles'][number];

export function blankRole(key: string): RoleEntry {
  return {
    id: key,
    group: groupOfRole(key) ?? 'brand',
    name: '',
    hex: '',
    cmyk: '',
    dark: '',
    usage: '',
    reason: '',
  };
}

export function roleEntry(doc: ColorDoc, key: string): RoleEntry {
  return doc.roles.find((role) => role.id === key) ?? blankRole(key);
}

/**
 * 改一個角色的一格。
 *
 * 全部欄位都空了就把這一行刪走：留著一行空殼會令 `color.r1` 以為角色存在
 * 但無值，畫面上又多一行「缺」，而實際上只是有人清空了它。
 */
export function patchRole(
  doc: ColorDoc,
  key: string,
  patch: Partial<Omit<RoleEntry, 'id' | 'group'>>,
): ColorDoc {
  const next: RoleEntry = { ...roleEntry(doc, key), ...patch };
  const blank =
    next.name.trim() === '' &&
    next.hex.trim() === '' &&
    next.cmyk.trim() === '' &&
    next.dark.trim() === '' &&
    next.usage.trim() === '' &&
    next.reason.trim() === '';

  const others = doc.roles.filter((role) => role.id !== key);

  return { ...doc, roles: blank ? others : [...others, next] };
}

/** 這一頁要有值而真的缺了的角色（`color.r1` 的四個）。 */
export function missingRoles(doc: ColorDoc): string[] {
  return MUST_HAVE_ROLES.filter((key) => roleEntry(doc, key).hex.trim() === '');
}

/** 未定的其他角色 —— 不是缺，只是未決定。 */
export function undecidedRoles(doc: ColorDoc): string[] {
  return COLOR_ROLES.filter(
    (role) => role.requiredIn === 'dark' && roleEntry(doc, role.key).hex.trim() === '',
  ).map((role) => role.key);
}

/* ── 對比與替代色 ─────────────────────────────────────────────── */

/** 三碼展開成六碼；不是 HEX 就回 `null`（不打回原值，免得住一個壞字）。 */
export function normalizeHexInput(value: string): string | null {
  const rgb = hexToRgb(value);

  if (rgb === null) {
    return null;
  }

  return toHex(rgb);
}

export function rgbChannels(value: string): string | null {
  const rgb = hexToRgb(value);

  return rgb === null ? null : `${rgb.r} ${rgb.g} ${rgb.b}`;
}

export function pairRatio(doc: ColorDoc, foreground: string, background: string): number | null {
  const fg = roleEntry(doc, foreground).hex;
  const bg = roleEntry(doc, background).hex;

  if (fg.trim() === '' || bg.trim() === '') {
    return null;
  }

  return contrastRatio(fg, bg);
}

/** 一個建議值：哪個色、實測多少、是現有角色還是算出來的新值。 */
export type Alternative = {
  hex: string;
  ratio: number;
  /** 用哪一個現有角色。`null`＝算出來的新值，不是任何現有角色。 */
  role: string | null;
};

function channelText(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));

  return clamped.toString(16).padStart(2, '0');
}

function toHex(channels: { r: number; g: number; b: number }): string {
  return `#${channelText(channels.r)}${channelText(channels.g)}${channelText(channels.b)}`;
}

/**
 * 把一個色沿著「向黑」或「向白」推，直到達到下限。
 *
 * 為什麼只動明度、不動色相：品牌色可以換，色相通常不可以 —— 換掉色相就是
 * 另一個品牌。由原色出發一小步一小步推，取**最近**那個達標的值：改得越少，
 * 越有可能真的被採用。
 */
function pushToFloor(foreground: string, background: string, floor: number): Alternative | null {
  const rgb = hexToRgb(foreground);

  if (rgb === null) {
    return null;
  }

  let best: { alternative: Alternative; distance: number } | null = null;

  for (const target of [0, 255]) {
    for (let step = 1; step <= 100; step += 1) {
      const distance = step / 100;
      const mixed = {
        r: rgb.r + (target - rgb.r) * distance,
        g: rgb.g + (target - rgb.g) * distance,
        b: rgb.b + (target - rgb.b) * distance,
      };
      const hex = toHex(mixed);
      const measured = contrastRatio(hex, background);

      if (measured === null || measured < floor) {
        continue;
      }

      if (best === null || distance < best.distance) {
        best = { alternative: { hex, ratio: measured, role: null }, distance };
      }

      break;
    }
  }

  return best === null ? null : best.alternative;
}

/**
 * 不達標的那一組，有沒有別的色可以用。
 *
 * 次序：先找**現有角色**（同組優先），真的沒有才用算出來的值。理由是「已經
 * 在表上的色」比「一個新色」便宜 —— 新色要再解釋一次為甚麼存在，而品牌色
 * 越少越好用。底色也未定就回 `null`：算不到就講算不到。
 */
export function suggestAlternative(
  doc: ColorDoc,
  foreground: string,
  background: string,
  floor: number,
): Alternative | null {
  const bg = roleEntry(doc, background).hex;

  if (bg.trim() === '' || !isHex(bg)) {
    return null;
  }

  const ownHex = roleEntry(doc, foreground).hex;
  const ownGroup = groupOfRole(foreground);
  let best: Alternative | null = null;
  let bestGap = Number.POSITIVE_INFINITY;

  // 1. 同組的現有角色。同組才是同一個用途：品牌色換成另一個品牌色是換色，
  //    品牌色換成 ink 是換了整個用途。
  // 2. 沒有同組的，就推同一個色的明度 —— 色相留住，改動最少。
  // 3. 連推都推不到（例如下限調到 20:1），才用別組的色，有總好過沒有。
  for (const role of doc.roles) {
    if (role.group !== ownGroup || role.id === foreground || role.hex.trim() === '') {
      continue;
    }

    const measured = contrastRatio(role.hex, bg);

    if (measured === null || measured < floor) {
      continue;
    }

    // 取「剛好夠用」的：用一個 18:1 的色去頂一個只需要 4.5:1 的位置，
    // 畫面上看起來就像換了品牌。
    const gap = measured - floor;

    if (gap < bestGap) {
      best = { hex: role.hex, ratio: measured, role: role.id };
      bestGap = gap;
    }
  }

  if (best !== null) {
    return best;
  }

  const pushed = pushToFloor(ownHex, bg, floor);

  if (pushed !== null) {
    return pushed;
  }

  for (const role of doc.roles) {
    if (role.id === foreground || role.hex.trim() === '') {
      continue;
    }

    const measured = contrastRatio(role.hex, bg);

    if (measured !== null && measured >= floor) {
      return { hex: role.hex, ratio: measured, role: role.id };
    }
  }

  return null;
}

/** 一組配對實測幾比幾，以及它在這一頁算不算達標。 */
export type PairReading = {
  ratio: number | null;
  /** 沒有色值／格式錯／未定義角色 → 算不到，不是「通過」。 */
  state: 'pass' | 'fail' | 'unknown';
  /** 有色值但未填的角色。 */
  missing: string[];
  /** 未定義的角色名。 */
  unknownRoles: string[];
  /** 不達標時的替代色建議。 */
  alternative: Alternative | null;
  /** 這一組的門檻。 */
  floor: number;
};

export function readPair(
  doc: ColorDoc,
  pair: { fg: string; bg: string; use?: 'body' | 'large' },
): PairReading {
  const keys = [pair.fg, pair.bg];
  const unknownRoles = keys.filter((key) => key.trim() !== '' && !isColorRole(key));
  const missing = keys.filter(
    (key) => key.trim() !== '' && isColorRole(key) && roleEntry(doc, key).hex.trim() === '',
  );
  const floor = pair.use === 'large' ? doc.large_floor : doc.contrast_floor;
  const ratio =
    unknownRoles.length > 0 || missing.length > 0 ? null : pairRatio(doc, pair.fg, pair.bg);

  if (ratio === null) {
    return { ratio: null, state: 'unknown', missing, unknownRoles, alternative: null, floor };
  }

  if (ratio >= floor) {
    return { ratio, state: 'pass', missing, unknownRoles, alternative: null, floor };
  }

  return {
    ratio,
    state: 'fail',
    missing,
    unknownRoles,
    alternative: suggestAlternative(doc, pair.fg, pair.bg, floor),
    floor,
  };
}

/** 比例加起來是不是 100。未填任何比例時回 `null`（不是 0）。 */
export function ratioTotal(doc: ColorDoc): number | null {
  const used = doc.ratios.filter((item) => item.role.trim() !== '');

  if (used.length === 0) {
    return null;
  }

  return used.reduce((sum, item) => sum + item.percent, 0);
}

/**
 * 這一頁現在有幾件未完成的事。給「這一頁」面板（#53）的數字。
 *
 * 只數**有規定的**：四個必要角色、內文配對、大字配對、比例合計 100。
 * 「未定品牌次要色」這種不數 —— 那是設計決定，不是缺口；數進去會令數字
 * 永遠大於零，於是沒有人再看它。
 */
export function gapCountOf(doc: ColorDoc): number {
  const missing = missingRoles(doc).length;
  const bodyPairs = doc.pairs.allowed.filter((pair) => pair.use === 'body').length;
  const largePairs = doc.pairs.allowed.filter((pair) => pair.use === 'large').length;
  const total = ratioTotal(doc);

  return (
    missing +
    (bodyPairs === 0 ? 1 : 0) +
    (largePairs === 0 ? 1 : 0) +
    (total !== null && total !== 100 ? 1 : 0)
  );
}

/* ── 給其他頁的轉接 ───────────────────────────────────────────── */

/** 一組色值。`cmyk` 由人填（印刷），RGB 由 HEX 算出來，所以不另存。 */
export type ColorValue = { hex: string; cmyk: string };

/**
 * 其他頁（標誌、主頁、自定義）要的形狀：`{ 角色名: { hex, cmyk } }`。
 *
 * 深色模式沒有另寫一個值，就沿用淺色那個 —— tokens 也是這樣做的（見
 * contracts 的色彩 `tokens()`），所以在這一頁看到的與 renderer 出來的
 * 是同一個結果。
 */
export function valuesOf(doc: ColorDoc, mode: 'light' | 'dark' = 'light'): Record<string, ColorValue> {
  const values: Record<string, ColorValue> = {};

  for (const role of doc.roles) {
    if (role.id === '') {
      continue;
    }

    const hex = mode === 'dark' && role.dark.trim() !== '' ? role.dark : role.hex;

    if (hex.trim() === '' && role.cmyk.trim() === '') {
      continue;
    }

    values[role.id] = { hex, cmyk: role.cmyk };
  }

  return values;
}

/** 可以進標誌的角色：品牌色與閱讀色。功能色是系統在講話，不是品牌的聲音。 */
export function logoEligibleRoles(): readonly ColorRoleSpec[] {
  return COLOR_ROLES.filter((role) => role.group !== 'function');
}

/**
 * 「最少要有」而真的缺了的角色。
 *
 * `mode` 保留是為了舊呼叫者：新形狀只有一張表，深色值只是同一行的一個欄位，
 * 所以兩個模式問「缺什麼」是同一個答案。
 */
export function missingMustHave(doc: ColorDoc, mode: 'light' | 'dark' = 'light'): string[] {
  void mode;

  return missingRoles(doc);
}

/** 三碼展開成六碼；不是 HEX 就回 `null`。舊名保留給既有呼叫者。 */
export const normalizeHex = normalizeHexInput;

/** `ink on paper` → `{ foreground: 'ink', background: 'paper' }`；格式不對回 `null`。 */
export function parsePair(text: string): { foreground: string; background: string } | null {
  const match = /^(\S+)\s+on\s+(\S+)$/.exec(text.trim());

  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }

  return { foreground: match[1], background: match[2] };
}
