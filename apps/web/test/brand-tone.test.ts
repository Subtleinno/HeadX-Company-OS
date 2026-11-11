import { describe, expect, it } from 'vitest';
import {
  BILINGUAL_MODES,
  MAX_TRAITS,
  MIN_TRAITS,
  SITUATION_KEYS,
  emptyToneDoc,
  gapCount,
  hasAnyValue,
  parseToneDoc,
  serializeToneDoc,
  toneGaps,
  traitGaps,
  traitNamesInText,
  type ToneDoc,
  type ToneTrait,
} from '../src/design/brandTone';

/**
 * 語氣頁的規則（issue #37）。畫面的測試在 `design-brand-tone.test.tsx`。
 *
 * 這一支只管**約束對不對**：三到五個特質、每個特質要有做與不做而且**兩邊都有
 * 實際句子**（只有形容詞不算）、禁用詞、中英是否並用、五個情境各要有例句。
 * 策略原文（`brand_policy_version` 語氣槽）就是這幾句。
 */

const DIRECT: ToneTrait = {
  id: 't-1',
  name: '直接',
  does: '講清楚要對方做甚麼',
  doesExample: '星期四下午三點前把樣板寄回，唔該。',
  doesNot: '不用「請盡快」這種講了等於無講的話',
  doesNotExample: '請盡快回覆，謝謝。',
};

const WARM: ToneTrait = {
  id: 't-2',
  name: '有溫度',
  does: '先認同對方的事，再講做法',
  doesExample: '明白你趕時間。我今日幫你排進去。',
  doesNot: '不假裝熱情，也不用感嘆號堆氣勢',
  doesNotExample: '太棒了！！！好開心！！！',
};

const PLAIN: ToneTrait = {
  id: 't-3',
  name: '不裝',
  does: '用日常講法，不用行業術語',
  doesExample: '呢個療程要分三次做。',
  doesNot: '不講「賦能」「閉環」這類字',
  doesNotExample: '我們賦能客戶的增長閉環。',
};

const DOC: ToneDoc = {
  traits: [DIRECT, WARM, PLAIN],
  banned: ['賦能', '閉環', '極致'],
  bilingual: 'zhFirst',
  bilingualNote: '療程名要保留英文原名，其餘一律繁中。',
  situations: {
    explain: '呢個療程分三次做，每次隔兩星期。',
    invite: '下星期三下午有位，你想上午定下午？',
    refuse: '呢個做法我們做唔到，但我可以幫你轉介。',
    apologise: '上一次等得太久，是我們排期出錯。',
    incident: '系統今早出問題，你今日的預約我已經改到星期五。',
  },
};

describe('三個到五個聲音特質', () => {
  it('下限三個、上限五個', () => {
    expect(MIN_TRAITS).toBe(3);
    expect(MAX_TRAITS).toBe(5);
  });

  it('少過三個就標缺：講得出要補幾多個', () => {
    const two: ToneDoc = { ...DOC, traits: [DIRECT, WARM] };

    expect(toneGaps(two).tooFew).toBe(true);
    expect(toneGaps(DOC).tooFew).toBe(false);
    expect(toneGaps(emptyToneDoc()).tooFew).toBe(true);
  });

  it('多過五個：讀入時只留前五個', () => {
    const many = parseToneDoc(
      JSON.stringify({
        traits: [DIRECT, WARM, PLAIN, { ...DIRECT, id: 't-4' }, { ...DIRECT, id: 't-5' }, { ...DIRECT, id: 't-6' }],
      }),
    );

    if (many.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(many.doc.traits.map((trait) => trait.id)).toEqual(['t-1', 't-2', 't-3', 't-4', 't-5']);
  });
});

describe('只有形容詞不算', () => {
  it('做與不做兩邊都要有實際句子才算一個特質', () => {
    expect(traitGaps(DIRECT)).toEqual([]);
    expect(traitGaps({ ...DIRECT, doesExample: '' })).toEqual(['doesExample']);
    expect(traitGaps({ ...DIRECT, doesNotExample: '   ' })).toEqual(['doesNotExample']);
    expect(traitGaps({ ...DIRECT, name: '' })).toEqual(['name']);
  });

  it('「專業、友善、創新」這種只有名的，兩個句子都缺', () => {
    const adjective: ToneTrait = {
      id: 't-9',
      name: '專業',
      does: '（寫得出，但沒有示範）',
      doesExample: '',
      doesNot: '',
      doesNotExample: '',
    };

    expect(traitGaps(adjective)).toEqual(['doesExample', 'doesNot', 'doesNotExample']);
    expect(toneGaps({ ...DOC, traits: [DIRECT, WARM, adjective] }).traits).toEqual(['t-9']);
  });
});

describe('禁用詞、中英、五個情境', () => {
  it('禁用詞一個都沒有就是缺', () => {
    expect(toneGaps(DOC).banned).toBe(false);
    expect(toneGaps({ ...DOC, banned: [] }).banned).toBe(true);
  });

  it('中英是否並用一定要答：三選一，空的不算', () => {
    expect(BILINGUAL_MODES).toEqual(['zhOnly', 'zhFirst', 'englishPair']);
    expect(toneGaps(DOC).bilingual).toBe(false);
    expect(toneGaps({ ...DOC, bilingual: '' }).bilingual).toBe(true);
  });

  it('五個情境，缺一個就逐個講得出是哪一個', () => {
    expect(SITUATION_KEYS).toEqual(['explain', 'invite', 'refuse', 'apologise', 'incident']);
    expect(toneGaps(DOC).situations).toEqual([]);
    expect(toneGaps({ ...DOC, situations: { ...DOC.situations, refuse: '  ' } }).situations).toEqual([
      'refuse',
    ]);
    expect(toneGaps(emptyToneDoc()).situations).toEqual([...SITUATION_KEYS]);
  });

  it('缺的總數：補幾多個特質、幾個情境都數得出來', () => {
    const gaps = toneGaps(emptyToneDoc());

    expect(gaps.tooFew).toBe(true);
    expect(gaps.traits).toEqual([]);
    expect(gaps.banned).toBe(true);
    expect(gaps.bilingual).toBe(true);
    expect(gaps.situations).toEqual([...SITUATION_KEYS]);
    // 少三個特質（1）＋禁用詞（1）＋中英（1）＋五個情境（5）
    expect(gapCount(gaps)).toBe(8);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty，舊的自由文字是 invalid', () => {
    expect(parseToneDoc('').kind).toBe('empty');
    expect(parseToneDoc('語氣要專業、友善。').kind).toBe('invalid');
    // 任意 JSON 不當成空表：那會畫出五個假的「缺」。
    expect(parseToneDoc('{"note":"語氣"}').kind).toBe('invalid');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseToneDoc(serializeToneDoc(DOC));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(DOC);
  });

  it('未知的中英答案不會被當成合法', () => {
    const parsed = parseToneDoc(JSON.stringify({ ...DOC, bilingual: 'bilingual' }));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.bilingual).toBe('');
  });

  it('全空的表不佔一版', () => {
    expect(hasAnyValue(emptyToneDoc())).toBe(false);
    expect(hasAnyValue({ ...emptyToneDoc(), banned: ['賦能'] })).toBe(true);
  });

  it('版本預覽抽得到特質名，抽不到就空', () => {
    expect(traitNamesInText('{"traits":[{"id":"t-1","name":"直接","does":"講清楚"')).toEqual(['直接']);
    expect(traitNamesInText('語氣要專業')).toEqual([]);
  });
});
