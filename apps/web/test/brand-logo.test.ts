import { describe, expect, it } from 'vitest';
import type { ColorDoc } from '../src/design/brandColors';
import {
  ASSET_KINDS,
  LOGO_MODES,
  MAX_ASSETS,
  assetGaps,
  assetNamesInText,
  availableKinds,
  emptyLogoDoc,
  gapCount,
  hasAnyValue,
  isVectorFile,
  logoGaps,
  modeRoleValue,
  parseLogoDoc,
  primaryAsset,
  printSizeOk,
  screenSizeOk,
  serializeLogoDoc,
  type LogoAsset,
  type LogoDoc,
} from '../src/design/brandLogo';

/**
 * 標誌頁的規則（issue #36）。畫面的測試在 `design-brand-logo.test.tsx`。
 *
 * 這一支只管**約束對不對**：五類封頂、主檔要向量、尺寸分螢幕與印刷而且要
 * 帶單位、色值只由色彩頁來（深底取深色那一套）。這些規則如果只寫在畫面裡，
 * 品牌主頁（#41）就沒有同一個標準可依。
 */

const LOGO: LogoAsset = {
  id: 'a-logo',
  kind: 'logo',
  name: '主標誌（橫式）',
  master: 'brand/logo/moonic-logo.svg',
  preview: 'brand/logo/moonic-logo.png',
};

const WORDMARK: LogoAsset = {
  id: 'a-wordmark',
  kind: 'wordmark',
  name: 'Moonic 字標',
  master: 'brand/logo/moonic-wordmark.ai',
  preview: '',
};

const DOC: LogoDoc = {
  assets: [LOGO, WORDMARK],
  primaryId: 'a-logo',
  modes: {
    brand: { screen: '24px', print: '8mm' },
    mono: { screen: '24px', print: '8mm' },
    reverse: { screen: '24px', print: '8mm' },
    onDark: { screen: '24px', print: '8mm' },
  },
  safeArea: '0.5X（X 為 mark 的高度）',
  orientation: '橫式為主；窄於 320px 用直式',
  backgrounds: '深色底用深色 surface',
  whenToUse: '對外一律用主標誌；只有 square 位用 mark',
  howToUse: '四周留 0.5X',
  wordmarkFamilyId: '',
  misuse: ['不拉長、不壓扁'],
};

const COLOUR: ColorDoc = {
  light: {
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    ink: { hex: '#191919', cmyk: '0 0 0 90' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
  },
  dark: { surface: { hex: '#17171d', cmyk: '0 0 0 90' } },
  ramps: {},
  allowed: [],
  denied: [],
  logoRoles: ['brand.primary'],
};

describe('五類資產', () => {
  it('只有五類：App icon 與 favicon 合起來一類，不是六類', () => {
    expect(ASSET_KINDS).toEqual(['logo', 'wordmark', 'mark', 'monogram', 'appicon']);
    expect(MAX_ASSETS).toBe(5);
  });

  it('用了一類就少一個選擇：加滿之後沒有可加的了', () => {
    expect(availableKinds(emptyLogoDoc())).toEqual([...ASSET_KINDS]);
    expect(availableKinds(DOC)).toEqual(['mark', 'monogram', 'appicon']);

    const full: LogoDoc = {
      ...DOC,
      assets: ASSET_KINDS.map((kind, index) => ({ ...LOGO, id: `a-${index}`, kind })),
    };

    expect(availableKinds(full)).toEqual([]);
  });

  it('同一類讀入時只留第一個：一個品牌不會有兩個 Mark', () => {
    const parsed = parseLogoDoc(
      JSON.stringify({
        assets: [
          { ...LOGO, id: 'a-1', kind: 'mark' },
          { ...LOGO, id: 'a-2', kind: 'mark' },
        ],
      }),
    );

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.assets.map((asset) => asset.id)).toEqual(['a-1']);
  });
});

describe('主檔與向量', () => {
  it('主檔認得四種向量格式，位圖一律不算', () => {
    expect(isVectorFile('logo.svg')).toBe(true);
    expect(isVectorFile('logo.AI')).toBe(true);
    expect(isVectorFile('logo.eps')).toBe(true);
    expect(isVectorFile('logo.pdf')).toBe(true);
    expect(isVectorFile('logo.png')).toBe(false);
    expect(isVectorFile('logo.jpg')).toBe(false);
    expect(isVectorFile('')).toBe(false);
  });

  it('未填名稱、未填主檔、主檔不是向量，三種缺分得開', () => {
    expect(assetGaps(LOGO)).toEqual([]);
    expect(assetGaps({ ...LOGO, name: '  ' })).toEqual(['name']);
    expect(assetGaps({ ...LOGO, master: '' })).toEqual(['master']);
    // 有主檔但不是向量：只講「不是向量」，不會同時說「未填」。
    expect(assetGaps({ ...LOGO, master: 'logo.png' })).toEqual(['vector']);
  });

  it('主標誌指去一個不存在的資產：當作未指定，不靜靜指去第一個', () => {
    expect(primaryAsset(DOC)?.id).toBe('a-logo');
    expect(primaryAsset({ ...DOC, primaryId: 'a-gone' })).toBeNull();
    expect(primaryAsset(emptyLogoDoc())).toBeNull();

    const parsed = parseLogoDoc(JSON.stringify({ ...DOC, primaryId: 'a-gone' }));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.primaryId).toBe('');
  });
});

