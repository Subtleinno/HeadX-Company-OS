/**
 * 品牌主頁的**結構**（issue #39）。
 *
 * 主頁是集大成，不是第二套識別：它自己只決定兩件事 ——
 *
 *   1. 這個品牌是誰（一段人寫的字）。
 *   2. 標誌預設用哪一個顏色模式（引用 #36 的四個模式，不另立一套）。
 *
 * 其餘四塊全部是**即時由來源頁砌出來的樣本**：色彩角色的樣本來自色彩頁、
 * 字體層級的樣本來自字體頁、語氣短例來自語氣頁、標誌用法來自標誌頁，入口
 * 清單來自後端推出來的頁清單（`#32`，零到多張自定義頁）。
 *
 * 所以這一頁不存色值、不存家族、不存語氣文案、不存頁清單 —— 存了就是第二套
 * 識別，而第二套識別一定會漂移。缺就標缺（`homeGaps`），不畫假色假字。
 */

import type { BrandPageSummary } from '../api';
import { COLOR_ROLES, valuesOf, type ColorDoc } from './brandColors';
import { LOGO_MODES, modeRoleValue, primaryAsset, type LogoDoc, type LogoModeKey } from './brandLogo';
import { TYPE_ROLES, familyUsable, type TypeDoc, type TypeRoleKey } from './brandType';
import type { ToneDoc } from './brandTone';

/** 「這個品牌是誰」少於這個字數就當寫得太短：一段講得清自己是誰，通常過二十字。 */
export const INTRO_MIN_CHARS = 20;

export function emptyHomeDoc(): { intro: string; logoMode: '' } {
  return { intro: '', logoMode: '' };
}

export type HomeDoc = {
  /** 這個品牌是誰：一段人寫的字，主頁唯一真正自己擁有的內容。 */
  intro: string;
  /** 標誌預設用哪個模式：引用 LOGO_MODES 的 key。空＝未揀。 */
  logoMode: '' | LogoModeKey;
};

export function hasAnyValue(doc: HomeDoc): boolean {
  return doc.intro.trim() !== '' || doc.logoMode !== '';
}

export type IntroState = 'ok' | 'empty' | 'short';

export function introState(intro: string): IntroState {
  const value = intro.trim();

  if (value === '') {
    return 'empty';
  }

  return value.length < INTRO_MIN_CHARS ? 'short' : 'ok';
}

/* ── 這一頁的入口清單 ─────────────────────────────────────── */

export type PageRow = {
  key: string;
  name: string;
  kind: 'fixed' | 'custom';
  href: string;
  hasCurrent: boolean;
};

/**
 * 每一個現行頁一條入口。
 *
 * **清單由後端來**：自定義頁零到多張，所以不可以寫死，也不可以把「自定義頁」
 * 當成單一條目 —— 三張自定義頁就是三條入口。主頁自己不列入（它現在就在你面前）。
 */
export function pageRows(pages: BrandPageSummary[]): PageRow[] {
  return pages
    .filter((page) => !(page.kind === 'fixed' && page.key === 'home'))
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((page) => ({
      key: page.key,
      name: page.name,
      kind: page.kind,
      href:
        page.kind === 'custom'
          ? `#/design/brand/p/${page.key}`
          : `#/design/brand/${page.key}`,
      hasCurrent: page.current !== null,
    }));
}

/* ── 四塊樣本 ─────────────────────────────────────────────── */

export type Swatch = { role: string; hex: string; cmyk: string };

/** 色彩頁有 HEX 的角色才有樣本。沒有 HEX 就是沒有螢幕上的色，不填近似值。 */
export function colourSwatches(colour: ColorDoc | null, mode: 'light' | 'dark'): Swatch[] {
  if (colour === null) {
    return [];
  }

  const values = valuesOf(colour, mode);

  return COLOR_ROLES.map((role) => ({
    role: role.key,
    hex: (values[role.key]?.hex ?? '').trim(),
    cmyk: (values[role.key]?.cmyk ?? '').trim(),
  })).filter((item) => item.hex !== '');
}

export type TypeRow = {
  role: TypeRoleKey;
  familyName: string;
  size: string;
  weight: string;
  leading: string;
  colourRole: string;
  /** 文字顏色在色彩頁的值：未定就是 null，樣本不畫假色。 */
  colourHex: string | null;
};

export type TypeSample = { rows: TypeRow[]; gaps: TypeRoleKey[] };

/** 四個層級逐個列出：家族名、尺寸、字重；未指定（或家族不齊）的層級列進 gaps。 */
export function typeRows(type: TypeDoc | null, colour: ColorDoc | null): TypeSample {
  const light = colour === null ? {} : valuesOf(colour, 'light');

  const rows = TYPE_ROLES.map((role) => {
    const spec = (type?.roles ?? []).find((row) => row.role === role);
    const family = type?.families.find((item) => item.id === (spec?.family ?? '')) ?? null;
    const colourRole = spec?.color_role ?? '';

    return {
      role,
      // 家族存在但缺授權或缺可嵌入檔，一樣不算有字 —— 否則樣本就排不出真字。
      familyName: family !== null && familyUsable(family) ? family.name : '',
      size: spec?.size ?? '',
      weight: spec?.weight ?? '',
      leading: spec?.leading ?? '',
      colourRole,
      colourHex: ((light[colourRole]?.hex ?? '').trim() || null) as string | null,
    };
  });

  return { rows, gaps: rows.filter((row) => row.familyName === '').map((row) => row.role) };
}

