import { describe, expect, it } from 'vitest';
import {
  CONTEXT_KEYS,
  HARDEST_FIELDS,
  MAX_TRAITS,
  MIN_TRAITS,
  SAMPLE_KINDS,
  SAMPLE_TARGET,
  addBanned,
  addSample,
  addTrait,
  adjectiveOnly,
  bannedGaps,
  bannedTerms,
  bannedWithoutReason,
  emptyToneDoc,
  gapCount,
  hasAnyValue,
  parseToneDoc,
  removeBanned,
  removeSample,
  removeTrait,
  sampleCount,
  serializeToneDoc,
  setTrait,
  toneGaps,
  traitGaps,
  traitNamesInText,
  traitReady,
  type ToneDoc,
} from '../src/design/brandTone';
import { adjectiveTrait, fullToneDoc, fullTrait } from './fixtures/brandTone';

/**
 * 語氣頁的規則（issue #65）。畫面的測試在 `design-brand-tone.test.tsx`。
 *
 * 這一支只管**約束對不對**：三到五個特質、每個特質要有「會這樣講」
 * 「不會這樣講」**加一句真句**（只有形容詞不算）、禁用詞逐個有原因、
 * 語言政策、五個情境、五句像五句不像、最難的一句。
 */

const DOC = fullToneDoc();

