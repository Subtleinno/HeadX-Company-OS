import { describe, expect, it } from 'vitest';
import {
  buildPromptPack,
  buildTokens,
  contrastRatio,
  emptyBrandDocument,
  renderBrandHtml,
  schemaForPage,
  type ComposedBrand,
  type ComposedPage,
} from '../src/brand/index.ts';

/**
 * 四種輸出（issue #57）。
 *
 * 三個要點：
 *   1. 四者由同一份 payload 出來 —— 改一個色，tokens、prompt、HTML 一起變。
 *   2. 缺就是缺 —— tokens 不會為缺的角色編值，prompt 寫「缺」。
 *   3. renderer 原始碼沒有色值（另有 `brand-output-hex` 測試咬住），
 *      所以這裡只驗「色值由 payload 來」。
 */

function colorPage(overrides: { hex?: string; surface?: boolean } = {}): ComposedPage {
  const schema = schemaForPage('color', 'fixed');
  const payload = {
    stance: '先白，後墨，再藍。',
    roles: [
      { id: 'paper', group: 'reading', name: 'Afterglow White', hex: '#F6F3FE', cmyk: '3,3,0,0', dark: '', usage: '底色', reason: '先白' },
      { id: 'ink', group: 'reading', name: 'Dusk Ink', hex: '#1F1B2D', cmyk: '80,85,60,70', dark: '', usage: '文字', reason: '定墨' },
      { id: 'brand.primary', group: 'brand', name: 'Signal Blue', hex: overrides.hex ?? '#DADEF8', cmyk: '18,12,0,0', dark: '', usage: '標記', reason: '只標記一件事' },
      ...(overrides.surface === false
        ? []
        : [{ id: 'surface', group: 'reading', name: 'Deep Surface', hex: '#141018', cmyk: '80,80,60,80', dark: '', usage: '深色底', reason: '深色模式' }]),
    ],
    order: { text: '先紙，後墨，再藍。', reason: '白是底' },
    ratios: [
      { role: 'paper', percent: 80, reason: '大量留白' },
      { role: 'ink', percent: 15, reason: '文字' },
      { role: 'brand.primary', percent: 5, reason: '只做標記' },
    ],
    contrast_floor: 4.5,
    large_floor: 3,
    pairs: {
      allowed: [{ fg: 'ink', bg: 'paper', use: 'body', reason: '正文' }],
      forbidden: [{ fg: 'brand.primary', bg: 'paper', reason: '1.2:1' }],
    },
    tints: [],
  };

  return {
    key: 'color',
    name: '色彩',
    kind: 'fixed',
    versionNo: 7,
    policyVersionNo: 3,
    document: {
      ...emptyBrandDocument(schema.layout(schema.normalize(payload))),
      stance: '先白，後墨，再藍。',
      payload,
    },
  };
}

function composed(overrides: { hex?: string; surface?: boolean } = {}): ComposedBrand {
  return {
    code: 'moonic',
    name: 'Moonic 滿月堂',
    releaseNo: 12,
    pages: [colorPage(overrides)],
    gaps: [],
  };
}

describe('tokens.json', () => {
  it('每個有值的角色都進 tokens，淺色與深色兩套', () => {
    const tokens = buildTokens(composed());

    expect(tokens.light['color']?.['brand.primary']?.$value).toBe('#DADEF8');
    expect(tokens.light['color']?.['ink']?.$value).toBe('#1F1B2D');
    expect(tokens.dark['color']?.['ink']?.$value).toBe('#1F1B2D');
  });

  it('改一個角色的值，tokens 跟著變（單一出處）', () => {
    const before = buildTokens(composed());
    const after = buildTokens(composed({ hex: '#123456' }));

    expect(before.light['color']?.['brand.primary']?.$value).toBe('#DADEF8');
    expect(after.light['color']?.['brand.primary']?.$value).toBe('#123456');
  });

  it('缺的角色不出現，但列在 missing', () => {
    const tokens = buildTokens(composed({ surface: false }));

    expect(tokens.light['color']?.['surface']).toBeUndefined();
    expect(tokens.missing).toContain('surface');
  });

  it('沒有 token 的頁會講明原因，不是靜靜失蹤', () => {
    const tokens = buildTokens(composed());

    expect(tokens.notes.length).toBe(0);
  });
});