/** 語氣短例：拿第一個特質的「做的句子」。形容詞不是句子，所以不拿。 */
export function toneSample(tone: ToneDoc | null): string {
  if (tone === null) {
    return '';
  }

  const fromTrait = tone.traits.find((trait) => trait.doesExample.trim() !== '');

  if (fromTrait !== undefined) {
    return fromTrait.doesExample.trim();
  }

  const fromSituation = Object.values(tone.situations).find((value) => value.trim() !== '');

  return fromSituation?.trim() ?? '';
}

export type LogoUsage = {
  assetName: string;
  role: string;
  hex: string | null;
  screen: string;
  print: string;
};

/** 標誌的預設用法：主標誌 ＋ 揀了的那個模式 ＋ 它對應的色彩角色與最小尺寸。 */
export function logoUsage(
  logo: LogoDoc | null,
  mode: '' | LogoModeKey,
  colour: ColorDoc | null,
): LogoUsage | null {
  if (logo === null || mode === '') {
    return null;
  }

  const spec = LOGO_MODES.find((item) => item.key === mode);

  if (spec === undefined) {
    return null;
  }

  return {
    assetName: primaryAsset(logo)?.name ?? '',
    role: spec.role,
    hex: modeRoleValue(colour, mode),
    screen: (logo.modes[mode]?.screen ?? '').trim(),
    print: (logo.modes[mode]?.print ?? '').trim(),
  };
}

/* ── 缺什麼 ───────────────────────────────────────────────── */

export type LogoGap = 'page' | 'assets' | 'primary' | 'modeValue';

export type HomeGaps = {
  /** 這個品牌是誰：未寫或者太短。 */
  intro: 'empty' | 'short' | null;
  /** 未揀標誌預設模式。 */
  logoMode: boolean;
  /** 標誌那一塊缺什麼。 */
  logo: LogoGap[];
  /** 色彩頁未定值的角色名（淺色那套）。 */
  colour: string[];
  /** 字體頁未指定家族的層級名。 */
  type: string[];
  /** 語氣頁未有現行版本。 */
  tone: boolean;
  /** 未有現行版本的頁名。 */
  pages: string[];
};

export type HomeGapInput = {
  doc: HomeDoc;
  colour: ColorDoc | null;
  type: TypeDoc | null;
  logo: LogoDoc | null;
  tone: ToneDoc | null;
  pages: BrandPageSummary[];
};

export function homeGaps(input: HomeGapInput): HomeGaps {
  const intro = introState(input.doc.intro);

  const logo: LogoGap[] = [];

  if (input.logo === null) {
    logo.push('page');
  } else {
    if (input.logo.assets.length === 0) {
      logo.push('assets');
    } else if (primaryAsset(input.logo) === null) {
      logo.push('primary');
    }

    if (
      input.doc.logoMode !== '' &&
      input.logo.assets.length > 0 &&
      modeRoleValue(input.colour, input.doc.logoMode) === null
    ) {
      logo.push('modeValue');
    }
  }

  const colour =
    input.colour === null
      ? COLOR_ROLES.map((role) => role.key)
      : COLOR_ROLES.map((role) => ({
          role: role.key,
          hex: (valuesOf(input.colour as ColorDoc, 'light')[role.key]?.hex ?? '').trim(),
        }))
          .filter((item) => item.hex === '')
          .map((item) => item.role);

  return {
    intro: intro === 'ok' ? null : intro,
    logoMode: input.doc.logoMode === '',
    logo,
    colour,
    type: typeRows(input.type, input.colour).gaps,
    tone: input.tone === null,
    pages: pageRows(input.pages)
      .filter((row) => !row.hasCurrent)
      .map((row) => row.name),
  };
}

export function gapCount(gaps: HomeGaps): number {
  return (
    gaps.colour.length +
    gaps.type.length +
    gaps.logo.length +
    gaps.pages.length +
    (gaps.intro === null ? 0 : 1) +
    (gaps.logoMode ? 1 : 0) +
    (gaps.tone ? 1 : 0)
  );
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseHomeResult = { kind: 'ok'; doc: HomeDoc } | { kind: 'empty' } | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function knownMode(value: unknown): '' | LogoModeKey {
  const key = text(value);

  return LOGO_MODES.some((mode) => mode.key === key) ? (key as LogoModeKey) : '';
}

export function parseHomeDoc(value: string): ParseHomeResult {
  if (value.trim() === '') {
    return { kind: 'empty' };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(value);
  } catch {
    return { kind: 'invalid' };
  }

  const record = asRecord(raw);

  if (record === null || !('intro' in record)) {
    return { kind: 'invalid' };
  }

  return { kind: 'ok', doc: { intro: text(record.intro), logoMode: knownMode(record.logoMode) } };
}

/** 單行，intro 排第一：版本列表只拿得到頭 160 字元做預覽。 */
export function serializeHomeDoc(doc: HomeDoc): string {
  return JSON.stringify({ intro: doc.intro, logoMode: doc.logoMode });
}

/** 版本預覽：第一句。抽不到就空 —— 不會假裝有。 */
export function introInText(value: string): string {
  const match = /"intro":"([^"\\]{1,80})/.exec(value);

  return match?.[1]?.trim() ?? '';
}
