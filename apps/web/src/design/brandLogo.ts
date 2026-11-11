/**
 * 品牌標誌的**結構**（issue #36）。
 *
 * 這一頁不是「上載一個 logo」，是這個品牌的標誌系統：五類資產、四種顏色模式、
 * 分模式的最小尺寸、安全範圍、方向與組合、背景、錯誤用法。約束來自
 * `brand_policy_version` 標誌槽的原文：
 *
 *   - 資產只分五類：Logo、Wordmark、Mark、Monogram，以及 App icon 與 favicon
 *     合起來一類。**不是六類**。
 *   - 色值只引用色彩頁的角色：品牌單色 `brand.primary`、單色正 `ink`、
 *     反白 `paper`、深底用深色 `surface`。色彩頁未定那個角色就標成缺，
 *     **不在這一頁補一個色**。
 *   - 最小尺寸由這一頁定、分模式，而且要寫單位：螢幕 px、印刷 mm。
 *   - 主檔要是向量。位圖只作預覽。
 *   - 不重畫已定稿字標、不決定字體家族（家族在字體頁；這一頁只可以引用）。
 *
 * 這四種顏色模式是**標誌的用法**，不是色彩頁的淺色／深色主題切換 —— 兩者
 * 不要混：`onDark` 講的是「把標誌放在深色底上」，引用深色那套的 `surface`。
 */

import { valuesOf, type ColorDoc } from './brandColors';

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

export type LogoAsset = {
  id: string;
  kind: LogoAssetKind;
  name: string;
  /** 主檔：一定要向量。 */
  master: string;
  /** 位圖預覽，可以空。 */
  preview: string;
};

export type LogoModeKey = 'brand' | 'mono' | 'reverse' | 'onDark';

/**
 * 四種顏色模式與其角色。**角色寫死**：這是策略的對應，不是每頁可以另作主張
 * 的選擇。色彩頁負責「那個角色是什麼色」，這一頁負責「標誌在甚麼底上用
 * 哪一個角色」。
 */
export const LOGO_MODES: readonly {
  key: LogoModeKey;
  role: string;
  /** 由色彩頁哪一套取值：深底用深色那一套。 */
  surface: 'light' | 'dark';
}[] = [
  { key: 'brand', role: 'brand.primary', surface: 'light' },
  { key: 'mono', role: 'ink', surface: 'light' },
  { key: 'reverse', role: 'paper', surface: 'light' },
  { key: 'onDark', role: 'surface', surface: 'dark' },
];

export type ModeSpec = {
  /** 螢幕最小尺寸，帶 px。 */
  screen: string;
  /** 印刷最小尺寸，帶 mm。 */
  print: string;
};

export type LogoDoc = {
  assets: LogoAsset[];
  /** 主標誌：資產清單裡的其中一個。 */
  primaryId: string;
  modes: Record<LogoModeKey, ModeSpec>;
  /** 安全範圍 X。 */
  safeArea: string;
  orientation: string;
  backgrounds: string;
  whenToUse: string;
  howToUse: string;
  /** 字標用了哪一個家族（引用字體頁的 id）。不決定家族，只引用。 */
  wordmarkFamilyId: string;
  misuse: string[];
};

export function emptyMode(): ModeSpec {
  return { screen: '', print: '' };
}

export function emptyLogoDoc(): LogoDoc {
  return {
    assets: [],
    primaryId: '',
    modes: {
      brand: emptyMode(),
      mono: emptyMode(),
      reverse: emptyMode(),
      onDark: emptyMode(),
    },
    safeArea: '',
    orientation: '',
    backgrounds: '',
    whenToUse: '',
    howToUse: '',
    wordmarkFamilyId: '',
    misuse: [],
  };
}

export function hasAnyValue(doc: LogoDoc): boolean {
  return (
    doc.assets.length > 0 ||
    doc.primaryId !== '' ||
    doc.safeArea.trim() !== '' ||
    doc.orientation.trim() !== '' ||
    doc.backgrounds.trim() !== '' ||
    doc.whenToUse.trim() !== '' ||
    doc.howToUse.trim() !== '' ||
    doc.misuse.length > 0 ||
    LOGO_MODES.some((mode) => {
      const spec = doc.modes[mode.key];

      return spec.screen !== '' || spec.print !== '';
    })
  );
}

/** 主檔要是向量。副檔名認得的就是向量，其他一律當位圖（．png／．jpg）。 */
export function isVectorFile(path: string): boolean {
  return /\.(svg|ai|eps|pdf)$/i.test(path.trim());
}

export function usedKinds(doc: LogoDoc): LogoAssetKind[] {
  return doc.assets.map((asset) => asset.kind);
}

/** 還可以加的類別。已經有一類就不再列 —— 不是變灰，是不存在。 */
export function availableKinds(doc: LogoDoc): LogoAssetKind[] {
  const used = new Set(usedKinds(doc));

  return ASSET_KINDS.filter((kind) => !used.has(kind));
}

export type AssetGap = 'name' | 'master' | 'vector';

export function assetGaps(asset: LogoAsset): AssetGap[] {
  const gaps: AssetGap[] = [];

  if (asset.name.trim() === '') {
    gaps.push('name');
  }

  if (asset.master.trim() === '') {
    gaps.push('master');
  } else if (!isVectorFile(asset.master)) {
    gaps.push('vector');
  }

  return gaps;
}

/** 螢幕最小尺寸：數字加 px。寫 `24` 或 `24mm` 都不算。 */
export function screenSizeOk(value: string): boolean {
  return /^\d+(\.\d+)?px$/.test(value.trim());
}

/** 印刷最小尺寸：數字加 mm。 */
export function printSizeOk(value: string): boolean {
  return /^\d+(\.\d+)?mm$/.test(value.trim());
}

