import { describe, expect, it } from 'vitest';
import { schemaForPage } from '../src/brand/index.ts';

/**
 * 平台頁 v2.1（issue #89 第二項）。
 *
 * 這一頁是整本品牌書的根，所以測試集中在三件事：
 *   1. 關鍵詞由主頁搬過來：去重、保序、**不截斷**（截斷等於靜靜丟資料）。
 *   2. 缺口只計根本原因：立場、三檢、關鍵詞，加「候選」（只在立場還是空的時候）。
 *   3. 立場句缺的時候，prompt 整段只寫「缺」—— 不交一份半份立場出去。
 */
const platform = schemaForPage('platform', 'fixed');

function normalized(raw: unknown): Record<string, unknown> {
  return platform.normalize(raw) as unknown as Record<string, unknown>;
}

describe('平台頁 payload v2.1', () => {
  it('空文件有 keywords，是空陣列不是 undefined', () => {
    const empty = platform.empty() as unknown as Record<string, unknown>;

    expect(empty.keywords).toEqual([]);
  });

  it('讀 keywords：去重、保留次序', () => {
    const payload = normalized({
      stance: '一句立場。',
      keywords: ['安靜', '克制', '安靜', '屬於你的時間'],
    });

    expect(payload.keywords).toEqual(['安靜', '克制', '屬於你的時間']);
  });

  it('超過五個不截斷：多出來的留著，由人決定刪哪個', () => {
    const payload = normalized({
      keywords: ['一', '二', '三', '四', '五', '六'],
    });

    expect(payload.keywords).toEqual(['一', '二', '三', '四', '五', '六']);
  });

  it('空白與非字串的關鍵詞會被濾走，但不會令整份讀不到', () => {
    const payload = normalized({ keywords: ['安靜', '', '  ', 42, null, '克制'] });

    expect(payload.keywords).toEqual(['安靜', '克制']);
  });
});

describe('平台頁缺口 v2.1', () => {
  it('全空：立場 1 ＋ 三檢 3 ＋ 關鍵詞 1 ＋ 候選 1 ＝ 6 項', () => {
    const gaps = platform.gaps(platform.empty());

    expect(gaps).toHaveLength(6);
    expect(gaps.map((gap) => gap.item)).toContain('keywords');
    expect(gaps.map((gap) => gap.item)).toContain('stance_candidates');
  });

  it('立場已選定：候選那一項消失（不再叫 agent 交一份沒有人會讀的稿）', () => {
    const gaps = platform.gaps(
      normalized({
        stance: '先白，後墨，再藍。',
        stance_candidates: [],
        tests: { real: '做過什麼', relevant: '對誰有用', unique: '只有我們' },
        keywords: ['一', '二', '三'],
      }) as never,
    );

    expect(gaps).toHaveLength(0);
  });

  it('關鍵詞不足三個計一項，而且是判斷型（老闆的定位決定）', () => {
    const gaps = platform.gaps(
      normalized({
        stance: '一句立場。',
        tests: { real: 'a', relevant: 'b', unique: 'c' },
        keywords: ['一', '二'],
      }) as never,
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ item: 'keywords', type: 'judgement' });
  });

  it('三檢缺一項就計一項，帶 platform.r1', () => {
    const gaps = platform.gaps(
      normalized({
        stance: '一句立場。',
        tests: { real: 'a', relevant: '', unique: 'c' },
        keywords: ['一', '二', '三'],
      }) as never,
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ item: 'tests.relevant', ruleId: 'platform.r1' });
  });
});

describe('平台頁 prompt v2.1', () => {
  it('立場缺：整段只寫「缺」，不輸出定位、價值、特質', () => {
    const sections = platform.prompt(
      normalized({
        stance: '',
        positioning: { for: '誰', who: '我們', category: '類', benefit: '好處', unlike: '不同', because: '因為' },
        values: [{ name: '安靜', do: '先靜', dont: '促銷' }],
        traits: ['克制'],
      }) as never,
    );

    expect(sections).toEqual([{ title: '立場', lines: ['缺'] }]);
  });

  it('有立場：先出立場，再出關鍵詞與品牌本質', () => {
    const sections = platform.prompt(
      normalized({
        stance: '先白，後墨，再藍。',
        keywords: ['安靜', '克制', '屬於你的時間'],
        essence: '把一小時還給自己。',
      }) as never,
    );

    const text = sections[0]?.lines.join('\n') ?? '';

    expect(text).toContain('立場：先白，後墨，再藍。');
    expect(text).toContain('關鍵詞：安靜、克制、屬於你的時間');
    expect(text).toContain('品牌本質：把一小時還給自己。');
  });
});

describe('平台頁分區 v2.1', () => {
  it('有關鍵詞一區，而且是標籤輸入', () => {
    const section = platform.sections.find((item) => item.id === 'keywords');

    expect(section).toMatchObject({ kind: 'tags', path: 'keywords' });
  });

  it('「受眾」不再混入本質與目的：本質有自己的區', () => {
    const audience = platform.sections.find((item) => item.id === 'audience');
    const essence = platform.sections.find((item) => item.id === 'essence');

    expect(audience?.fields?.map((field) => field.path)).toEqual(['audience']);
    expect(essence?.fields?.map((field) => field.path)).toEqual(['essence', 'purpose']);
  });

  it('分區次序：立場 → 關鍵詞 → 本質 → 定位 → 價值 → 個性 → 受眾 → 三檢', () => {
    const ids = platform.sections.map((item) => item.id).filter((id) => id !== 'legacy');

    expect(ids).toEqual([
      'stance',
      'keywords',
      'essence',
      'positioning',
      'values',
      'traits',
      'audience',
      'tests',
    ]);
  });
});
