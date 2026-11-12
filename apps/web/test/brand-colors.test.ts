import { describe, expect, it } from 'vitest';
import { colourDoc, fullColourDoc } from './fixtures/brandColour';
import {
  EMPTY_DOC,
  MUST_HAVE_ROLES,
  gapCountOf,
  hasAnyValue,
  hexesInText,
  missingRoles,
  normalizeHexInput,
  parseColorDoc,
  parsePair,
  patchRole,
  ratioTotal,
  readPair,
  rgbChannels,
  roleEntry,
  serializeColorDoc,
  suggestAlternative,
  undecidedRoles,
  valuesOf,
} from '../src/design/brandColors';

/**
 * 色彩頁的資料層（issue #62，取代 #35）。
 *
 * 這一支只管「表對不對」：讀得返、寫得出、缺的就是缺、不達標旁邊有可用的
 * 替代值。畫面怎樣畫在 `design-brand-colors.test.tsx`。
 *
 * 要證明四件事，四件都可以逐個數：
 *   1. 形狀認得就是認得 —— 舊形狀（`light`／`dark` 兩張表）不是新表，講讀不到。
 *   2. 缺的四個角色數得出來，而且要與 `color.r1` 一字不差。
 *   3. 對比三態：過、不過、算不到。算不到不是過。
 *   4. 不達標時給得出替代值，而且替代值真的過線 —— 不是「建議」了事。
 */

describe('讀一份色彩表', () => {
  it('空白就是空白，不是壞掉', () => {
    expect(parseColorDoc('')).toEqual({ kind: 'empty' });
    expect(parseColorDoc('   ')).toEqual({ kind: 'empty' });
  });

  it('新形狀讀得返：角色、順序、比例、配對、深淺', () => {
    const doc = colourDoc({ ink: { hex: '#111111' } });
    const parsed = parseColorDoc(
      JSON.stringify({ ...doc, order: { text: '先紙後墨', reason: '白是底' } }),
    );

    expect(parsed.kind).toBe('ok');

    if (parsed.kind !== 'ok') {
      return;
    }

    expect(parsed.doc.roles).toHaveLength(1);
    expect(parsed.doc.roles[0]?.id).toBe('ink');
    expect(parsed.doc.order.text).toBe('先紙後墨');
    expect(parsed.doc.contrast_floor).toBe(4.5);
  });

  it('舊形狀（light／dark 兩張表）不是新表：講讀不到，不畫九行假的缺', () => {
    const old = JSON.stringify({ light: { ink: { hex: '#111111' } }, dark: {}, ramps: {} });

    expect(parseColorDoc(old)).toEqual({ kind: 'invalid' });
  });

  it('任意 JSON 與壞 JSON 都講讀不到', () => {
    expect(parseColorDoc('品牌主色係藍色。')).toEqual({ kind: 'invalid' });
    expect(parseColorDoc('{"note":"藍色"}')).toEqual({ kind: 'invalid' });
    expect(parseColorDoc('[]')).toEqual({ kind: 'invalid' });
  });

  it('存出來是單行：版本預覽只有 160 字元', () => {
    const text = serializeColorDoc(fullColourDoc());

    expect(text).not.toContain('\n');
    expect(JSON.parse(text)).toMatchObject({ contrast_floor: 4.5, large_floor: 3 });
  });

  it('全空不佔一版', () => {
    expect(hasAnyValue(EMPTY_DOC)).toBe(false);
    expect(hasAnyValue(fullColourDoc())).toBe(true);
    // 只有 CMYK 沒有 HEX：仍然是未填，不當成有內容。
    expect(hasAnyValue(colourDoc({ ink: { hex: '' } }))).toBe(false);
  });
});

