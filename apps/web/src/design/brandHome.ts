/**
 * 品牌主頁的**資料層**（issue #67，取代 #39 的形狀）。
 *
 * 主頁是這個品牌的立場與系統總覽，**不是索引**。它自己只擁有幾件事：立場句、
 * 一句話說自己是誰、三到五個關鍵詞、以及**版面決定**（用哪幾塊、先後、重點、
 * 為咩）。其餘全部是**引用**：用色順序引用色彩頁的角色名、標誌預設引用標誌頁
 * 的模式、字體分工引用字體頁的家族、語氣樣本引用語氣頁的句子、專屬系統引用
 * 自定義頁的入口。
 *
 * 所以這一頁存不到色值、家族、標誌規則或語氣文案 —— 存了就是第二套識別，而
 * 第二套識別一定會漂移。每一個引用都帶「來源頁 + 當時版本」，這是驗收第一條
 * （任何色值、字體、標誌規則都能追溯到來源頁）的實作方式。
 *
 * 舊形狀（#39：`intro` ＋ `logoMode`）與 `HomePayload` 完全對不上：主頁存的
 * 東西 prompt 與 renderer 都讀不到。所以舊形狀判 invalid，並講明讀不到。
 */

import {
  BRAND_BLOCK_KINDS,
  schemaForPage,
  type BrandBlockKind,
  type HomePayload,
} from '@company-os/contracts';
import type { BrandPageSummary } from '../api';
import { COLOR_ROLES, valuesOf, type ColorDoc } from './brandColors';
import { LOGO_MODES, modeRoleValue, modeRow, primaryAsset, type LogoDoc, type LogoModeKey } from './brandLogo';
import { TYPE_ROLES, familyUsable, type TypeDoc, type TypeRoleKey } from './brandType';
import type { ToneDoc } from './brandTone';

export type HomeDoc = HomePayload;

export type HomeLayoutRow = HomePayload['layout'][number];

export type HomeSystem = HomePayload['systems'][number];

/** 關鍵詞三到五個。少過三個講不清，多過五個記不住。 */
export const KEYWORD_MIN = 3;
export const KEYWORD_MAX = 5;

/** 版面可以用哪幾種區塊。與 renderer 的九種一字不差 —— 不另開一套詞彙。 */
export const LAYOUT_BLOCKS: readonly BrandBlockKind[] = BRAND_BLOCK_KINDS;

const HOME_SCHEMA = schemaForPage('home', 'fixed');

export const EMPTY_DOC: HomeDoc = {
  stance: '',
  who: '',
  keywords: [],
  color_order: { roles: [], note: '' },
  logo_default: '',
  type_split: { serif: '', sans: '', note: '' },
  voice_samples: [],
  systems: [],
  layout: [],
};

export function emptyHomeDoc(): HomeDoc {
  return {
    ...EMPTY_DOC,
    keywords: [],
    color_order: { roles: [], note: '' },
    type_split: { serif: '', sans: '', note: '' },
    voice_samples: [],
    systems: [],
    layout: [],
  };
}

export function emptyLayoutRow(): HomeLayoutRow {
  return { block: 'section', source: '', emphasis: 'normal', reason: '' };
}

export function emptySystem(): HomeSystem {
  return { name: '', note: '', refs: [] };
}

export function hasAnyValue(doc: HomeDoc): boolean {
  return (
    doc.stance.trim() !== '' ||
    doc.who.trim() !== '' ||
    doc.keywords.length > 0 ||
    doc.color_order.roles.length > 0 ||
    doc.color_order.note.trim() !== '' ||
    doc.logo_default !== '' ||
    doc.type_split.serif.trim() !== '' ||
    doc.type_split.sans.trim() !== '' ||
    doc.type_split.note.trim() !== '' ||
    doc.voice_samples.length > 0 ||
    doc.systems.length > 0 ||
    doc.layout.length > 0
  );
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseHomeResult = { kind: 'ok'; doc: HomeDoc } | { kind: 'empty' } | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 認得這份 JSON 是不是一張主頁表。
 *
 * 舊形狀（`intro`／`logoMode`）硬讀的話，立場句、關鍵詞、版面全部畫成「缺」，
 * 而畫面看起來像已經檢查過。所以認不到就講認不到。
 */
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

  if (record === null) {
    return { kind: 'invalid' };
  }

  const legacy = 'intro' in record || 'logoMode' in record;

  const v2 =
    !legacy &&
    ('who' in record ||
      'keywords' in record ||
      'color_order' in record ||
      'type_split' in record ||
      'voice_samples' in record ||
      'layout' in record);

  if (!v2) {
    return { kind: 'invalid' };
  }

  return { kind: 'ok', doc: HOME_SCHEMA.normalize(raw) as HomeDoc };
}

