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
