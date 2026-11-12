/**
 * 品牌標誌頁的**資料層**（issue #64，取代 #36 的形狀）。
 *
 * 和色彩頁、字體頁一樣，這一支是 `@company-os/contracts` 標誌 payload 的
 * **編輯器轉接層**：存的是同一個 `LogoPayload`，所以 tokens.json、prompt 包、
 * HTML 與這一頁看到的必然是同一份。舊版（#36）自己的形狀（`primaryId`、
 * 每個模式的 px／mm、`safeArea` 一句字）要靠 legacy 換算才可以餵 renderer，
 * 換算一日存在就有一日不同步。
 *
 * 約束（策略標誌槽原文）：
 *   - 資產只分五類：Logo、Wordmark、Mark、Monogram，以及 App icon 與 favicon
 *     合起來一類。**不是六類**。一類一件，所以類別本身就是身份。
 *   - 色值只引用色彩頁的角色名；**功能色不可用於標誌**（`color.r4`）。
 *     色彩頁未定那個角色就標缺，**不在這一頁補一個色**。
 *   - 最小尺寸分螢幕 px 與印刷 mm，兩者不是同一個數（`logo.r2`）。
 *   - 淨空間以 x 定義，而且 x 要講明是甚麼（`logo.r1`）。
 *   - 主檔要是向量。位圖只作預覽。
 *   - 四種顏色模式（品牌單色／單色正／反白／深底）是策略固定的，缺一種
 *     就是缺（`logo.r3`），但**用哪一個角色由這一頁指定** —— 那正是 #62
 *     從色彩頁搬過來的 `logoRoles`。
 */

import { schemaForPage, type LogoPayload } from '@company-os/contracts';
import { COLOR_ROLES, valuesOf, type ColorDoc } from './brandColors';

export type LogoDoc = LogoPayload;

export type LogoAssetKind = 'logo' | 'wordmark' | 'mark' | 'monogram' | 'appicon';

/** 五類，次序固定。App icon 與 favicon 合起來一類，所以這裡沒有第六個。 */
export const ASSET_KINDS: readonly LogoAssetKind[] = [
  'logo',
  'wordmark',
  'mark',
  'monogram',
  'appicon',
];

export const MAX_ASSETS = ASSET_KINDS.length;

export type LogoModeKey = 'brand' | 'mono' | 'reverse' | 'onDark';

/** 四種模式，次序固定。用哪一個色彩角色由這一頁決定，不是寫死。 */
export const LOGO_MODES: readonly LogoModeKey[] = ['brand', 'mono', 'reverse', 'onDark'];

export type LogoAsset = LogoPayload['assets'][number];
export type LogoModeRow = LogoPayload['modes'][number];
export type LogoLockup = LogoPayload['lockups'][number];
export type LogoMisuse = LogoPayload['misuse'][number];

const LOGO_SCHEMA = schemaForPage('logo', 'fixed');

export const EMPTY_DOC: LogoDoc = {
  stance: '',
  logic_line: '',
  assets: [],
  lockups: [],
  construction: '',
  clear_space_x: { x: '', multiples: '', note: '' },
  min_size: { screen_px: 0, print_mm: 0 },
  modes: [],
  backgrounds: '',
  misuse: [],
  master_vector: '',
};

export function emptyLogoDoc(): LogoDoc {
  return {
    ...EMPTY_DOC,
    assets: [],
    lockups: [],
    modes: [],
    misuse: [],
    clear_space_x: { x: '', multiples: '', note: '' },
    min_size: { screen_px: 0, print_mm: 0 },
  };
}

export function emptyAsset(kind: LogoAssetKind): LogoAsset {
  return { class: kind, label: '', file_ref: '', version: '' };
}

