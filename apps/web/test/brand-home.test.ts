import { describe, expect, it } from 'vitest';
import {
  KEYWORD_MAX,
  KEYWORD_MIN,
  LAYOUT_BLOCKS,
  addKeyword,
  addLayout,
  addSystem,
  addVoiceSample,
  colourRefs,
  colourSwatches,
  emptyHomeDoc,
  gapCount,
  homeGaps,
  homeRefs,
  logoRef,
  logoUsage,
  moveLayout,
  pageRows,
  parseHomeDoc,
  removeKeyword,
  removeLayout,
  serializeHomeDoc,
  setEmphasis,
  setLayout,
  toneSample,
  typeRefs,
  typeRows,
  voiceRefs,
  whoInText,
  type HomeDoc,
} from '../src/design/brandHome';
import { emptyLogoDoc } from '../src/design/brandLogo';
import { emptyToneDoc, type ToneDoc } from '../src/design/brandTone';
import { fullFamily, typeDoc } from './fixtures/brandTypeface';
import type { BrandPageSummary } from '../src/api';
import { colourDoc, fullColourDoc, withRoleHex } from './fixtures/brandColour';
import { fullHomeDoc, thinHomeDoc, withBlankReason } from './fixtures/brandHome';

/**
 * 品牌主頁（issue #67，取代 #39）的純規則。
 *
 * 主頁**不重寫**來源頁的規則：它自己只擁有立場句、一句話說自己是誰、關鍵詞、
 * 版面決定，其餘四個引用（用色順序、標誌預設、字體分工、語氣樣本）都是即時
 * 由來源頁砌出來，而且每一條都帶「來源頁 + 當時版本」。所以這裡驗的是三件事：
 * 引用追得回去、缺得誠實、舊形狀不會被當成空白主頁蓋掉。
 */

