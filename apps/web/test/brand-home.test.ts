import { describe, expect, it } from 'vitest';
import {
  INTRO_MIN_CHARS,
  colourSwatches,
  emptyHomeDoc,
  gapCount,
  homeGaps,
  introState,
  introInText,
  logoUsage,
  pageRows,
  parseHomeDoc,
  serializeHomeDoc,
  toneSample,
  typeRows,
} from '../src/design/brandHome';
import { emptyLogoDoc } from '../src/design/brandLogo';
import { emptyToneDoc } from '../src/design/brandTone';
import { fullFamily, typeDoc } from './fixtures/brandTypeface';
import type { BrandPageSummary } from '../src/api';
import { colourDoc, withRoleHex } from './fixtures/brandColour';

/**
 * 品牌主頁（issue #39）的純規則。
 *
 * 主頁是**集大成**：它自己只決定兩件事（這個品牌是誰的一段、標誌預設用哪個
 * 模式），其餘四塊都是即時由來源頁砌出來的樣本。所以這裡驗的是「砌得對、
 * 缺得誠實」，不是「存了什麼」。
 */

function page(overrides: Partial<BrandPageSummary> & { key: string }): BrandPageSummary {
  return {
    id: `p-${overrides.key}`,
    brandId: 'b-1',
    kind: 'fixed',
    name: overrides.key,
    brief: null,
    sortOrder: 10,
    // 分組由後端的固定頁表派生（#60）；測試只需要一個合法值。
    group: overrides.key === 'home' ? 'home' : overrides.key === 'examples' ? 'apply' : 'identity',
    current: {
      id: 'v1',
      versionNo: 1,
      createdAt: '2026-11-11T10:00:00.000Z',
      note: null,
      preview: '',
      policyVersionNo: 1,
      changed: [],
    },
    ...overrides,
  };
}

const PAGES: BrandPageSummary[] = [
  page({ key: 'home', name: '品牌主頁', sortOrder: 10 }),
  page({ key: 'logo', name: '標誌', sortOrder: 20 }),
  page({ key: 'color', name: '色彩', sortOrder: 30 }),
  page({ key: 'type', name: '字體', sortOrder: 40, current: null }),
  page({ key: 'tone', name: '語氣', sortOrder: 50 }),
  page({ key: 'packaging', name: '包裝', kind: 'custom', sortOrder: 60 }),
  page({ key: 'photography', name: '攝影', kind: 'custom', sortOrder: 70, current: null }),
  page({ key: 'naming', name: '命名', kind: 'custom', sortOrder: 80 }),
];

const COLOUR = colourDoc({
  'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
  paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
  surface: { hex: '#17171d', cmyk: '0 0 0 90' },
});

const TYPE = {
  ...typeDoc({
    heading: { family: 'f-latin', size: '28px', leading: '1.3', weight: '600', min: 20, color_role: 'ink' },
  }),
  families: [fullFamily('f-latin', 'Inter', 'latin')],
};

const LOGO = {
  ...emptyLogoDoc(),
  assets: [{ class: 'logo', label: '主標誌（橫式）', file_ref: 'logo.svg', version: 'v1' }],
  modes: [
    { mode: 'brand', color_role: 'brand.primary', note: '' },
    { mode: 'mono', color_role: 'ink', note: '' },
  ],
  min_size: { screen_px: 24, print_mm: 12 },
};

const TONE = {
  ...emptyToneDoc(),
  traits: [
    {
      name: '直接',
      do: '講清楚要對方做甚麼',
      dont: '轉彎',
      sentence: '請你星期三之前回覆。',
    },
  ],
};

describe('主頁的頁清單：由後端來，不寫死', () => {
  it('五頁加三張自定義頁 = 八條入口，自定義頁各自一條', () => {
    const rows = pageRows(PAGES);

    expect(rows.map((row) => row.name)).toEqual([
      '標誌',
      '色彩',
      '字體',
      '語氣',
      '包裝',
      '攝影',
      '命名',
    ]);
    // 主頁自己不是「入口」。
    expect(rows.some((row) => row.key === 'home')).toBe(false);
  });

  it('每一條入口指向自己的網址，自定義頁走 p/<slug>', () => {
    const rows = pageRows(PAGES);

    expect(rows.find((row) => row.key === 'color')?.href).toBe('#/design/brand/color');
    expect(rows.find((row) => row.key === 'packaging')?.href).toBe('#/design/brand/p/packaging');
  });

  it('未有現行版本的頁如實標缺', () => {
    const rows = pageRows(PAGES);

    expect(rows.find((row) => row.key === 'type')?.hasCurrent).toBe(false);
    expect(rows.find((row) => row.key === 'photography')?.hasCurrent).toBe(false);
    expect(rows.find((row) => row.key === 'packaging')?.hasCurrent).toBe(true);
  });

  it('零張自定義頁也照樣得五條，不會硬塞一條「自定義頁」', () => {
    const rows = pageRows(PAGES.filter((item) => item.kind === 'fixed'));

    expect(rows.length).toBe(4);
    expect(rows.some((row) => row.name.includes('自定義'))).toBe(false);
  });
});