describe('最小尺寸', () => {
  it('螢幕一定是 px：寫 24 或 24mm 都不算', () => {
    expect(screenSizeOk('24px')).toBe(true);
    expect(screenSizeOk('24.5px')).toBe(true);
    expect(screenSizeOk('24')).toBe(false);
    expect(screenSizeOk('24mm')).toBe(false);
    expect(screenSizeOk('24 px')).toBe(false);
    expect(screenSizeOk('')).toBe(false);
  });

  it('印刷一定是 mm：寫 8px 不算', () => {
    expect(printSizeOk('8mm')).toBe(true);
    expect(printSizeOk('8px')).toBe(false);
    expect(printSizeOk('8')).toBe(false);
    expect(printSizeOk('')).toBe(false);
  });

  it('尺寸未齊的模式逐個標得出來', () => {
    const doc: LogoDoc = {
      ...DOC,
      modes: { ...DOC.modes, mono: { screen: '24', print: '8mm' } },
    };

    expect(logoGaps(doc, COLOUR).modes).toEqual(['mono']);
  });
});

describe('顏色模式只引用色彩頁', () => {
  it('四個模式，各自寫死對應的角色；深底取深色那一套', () => {
    expect(LOGO_MODES.map((mode) => mode.key)).toEqual(['brand', 'mono', 'reverse', 'onDark']);
    expect(LOGO_MODES.map((mode) => mode.role)).toEqual(['brand.primary', 'ink', 'paper', 'surface']);
    expect(LOGO_MODES.find((mode) => mode.key === 'onDark')?.surface).toBe('dark');
  });

  it('色彩頁有值就取得返，未定就 null', () => {
    expect(modeRoleValue(COLOUR, 'brand')).toBe('#0057ff');
    expect(modeRoleValue(COLOUR, 'mono')).toBe('#191919');
    expect(modeRoleValue(COLOUR, 'reverse')).toBe('#ffffff');
    // 深底取深色那套的 surface，不是淺色那套。
    expect(modeRoleValue(COLOUR, 'onDark')).toBe('#17171d');

    expect(modeRoleValue(null, 'brand')).toBeNull();

    const lightNoInk: ColorDoc['light'] = {
      'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
      paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
    };

    expect(modeRoleValue({ ...COLOUR, light: lightNoInk }, 'mono')).toBeNull();
    // 只有 CMYK、沒有 HEX：螢幕上仍然是缺。
    expect(modeRoleValue({ ...COLOUR, light: { ...COLOUR.light, ink: { hex: '', cmyk: '0 0 0 90' } } }, 'mono')).toBeNull();
  });

  it('色彩頁未定角色，那個模式算缺 —— 即使尺寸已經填齊', () => {
    const noInk: ColorDoc = {
      ...COLOUR,
      light: {
        'brand.primary': COLOUR.light['brand.primary']!,
        paper: COLOUR.light['paper']!,
      },
    };

    expect(logoGaps(DOC, noInk).modes).toEqual(['mono']);
  });
});

describe('缺的總表', () => {
  it('填齊的表一個缺都沒有', () => {
    expect(gapCount(logoGaps(DOC, COLOUR))).toBe(0);
  });

  it('空表：每個欄位都算缺', () => {
    const gaps = logoGaps(emptyLogoDoc(), null);

    expect(gaps.primary).toBe(true);
    expect(gaps.assets).toEqual([]);
    expect(gaps.modes).toHaveLength(4);
    // 主標誌、安全範圍、方向、背景、何時用、怎樣用、錯誤用法 = 7
    expect(gapCount(gaps)).toBe(7 + 4);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty，舊的自由文字是 invalid', () => {
    expect(parseLogoDoc('').kind).toBe('empty');
    expect(parseLogoDoc('主標誌見附件。').kind).toBe('invalid');
    // 任意 JSON 不當成空表：那會畫出五個假的「缺」。
    expect(parseLogoDoc('{"note":"標誌"}').kind).toBe('invalid');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseLogoDoc(serializeLogoDoc(DOC));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(DOC);
  });

  it('未知的資產類別不會被當成合法', () => {
    const parsed = parseLogoDoc(
      JSON.stringify({ ...DOC, assets: [{ ...LOGO, kind: 'sticker' }] }),
    );

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.assets).toEqual([]);
  });

  it('全空的表不佔一版', () => {
    expect(hasAnyValue(emptyLogoDoc())).toBe(false);
    expect(hasAnyValue({ ...emptyLogoDoc(), safeArea: '0.5X' })).toBe(true);
    expect(hasAnyValue({ ...emptyLogoDoc(), assets: [LOGO] })).toBe(true);
  });

  it('版本預覽抽得到資產名，抽不到就空', () => {
    expect(assetNamesInText('{"assets":[{"id":"a-logo","kind":"logo","name":"主標誌（橫式）"')).toEqual([
      '主標誌（橫式）',
    ]);
    expect(assetNamesInText('主標誌見附件')).toEqual([]);
  });
});