function page(overrides: Partial<BrandPageSummary> & { key: string }): BrandPageSummary {
  return {
    id: `p-${overrides.key}`,
    brandId: 'b-1',
    kind: 'fixed',
    name: overrides.key,
    brief: null,
    sortOrder: 10,
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
  families: [fullFamily('f-latin', 'Inter', 'latin'), fullFamily('f-chinese', 'Noto Serif TC', 'chinese')],
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

const TONE: ToneDoc = {
  ...emptyToneDoc(),
  traits: [
    { name: '直接', do: '講清楚要對方做甚麼', dont: '轉彎', sentence: '請你星期三之前回覆。' },
  ],
  samples: { like: ['請你星期三之前回覆。'], unlike: ['請盡快回覆。'] },
};

/** 四頁都讀得到、都有一版：引用全部追得回去。 */
const REF_INPUT = {
  colour: COLOUR,
  colourVersion: 3,
  type: TYPE,
  typeVersion: 2,
  logo: LOGO,
  logoVersion: 1,
  tone: TONE,
  toneVersion: 4,
};

/** 源頁全部讀不到：用來驗「逐條標缺，不畫假色假字」。 */
const REF_MISSING = {
  colour: null,
  colourVersion: null,
  type: null,
  typeVersion: null,
  logo: null,
  logoVersion: null,
  tone: null,
  toneVersion: null,
};

describe('主頁的頁清單：由後端來，不寫死', () => {
  it('四固定頁加三張自定義頁 = 七條入口，自定義頁各自一條', () => {
    const rows = pageRows(PAGES);

    expect(rows.map((row) => row.name)).toEqual(['標誌', '色彩', '字體', '語氣', '包裝', '攝影', '命名']);
    // 主頁自己不是「入口」。
    expect(rows.some((row) => row.key === 'home')).toBe(false);
  });

  it('每一條入口指向自己的網址，自定義頁走 p/<slug>', () => {
    const rows = pageRows(PAGES);

    expect(rows.find((row) => row.key === 'color')?.href).toBe('#/design/brand/color');
    expect(rows.find((row) => row.key === 'packaging')?.href).toBe('#/design/brand/p/packaging');
  });

  it('未有現行版本的頁如實標缺，並帶版本號', () => {
    const rows = pageRows(PAGES);

    expect(rows.find((row) => row.key === 'type')?.hasCurrent).toBe(false);
    expect(rows.find((row) => row.key === 'type')?.versionNo).toBeNull();
    expect(rows.find((row) => row.key === 'color')?.versionNo).toBe(1);
  });

  it('零張自定義頁也照樣得四條，不會硬塞一條「自定義頁」', () => {
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

    expect(dark.find((item) => item.role === 'surface')?.hex).toBe('#17171d');
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

  it('特質全部只有形容詞，就退到情境那一句', () => {
    const adjectiveOnly: ToneDoc = {
      ...emptyToneDoc(),
      traits: [{ name: '直接', do: '', dont: '', sentence: '' }],
      contexts: { ...emptyToneDoc().contexts, explain: '這個療程要做三次，每次隔兩星期。' },
    };

    expect(toneSample(adjectiveOnly)).toBe('這個療程要做三次，每次隔兩星期。');
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

describe('關鍵詞：三到五個，不另創新詞', () => {
  it('加到上限就停，重複的不再加', () => {
    let doc = emptyHomeDoc();
    doc = addKeyword(doc, '中醫');
    doc = addKeyword(doc, '中醫');
    doc = addKeyword(doc, '美容');
    doc = addKeyword(doc, '香港');
    doc = addKeyword(doc, '銅鑼灣');
    doc = addKeyword(doc, '第六個');
    doc = addKeyword(doc, '第七個');

    expect(doc.keywords).toEqual(['中醫', '美容', '香港', '銅鑼灣', '第六個']);
    expect(doc.keywords.length).toBe(KEYWORD_MAX);
    expect(KEYWORD_MIN).toBe(3);
  });

  it('空白的不加，移除按索引', () => {
    const doc = addKeyword(addKeyword(emptyHomeDoc(), '   '), '中醫');

    expect(doc.keywords).toEqual(['中醫']);
    expect(removeKeyword(doc, 0).keywords).toEqual([]);
  });
});

describe('版面：次序是判斷，理由缺一塊就標一塊', () => {
  it('加、移、刪三種都改得到，移到邊界原樣交回', () => {
    let doc = addLayout(addLayout(emptyHomeDoc()));

    expect(doc.layout.length).toBe(2);
    expect(doc.layout[0]?.reason).toBe('');

    doc = moveLayout(doc, 1, -1);
    doc = setLayout(doc, 0, { block: 'quotes', reason: '先講客人的話' });

    expect(doc.layout[0]?.block).toBe('quotes');
    expect(moveLayout(doc, 0, -1)).toEqual(doc);
    expect(removeLayout(doc, 0).layout.length).toBe(1);
  });

  it('一個 layout 只有一個重點：再揀第二塊，第一塊自動降回普通', () => {
    const doc = setEmphasis(fullHomeDoc(), 1);

    expect(doc.layout.map((row) => row.emphasis)).toEqual(['normal', 'lead']);
  });

  it('區塊種類就是 renderer 的九種，不另開一套詞彙', () => {
    expect(LAYOUT_BLOCKS.length).toBe(9);
    expect(LAYOUT_BLOCKS).toContain('swatches');
    expect(LAYOUT_BLOCKS).toContain('gaps');
  });
});

describe('引用：每一條都追得回來源頁，並帶當時版本', () => {
  it('顏色引用帶色彩頁那一版', () => {
    const refs = colourRefs(fullHomeDoc(), REF_INPUT);

    expect(refs.map((ref) => ref.item)).toEqual(['brand.primary', 'paper']);
    expect(refs.every((ref) => ref.page === 'color' && ref.version === 3 && ref.state === 'ok')).toBe(true);
  });

  it('三種追不到分開講：頁未有一版、認不到、未定值', () => {
    expect(colourRefs(fullHomeDoc(), REF_MISSING).map((ref) => ref.state)).toEqual([
      'missing-page',
      'missing-page',
    ]);

    const unknown = colourRefs({ ...fullHomeDoc(), color_order: { roles: ['neon'], note: '' } }, REF_INPUT);

    expect(unknown[0]?.state).toBe('unknown');

    const undecided = colourRefs(
      fullHomeDoc(),
      { ...REF_INPUT, colour: withRoleHex(fullColourDoc(), 'brand.primary', '') },
    );

    expect(undecided[0]?.state).toBe('missing-value');
  });

  it('標誌預設引用的是模式，模式要指向一件真的主標誌', () => {
    expect(logoRef(fullHomeDoc(), REF_INPUT)?.state).toBe('ok');
    // 未揀模式就沒有這條引用 —— 不是一條空的引用。
    expect(logoRef({ ...fullHomeDoc(), logo_default: '' }, REF_INPUT)).toBeNull();
    // 有模式但標誌頁未有一版。
    expect(logoRef(fullHomeDoc(), { ...REF_MISSING })?.state).toBe('missing-page');
  });

  it('字體分工的兩個名字要對得上字體頁的家族', () => {
    expect(typeRefs(fullHomeDoc(), REF_INPUT).map((ref) => ref.state)).toEqual(['ok', 'ok']);

    const typo = typeRefs({ ...fullHomeDoc(), type_split: { serif: 'Noto Serif', sans: 'Inter', note: '' } }, REF_INPUT);

    expect(typo[0]?.state).toBe('unknown');
    expect(typo[0]?.label).toBe('Noto Serif');
  });

  it('語氣樣本要逐字對得上語氣頁的樣本，不可以在主頁另寫一句', () => {
    expect(voiceRefs(fullHomeDoc(), REF_INPUT)[0]?.state).toBe('ok');

    const invented = voiceRefs(
      { ...fullHomeDoc(), voice_samples: ['這句話語氣頁沒有。'] },
      REF_INPUT,
    );

    expect(invented[0]?.state).toBe('unknown');
  });

  it('四種引用一次過：顏色、標誌、字體、語氣，次序固定', () => {
    const refs = homeRefs(fullHomeDoc(), REF_INPUT);

    expect(refs.map((ref) => ref.page)).toEqual(['color', 'color', 'logo', 'type', 'type', 'tone']);
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

  it('舊形狀（#39 的 intro ＋ logoMode）判 invalid，不當成空白主頁', () => {
    expect(parseHomeDoc(JSON.stringify({ intro: '滿月堂是一間診所。', logoMode: 'brand' }))).toEqual({
      kind: 'invalid',
    });
  });

  it('讀得返自己寫的', () => {
    const doc = fullHomeDoc();
    const parsed = parseHomeDoc(serializeHomeDoc(doc));

    expect(parsed.kind).toBe('ok');
    expect(parsed.kind === 'ok' && parsed.doc).toEqual(doc);
  });

  it('認不到的區塊種類退回 section，理由仍然留著', () => {
    const parsed = parseHomeDoc(
      JSON.stringify({ layout: [{ block: 'neon', source: 'x', emphasis: 'normal', reason: '為咩' }] }),
    );

    expect(parsed.kind === 'ok' && parsed.doc.layout[0]?.block).toBe('section');
    expect(parsed.kind === 'ok' && parsed.doc.layout[0]?.reason).toBe('為咩');
  });

  it('版本預覽先講「是誰」，抽不到講空 —— 不會假裝有', () => {
    expect(whoInText(serializeHomeDoc(fullHomeDoc()))).toBe(
      '滿月堂是一間用中醫調理皮膚與身體的診所，在香港銅鑼灣。',
    );
    expect(whoInText(serializeHomeDoc(thinHomeDoc()))).toBe('滿月堂是一間中醫診所。');
    expect(whoInText('{}')).toBe('');
  });
});

describe('缺什麼', () => {
  const input = (doc: HomeDoc, pages = PAGES) => ({ doc, pages, ...REF_INPUT });

  it('一樣都沒有寫：逐項都缺，兩頁未有現行版本', () => {
    const gaps = homeGaps(input(emptyHomeDoc()));

    expect(gaps.stance).toBe(true);
    expect(gaps.who).toBe(true);
    expect(gaps.keywords).toBe('empty');
    expect(gaps.colorOrder).toBe(true);
    expect(gaps.logoDefault).toBe(true);
    expect(gaps.typeSplit).toBe(true);
    expect(gaps.voiceSamples).toBe(true);
    expect(gaps.layout).toBe(true);
    expect(gaps.layoutReasons).toEqual([]);
    expect(gaps.pages).toEqual(['字體', '攝影']);
  });

  it('關鍵詞少過三個與多過五個分開講，不是一句「未夠」', () => {
    expect(homeGaps(input({ ...fullHomeDoc(), keywords: ['中醫', '美容'] })).keywords).toBe('tooFew');
    expect(
      homeGaps(input({ ...fullHomeDoc(), keywords: ['一', '二', '三', '四', '五', '六'] })).keywords,
    ).toBe('tooMany');
  });

  it('有一塊版面未寫理由：標出那個索引，而這一塊不會出現在輸出', () => {
    const gaps = homeGaps(input(withBlankReason(fullHomeDoc())));

    expect(gaps.layoutReasons).toEqual([2]);
  });

  it('四頁都未有現行版本：引用逐條標缺，不是畫一個空框', () => {
    const gaps = homeGaps({ doc: fullHomeDoc(), pages: PAGES, ...REF_MISSING });

    // 兩色 + 標誌 + 兩字體 + 一句語氣 = 六條。
    expect(gaps.refs.length).toBe(6);
    expect(gaps.refs.every((ref) => ref.state === 'missing-page')).toBe(true);
    expect(gaps.tone).toBe(true);
  });

  it('齊了就是零缺', () => {
    const gaps = homeGaps(
      input(fullHomeDoc(), PAGES.filter((item) => item.current !== null)),
    );

    expect(gaps.refs).toEqual([]);
    expect(gaps.pages).toEqual([]);
    expect(gapCount(gaps)).toBe(0);
  });

  it('主頁自己不計入「未有版本的頁」', () => {
    const gaps = homeGaps(
      input(fullHomeDoc(), [
        page({ key: 'home', name: '品牌主頁', sortOrder: 10, current: null }),
        page({ key: 'color', name: '色彩', sortOrder: 30 }),
      ]),
    );

    expect(gaps.pages).toEqual([]);
  });
});

describe('清單：語音樣本與系統', () => {
  it('同一句不重複加，移除按索引', () => {
    const doc = addVoiceSample(addVoiceSample(emptyHomeDoc(), '一句'), '一句');

    expect(doc.voice_samples).toEqual(['一句']);
  });

  it('系統一加就是一個空白系統，不是 undefined', () => {
    const doc = addSystem(emptyHomeDoc());

    expect(doc.systems).toEqual([{ name: '', note: '', refs: [] }]);
  });

  it('空表不會被寫成 JSON：一鍵清空要真的是空字串', () => {
    expect(serializeHomeDoc(emptyHomeDoc())).toContain('"layout":[]');
  });
});

// 保留一份「空表」的形狀參考：新增欄位時這一行會紅，提醒同步 EMPTY_DOC。
describe('空表', () => {
  it('九個欄位齊，不多不少', () => {
    expect(Object.keys(emptyHomeDoc()).sort()).toEqual(
      [
        'color_order',
        'keywords',
        'layout',
        'logo_default',
        'stance',
        'systems',
        'type_split',
        'voice_samples',
        'who',
      ].sort(),
    );
  });
});