describe('色彩角色的可見樣本', () => {
  it('只畫色彩頁有 HEX 的角色，次序照角色表', () => {
    const swatches = colourSwatches(COLOUR, 'light');

    expect(swatches.map((item) => item.role)).toEqual(['brand.primary', 'paper', 'surface']);
    expect(swatches[0]).toEqual({ role: 'brand.primary', hex: '#0057ff', cmyk: '100 90 0 0' });
  });

  it('深色樣本：寫了深色值的用自己的，未寫的沿用淺色（與 tokens 一致）', () => {
    const dark = colourSwatches(COLOUR, 'dark');

    // 深色值寫明就用它：surface 不是拿淺色那個。
    expect(dark.find((item) => item.role === 'surface')?.hex).toBe('#17171d');
    // 未寫深色值的角色在 tokens 裡就是沿用淺色，所以樣本照樣畫同一個色 ——
    // 畫面上見到的不會與 tokens 出來的東西不同。
    expect(dark.find((item) => item.role === 'paper')?.hex).toBe('#ffffff');
  });

  it('沒有色彩頁就一個樣本都沒有，不畫假色', () => {
    expect(colourSwatches(null, 'light')).toEqual([]);
  });
});

describe('字體層級的可見樣本', () => {
  it('四個層級逐個列出，未指定家族的標缺', () => {
    const { rows, gaps } = typeRows(TYPE, COLOUR);

    expect(rows.map((row) => row.role)).toEqual(['display', 'heading', 'body', 'caption']);
    expect(rows.find((row) => row.role === 'heading')?.familyName).toBe('Inter');
    expect(rows.find((row) => row.role === 'heading')?.size).toBe('28px');
    expect(gaps).toEqual(['display', 'body', 'caption']);
  });

  it('文字顏色只寫角色名，值由色彩頁來', () => {
    const heading = typeRows(TYPE, COLOUR).rows.find((row) => row.role === 'heading');

    expect(heading?.colourRole).toBe('ink');
    // ink 在色彩頁未定值：樣本不畫一個假的色。
    expect(heading?.colourHex).toBeNull();
  });
});

describe('語氣短例', () => {
  it('拿第一個特質的「做的句子」，不是拿形容詞', () => {
    expect(toneSample(TONE)).toBe('請你星期三之前回覆。');
  });

  it('一個特質都沒有就回空，不自己作一句', () => {
    expect(toneSample(null)).toBe('');
    expect(toneSample({ ...emptyToneDoc(), traits: [] })).toBe('');
  });
});

describe('標誌的預設用法', () => {
  it('揀了模式就有主標誌、對應角色、最小尺寸', () => {
    const usage = logoUsage(LOGO, 'brand', COLOUR);

    expect(usage?.assetName).toBe('主標誌（橫式）');
    expect(usage?.role).toBe('brand.primary');
    expect(usage?.hex).toBe('#0057ff');
    expect(usage?.screen).toBe('24px');
    expect(usage?.print).toBe('12mm');
  });

  it('未揀模式就沒有預設用法', () => {
    expect(logoUsage(LOGO, '', COLOUR)).toBeNull();
  });

  it('揀了模式但色彩頁未定那個角色：仍然講是哪個角色，只是沒有色', () => {
    expect(logoUsage(LOGO, 'mono', COLOUR)?.hex).toBeNull();
    expect(logoUsage(LOGO, 'mono', COLOUR)?.role).toBe('ink');
  });

  it('標誌頁一件資產都沒有，主標誌就是空', () => {
    expect(logoUsage(emptyLogoDoc(), 'brand', COLOUR)?.assetName).toBe('');
  });
});