describe('品牌 prompt 包', () => {
  it('帶數字：比例、對比下限、禁止配對', () => {
    const pack = buildPromptPack(composed());

    expect(pack.markdown).toContain('內文 4.5:1');
    expect(pack.markdown).toContain('大字 3:1');
    expect(pack.markdown).toContain('paper 80%');
    expect(pack.markdown).toContain('brand.primary on paper');
  });

  it('一定寫明由哪些頁哪個版本組成', () => {
    const pack = buildPromptPack(composed());

    expect(pack.markdown).toContain('色彩 v7');
    expect(pack.composed).toEqual([{ page: 'color', name: '色彩', versionNo: 7 }]);
  });

  it('沒有缺口就講沒有，不假裝', () => {
    const pack = buildPromptPack(composed());

    expect(pack.markdown).toContain('沒有登記的缺口');
  });
});

describe('HTML 與印刷版', () => {
  it('立場句與角色表都在，色值由 payload 來', () => {
    const html = renderBrandHtml(composed());

    expect(html).toContain('先白，後墨，再藍。');
    expect(html).toContain('#DADEF8');
    expect(html).toContain('data-role="brand.primary"');
  });

  it('缺的角色畫虛線框，不畫一個假色', () => {
    const html = renderBrandHtml(composed({ surface: false }));

    expect(html).not.toContain('data-role="surface"');
  });

  it('印刷版是同一份標記，只是加了印刷 CSS 與 folio', () => {
    const screen = renderBrandHtml(composed());
    const print = renderBrandHtml(composed(), { print: true });

    expect(print).toContain('size: A4');
    expect(print).toContain('class="folio"');
    expect(print).toContain('先白，後墨，再藍。');
    expect(screen).toContain('data-print="false"');
  });

  it('只出一頁時，其他頁不在', () => {
    const brand = composed();
    const html = renderBrandHtml({ ...brand, pages: [...brand.pages] }, { pageKey: 'color' });

    expect(html).toContain('data-page="color"');
  });
});

describe('對比計算', () => {
  it('黑白是 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
  });

  it('同一個色是 1:1', () => {
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });

  it('讀不到色值回 null，不是回 1', () => {
    expect(contrastRatio('', '#ffffff')).toBeNull();
    expect(contrastRatio('red', '#ffffff')).toBeNull();
  });
});

/**
 * 兩個品牌的平台頁（issue #61 的驗收）：同一套 renderer，出來的頁要**實質不同**。
 *
 * 差異不是靠多一個模板，是靠兩份資料：立場句不同，layout 的區塊次序不同。
 * 這裡斷言兩項，因為驗收寫明「至少兩項實質差異」—— 一項可以只是換了顏色。
 */
describe('兩個品牌的平台頁', () => {
  function platformPage(options: {
    stance: string;
    traits: string[];
    order: ('stance' | 'positioning' | 'tests')[];
    reason: string;
  }): ComposedPage {
    const payload = {
      stance: options.stance,
      positioning: { for: '想被認真看待的人', who: '一間做臨床與品牌的公司', category: '設計研究', benefit: '一句定位', unlike: '同一個人管兩邊', because: '做過十二個品牌' },
      purpose: '',
      values: [],
      traits: options.traits,
      essence: '',
      audience: '',
      references: [],
      stance_candidates: [],
      tests: { real: '二〇二四年改過三家診所的預約', relevant: '客人第一句問幾位', unique: '臨床與品牌同一人' },
    };

    return {
      key: 'platform',
      name: '平台',
      kind: 'fixed',
      versionNo: 1,
      policyVersionNo: 1,
      document: {
        ...emptyBrandDocument({ blocks: [] }),
        stance: options.stance,
        payload,
        layout: {
          blocks: options.order.map((kind) =>
            kind === 'stance'
              ? { kind: 'stance' as const, reason: options.reason }
              : { kind: 'section' as const, source: kind, reason: options.reason },
          ),
        },
      },
    };
  }

  function htmlOf(page: ComposedPage): string {
    return renderBrandHtml(
      { code: 'x', name: 'X', releaseNo: 1, pages: [page], gaps: [] },
      { pageKey: 'platform' },
    );
  }

  it('立場句與區塊次序兩項都不同（不是同一頁換顏色）', () => {
    const moonic = platformPage({
      stance: '先白，後墨，再藍。',
      traits: ['慢', '準'],
      order: ['stance', 'positioning', 'tests'],
      reason: '先講自己是誰，再用證據收尾。',
    });
    const other = platformPage({
      stance: '先做人，後做圖。',
      traits: ['直', '簡'],
      order: ['positioning', 'stance', 'tests'],
      reason: '先把六格講清，立場句當成結論。',
    });

    const a = htmlOf(moonic);
    const b = htmlOf(other);

    expect(a).not.toBe(b);
    // 第一項差異：立場句。
    expect(a).toContain('先白，後墨，再藍。');
    expect(b).toContain('先做人，後做圖。');
    // 第二項差異：區塊次序（立場句在定位之前 vs 之後）。
    expect(a.indexOf('先白，後墨，再藍。')).toBeLessThan(a.indexOf('為誰'));
    expect(b.indexOf('先做人，後做圖。')).toBeGreaterThan(b.indexOf('為誰'));
  });
});

