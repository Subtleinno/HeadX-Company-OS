import { describe, expect, it } from 'vitest';
import {
  buildPromptPack,
  buildTokens,
  emptyBrandDocument,
  renderBrandHtml,
  schemaForPage,
  type ComposedBrand,
  type ComposedPage,
} from '../src/brand/index.ts';

/**
 * 整合驗收（issue #69 第 4 點）：兩個內容不同的品牌，走完同一條輸出管線，
 * 差異要**可數**。
 *
 * 這一支不是「畫面截圖對照」的替代品，而是它下面的地基：如果兩個品牌的
 * payload 只差一個色值，畫面就只會差一個色值。這裡逐項證明四種輸出都真的
 * 由 payload 決定 —— tokens、字體、版面次序、語氣、HTML 立場。
 */

function composedPage(key: 'home' | 'color' | 'type' | 'tone', payload: unknown): ComposedPage {
  const schema = schemaForPage(key, 'fixed');
  const normalized = schema.normalize(payload);

  return {
    key,
    name: schema.name,
    kind: 'fixed',
    versionNo: 3,
    policyVersionNo: 1,
    document: {
      ...emptyBrandDocument(schema.layout(normalized)),
      stance: typeof (payload as { stance?: string }).stance === 'string' ? (payload as { stance: string }).stance : '',
      payload: normalized,
    },
  };
}

type BrandSpec = {
  code: string;
  name: string;
  stance: string;
  primary: string;
  paper: string;
  ink: string;
  families: { id: string; name: string; script: 'latin' | 'chinese' }[];
  layout: { block: string; source: string; emphasis: 'lead' | 'normal'; reason: string }[];
  toneSentence: string;
};

function brand(spec: BrandSpec): ComposedBrand {
  const tone = {
    stance: spec.stance,
    traits: [{ name: '直接', do: '講清楚要對方做甚麼', dont: '轉彎', sentence: spec.toneSentence }],
    banned: [{ term: '賦能', reason: '意思空' }],
    language_policy: '廣東話口語，書面用繁體。',
    contexts: {
      explain: '這個療程要做三次。',
      invite: '星期三下午有位。',
      decline: '這個我們做唔到。',
      apologize: '遲了回覆，抱歉。',
      incident: '已經停用那批貨。',
    },
    samples: { like: [spec.toneSentence], unlike: ['盡快回覆。'] },
    hardest_line: { wrong: '我哋會盡快覆你。', right: '星期四之前覆你。' },
  };

  return {
    code: spec.code,
    name: spec.name,
    releaseNo: 4,
    pages: [
      composedPage('color', {
        stance: spec.stance,
        roles: [
          { id: 'paper', group: 'reading', name: 'Paper', hex: spec.paper, cmyk: '', dark: '', usage: '底', reason: '底' },
          { id: 'ink', group: 'reading', name: 'Ink', hex: spec.ink, cmyk: '', dark: '', usage: '字', reason: '字' },
          { id: 'brand.primary', group: 'brand', name: 'Primary', hex: spec.primary, cmyk: '', dark: '', usage: '標記', reason: '只標一件事' },
        ],
        order: { text: '先底，後字，再主色。', reason: '主色少用' },
        ratios: [
          { role: 'paper', percent: 80, reason: '留白' },
          { role: 'ink', percent: 15, reason: '文字' },
          { role: 'brand.primary', percent: 5, reason: '標記' },
        ],
        contrast_floor: 4.5,
        large_floor: 3,
        pairs: { allowed: [], forbidden: [] },
        tints: [],
      }),
      composedPage('type', {
        stance: '',
        philosophy: '字要撐得住一整頁。',
        families: spec.families.map((family) => ({
          id: family.id,
          script: family.script,
          name: family.name,
          license_web: 'SIL OFL 1.1，可嵌入',
          license_print: '',
          license_app: '',
          license_desktop: '',
          file_ref: `fonts/${family.name}.woff2`,
        })),
        roles: [
          {
            role: 'heading',
            family: spec.families[0]?.id ?? '',
            weight: '600',
            size: '28px',
            leading: '1.3',
            min: 20,
            measure: '32 字元',
            color_role: 'ink',
            reason: '',
          },
        ],
        pairing: '中文講資訊，拉丁講數字。',
        sentence_anatomy: '',
        mixed_setting: '',
        print_matrix: [],
        misuse: [],
      }),
      composedPage('tone', tone),
      composedPage('home', {
        stance: spec.stance,
        who: `${spec.name} 是這一間公司。`,
        keywords: ['甲', '乙', '丙'],
        color_order: { roles: ['paper', 'brand.primary'], note: '' },
        logo_default: 'brand',
        type_split: { serif: spec.families[0]?.name ?? '', sans: spec.families[1]?.name ?? '', note: '' },
        voice_samples: [spec.toneSentence],
        systems: [],
        layout: spec.layout,
      }),
    ],
    gaps: [],
  };
}

