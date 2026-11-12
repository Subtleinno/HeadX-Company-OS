import { describe, expect, it } from 'vitest';
import type { ColorDoc } from '../src/design/brandColors';
import { colourDoc, fullColourDoc } from './fixtures/brandColour';
import {
  ASSET_KINDS,
  LOGO_MODES,
  MAX_ASSETS,
  assetGaps,
  assetNamesInText,
  availableKinds,
  emptyAsset,
  emptyLogoDoc,
  gapCount,
  hasAnyValue,
  isVectorFile,
  logoGaps,
  modeRoleValue,
  modeRow,
  parseLogoDoc,
  primaryAsset,
  printSizeOk,
  roleState,
  screenSizeOk,
  serializeLogoDoc,
  setMode,
  usedKinds,
  type LogoAsset,
  type LogoDoc,
} from '../src/design/brandLogo';

/**
 * 標誌頁的規則（issue #64）。畫面的測試在 `design-brand-logo.test.tsx`。
 *
 * 這一支只管**約束對不對**：五類上限、向量主檔、四種模式必須引用色彩頁
 * 存在的角色、功能色不可用於標誌、兩個最小尺寸不可以是同一個數、主標誌
 * 由類別決定。
 */

const COLOUR: ColorDoc = fullColourDoc();

function asset(patch: Partial<LogoAsset> = {}): LogoAsset {
  return { ...emptyAsset('logo'), label: '主標誌', file_ref: 'logo.svg', ...patch };
}

function doc(patch: Partial<LogoDoc> = {}): LogoDoc {
  return {
    ...emptyLogoDoc(),
    logic_line: '一個印章。',
    assets: [asset()],
    clear_space_x: { x: '字標高度', multiples: '2x', note: '' },
    min_size: { screen_px: 24, print_mm: 12 },
    modes: LOGO_MODES.map((mode) => ({
      mode,
      color_role: mode === 'brand' ? 'brand.primary' : 'ink',
      note: '',
    })),
    backgrounds: '白、米、淺灰。',
    ...patch,
  };
}

describe('檔案', () => {
  it('五類，一類一件：App icon 與 favicon 合起來一類', () => {
    expect(ASSET_KINDS).toEqual(['logo', 'wordmark', 'mark', 'monogram', 'appicon']);
    expect(MAX_ASSETS).toBe(5);
    expect(availableKinds(doc())).toEqual(['wordmark', 'mark', 'monogram', 'appicon']);
  });

  it('同類第二次出現不算第二件：讀入時丟掉', () => {
    const parsed = parseLogoDoc(
      JSON.stringify({
        assets: [
          { class: 'logo', label: 'A', file_ref: 'a.svg' },
          { class: 'logo', label: 'B', file_ref: 'b.svg' },
        ],
      }),
    );

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.assets.map((item) => item.label)).toEqual(['A']);
  });

  it('缺名、缺檔、不是向量：三種缺分得開', () => {
    expect(assetGaps(asset())).toEqual([]);
    expect(assetGaps(asset({ label: '' }))).toEqual(['label']);
    expect(assetGaps(asset({ file_ref: '' }))).toEqual(['file']);
    expect(assetGaps(asset({ file_ref: 'logo.png' }))).toEqual(['vector']);
    expect(assetGaps(asset({ label: '', file_ref: 'logo.png' }))).toEqual(['label', 'vector']);
  });

  it('向量檔認得 svg／ai／eps／pdf，其餘當位圖', () => {
    expect(isVectorFile('logo.svg')).toBe(true);
    expect(isVectorFile('brand.AI')).toBe(true);
    expect(isVectorFile('brand.eps')).toBe(true);
    expect(isVectorFile('print.pdf')).toBe(true);
    expect(isVectorFile('logo.png')).toBe(false);
    expect(isVectorFile('')).toBe(false);
  });

  it('主標誌＝類別為 logo 的那一件；冇就係冇，唔會指去第一件', () => {
    expect(primaryAsset(doc())?.label).toBe('主標誌');
    expect(primaryAsset(doc({ assets: [asset({ class: 'wordmark' })] }))).toBeNull();
    expect(primaryAsset(null)).toBeNull();
  });
});