export function emptyModeRow(mode: LogoModeKey): LogoModeRow {
  return { mode, color_role: '', note: '' };
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseLogoResult = { kind: 'ok'; doc: LogoDoc } | { kind: 'empty' } | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 認得這份 JSON 是不是一張標誌表。
 *
 * 舊形狀（`modes` 是一個以模式為鍵的物件、`primaryId` 指資產 id）硬讀會
 * 畫出四行「每個模式都缺」的假表，所以形狀不對就講讀不到。
 */
export function parseLogoDoc(value: string): ParseLogoResult {
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

  const looksLikeLogo =
    Array.isArray(record['assets']) ||
    Array.isArray(record['modes']) ||
    'logic_line' in record ||
    'clear_space_x' in record ||
    'min_size' in record;

  // 舊形狀的 modes 是一個物件，新形狀是陣列：留著它只會畫出四行假的缺。
  const modesAreNew = record['modes'] === undefined || Array.isArray(record['modes']);

  if (!looksLikeLogo || !modesAreNew) {
    return { kind: 'invalid' };
  }

  const doc = LOGO_SCHEMA.normalize(raw) as LogoDoc;

  // 一類一件：同類出現兩次不是「兩個主標誌」，是沒有決定。
  const seen = new Set<string>();
  const assets = doc.assets.filter((asset) => {
    if (seen.has(asset.class)) {
      return false;
    }

    seen.add(asset.class);

    return true;
  });

  return { kind: 'ok', doc: { ...doc, assets: assets.slice(0, MAX_ASSETS) } };
}

/** 存進版本的內容：單行，因為版本預覽只有頭 160 字元。 */
export function serializeLogoDoc(doc: LogoDoc): string {
  return JSON.stringify(LOGO_SCHEMA.normalize(doc));
}

export function hasAnyValue(doc: LogoDoc): boolean {
  return (
    doc.logic_line.trim() !== '' ||
    doc.master_vector.trim() !== '' ||
    doc.assets.length > 0 ||
    doc.lockups.length > 0 ||
    doc.construction.trim() !== '' ||
    doc.clear_space_x.x.trim() !== '' ||
    doc.clear_space_x.multiples.trim() !== '' ||
    doc.min_size.screen_px > 0 ||
    doc.min_size.print_mm > 0 ||
    doc.modes.some((mode) => mode.color_role.trim() !== '' || mode.note.trim() !== '') ||
    doc.backgrounds.trim() !== '' ||
    doc.misuse.length > 0
  );
}

/* ── 資產 ─────────────────────────────────────────────────── */

/** 主檔要是向量。副檔名認得的就是向量，其他一律當位圖（．png／．jpg）。 */
export function isVectorFile(path: string): boolean {
  return /\.(svg|ai|eps|pdf)$/i.test(path.trim());
}

export function usedKinds(doc: LogoDoc): string[] {
  return doc.assets.map((asset) => asset.class);
}

/** 還可以加的類別。已經有一類就不再列 —— 不是變灰，是不存在。 */
export function availableKinds(doc: LogoDoc): LogoAssetKind[] {
  const used = new Set(usedKinds(doc));

  return ASSET_KINDS.filter((kind) => !used.has(kind));
}

export type AssetGap = 'label' | 'file' | 'vector';

export function assetGaps(asset: LogoAsset): AssetGap[] {
  const gaps: AssetGap[] = [];

  if (asset.label.trim() === '') {
    gaps.push('label');
  }

  if (asset.file_ref.trim() === '') {
    gaps.push('file');
  } else if (!isVectorFile(asset.file_ref)) {
    gaps.push('vector');
  }

  return gaps;
}

/** 主標誌＝類別為 `logo` 的那一件。不再另存一個 `primaryId`（那是第二份真相）。 */
export function primaryAsset(doc: LogoDoc | null): LogoAsset | null {
  return doc?.assets.find((asset) => asset.class === 'logo') ?? null;
}

/* ── 顏色模式 ─────────────────────────────────────────────── */

export function modeRow(doc: LogoDoc | null, key: LogoModeKey): LogoModeRow {
  return doc?.modes.find((mode) => mode.mode === key) ?? emptyModeRow(key);
}

/** 改一個模式；整行都空了就刪走，不留空殼。 */
export function setMode(
  doc: LogoDoc,
  key: LogoModeKey,
  patch: Partial<Omit<LogoModeRow, 'mode'>>,
): LogoDoc {
  const next = { ...modeRow(doc, key), ...patch };
  const others = doc.modes.filter((mode) => mode.mode !== key);
  const blank = next.color_role.trim() === '' && next.note.trim() === '';

  return { ...doc, modes: blank ? others : [...others, next] };
}

/** 角色是否可用於標誌：一定要是色彩頁的角色，而且不是功能色。 */
export type RoleState = 'ok' | 'unknown' | 'function';

export function roleState(role: string): RoleState {
  const entry = COLOR_ROLES.find((item) => item.key === role);

  if (entry === undefined) {
    return 'unknown';
  }

  // 功能色是「系統在講話」的顏色，不是品牌的聲音（color.r4）。
  return entry.group === 'function' ? 'function' : 'ok';
}

/**
 * 這個模式在色彩頁有沒有值。
 *
 * 深底（`onDark`）取深色那一套 —— 標誌放在深色底上，用的是深色主題的值，
 * 不是淺色主題的同名角色。
 */
export function modeRoleValue(
  colour: ColorDoc | null,
  key: LogoModeKey,
  doc: LogoDoc | null,
): string | null {
  if (colour === null) {
    return null;
  }

  const role = modeRow(doc, key).color_role;

  if (role === '') {
    return null;
  }

  const hex = valuesOf(colour, key === 'onDark' ? 'dark' : 'light')[role]?.hex ?? '';

  return hex === '' ? null : hex;
}

/* ── 最小尺寸 ─────────────────────────────────────────────── */

/** 螢幕最小尺寸：數字加 px。寫 `24` 或 `24mm` 都不算。 */
export function screenSizeOk(value: string): boolean {
  return /^\d+(\.\d+)?px$/.test(value.trim());
}

/** 印刷最小尺寸：數字加 mm。 */
export function printSizeOk(value: string): boolean {
  return /^\d+(\.\d+)?mm$/.test(value.trim());
}

/* ── 缺口 ─────────────────────────────────────────────────── */

export type LogoGaps = {
  /** 有缺的資產類別。 */
  assets: LogoAssetKind[];
  /** 沒有一件類別是 logo 的資產：主標誌不存在。 */
  primary: boolean;
  /** 缺少、或者引用了不存在／功能色的模式。 */
  modes: LogoModeKey[];
  /** 淨空間未寫齊（倍數或 x 未定義）。 */
  space: boolean;
  /** 螢幕與印刷兩個下限未寫齊，或者寫了同一個數。 */
  size: boolean;
  backgrounds: boolean;
  logic: boolean;
};

export function logoGaps(doc: LogoDoc): LogoGaps {
  const space = doc.clear_space_x.multiples.trim() === '' || doc.clear_space_x.x.trim() === '';

  const size =
    doc.min_size.screen_px <= 0 ||
    doc.min_size.print_mm <= 0 ||
    doc.min_size.screen_px === doc.min_size.print_mm;

  return {
    assets: ASSET_KINDS.filter((kind) => {
      const asset = doc.assets.find((item) => item.class === kind);

      return asset !== undefined && assetGaps(asset).length > 0;
    }),
    primary: primaryAsset(doc) === null,
    modes: LOGO_MODES.filter((key) => {
      const role = modeRow(doc, key).color_role;

      return role === '' || roleState(role) !== 'ok';
    }),
    space,
    size,
    backgrounds: doc.backgrounds.trim() === '',
    logic: doc.logic_line.trim() === '',
  };
}

export function gapCount(gaps: LogoGaps): number {
  return (
    gaps.assets.length +
    gaps.modes.length +
    (gaps.primary ? 1 : 0) +
    (gaps.space ? 1 : 0) +
    (gaps.size ? 1 : 0) +
    (gaps.backgrounds ? 1 : 0) +
    (gaps.logic ? 1 : 0)
  );
}

/**
 * 版本預覽抽資產名：那一版有哪幾件。
 *
 * 用 `new RegExp` 而不用字面量：模式裡的引號數目是單數，寫成字面量會令
 * i18n 守門的字元掃描器以為字串未收尾。
 */
const LABEL_PATTERN = new RegExp('"label":"([^"]{1,40})"', 'g');

export function assetNamesInText(value: string): string[] {
  const found = value.matchAll(LABEL_PATTERN);

  return Array.from(new Set(Array.from(found, (match) => match[1] ?? '').filter((name) => name !== '')));
}
