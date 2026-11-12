import { describe, expect, it } from 'vitest';
import type { ColorDoc } from '../src/design/brandColors';
import { fullColourDoc, withoutRole } from './fixtures/brandColour';
import { fullFamily, typeDoc } from './fixtures/brandTypeface';
import type { TypeDoc } from '../src/design/brandType';
import type { ToneDoc } from '../src/design/brandTone';
import {
  BRIEF_MIN_CHARS,
  CUSTOM_SECTIONS,
  briefState,
  conflictInBrief,
  customGaps,
  emptyCustomDoc,
  gapCount,
  hasAnyValue,
  leadingLineInText,
  parseCustomDoc,
  serializeCustomDoc,
  type CustomDoc,
} from '../src/design/brandCustom';

/**
 * 自定義頁的規則（issue #41）。畫面的測試在 `design-brand-custom.test.tsx`。
 *
 * 這一支只管**約束對不對**：brief 夠不夠具體、六個欄目齊不齊、引用的角色
 * 在色彩頁有沒有值、例子有沒有用語氣頁的禁用詞、brief 有沒有撞通用槽。
 */

const POLICY = `先判斷這頁是不是其實屬於標誌、色彩、字體或語氣。是的話不要做新頁，標明應該去哪一頁。

不是的話，必須有：這頁決定什麼、不准決定什麼、規則、例子、錯誤例子、它如何引用既有角色、版本。

不准發明新色、新字、新標誌。文字遵循語氣策略。完成後必須能被品牌主頁讀到。不夠具體就標成缺。`;

const COLOUR: ColorDoc = fullColourDoc();

const TYPE: TypeDoc = {
  ...typeDoc({
    display: { family: 'f-latin', size: '56px', leading: '64px', weight: '700', min: 32 },
    heading: { family: 'f-latin', size: '28px', leading: '1.3', weight: '600', min: 20 },
    body: { family: 'f-latin', size: '17px', leading: '26px', weight: '400', min: 14 },
    caption: { family: 'f-latin', size: '13px', leading: '18px', weight: '400', min: 11, color_role: 'muted' },
  }),
  families: [fullFamily('f-latin', 'Inter', 'latin')],
  pairing: '只用 Inter。',
};

const TONE: ToneDoc = {
  traits: [
    {
      id: 't-1',
      name: '直接',
      does: '講清楚要對方做甚麼',
      doesExample: '星期四下午三點前把樣板寄回，唔該。',
      doesNot: '不用「請盡快」',
      doesNotExample: '請盡快回覆，謝謝。',
    },
    {
      id: 't-2',
      name: '有溫度',
      does: '先認同對方',
      doesExample: '明白你趕時間。',
      doesNot: '不假裝熱情',
      doesNotExample: '太棒了！！！',
    },
    {
      id: 't-3',
      name: '不裝',
      does: '用日常講法',
      doesExample: '呢個療程要分三次做。',
      doesNot: '不講賦能這類字',
      doesNotExample: '我們賦能客戶。',
    },
  ],
  banned: ['賦能', '閉環'],
  bilingual: 'zhFirst',
  bilingualNote: '療程名保留英文原名。',
  situations: {
    explain: '呢個療程分三次做。',
    invite: '下星期三下午有位。',
    refuse: '呢個做唔到。',
    apologise: '上一次等得太久。',
    incident: '系統今早出問題。',
  },
};

const BRIEF = '包裝要決定盒型、紙材、印刷方式與最小落單量，以及盒上的資訊次序。';

const DOC: CustomDoc = {
  decided: '這一頁決定盒型與紙材：單支裝、雙支裝，白卡 350g。',
  notDecided: '不決定品牌色與字體，也不決定渠道價錢。',
  rules: ['盒面只放主標誌與產品名', '背面放成分與用法'],
  examples: ['單支裝：白卡 350g，主標誌置中。'],
  badExamples: ['盒面同時放三個標誌。'],
  colorRoles: ['brand.primary', 'paper'],
  typeRoles: ['heading', 'body'],
};

const ok = {
  doc: DOC,
  brief: BRIEF,
  colour: COLOUR,
  type: TYPE,
  tone: TONE,
  policyText: POLICY,
};

describe('brief 夠不夠具體', () => {
  it('未寫是 empty，只寫名詞是 vague，講得出要決定什麼才是 ok', () => {
    expect(BRIEF_MIN_CHARS).toBe(10);
    expect(briefState('')).toBe('empty');
    expect(briefState('   ')).toBe('empty');
    expect(briefState('關於包裝')).toBe('vague');
    expect(briefState(BRIEF)).toBe('ok');
  });

  it('brief 有未寫或太空泛，就標缺 —— 不自己編方向', () => {
    expect(customGaps({ ...ok, brief: '關於包裝' }).brief).toBe('vague');
    expect(customGaps({ ...ok, brief: '' }).brief).toBe('empty');
    expect(customGaps(ok).brief).toBeNull();
  });
});