/**
 * 這個模式在色彩頁有沒有值。
 *
 * 深底（`onDark`）取深色那一套的 `surface` —— 標誌放在深色底上，用的是
 * 深色主題的值，不是淺色主題的同名角色。
 */
export function modeRoleValue(colour: ColorDoc | null, key: LogoModeKey): string | null {
  if (colour === null) {
    return null;
  }

  const mode = LOGO_MODES.find((item) => item.key === key);

  if (mode === undefined) {
    return null;
  }

  const hex = valuesOf(colour, mode.surface)[mode.role]?.hex ?? '';

  return hex === '' ? null : hex;
}

export function primaryAsset(doc: LogoDoc): LogoAsset | null {
  return doc.assets.find((asset) => asset.id === doc.primaryId) ?? null;
}

export type LogoGaps = {
  /** 主標誌未指定（或者指去一個已經不存在的資產）。 */
  primary: boolean;
  /** 有缺的資產 id。 */
  assets: string[];
  /** 尺寸不足或色彩頁未定角色的模式。 */
  modes: LogoModeKey[];
  safeArea: boolean;
  orientation: boolean;
  backgrounds: boolean;
  whenToUse: boolean;
  howToUse: boolean;
  misuse: boolean;
};

export function logoGaps(doc: LogoDoc, colour: ColorDoc | null): LogoGaps {
  return {
    primary: primaryAsset(doc) === null,
    assets: doc.assets.filter((asset) => assetGaps(asset).length > 0).map((asset) => asset.id),
    modes: LOGO_MODES.filter((mode) => {
      const spec = doc.modes[mode.key];

      return (
        !screenSizeOk(spec.screen) ||
        !printSizeOk(spec.print) ||
        modeRoleValue(colour, mode.key) === null
      );
    }).map((mode) => mode.key),
    safeArea: doc.safeArea.trim() === '',
    orientation: doc.orientation.trim() === '',
    backgrounds: doc.backgrounds.trim() === '',
    whenToUse: doc.whenToUse.trim() === '',
    howToUse: doc.howToUse.trim() === '',
    misuse: doc.misuse.length === 0,
  };
}

export function gapCount(gaps: LogoGaps): number {
  return (
    gaps.assets.length +
    gaps.modes.length +
    (gaps.primary ? 1 : 0) +
    (gaps.safeArea ? 1 : 0) +
    (gaps.orientation ? 1 : 0) +
    (gaps.backgrounds ? 1 : 0) +
    (gaps.whenToUse ? 1 : 0) +
    (gaps.howToUse ? 1 : 0) +
    (gaps.misuse ? 1 : 0)
  );
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseLogoResult =
  | { kind: 'ok'; doc: LogoDoc }
  | { kind: 'empty' }
  | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readAssets(raw: unknown): LogoAsset[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const assets: LogoAsset[] = [];
  const used = new Set<LogoAssetKind>();

  for (const item of raw) {
    const entry = asRecord(item);

    if (entry === null) {
      continue;
    }

    const kind = ASSET_KINDS.find((candidate) => candidate === entry.kind);
    const id = text(entry.id);

    if (kind === undefined || id === '' || used.has(kind)) {
      continue;
    }

    used.add(kind);
    assets.push({
      id,
      kind,
      name: text(entry.name),
      master: text(entry.master),
      preview: text(entry.preview),
    });
  }

  return assets.slice(0, MAX_ASSETS);
}

function readMode(raw: unknown): ModeSpec {
  const entry = asRecord(raw);

  if (entry === null) {
    return emptyMode();
  }

  return { screen: text(entry.screen), print: text(entry.print) };
}

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

  // 認得形狀才算標誌表；任意 JSON 硬當成空表就會畫出五個假的「缺」。
  if (!('assets' in record) && !('modes' in record)) {
    return { kind: 'invalid' };
  }

  const modesRaw = asRecord(record.modes);
  const modes = {} as Record<LogoModeKey, ModeSpec>;

  for (const mode of LOGO_MODES) {
    modes[mode.key] = readMode(modesRaw?.[mode.key]);
  }

  const assets = readAssets(record.assets);
  const primaryId = text(record.primaryId);

  return {
    kind: 'ok',
    doc: {
      assets,
      // 指去一個已經不存在的資產：當作未指定，不靜靜指去第一個。
      primaryId: assets.some((asset) => asset.id === primaryId) ? primaryId : '',
      modes,
      safeArea: text(record.safeArea),
      orientation: text(record.orientation),
      backgrounds: text(record.backgrounds),
      whenToUse: text(record.whenToUse),
      howToUse: text(record.howToUse),
      wordmarkFamilyId: text(record.wordmarkFamilyId),
      misuse: Array.isArray(record.misuse)
        ? record.misuse.map((item) => text(item)).filter((item) => item !== '')
        : [],
    },
  };
}

/** 單行，資產排第一：版本列表只拿得到頭 160 字元做預覽。 */
export function serializeLogoDoc(doc: LogoDoc): string {
  return JSON.stringify({
    assets: doc.assets,
    primaryId: doc.primaryId,
    modes: doc.modes,
    safeArea: doc.safeArea,
    orientation: doc.orientation,
    backgrounds: doc.backgrounds,
    whenToUse: doc.whenToUse,
    howToUse: doc.howToUse,
    wordmarkFamilyId: doc.wordmarkFamilyId,
    misuse: doc.misuse,
  });
}

/** 版本預覽：資產名。抽不到就空 —— 不會假裝有。 */
export function assetNamesInText(value: string): string[] {
  const found = value.matchAll(/"name":"([^"]{1,40})"/g);

  return Array.from(
    new Set(Array.from(found, (match) => match[1] ?? '').filter((name) => name !== '')),
  );
}