/** 單行，立場排第一：版本列表只拿得到頭 160 字元做預覽。 */
export function serializeHomeDoc(doc: HomeDoc): string {
  return JSON.stringify(HOME_SCHEMA.normalize(doc));
}

/** 版本預覽：先「是誰」，再立場句。抽不到就空 —— 不會假裝有。 */
export function whoInText(value: string): string {
  const who = /"who":"([^"\\]{1,80})/.exec(value);

  if (who?.[1] !== undefined && who[1].trim() !== '') {
    return who[1].trim();
  }

  const stance = /"stance":"([^"\\]{1,80})/.exec(value);

  return stance?.[1]?.trim() ?? '';
}

/* ── 這一頁的入口清單 ─────────────────────────────────────── */

export type PageRow = {
  key: string;
  name: string;
  kind: 'fixed' | 'custom';
  href: string;
  hasCurrent: boolean;
  /** 現行版本號。未有一版就是 null。 */
  versionNo: number | null;
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
      href: page.kind === 'custom' ? `#/design/brand/p/${page.key}` : `#/design/brand/${page.key}`,
      hasCurrent: page.current !== null,
      versionNo: page.current?.versionNo ?? null,
    }));
}

/* ── 四塊樣本（引用來源頁，不複製） ───────────────────────── */

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

/** 語氣短例：拿第一個特質的示範句。形容詞不是句子，所以不拿。 */
export function toneSample(tone: ToneDoc | null): string {
  if (tone === null) {
    return '';
  }

  const fromTrait = tone.traits.find((trait) => trait.sentence.trim() !== '');

  if (fromTrait !== undefined) {
    return fromTrait.sentence.trim();
  }

  const fromContext = Object.values(tone.contexts).find((value) => value.trim() !== '');

  return fromContext?.trim() ?? '';
}

export type LogoUsage = {
  assetName: string;
  role: string;
  hex: string | null;
  screen: string;
  print: string;
};

/** 標誌的預設用法：主標誌 ＋ 揀了的那個模式 ＋ 它指定的色彩角色與最小尺寸。 */
export function logoUsage(
  logo: LogoDoc | null,
  mode: '' | LogoModeKey,
  colour: ColorDoc | null,
): LogoUsage | null {
  if (logo === null || mode === '' || !LOGO_MODES.includes(mode)) {
    return null;
  }

  const screen = logo.min_size.screen_px > 0 ? `${logo.min_size.screen_px}px` : '';
  const print = logo.min_size.print_mm > 0 ? `${logo.min_size.print_mm}mm` : '';

  return {
    assetName: primaryAsset(logo)?.label ?? '',
    role: modeRow(logo, mode).color_role,
    hex: modeRoleValue(colour, mode, logo),
    screen,
    print,
  };
}

/* ── 版面 ─────────────────────────────────────────────────── */

export function addLayout(doc: HomeDoc): HomeDoc {
  return { ...doc, layout: [...doc.layout, emptyLayoutRow()] };
}

export function removeLayout(doc: HomeDoc, index: number): HomeDoc {
  return { ...doc, layout: doc.layout.filter((_, at) => at !== index) };
}

export function setLayout(doc: HomeDoc, index: number, patch: Partial<HomeLayoutRow>): HomeDoc {
  return {
    ...doc,
    layout: doc.layout.map((row, at) => (at === index ? { ...row, ...patch } : row)),
  };
}

/**
 * 上移／下移一塊。
 *
 * 次序就是這一頁的判斷本身，所以一定要改得到；改完要靠 `reason` 講為咩。
 * 移到頭或尾就原樣交回，不會把第一塊捲到最後。
 */
export function moveLayout(doc: HomeDoc, index: number, delta: -1 | 1): HomeDoc {
  const target = index + delta;

  if (index < 0 || index >= doc.layout.length || target < 0 || target >= doc.layout.length) {
    return doc;
  }

  const next = doc.layout.slice();
  const [row] = next.splice(index, 1);

  if (row === undefined) {
    return doc;
  }

  next.splice(target, 0, row);

  return { ...doc, layout: next };
}

/** 一個 layout 最多一個 `lead`：全部都是重點等於沒有重點。 */
export function setEmphasis(doc: HomeDoc, index: number): HomeDoc {
  return {
    ...doc,
    layout: doc.layout.map((row, at) => ({ ...row, emphasis: at === index ? 'lead' : 'normal' })),
  };
}