const MOONIC = brand({
  code: 'moonic',
  name: 'Moonic 滿月堂',
  stance: '我們相信護理應該講得出理由。',
  primary: '#0057FF',
  paper: '#FFFFFF',
  ink: '#191919',
  families: [
    { id: 'f-serif', name: 'Noto Serif TC', script: 'chinese' },
    { id: 'f-sans', name: 'Inter', script: 'latin' },
  ],
  layout: [
    { block: 'swatches', source: '色彩頁', emphasis: 'lead', reason: '先給證據' },
    { block: 'quotes', source: '語氣頁', emphasis: 'normal', reason: '再講口氣' },
  ],
  toneSentence: '請你星期三之前回覆。',
});

const CHEONG_KEE = brand({
  code: 'cheong-kee',
  name: '張記食品',
  stance: '我們賣的是每日新鮮做的，不是包裝。',
  primary: '#8B1E1E',
  paper: '#FBF7EF',
  ink: '#2B2620',
  families: [
    { id: 'f-serif', name: 'Source Han Serif', script: 'chinese' },
    { id: 'f-sans', name: 'IBM Plex Sans', script: 'latin' },
  ],
  layout: [
    { block: 'quotes', source: '語氣頁', emphasis: 'lead', reason: '先講街坊點講' },
    { block: 'swatches', source: '色彩頁', emphasis: 'normal', reason: '再給色' },
  ],
  toneSentence: '今朝六點開始賣，賣完就冇。',
});

describe('兩個品牌走同一條管線：差異可數', () => {
  it('一、tokens 的主色與底色不同（色值只由 payload 來）', () => {
    const moonic = buildTokens(MOONIC);
    const cheongKee = buildTokens(CHEONG_KEE);

    expect(moonic.light['color']?.['brand.primary']?.$value).toBe('#0057FF');
    expect(cheongKee.light['color']?.['brand.primary']?.$value).toBe('#8B1E1E');
    expect(moonic.light['color']?.['paper']?.$value).not.toBe(cheongKee.light['color']?.['paper']?.$value);
  });

  it('二、prompt 的字體家族不同', () => {
    const moonic = buildPromptPack(MOONIC).markdown;
    const cheongKee = buildPromptPack(CHEONG_KEE).markdown;

    expect(moonic).toContain('Noto Serif TC');
    expect(moonic).toContain('Inter');
    expect(cheongKee).toContain('Source Han Serif');
    expect(cheongKee).not.toContain('Noto Serif TC');
  });

  it('三、主頁的版面次序不同（同一個 block 詞彙，不同判斷）', () => {
    const moonic = buildPromptPack(MOONIC).markdown;
    const cheongKee = buildPromptPack(CHEONG_KEE).markdown;

    expect(moonic).toContain('1. swatches');
    expect(moonic).toContain('2. quotes');
    expect(cheongKee).toContain('1. quotes');
    expect(cheongKee).toContain('2. swatches');
  });

  it('四、語氣樣本不同，而且各自的句子只出現在自己的 prompt', () => {
    const moonic = buildPromptPack(MOONIC).markdown;
    const cheongKee = buildPromptPack(CHEONG_KEE).markdown;

    expect(moonic).toContain('請你星期三之前回覆。');
    expect(moonic).not.toContain('今朝六點開始賣');
    expect(cheongKee).toContain('今朝六點開始賣');
    expect(cheongKee).not.toContain('請你星期三之前回覆。');
  });

  it('五、HTML 的立場句不同，色值也不同', () => {
    // renderer 自己沒有色值：畫面上的色只能由 payload 來。
    const moonic = renderBrandHtml(MOONIC);
    const cheongKee = renderBrandHtml(CHEONG_KEE);

    expect(moonic).toContain('我們相信護理應該講得出理由。');
    expect(cheongKee).toContain('我們賣的是每日新鮮做的');
    expect(moonic).toContain('#0057FF');
    expect(cheongKee).toContain('#8B1E1E');
    expect(moonic).not.toContain('#8B1E1E');
  });

  it('兩個品牌的組成頁一樣多，所以差異不是「一邊多了一頁」', () => {
    const moonic = buildPromptPack(MOONIC).composed.map((item) => item.page);
    const cheongKee = buildPromptPack(CHEONG_KEE).composed.map((item) => item.page);

    expect(moonic.length).toBe(4);
    expect(cheongKee.length).toBe(4);
    expect(moonic).toEqual(cheongKee);
  });
});