describe('三個到五個聲音特質', () => {
  it('下限三個、上限五個', () => {
    expect(MIN_TRAITS).toBe(3);
    expect(MAX_TRAITS).toBe(5);
  });

  it('少過三個就標缺：講得出要補幾多個', () => {
    expect(toneGaps({ ...DOC, traits: DOC.traits.slice(0, 2) }).tooFew).toBe(true);
    expect(toneGaps(DOC).tooFew).toBe(false);
    expect(toneGaps(emptyToneDoc()).tooFew).toBe(true);
  });

  it('多過五個：讀入時只留前五個', () => {
    const many = parseToneDoc(
      JSON.stringify({
        ...DOC,
        traits: [fullTrait('一'), fullTrait('二'), fullTrait('三'), fullTrait('四'), fullTrait('五'), fullTrait('六')],
      }),
    );

    if (many.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(many.doc.traits.map((trait) => trait.name)).toEqual(['一', '二', '三', '四', '五']);
  });

  it('加到五個就停：第六個加不進去', () => {
    const full: ToneDoc = {
      ...DOC,
      traits: [fullTrait('一'), fullTrait('二'), fullTrait('三'), fullTrait('四'), fullTrait('五')],
    };

    expect(addTrait(full).traits).toHaveLength(5);
    expect(addTrait({ ...DOC, traits: [] }).traits).toHaveLength(1);
  });

  it('刪一個特質：其餘的次序不變', () => {
    const after = removeTrait(DOC, 1);

    expect(after.traits.map((trait) => trait.name)).toEqual(['直接', '不裝']);
  });
});

describe('只有形容詞不算', () => {
  it('名、會這樣講、不會這樣講、一句示範，四樣齊才算一條', () => {
    expect(traitGaps(fullTrait('直接'))).toEqual([]);
    expect(traitGaps({ ...fullTrait('直接'), sentence: '  ' })).toEqual(['sentence']);
    expect(traitGaps({ ...fullTrait('直接'), do: '' })).toEqual(['do']);
    expect(traitGaps({ ...fullTrait('直接'), dont: '' })).toEqual(['dont']);
    expect(traitGaps({ ...fullTrait('直接'), name: '' })).toEqual(['name']);
    expect(traitReady(fullTrait('直接'))).toBe(true);
  });

  it('「專業、友善、創新」這種只有形容詞的，標成缺（驗收第一條）', () => {
    const adjective = adjectiveTrait('專業');

    expect(adjectiveOnly(adjective)).toBe(true);
    expect(adjectiveOnly(fullTrait('直接'))).toBe(false);
    expect(traitGaps(adjective)).toEqual(['do', 'dont', 'sentence']);
  });

  it('缺的特質用索引指出來：payload 的特質冇 id', () => {
    const doc: ToneDoc = { ...DOC, traits: [fullTrait('直接'), adjectiveTrait('專業'), fullTrait('不裝')] };

    expect(toneGaps(doc).traits).toEqual([1]);
  });
});

describe('禁用詞逐個有原因', () => {
  it('一個禁用詞都沒有就是缺', () => {
    expect(toneGaps(DOC).banned).toBe(false);
    expect(toneGaps({ ...DOC, banned: [] }).banned).toBe(true);
  });

  it('有詞但冇原因：指出是第幾條（voice.r1 看的就是這個）', () => {
    const doc: ToneDoc = {
      ...DOC,
      banned: [
        { term: '賦能', reason: '意思空' },
        { term: '閉環', reason: '   ' },
        { term: '', reason: '未有詞' },
      ],
    };

    expect(bannedWithoutReason(doc)).toEqual([1]);
    expect(toneGaps(doc).bannedReasons).toEqual([1]);
    expect(bannedGaps(doc.banned[1] ?? { term: '', reason: '' })).toEqual(['reason']);
    expect(bannedGaps(doc.banned[2] ?? { term: '', reason: '' })).toEqual(['term']);
  });

  it('空白的詞不當成一個詞', () => {
    const doc: ToneDoc = { ...DOC, banned: [{ term: '  ', reason: '寫了原因' }] };

    expect(bannedTerms(doc)).toEqual([]);
    expect(toneGaps(doc).banned).toBe(true);
  });

  it('同一個詞加兩次不會出現兩行：第二個原因是第二份真相', () => {
    const doc = addBanned(DOC, '賦能', '第二次寫的原因');

    expect(bannedTerms(doc)).toEqual(['賦能', '閉環', '極致']);
    expect(addBanned(DOC, '   ', '空詞').banned).toHaveLength(3);
  });

  it('刪一個禁用詞：其餘不動', () => {
    expect(bannedTerms(removeBanned(DOC, 0))).toEqual(['閉環', '極致']);
  });
});

describe('語言政策與五個情境', () => {
  it('未答用哪種語言就是缺', () => {
    expect(toneGaps(DOC).languagePolicy).toBe(false);
    expect(toneGaps({ ...DOC, language_policy: '  ' }).languagePolicy).toBe(true);
  });

  it('五個情境，缺一個就逐個講得出是哪一個', () => {
    expect(CONTEXT_KEYS).toEqual(['explain', 'invite', 'decline', 'apologize', 'incident']);
    expect(toneGaps(DOC).contexts).toEqual([]);
    expect(toneGaps({ ...DOC, contexts: { ...DOC.contexts, decline: '  ' } }).contexts).toEqual(['decline']);
    expect(toneGaps(emptyToneDoc()).contexts).toEqual([...CONTEXT_KEYS]);
  });
});

describe('五句像、五句不像', () => {
  it('少過五句就標缺，兩邊分開數', () => {
    expect(SAMPLE_TARGET).toBe(5);
    expect(SAMPLE_KINDS).toEqual(['like', 'unlike']);
    expect(toneGaps(DOC).samples).toEqual([]);
    expect(
      toneGaps({ ...DOC, samples: { ...DOC.samples, unlike: DOC.samples.unlike.slice(0, 4) } }).samples,
    ).toEqual(['unlike']);
    expect(toneGaps(emptyToneDoc()).samples).toEqual(['like', 'unlike']);
  });

  it('空字串不算一句：五格有四格是空的，就是一句', () => {
    const doc: ToneDoc = { ...DOC, samples: { ...DOC.samples, like: ['一句真的', '  ', '', '', ''] } };

    expect(sampleCount(doc, 'like')).toBe(1);
    expect(toneGaps(doc).samples).toEqual(['like']);
  });

  it('加到五句就停，刪一句就少一句', () => {
    const four: ToneDoc = { ...DOC, samples: { ...DOC.samples, like: DOC.samples.like.slice(0, 4) } };

    expect(addSample(four, 'like').samples.like).toHaveLength(5);
    expect(addSample(DOC, 'like').samples.like).toHaveLength(5);
    expect(removeSample(DOC, 'like', 0).samples.like).toHaveLength(4);
  });
});

describe('最難的一句：錯的與對的都要寫', () => {
  it('兩邊分開標缺', () => {
    expect(HARDEST_FIELDS).toEqual(['wrong', 'right']);
    expect(toneGaps(DOC).hardest).toEqual([]);
    expect(toneGaps({ ...DOC, hardest_line: { wrong: '', right: DOC.hardest_line.right } }).hardest).toEqual([
      'wrong',
    ]);
    expect(toneGaps(emptyToneDoc()).hardest).toEqual(['wrong', 'right']);
  });
});

describe('缺的總數', () => {
  it('空表的十三個缺：立場、三個特質、禁用詞、語言政策、五個情境、兩邊樣本、兩句最難', () => {
    const gaps = toneGaps(emptyToneDoc());

    expect(gaps.stance).toBe(true);
    expect(gaps.traits).toEqual([]);
    expect(gaps.hardest).toEqual(['wrong', 'right']);
    // 立場 1 ＋ 特質不夠 1 ＋ 禁用詞 1 ＋ 語言政策 1 ＋ 情境 5 ＋ 樣本 2 ＋ 最難 2
    expect(gapCount(gaps)).toBe(13);
    expect(gapCount(toneGaps(DOC))).toBe(0);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty，舊的自由文字與任意 JSON 都是 invalid', () => {
    expect(parseToneDoc('').kind).toBe('empty');
    expect(parseToneDoc('語氣要專業、友善。').kind).toBe('invalid');
    expect(parseToneDoc('{"note":"語氣"}').kind).toBe('invalid');
  });

  it('舊形狀（situations／bilingual）讀不到：不畫五個假的缺', () => {
    expect(parseToneDoc(JSON.stringify({ traits: [], situations: {}, bilingual: 'zhFirst' })).kind).toBe('invalid');
    expect(parseToneDoc(JSON.stringify({ traits: [], bilingualNote: '中英並用' })).kind).toBe('invalid');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseToneDoc(serializeToneDoc(DOC));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(DOC);
  });

  it('全空的表不佔一版', () => {
    expect(hasAnyValue(emptyToneDoc())).toBe(false);
    expect(hasAnyValue({ ...emptyToneDoc(), language_policy: '一律繁中' })).toBe(true);
    expect(hasAnyValue({ ...emptyToneDoc(), banned: [{ term: '賦能', reason: '空' }] })).toBe(true);
  });

  it('改一條特質不影響其他條', () => {
    const after = setTrait(DOC, 0, { sentence: '新的一句' });

    expect(after.traits[0]?.sentence).toBe('新的一句');
    expect(after.traits[1]).toEqual(DOC.traits[1]);
  });

  it('版本預覽抽得到特質名，抽不到就空', () => {
    expect(traitNamesInText('{"traits":[{"name":"直接","do":"講清楚"')).toEqual(['直接']);
    expect(traitNamesInText('語氣要專業')).toEqual([]);
  });
});