describe('顏色模式', () => {
  it('四種模式次序固定，用哪個角色由這一頁指定', () => {
    expect(LOGO_MODES).toEqual(['brand', 'mono', 'reverse', 'onDark']);
    expect(modeRow(doc(), 'brand').color_role).toBe('brand.primary');
    expect(modeRow(emptyLogoDoc(), 'brand').color_role).toBe('');
  });

  it('改模式；整行清了就刪走，不留空殼', () => {
    const withNote = setMode(doc(), 'mono', { note: '只在海報上用' });

    expect(modeRow(withNote, 'mono')).toMatchObject({ color_role: 'ink', note: '只在海報上用' });

    const cleared = setMode(withNote, 'mono', { color_role: '', note: '' });

    expect(cleared.modes.some((mode) => mode.mode === 'mono')).toBe(false);
  });

  it('只可以引用色彩頁的角色，而且功能色不可用於標誌', () => {
    expect(roleState('ink')).toBe('ok');
    expect(roleState('danger')).toBe('function');
    expect(roleState('neon')).toBe('unknown');
    expect(roleState('')).toBe('unknown');
  });

  it('深底模式取深色那套的值，其餘取淺色', () => {
    const withDark: ColorDoc = {
      ...COLOUR,
      roles: COLOUR.roles.map((role) => (role.id === 'ink' ? { ...role, dark: '#eeeeee' } : role)),
    };

    expect(modeRoleValue(COLOUR, 'mono', doc())).toBe('#191919');
    expect(modeRoleValue(withDark, 'onDark', doc())).toBe('#eeeeee');
    expect(modeRoleValue(null, 'mono', doc())).toBeNull();
  });

  it('色彩頁未定那個角色：算不到值，但仍然講得返是哪個角色', () => {
    const partial = colourDoc({ 'brand.primary': { hex: '#0057ff' } });

    expect(modeRoleValue(partial, 'mono', doc())).toBeNull();
    expect(modeRow(doc(), 'mono').color_role).toBe('ink');
  });
});

describe('最小尺寸與淨空間', () => {
  it('螢幕要 px、印刷要 mm', () => {
    expect(screenSizeOk('24px')).toBe(true);
    expect(screenSizeOk('24')).toBe(false);
    expect(screenSizeOk('24mm')).toBe(false);
    expect(printSizeOk('12mm')).toBe(true);
    expect(printSizeOk('12px')).toBe(false);
  });

  it('兩個下限寫了同一個數：不算齊', () => {
    const same = doc({ min_size: { screen_px: 24, print_mm: 24 } });

    expect(logoGaps(same).size).toBe(true);
    expect(logoGaps(doc()).size).toBe(false);
  });

  it('淨空間要倍數與 x 兩樣都寫', () => {
    expect(logoGaps(doc()).space).toBe(false);
    expect(logoGaps(doc({ clear_space_x: { x: '', multiples: '2x', note: '' } })).space).toBe(true);
    expect(logoGaps(doc({ clear_space_x: { x: '字標高度', multiples: '', note: '' } })).space).toBe(true);
  });
});

describe('缺口', () => {
  it('齊了就是零缺', () => {
    expect(gapCount(logoGaps(doc()))).toBe(0);
  });

  it('缺模式依序逐個計，缺角色與引用未知角色都算', () => {
    const noModes = doc({ modes: [] });

    expect(logoGaps(noModes).modes).toEqual(['brand', 'mono', 'reverse', 'onDark']);
    expect(gapCount(logoGaps(noModes))).toBe(4);

    const badRole = doc({
      modes: [{ mode: 'brand', color_role: 'neon', note: '' }],
    });

    expect(logoGaps(badRole).modes).toEqual(['brand', 'mono', 'reverse', 'onDark']);
  });

  it('功能色寫入模式一樣算缺（color.r4 的同一條界線）', () => {
    const fn = doc({ modes: [{ mode: 'brand', color_role: 'danger', note: '' }] });

    expect(logoGaps(fn).modes).toContain('brand');
  });

  it('沒有主標誌、背景、邏輯各計一件', () => {
    const gaps = logoGaps(
      doc({ assets: [asset({ class: 'wordmark' })], backgrounds: '', logic_line: '' }),
    );

    expect(gaps.primary).toBe(true);
    expect(gaps.backgrounds).toBe(true);
    expect(gaps.logic).toBe(true);
    expect(gapCount(gaps)).toBe(3);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty；自由文字與舊形狀是 invalid', () => {
    expect(parseLogoDoc('').kind).toBe('empty');
    expect(parseLogoDoc('用一個印章做標誌。').kind).toBe('invalid');
    expect(parseLogoDoc('{"note":"標誌"}').kind).toBe('invalid');

    // #36 的形狀：modes 是一個物件、primaryId 指資產 id。
    expect(
      parseLogoDoc(
        JSON.stringify({
          assets: [{ id: 'a-1', kind: 'logo', name: '主標誌', master: 'logo.svg' }],
          modes: { brand: { screen: '24px', print: '12mm' } },
          primaryId: 'a-1',
        }),
      ).kind,
    ).toBe('invalid');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseLogoDoc(serializeLogoDoc(doc()));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(doc());
  });

  it('全空的表不佔一版', () => {
    expect(hasAnyValue(emptyLogoDoc())).toBe(false);
    expect(hasAnyValue(doc({ min_size: { screen_px: 0, print_mm: 0 } }))).toBe(true);
  });

  it('版本預覽抽資產名，抽不到就空', () => {
    expect(assetNamesInText('{"assets":[{"class":"logo","label":"主標誌"')).toEqual(['主標誌']);
    expect(assetNamesInText('用一個印章做標誌')).toEqual([]);
  });

  it('usedKinds 用類別做身份，不再有另一個 id', () => {
    expect(usedKinds(doc())).toEqual(['logo']);
  });
});