/* ── 清單 ─────────────────────────────────────────────────── */

export function addKeyword(doc: HomeDoc, word: string): HomeDoc {
  const value = word.trim();

  if (value === '' || doc.keywords.includes(value) || doc.keywords.length >= KEYWORD_MAX) {
    return doc;
  }

  return { ...doc, keywords: [...doc.keywords, value] };
}

export function removeKeyword(doc: HomeDoc, index: number): HomeDoc {
  return { ...doc, keywords: doc.keywords.filter((_, at) => at !== index) };
}

export function addVoiceSample(doc: HomeDoc, line: string): HomeDoc {
  const value = line.trim();

  if (value === '' || doc.voice_samples.includes(value)) {
    return doc;
  }

  return { ...doc, voice_samples: [...doc.voice_samples, value] };
}

export function removeVoiceSample(doc: HomeDoc, index: number): HomeDoc {
  return { ...doc, voice_samples: doc.voice_samples.filter((_, at) => at !== index) };
}

export function addSystem(doc: HomeDoc): HomeDoc {
  return { ...doc, systems: [...doc.systems, emptySystem()] };
}

export function setSystem(doc: HomeDoc, index: number, patch: Partial<HomeSystem>): HomeDoc {
  return { ...doc, systems: doc.systems.map((row, at) => (at === index ? { ...row, ...patch } : row)) };
}

export function removeSystem(doc: HomeDoc, index: number): HomeDoc {
  return { ...doc, systems: doc.systems.filter((_, at) => at !== index) };
}

/* ── 引用：每一條都要追得回來源頁 ─────────────────────────── */

export type RefState = 'ok' | 'missing-page' | 'unknown' | 'missing-value';

/** 引用來自哪一頁。存 key 不存中文：字面文案由 i18n 給，資料層不寫介面文字。 */
export type RefPage = 'color' | 'logo' | 'type' | 'tone';

export type HomeRef = {
  /** 引用的是哪一個東西（角色名／資產名／層級名／頁名）。 */
  item: string;
  /** 人讀得明的名稱。 */
  label: string;
  /** 來源頁的 key（色彩／字體／標誌／語氣）。 */
  page: RefPage;
  /** 來源頁當時的版本號。未有一版就是 null。 */
  version: number | null;
  state: RefState;
};

export type RefInput = {
  colour: ColorDoc | null;
  colourVersion: number | null;
  type: TypeDoc | null;
  typeVersion: number | null;
  logo: LogoDoc | null;
  logoVersion: number | null;
  tone: ToneDoc | null;
  toneVersion: number | null;
};

/** 用色順序的每一角色追回色彩頁：未有一版、認不到、未定值，三種都分開講。 */
export function colourRefs(doc: HomeDoc, input: RefInput): HomeRef[] {
  return doc.color_order.roles.map((role) => {
    const known = COLOR_ROLES.some((entry) => entry.key === role);

    if (input.colour === null) {
      return { item: role, label: role, page: 'color', version: input.colourVersion, state: 'missing-page' };
    }

    if (!known) {
      return { item: role, label: role, page: 'color', version: input.colourVersion, state: 'unknown' };
    }

    const hex = (valuesOf(input.colour, 'light')[role]?.hex ?? '').trim();

    return {
      item: role,
      label: role,
      page: 'color',
      version: input.colourVersion,
      state: hex === '' ? 'missing-value' : 'ok',
    };
  });
}

/** 標誌預設：引用的是模式，而模式要指向一件真的主標誌。 */
export function logoRef(doc: HomeDoc, input: RefInput): HomeRef | null {
  if (doc.logo_default === '') {
    return null;
  }

  if (input.logo === null) {
    return { item: doc.logo_default, label: doc.logo_default, page: 'logo', version: input.logoVersion, state: 'missing-page' };
  }

  const known = LOGO_MODES.includes(doc.logo_default as LogoModeKey);

  if (!known) {
    return { item: doc.logo_default, label: doc.logo_default, page: 'logo', version: input.logoVersion, state: 'unknown' };
  }

  const usable = primaryAsset(input.logo) !== null && modeRow(input.logo, doc.logo_default as LogoModeKey).color_role !== '';

  return {
    item: doc.logo_default,
    label: doc.logo_default,
    page: 'logo',
    version: input.logoVersion,
    state: usable ? 'ok' : 'missing-value',
  };
}

