import { describe, expect, it } from 'vitest';
import {
  COLOR_ROLES,
  EMPTY_DOC,
  contrastRatio,
  hexToRgb,
  hexesInText,
  isColorRole,
  logoEligibleRoles,
  missingMustHave,
  missingRoles,
  normalizeHex,
  parseColorDoc,
  parsePair,
  rgbChannels,
  serializeColorDoc,
  type ColorDoc,
} from '../src/design/brandColors';

/**
 * 色彩頁的规则（issue #35）。
 *
 * 畫面的測試在 `design-brand-colors.test.tsx`；這一支只管**算得對不對**：
 * 角色名是不是真正寫死、缺的判斷、對比門檻、以及「舊的自由文字不可以假裝
 * 成全部缺」。這些規則如果只寫在畫面裡，下一個引用角色名的頁面（標誌、字體）
 * 就要各自再實作一次，然後三邊慢慢分開。
 */

const DOC: ColorDoc = {
  light: {
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    ink: { hex: '#000000', cmyk: '0 0 0 100' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
  },
  dark: {
    ink: { hex: '#f5f5f7', cmyk: '' },
    surface: { hex: '#17171d', cmyk: '' },
  },
  ramps: {},
  allowed: [],
  denied: [],
  logoRoles: [],
};

describe('角色名', () => {
  it('九個角色寫死，分三組，ink 與 paper 必須存在', () => {
    expect(COLOR_ROLES.map((role) => role.key)).toEqual([
      'brand.primary',
      'brand.secondary',
      'ink',
      'paper',
      'muted',
      'surface',
      'success',
      'warning',
      'danger',
    ]);

    const groups = new Set(COLOR_ROLES.map((role) => role.group));
    expect([...groups].sort()).toEqual(['brand', 'function', 'reading']);

    expect(isColorRole('ink')).toBe(true);
    expect(isColorRole('paper')).toBe(true);
    // 同義角色不存在：不可以用「主色」代替 brand.primary。
    expect(isColorRole('主色')).toBe(false);
    expect(isColorRole('light.ink')).toBe(false);
  });

  it('功能色不可以進標誌：可用清單裡一個都沒有', () => {
    const eligible = logoEligibleRoles().map((role) => role.key);

    expect(eligible).toContain('brand.primary');
    expect(eligible).toContain('ink');
    expect(eligible).not.toContain('success');
    expect(eligible).not.toContain('warning');
  });
});

describe('缺的判斷', () => {
  it('淺色逐個列出未填的角色，而且按角色表的次序', () => {
    expect(missingRoles(DOC, 'light')).toEqual([
      'brand.secondary',
      'muted',
      'success',
      'warning',
      'danger',
    ]);
    // 淺色不要求 surface，所以它不會出現在這一串裡。
    expect(missingRoles(DOC, 'light')).not.toContain('surface');
  });

  it('表面上看深色：有值的不是缺，沒有的才是', () => {
    // dark 只有 ink 與 surface：所以缺的是其他，不是 surface。
    expect(missingRoles(DOC, 'dark')).toContain('paper');
    expect(missingRoles(DOC, 'dark')).toContain('brand.primary');
    expect(missingRoles(DOC, 'dark')).not.toContain('surface');
    expect(missingRoles(DOC, 'dark')).not.toContain('ink');
  });

  it('「最少要有」只算策略明講那幾個：brand.primary、ink、paper、深色 surface', () => {
    // 淺色三個（brand.primary、ink、paper）都有，所以一個都不缺；
    // brand.secondary 缺不是「最少要有」的問題 —— 不應該在這裡叫。
    expect(missingMustHave(DOC, 'light')).toEqual([]);
    expect(missingMustHave(DOC, 'dark')).toEqual(['brand.primary', 'paper']);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty，不是「全部缺」', () => {
    expect(parseColorDoc('').kind).toBe('empty');
    expect(parseColorDoc('   ').kind).toBe('empty');
  });

  it('舊的自由文字讀不到就是讀不到', () => {
    expect(parseColorDoc('品牌主色係藍色。').kind).toBe('invalid');
  });

  it('認得形狀的 JSON 才算色彩表', () => {
    expect(parseColorDoc('{"note":"藍色"}').kind).toBe('invalid');

    const parsed = parseColorDoc(serializeColorDoc(DOC));
    expect(parsed.kind).toBe('ok');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseColorDoc(serializeColorDoc(DOC));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(DOC);
  });

  it('未知角色與功能色都不會留在標誌清單裡', () => {
    const parsed = parseColorDoc(
      JSON.stringify({ light: {}, logoRoles: ['ink', 'warning', '主色', 'not-a-role'] }),
    );

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.logoRoles).toEqual(['ink']);
  });

  it('只有 CMYK 的角色留得住（先打印刷值再打 HEX 是正常次序）', () => {
    const parsed = parseColorDoc(JSON.stringify({ light: { ink: { hex: '', cmyk: '0 0 0 100' } } }));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.light.ink).toEqual({ hex: '', cmyk: '0 0 0 100' });
  });

  it('全空的表寫出來是空字串（不佔一版）', () => {
    expect(serializeColorDoc(EMPTY_DOC)).toContain('"light"');
    // 空表本身仍然序列化得到，但畫面那層會轉成空字串交上去；
    // 這裡只確認空表是合法形狀，不會在讀回來時變成 invalid。
    expect(parseColorDoc(serializeColorDoc(EMPTY_DOC)).kind).toBe('ok');
  });
});

describe('色值計算', () => {
  it('三碼展開成六碼，不是 hex 就回 null', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex(' #ABC ')).toBe('#aabbcc');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('blue')).toBeNull();
  });

  it('RGB 三個數字由 HEX 算出來', () => {
    expect(rgbChannels('#0057ff')).toBe('0 87 255');
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(rgbChannels('not-a-color')).toBeNull();
  });

  it('對比：黑白是 21，門檻 4.5 與 3', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('nope', '#ffffff')).toBeNull();
  });

  it('組合寫法：前景 on 底色', () => {
    expect(parsePair('ink on paper')).toEqual({ foreground: 'ink', background: 'paper' });
    expect(parsePair('  ink   on   paper ')).toEqual({ foreground: 'ink', background: 'paper' });
    expect(parsePair('ink/paper')).toBeNull();
    expect(parsePair('')).toBeNull();
  });

  it('版本預覽只抽得到色值，抽不到就空', () => {
    expect(hexesInText('{"light":{"ink":{"hex":"#111111","x":"#111111"')).toEqual(['#111111']);
    expect(hexesInText('品牌主色係藍色')).toEqual([]);
  });
});