describe('這個品牌是誰', () => {
  it('空、太短、夠具體分三種', () => {
    expect(introState('')).toBe('empty');
    expect(introState('   ')).toBe('empty');
    expect(introState('Moonic 是一間')).toBe('short');
    expect(introState('滿月堂是一間用中醫調理皮膚與身體的診所，在香港銅鑼灣。')).toBe('ok');
    expect(INTRO_MIN_CHARS).toBeGreaterThan(10);
  });
});

describe('讀與寫', () => {
  it('空內容是「未開始」，不是壞掉', () => {
    expect(parseHomeDoc('')).toEqual({ kind: 'empty' });
    expect(parseHomeDoc('   ')).toEqual({ kind: 'empty' });
  });

  it('任意 JSON 不當成空表', () => {
    expect(parseHomeDoc('{"foo":1}')).toEqual({ kind: 'invalid' });
    expect(parseHomeDoc('not json')).toEqual({ kind: 'invalid' });
  });

  it('讀得返自己寫的', () => {
    const doc = { intro: '滿月堂是一間診所。', logoMode: 'brand' as const };

    expect(parseHomeDoc(serializeHomeDoc(doc))).toEqual({ kind: 'ok', doc });
  });

  it('不認得的模式當作未揀，不會靜靜指去第一個', () => {
    const parsed = parseHomeDoc(JSON.stringify({ intro: 'x', logoMode: 'neon' }));

    expect(parsed.kind === 'ok' && parsed.doc.logoMode).toBe('');
  });

  it('intro 排第一：版本列表只拿得到頭 160 字元做預覽', () => {
    expect(serializeHomeDoc({ intro: '開頭這一句', logoMode: '' }).startsWith('{"intro":"開頭這一句"')).toBe(true);
    expect(introInText(serializeHomeDoc({ intro: '開頭這一句', logoMode: '' }))).toBe('開頭這一句');
  });
});

describe('缺什麼', () => {
  const fullDoc = { intro: '滿月堂是一間用中醫調理皮膚與身體的診所，在香港銅鑼灣。', logoMode: 'brand' as const };

  it('一樣都沒有寫：五樣都缺，頁清單兩頁未有版本', () => {
    const gaps = homeGaps({
      doc: emptyHomeDoc(),
      colour: COLOUR,
      type: TYPE,
      logo: LOGO,
      tone: TONE,
      pages: PAGES,
    });

    expect(gaps.intro).toBe('empty');
    expect(gaps.logoMode).toBe(true);
    expect(gaps.pages).toEqual(['字體', '攝影']);
    expect(gapCount(gaps)).toBeGreaterThanOrEqual(4);
  });

  it('四頁都未有現行版本：逐塊標缺，不是畫一個空框', () => {
    const gaps = homeGaps({
      doc: fullDoc,
      colour: null,
      type: null,
      logo: null,
      tone: null,
      pages: PAGES,
    });

    expect(gaps.colour).toEqual([
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
    expect(gaps.type).toEqual(['display', 'heading', 'body', 'caption']);
    expect(gaps.logo).toContain('page');
    expect(gaps.tone).toBe(true);
    expect(gaps.intro).toBeNull();
    expect(gaps.logoMode).toBe(false);
  });

  it('齊了就是零缺', () => {
    const gaps = homeGaps({
      doc: fullDoc,
      colour: withRoleHex(COLOUR, 'ink', '#111111'),
      type: {
        ...typeDoc({
          display: { family: 'f-latin' },
          heading: { family: 'f-latin' },
          body: { family: 'f-latin' },
          caption: { family: 'f-latin' },
        }),
        families: [fullFamily('f-latin', 'Inter', 'latin')],
      },
      logo: LOGO,
      tone: TONE,
      pages: PAGES.filter((item) => item.current !== null),
    });

    // 九個角色只定了三個（brand.primary／paper／ink），所以仍然有六個未定值：
    // 那是真的，不是零缺。
    expect(gaps.colour.length).toBe(6);
    expect(gaps.intro).toBeNull();
    expect(gaps.logoMode).toBe(false);
    expect(gaps.logo).toEqual([]);
    expect(gaps.pages).toEqual([]);
  });

  it('有檔案但冇一件類別係 logo：標「未有主標誌」', () => {
    const gaps = homeGaps({
      doc: fullDoc,
      colour: COLOUR,
      type: TYPE,
      // 主標誌＝類別為 logo 的那一件，不再另存一個 primaryId。
      logo: {
        ...LOGO,
        assets: [{ class: 'wordmark', label: '字標', file_ref: 'wordmark.svg', version: '' }],
      },
      tone: TONE,
      pages: PAGES,
    });

    expect(gaps.logo).toContain('primary');
  });
});