describe('角色', () => {
  it('缺的四個就是 color.r1 的四個', () => {
    expect(MUST_HAVE_ROLES).toEqual(['brand.primary', 'ink', 'paper', 'surface']);
    expect(missingRoles(EMPTY_DOC)).toEqual(['brand.primary', 'ink', 'paper', 'surface']);
  });

  it('有 HEX 才算有值：只有 CMYK 仍然是缺', () => {
    const doc = colourDoc({ ink: { hex: '', cmyk: '0 0 0 90' } });

    expect(missingRoles(doc)).toContain('ink');
  });

  it('未定不是缺：功能色與次要色只算未決定', () => {
    const doc = fullColourDoc();

    expect(missingRoles(doc)).toEqual([]);
    expect(undecidedRoles(doc)).toEqual([
      'brand.secondary',
      'muted',
      'success',
      'warning',
      'danger',
    ]);
  });

  it('改一格不影響其他角色', () => {
    const doc = fullColourDoc();
    const next = patchRole(doc, 'ink', { hex: '#222222' });

    expect(roleEntry(next, 'ink').hex).toBe('#222222');
    expect(roleEntry(next, 'paper').hex).toBe('#ffffff');
    expect(next.roles).toHaveLength(doc.roles.length);
  });

  it('清空所有欄位就刪走那一行（不留空殼）', () => {
    const doc = fullColourDoc();
    const next = patchRole(doc, 'ink', { hex: '', cmyk: '' });

    expect(next.roles.some((role) => role.id === 'ink')).toBe(false);
    expect(missingRoles(next)).toContain('ink');
  });

  it('深色值未填就沿用淺色：與 tokens 的做法一致', () => {
    const doc = colourDoc({
      ink: { hex: '#111111' },
      surface: { hex: '#222222', dark: '#333333' },
    });

    expect(valuesOf(doc, 'light')['ink']?.hex).toBe('#111111');
    expect(valuesOf(doc, 'dark')['ink']?.hex).toBe('#111111');
    expect(valuesOf(doc, 'dark')['surface']?.hex).toBe('#333333');
  });

  it('RGB 由 HEX 算，三碼先展開', () => {
    expect(rgbChannels('#0057ff')).toBe('0 87 255');
    expect(normalizeHexInput('#abc')).toBe('#aabbcc');
    expect(normalizeHexInput('藍色')).toBeNull();
    expect(rgbChannels('')).toBeNull();
  });
});

describe('對比', () => {
  it('過、不過、算不到是三件事', () => {
    const doc = colourDoc({
      ink: { hex: '#000000' },
      paper: { hex: '#ffffff' },
      muted: { hex: '#999999' },
      surface: { hex: '#222222' },
    });

    expect(readPair(doc, { fg: 'ink', bg: 'paper', use: 'body' }).state).toBe('pass');
    expect(readPair(doc, { fg: 'muted', bg: 'paper', use: 'body' }).state).toBe('fail');
    // 算不到不是過：沒有色值就沒有比值。
    expect(readPair(doc, { fg: 'surface', bg: 'warning' }).ratio).toBeNull();
    expect(readPair(doc, { fg: 'not-a-role', bg: 'paper' }).state).toBe('unknown');
  });

  it('內文與大字用不同下限', () => {
    const doc = colourDoc({ ink: { hex: '#949494' }, paper: { hex: '#ffffff' } });
    const body = readPair(doc, { fg: 'ink', bg: 'paper', use: 'body' });
    const large = readPair(doc, { fg: 'ink', bg: 'paper', use: 'large' });

    expect(body.state).toBe('fail');
    expect(large.state).toBe('pass');
    expect(large.floor).toBe(3);
  });

  it('下限可以調高：同一組色由過變不過', () => {
    const doc = {
      ...colourDoc({ ink: { hex: '#767676' }, paper: { hex: '#ffffff' } }),
      contrast_floor: 6,
    };

    expect(readPair(doc, { fg: 'ink', bg: 'paper', use: 'body' }).state).toBe('fail');
  });
});