/** 字體分工的兩個名字要對得上字體頁的家族（而且那個家族要可用）。 */
export function typeRefs(doc: HomeDoc, input: RefInput): HomeRef[] {
  const wanted: { name: string; item: string }[] = [
    { name: doc.type_split.serif, item: 'serif' },
    { name: doc.type_split.sans, item: 'sans' },
  ];

  return wanted
    .filter((entry) => entry.name.trim() !== '')
    .map((entry) => {
      if (input.type === null) {
        return { item: entry.item, label: entry.name, page: 'type', version: input.typeVersion, state: 'missing-page' as const };
      }

      const family = input.type.families.find((row) => row.name === entry.name.trim());

      if (family === undefined) {
        return { item: entry.item, label: entry.name, page: 'type', version: input.typeVersion, state: 'unknown' as const };
      }

      return {
        item: entry.item,
        label: entry.name,
        page: 'type',
        version: input.typeVersion,
        state: familyUsable(family) ? ('ok' as const) : ('missing-value' as const),
      };
    });
}

/** 語氣樣本：每一句要真的在語氣頁的樣本裡，而不是在這裡另寫一句。 */
export function voiceRefs(doc: HomeDoc, input: RefInput): HomeRef[] {
  const lines = [...(input.tone?.samples.like ?? []), ...(input.tone?.samples.unlike ?? [])];

  return doc.voice_samples.map((line) => {
    if (input.tone === null) {
      return { item: line, label: line, page: 'tone', version: input.toneVersion, state: 'missing-page' };
    }

    return {
      item: line,
      label: line,
      page: 'tone',
      version: input.toneVersion,
      state: lines.includes(line.trim()) ? 'ok' : 'unknown',
    };
  });
}

/** 所有引用一次過：畫面的「引用」那一段與缺口都用同一份。 */
export function homeRefs(doc: HomeDoc, input: RefInput): HomeRef[] {
  const logo = logoRef(doc, input);

  return [
    ...colourRefs(doc, input),
    ...(logo === null ? [] : [logo]),
    ...typeRefs(doc, input),
    ...voiceRefs(doc, input),
  ];
}

/* ── 缺什麼 ───────────────────────────────────────────────── */

export type KeywordGap = 'empty' | 'tooFew' | 'tooMany' | null;

export type HomeGaps = {
  stance: boolean;
  who: boolean;
  keywords: KeywordGap;
  colorOrder: boolean;
  logoDefault: boolean;
  typeSplit: boolean;
  voiceSamples: boolean;
  /** 未寫理由的版面區塊（索引）。 */
  layoutReasons: number[];
  /** 一塊版面都未有：等於用回模板。 */
  layout: boolean;
  /** 引用的東西追不回來源頁（`homeRefs` 的非 ok）。 */
  refs: HomeRef[];
  /** 未有現行版本的頁名。 */
  pages: string[];
  /** 語氣頁未有現行版本。 */
  tone: boolean;
};

export type HomeGapInput = RefInput & {
  doc: HomeDoc;
  pages: BrandPageSummary[];
};

export function homeGaps(input: HomeGapInput): HomeGaps {
  const count = input.doc.keywords.length;
  const keywords: KeywordGap =
    count === 0 ? 'empty' : count < KEYWORD_MIN ? 'tooFew' : count > KEYWORD_MAX ? 'tooMany' : null;

  return {
    stance: input.doc.stance.trim() === '',
    who: input.doc.who.trim() === '',
    keywords,
    colorOrder: input.doc.color_order.roles.length === 0,
    logoDefault: input.doc.logo_default === '',
    typeSplit: input.doc.type_split.serif.trim() === '' || input.doc.type_split.sans.trim() === '',
    voiceSamples: input.doc.voice_samples.length === 0,
    layoutReasons: input.doc.layout.reduce<number[]>((found, row, index) => {
      return row.reason.trim() === '' ? [...found, index] : found;
    }, []),
    layout: input.doc.layout.length === 0,
    refs: homeRefs(input.doc, input).filter((ref) => ref.state !== 'ok'),
    pages: pageRows(input.pages)
      .filter((row) => !row.hasCurrent)
      .map((row) => row.name),
    tone: input.tone === null,
  };
}

export function gapCount(gaps: HomeGaps): number {
  return (
    gaps.layoutReasons.length +
    gaps.refs.length +
    gaps.pages.length +
    (gaps.stance ? 1 : 0) +
    (gaps.who ? 1 : 0) +
    (gaps.keywords === null ? 0 : 1) +
    (gaps.colorOrder ? 1 : 0) +
    (gaps.logoDefault ? 1 : 0) +
    (gaps.typeSplit ? 1 : 0) +
    (gaps.voiceSamples ? 1 : 0) +
    (gaps.layout ? 1 : 0) +
    (gaps.tone ? 1 : 0)
  );
}