describe('六個欄目', () => {
  it('決定什麼、不准決定什麼、規則、例子、錯誤例子：缺一個講一個', () => {
    expect(CUSTOM_SECTIONS).toEqual(['decided', 'notDecided', 'rules', 'examples', 'badExamples']);
    expect(customGaps(ok).sections).toEqual([]);

    expect(customGaps({ ...ok, doc: { ...DOC, notDecided: '' } }).sections).toEqual(['notDecided']);
    expect(customGaps({ ...ok, doc: { ...DOC, examples: [] } }).sections).toEqual(['examples']);
    expect(customGaps({ ...ok, doc: emptyCustomDoc() }).sections).toEqual([...CUSTOM_SECTIONS]);
  });
});

describe('引用既有角色', () => {
  it('色彩角色在色彩頁有值才算數，未定的逐個講', () => {
    expect(customGaps(ok).colorRoles).toEqual([]);

    const noInk = withoutRole(COLOUR, 'paper');

    expect(customGaps({ ...ok, colour: noInk }).colorRoles).toEqual(['paper']);
    expect(customGaps({ ...ok, colour: null }).colorRoles).toEqual(['brand.primary', 'paper']);
  });

  it('字體角色在字體頁未有現行版本就算缺', () => {
    expect(customGaps(ok).typeRoles).toEqual([]);
    expect(customGaps({ ...ok, type: null }).typeRoles).toEqual(['heading', 'body']);
  });

  it('語氣頁未有現行版本：標缺，不假裝有語氣', () => {
    expect(customGaps(ok).tone).toBe(false);
    expect(customGaps({ ...ok, tone: null }).tone).toBe(true);
  });
});

describe('禁用詞與通用槽', () => {
  it('例子用了語氣頁的禁用詞：逐個講出來', () => {
    expect(customGaps(ok).banned).toEqual([]);
    expect(
      customGaps({ ...ok, doc: { ...DOC, examples: ['盒面寫「賦能品牌增長」。'] } }).banned,
    ).toEqual(['賦能']);
  });

  it('錯誤例子本來就示範錯的東西，所以不用來查禁用詞', () => {
    expect(
      customGaps({ ...ok, doc: { ...DOC, badExamples: ['不要寫「賦能」這種字。'] } }).banned,
    ).toEqual([]);
  });

  it('brief 要求發明新色／新字／新標誌：停手，講明撞通用槽哪一句', () => {
    const conflict = conflictInBrief('包裝要發明一套自己的顏色，另外定一個新標誌。', POLICY);

    expect(conflict).not.toBeNull();
    expect(conflict?.phrase).toContain('發明');
    expect(conflict?.policyLine).toContain('不准發明新色');
    expect(customGaps({ ...ok, brief: '包裝要發明一套自己的顏色。', doc: DOC }).conflict?.policyLine).toContain(
      '不准發明新色',
    );
  });

  it('講包裝規格不是衝突', () => {
    expect(conflictInBrief(BRIEF, POLICY)).toBeNull();
    expect(conflictInBrief('包裝要決定盒型、紙材與印刷方式。', POLICY)).toBeNull();
  });

  it('缺的總數數得出來', () => {
    const gaps = customGaps({
      doc: emptyCustomDoc(),
      brief: '',
      colour: null,
      type: null,
      tone: null,
      policyText: POLICY,
    });

    // 五個欄目（5）＋ brief（1）＋ 語氣（1）
    expect(gapCount(gaps)).toBe(7);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty，舊的自由文字是 invalid', () => {
    expect(parseCustomDoc('').kind).toBe('empty');
    expect(parseCustomDoc('包裝用白卡。').kind).toBe('invalid');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseCustomDoc(serializeCustomDoc(DOC));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(DOC);
  });

  it('不認識的角色名讀入時丟掉：引用只認色彩頁與字體頁的名字', () => {
    const parsed = parseCustomDoc(
      JSON.stringify({ ...DOC, colorRoles: ['brand.primary', 'brand.hologram'], typeRoles: ['heading', 'poster'] }),
    );

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.colorRoles).toEqual(['brand.primary']);
    expect(parsed.doc.typeRoles).toEqual(['heading']);
  });

  it('全空的表不佔一版', () => {
    expect(hasAnyValue(emptyCustomDoc())).toBe(false);
    expect(hasAnyValue({ ...emptyCustomDoc(), rules: ['一條'] })).toBe(true);
  });

  it('版本預覽抽得到第一句（這頁決定什麼排第一）', () => {
    expect(leadingLineInText('{"decided":"這一頁決定盒型與紙材。","notDecided"')).toBe(
      '這一頁決定盒型與紙材。',
    );
    expect(leadingLineInText('包裝用白卡')).toBe('');
  });
});