describe('替代色', () => {
  it('先找同組的現有角色，取剛好夠用的那個', () => {
    const doc = colourDoc({
      'brand.primary': { hex: '#dddddd' },
      'brand.secondary': { hex: '#444444' },
      ink: { hex: '#000000' },
      paper: { hex: '#ffffff' },
      surface: { hex: '#000000' },
    });
    const alternative = suggestAlternative(doc, 'brand.primary', 'paper', 4.5);

    expect(alternative?.role).toBe('brand.secondary');
    expect(alternative?.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('同組沒有替換就調自己的明度，留住色相', () => {
    const doc = colourDoc({ 'brand.primary': { hex: '#c8d2ff' }, paper: { hex: '#ffffff' } });
    const alternative = suggestAlternative(doc, 'brand.primary', 'paper', 4.5);

    expect(alternative?.role).toBeNull();
    expect(alternative?.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(alternative?.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('建議值真的過線：用來改角色之後，同一組就達標', () => {
    const doc = colourDoc({
      'brand.primary': { hex: '#c8d2ff' },
      ink: { hex: '#111111' },
      paper: { hex: '#ffffff' },
      surface: { hex: '#000000' },
    });
    const alternative = suggestAlternative(doc, 'brand.primary', 'paper', 4.5);

    expect(alternative).not.toBeNull();

    const fixed = patchRole(doc, 'brand.primary', { hex: alternative?.hex ?? '' });

    expect(readPair(fixed, { fg: 'brand.primary', bg: 'paper', use: 'body' }).state).toBe('pass');
  });

  it('底色都未有就計不到，回 null 而不是猜一個', () => {
    const doc = colourDoc({ 'brand.primary': { hex: '#c8d2ff' } });

    expect(suggestAlternative(doc, 'brand.primary', 'paper', 4.5)).toBeNull();
  });

  it('達標的那一組不給建議', () => {
    const doc = fullColourDoc();

    expect(readPair(doc, { fg: 'ink', bg: 'paper', use: 'body' }).alternative).toBeNull();
  });
});

describe('比例與缺口', () => {
  it('比例合計要 100；未填任何比例不算 0', () => {
    expect(ratioTotal(EMPTY_DOC)).toBeNull();

    const doc = {
      ...EMPTY_DOC,
      roles: fullColourDoc().roles,
      pairs: {
        allowed: [
          { fg: 'ink', bg: 'paper', use: 'body' as const, reason: '' },
          { fg: 'ink', bg: 'surface', use: 'large' as const, reason: '' },
        ],
        forbidden: [],
      },
      ratios: [
        { role: 'paper', percent: 70, reason: '' },
        { role: 'ink', percent: 30, reason: '' },
      ],
    };

    expect(ratioTotal(doc)).toBe(100);
    expect(gapCountOf(doc)).toBe(0);
  });

  it('缺口數只數有規定的：四個必要角色、兩種配對、比例', () => {
    // 全空：四個角色 + 內文配對 + 大字配對 = 6（比例未填不算缺）。
    expect(gapCountOf(EMPTY_DOC)).toBe(6);

    const doc = {
      ...fullColourDoc(),
      ratios: [{ role: 'paper', percent: 60, reason: '' }],
      pairs: {
        allowed: [
          { fg: 'ink', bg: 'paper', use: 'body' as const, reason: '' },
          { fg: 'ink', bg: 'surface', use: 'large' as const, reason: '' },
        ],
        forbidden: [],
      },
    };

    // 比例加起來不是 100。
    expect(gapCountOf(doc)).toBe(1);
  });
});

describe('其他', () => {
  it('配對寫法解析', () => {
    expect(parsePair('ink on paper')).toEqual({ foreground: 'ink', background: 'paper' });
    expect(parsePair('ink paper')).toBeNull();
  });

  it('版本預覽抽色點：抽到幾多個就畫幾個', () => {
    expect(
      hexesInText('{"roles":[{"hex":"#0057FF"},{"hex":"#0057ff"},{"hex":"#111111"}]}'),
    ).toEqual(['#0057ff', '#111111']);
    expect(hexesInText('沒有色')).toEqual([]);
  });
});