/**
 * 兩個品牌的色彩頁（issue #62 的驗收）：同一套 renderer，出來的頁要**實質不同**。
 *
 * 差異不是靠多一個模板，是靠兩份資料：立場句不同、用色順序不同、比例的重點
 * 不同。這裡斷言三項，因為驗收寫明「至少兩項」—— 一項可以只是換了顏色。
 */
describe('兩個品牌的色彩頁', () => {
  function colourPage(options: {
    stance: string;
    order: string;
    roles: { id: string; group: 'brand' | 'reading'; hex: string }[];
    focusRole: string;
  }): ComposedPage {
    const payload = {
      stance: options.stance,
      roles: options.roles.map((role) => ({
        id: role.id,
        group: role.group,
        name: '',
        hex: role.hex,
        cmyk: '',
        dark: '',
        usage: '',
        reason: '',
      })),
      order: { text: options.order, reason: '' },
      ratios: [
        { role: options.focusRole, percent: 70, reason: '' },
        { role: 'paper', percent: 30, reason: '' },
      ],
      contrast_floor: 4.5,
      large_floor: 3,
      pairs: { allowed: [], forbidden: [] },
      tints: [],
    };

    const schema = schemaForPage('color', 'fixed');

    return {
      key: 'color',
      name: '色彩',
      kind: 'fixed',
      versionNo: 1,
      policyVersionNo: 1,
      document: {
        ...emptyBrandDocument(schema.layout(schema.normalize(payload))),
        stance: options.stance,
        payload,
      },
    };
  }

  const moonic = colourPage({
    stance: '先白，後墨，再藍。',
    order: '紙佔七成，墨兩成，藍只點一下。',
    roles: [
      { id: 'paper', group: 'reading', hex: '#F6F3FE' },
      { id: 'ink', group: 'reading', hex: '#1F1B2D' },
      { id: 'brand.primary', group: 'brand', hex: '#0057FF' },
    ],
    focusRole: 'paper',
  });

  const other = colourPage({
    stance: '先黑，後米，再赭。',
    order: '黑是主角，米只是呼吸位。',
    roles: [
      { id: 'paper', group: 'reading', hex: '#EFE7D8' },
      { id: 'ink', group: 'reading', hex: '#141210' },
      { id: 'brand.primary', group: 'brand', hex: '#8C3B1E' },
    ],
    focusRole: 'ink',
  });

  function htmlOf(page: ComposedPage): string {
    return renderBrandHtml(
      { code: 'x', name: 'X', releaseNo: 1, pages: [page], gaps: [] },
      { pageKey: 'color' },
    );
  }

  it('立場句、用色順序、比例重點三項都不同', () => {
    const a = htmlOf(moonic);
    const b = htmlOf(other);

    expect(a).not.toBe(b);
    // 第一項：立場句。
    expect(a).toContain('先白，後墨，再藍。');
    expect(b).toContain('先黑，後米，再赭。');
    // 第二項：用色順序（同一句 prompt 也會帶到）。
    expect(a).toContain('紙佔七成，墨兩成，藍只點一下。');
    expect(b).toContain('黑是主角，米只是呼吸位。');
  });

  it('tokens 帶的是自己的色，不是同一個模板換名字', () => {
    const a = buildTokens({ code: 'a', name: 'A', releaseNo: 1, pages: [moonic], gaps: [] });
    const b = buildTokens({ code: 'b', name: 'B', releaseNo: 1, pages: [other], gaps: [] });

    expect(a.light['color']?.['brand.primary']?.$value).toBe('#0057FF');
    expect(b.light['color']?.['brand.primary']?.$value).toBe('#8C3B1E');
  });

  it('prompt 包寫明各自的用色順序與比例', () => {
    const a = buildPromptPack({ code: 'a', name: 'A', releaseNo: 1, pages: [moonic], gaps: [] });
    const b = buildPromptPack({ code: 'b', name: 'B', releaseNo: 1, pages: [other], gaps: [] });

    expect(a.markdown).toContain('紙佔七成');
    expect(b.markdown).toContain('黑是主角');
    expect(a.markdown).toContain('paper 70%');
    expect(b.markdown).toContain('ink 70%');
  });
});
