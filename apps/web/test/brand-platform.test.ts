import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLATFORM_DOC,
  buildPlatformDoc,
  candidatesOf,
  hasAnyValue,
  isBlank,
  missingTests,
  parsePlatformDoc,
  platformGapCount,
  serializePlatformDoc,
} from '../src/design/brandPlatform';

/**
 * 平台頁的內容模型（issue #61）。
 *
 * 這一支驗的是「讀得對、算得對」：立場句與三檢是缺口，候選少過三個也是缺口
 * （檔案型），而舊的自由文字不可以被當成一份填好的文件。
 */

const FULL = {
  stance: '先白，後墨，再藍。',
  keywords: ['安靜', '克制', '屬於你的時間'],
  positioning: {
    for: '想被認真看待的人',
    who: '一間做臨床與品牌的公司',
    category: '設計研究',
    benefit: '一句可以用的定位',
    unlike: '同時做臨床與品牌',
    because: '二〇二四年起做了十二個品牌',
  },
  purpose: '令專業講得清',
  values: [{ name: '先專業', do: '先寫證據', dont: '先寫形容詞' }],
  traits: ['慢', '準'],
  essence: '一句頂十句',
  audience: '老闆與設計師',
  references: ['Kinfolk：留白'],
  stance_candidates: [
    { text: '先白，後墨，再藍。', reason: '白是底' },
    { text: '少即是多。', reason: '減法' },
    { text: '只做一件事。', reason: '專注' },
  ],
  tests: { real: '二〇二四年幫三家診所改過預約', relevant: '客人第一句問幾時有位', unique: '同一個人管臨床與品牌' },
};

describe('讀現行內容', () => {
  it('空白＝一份空文件，不是錯誤', () => {
    const parsed = parsePlatformDoc('');

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.doc).toEqual(EMPTY_PLATFORM_DOC);
  });

  it('舊的自由文字讀不到結構：如實回 not_json', () => {
    const parsed = parsePlatformDoc('這是一段舊的自由文字，不是 JSON。');

    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toBe('not_json');
  });

  it('舊的自定義頁 JSON 不會被當成平台文件', () => {
    const parsed = parsePlatformDoc(JSON.stringify({ decided: '產品照用柔光箱' }));

    expect(parsed.ok).toBe(false);
  });

  it('讀得返的 JSON：每個欄位都在，缺的是空字串', () => {
    const parsed = parsePlatformDoc(JSON.stringify({ stance: '一句', positioning: { for: '誰' } }));

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.doc.stance).toBe('一句');
      expect(parsed.doc.positioning.for).toBe('誰');
      expect(parsed.doc.positioning.because).toBe('');
      expect(parsed.doc.tests.unique).toBe('');
      expect(parsed.doc.values).toEqual([]);
    }
  });

  it('寫出去再讀返，是同一個文件', () => {
    const doc = buildPlatformDoc(FULL);
    const again = parsePlatformDoc(serializePlatformDoc(doc));

    expect(again.ok).toBe(true);
    expect(again.ok && again.doc).toEqual(doc);
  });
});

describe('缺口算得對', () => {
  it('全空：立場 1 ＋ 三檢 3 ＋ 關鍵詞 1 ＋ 候選 1 ＝ 六個缺口', () => {
    expect(missingTests(EMPTY_PLATFORM_DOC)).toEqual(['real', 'relevant', 'unique']);
    expect(platformGapCount(EMPTY_PLATFORM_DOC)).toBe(6);
  });

  it('填齊了就是零', () => {
    const doc = buildPlatformDoc(FULL);

    expect(platformGapCount(doc)).toBe(0);
  });

  it('有立場、冇證據：缺口是缺的那幾項，不是全部', () => {
    const doc = buildPlatformDoc({ ...FULL, tests: { real: '有', relevant: '', unique: '' } });

    expect(missingTests(doc)).toEqual(['relevant', 'unique']);
    // 立場有、候選有：只剩兩項證據。
    expect(platformGapCount(doc)).toBe(2);
  });

  it('立場空時候選不足三個才算一個缺口（交回 agent 出候選）', () => {
    const doc = buildPlatformDoc({
      ...FULL,
      stance: '',
      stance_candidates: [{ text: '一句', reason: '因為' }],
    });

    expect(candidatesOf(doc)).toHaveLength(1);
    // 立場空 1 ＋ 候選 1。
    expect(platformGapCount(doc)).toBe(2);
  });

  it('立場已選定：候選不足不再計缺口', () => {
    const doc = buildPlatformDoc({ ...FULL, stance_candidates: [{ text: '一句', reason: '因為' }] });

    expect(platformGapCount(doc)).toBe(0);
  });

  it('關鍵詞不足三個計一項，已經選定立場也照計', () => {
    const doc = buildPlatformDoc({ ...FULL, keywords: ['安靜', '克制'] });

    expect(platformGapCount(doc)).toBe(1);
  });

  it('關鍵詞超過五個不截斷，缺口不因此增加（由人刪，不靜靜丟）', () => {
    const doc = buildPlatformDoc({ ...FULL, keywords: ['一', '二', '三', '四', '五', '六'] });

    expect(doc.keywords).toHaveLength(6);
    expect(platformGapCount(doc)).toBe(0);
  });
});

describe('全空判斷', () => {
  it('一個字都未填＝空（儲存鍵因此不出現「已填」的錯覺）', () => {
    expect(hasAnyValue(EMPTY_PLATFORM_DOC)).toBe(false);
  });

  it('只寫了一個定位格：已經算有內容', () => {
    const doc = buildPlatformDoc({ positioning: { for: '誰' } });

    expect(hasAnyValue(doc)).toBe(true);
  });

  it('只有 agent 交來的候選：仍然算全空（候選不是這一頁的內容）', () => {
    const doc = buildPlatformDoc({ stance_candidates: [{ text: '一句', reason: '因為' }] });

    expect(isBlank(doc)).toBe(true);
  });

  it('有立場句就不再全空', () => {
    expect(isBlank(buildPlatformDoc({ stance: '先白，後墨。' }))).toBe(false);
  });
});
