import { describe, expect, it } from 'vitest';
import {
  MAX_FAMILIES,
  TYPE_ROLES,
  familyUsable,
  gapCount,
  hasAnyValue,
  leadingOk,
  missingScripts,
  namesInText,
  parseTypeDoc,
  roleGaps,
  serializeTypeDoc,
  sizeHasUnit,
  typeGaps,
  emptyTypeDoc,
  type FontFamily,
  type TypeDoc,
} from '../src/design/brandType';

/**
 * 字體頁的規則（issue #38）。畫面的測試在 `design-brand-type.test.tsx`。
 *
 * 這一支只管**約束對不對**：兩個家族上限、缺授權不可用、尺寸要帶單位、
 * 缺中文要標得出來、文字顏色只可以揀色彩頁的角色。這些規則如果只寫在
 * 畫面裡，#36 的字標就沒有同一個標準可依。
 */

const LATIN: FontFamily = {
  id: 'f-latin',
  script: 'latin',
  name: 'Inter',
  licence: '網頁嵌入、印刷',
  webEmbeddable: true,
};

const CHINESE: FontFamily = {
  id: 'f-chinese',
  script: 'chinese',
  name: '思源黑體',
  licence: '網頁嵌入',
  webEmbeddable: true,
};

const DOC: TypeDoc = {
  families: [LATIN, CHINESE],
  roles: {
    display: { familyId: 'f-chinese', size: '56px', leading: '64px', weight: '700', minSize: '32px', colorRole: 'ink' },
    heading: { familyId: 'f-chinese', size: '28px', leading: '1.3', weight: '600', minSize: '20px', colorRole: 'ink' },
    body: { familyId: 'f-latin', size: '17px', leading: '26px', weight: '400', minSize: '14px', colorRole: 'ink' },
    caption: { familyId: 'f-latin', size: '13px', leading: '18px', weight: '400', minSize: '11px', colorRole: 'muted' },
  },
  pairing: '中文用思源黑體，拉丁用 Inter。',
  fallbackLatin: 'system-ui, sans-serif',
  fallbackChinese: 'PingFang TC, sans-serif',
  measure: '32 字元',
  align: 'left',
  misuse: ['不拉寬'],
};

describe('家族與授權', () => {
  it('三個條件缺一不可：有名、有授權、有可嵌入的檔', () => {
    const base = { id: 'f', script: 'latin' as const, name: 'Inter', licence: '印刷', webEmbeddable: true };

    expect(familyUsable(base)).toBe(true);
    expect(familyUsable({ ...base, name: '' })).toBe(false);
    expect(familyUsable({ ...base, licence: '' })).toBe(false);
    expect(familyUsable({ ...base, webEmbeddable: false })).toBe(false);
  });

  it('一套品牌最多兩個家族：讀入時第三個丟掉', () => {
    expect(MAX_FAMILIES).toBe(2);

    const parsed = parseTypeDoc(
      JSON.stringify({
        families: [
          { id: 'a', script: 'latin', name: 'A', licence: 'x', webEmbeddable: true },
          { id: 'b', script: 'chinese', name: 'B', licence: 'x', webEmbeddable: true },
          { id: 'c', script: 'latin', name: 'C', licence: 'x', webEmbeddable: true },
        ],
      }),
    );

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.families.map((family) => family.id)).toEqual(['a', 'b']);
  });

  it('缺中文或缺拉丁：逐個講得出來', () => {
    expect(missingScripts(DOC)).toEqual([]);
    expect(missingScripts({ ...DOC, families: [LATIN] })).toEqual(['chinese']);
    expect(missingScripts({ ...DOC, families: [CHINESE] })).toEqual(['latin']);
    expect(missingScripts(emptyTypeDoc())).toEqual(['latin', 'chinese']);
  });

  it('未授權的家族不算可用，所以那個腳本仍然算缺', () => {
    const unlicensed: TypeDoc = {
      ...DOC,
      families: [LATIN, { ...CHINESE, licence: '' }],
    };

    expect(missingScripts(unlicensed)).toEqual(['chinese']);
  });
});

describe('層級', () => {
  it('四個層級齊全就沒有缺', () => {
    expect(TYPE_ROLES).toEqual(['display', 'heading', 'body', 'caption']);
    expect(gapCount(typeGaps(DOC))).toBe(0);

    for (const key of TYPE_ROLES) {
      expect(roleGaps(DOC, key), key).toEqual([]);
    }
  });

  it('尺寸要帶單位：18 不是 18 像素', () => {
    expect(sizeHasUnit('18')).toBe(false);
    expect(sizeHasUnit('18px')).toBe(true);
    expect(sizeHasUnit('3.5rem')).toBe(true);
    expect(sizeHasUnit('42pt')).toBe(true);
    expect(sizeHasUnit('18 px')).toBe(false);
    expect(sizeHasUnit('')).toBe(false);

    expect(roleGaps({ ...DOC, roles: { ...DOC.roles, body: { ...DOC.roles.body, size: '18' } } }, 'body')).toEqual([
      'size',
    ]);
  });

  it('行距可以是倍數，也可以帶單位', () => {
    expect(leadingOk('1.5')).toBe(true);
    expect(leadingOk('26px')).toBe(true);
    expect(leadingOk('120%')).toBe(true);
    expect(leadingOk('')).toBe(false);
    expect(leadingOk('行距')).toBe(false);
  });

  it('指去未授權或未存在的家族，算缺家族', () => {
    const doc: TypeDoc = {
      ...DOC,
      families: [LATIN, { ...CHINESE, webEmbeddable: false }],
    };

    expect(roleGaps(doc, 'display')).toContain('family');
    // 指去一個不存在的 id 一樣算缺（內容可以由外面寫入）。
    const dangling: TypeDoc = {
      ...DOC,
      roles: { ...DOC.roles, heading: { ...DOC.roles.heading, familyId: 'f-gone' } },
    };

    expect(roleGaps(dangling, 'heading')).toEqual(['family']);
  });

  it('文字顏色只可以是色彩頁的角色名，色值一律不算', () => {
    expect(
      roleGaps({ ...DOC, roles: { ...DOC.roles, body: { ...DOC.roles.body, colorRole: '' } } }, 'body'),
    ).toEqual(['color']);

    // 打了色值也沒有用：那不是角色名。
    expect(
      roleGaps(
        { ...DOC, roles: { ...DOC.roles, body: { ...DOC.roles.body, colorRole: '#000000' } } },
        'body',
      ),
    ).toEqual(['color']);
  });

  it('配對、行長、對齊缺了都算缺', () => {
    const gaps = typeGaps({ ...DOC, pairing: '', measure: '', align: '' });

    expect(gaps.pairing).toBe(true);
    expect(gaps.measure).toBe(true);
    expect(gaps.align).toBe(true);
    expect(gapCount(gaps)).toBe(3);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty，舊的自由文字是 invalid', () => {
    expect(parseTypeDoc('').kind).toBe('empty');
    expect(parseTypeDoc('主標用思源黑體。').kind).toBe('invalid');
    expect(parseTypeDoc('{"note":"字體"}').kind).toBe('invalid');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseTypeDoc(serializeTypeDoc(DOC));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(DOC);
  });

  it('未知的對齊值不會被當成合法', () => {
    const parsed = parseTypeDoc(JSON.stringify({ ...DOC, align: 'right' }));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc.align).toBe('');
  });

  it('全空的表不佔一版', () => {
    expect(hasAnyValue(emptyTypeDoc())).toBe(false);
    expect(hasAnyValue({ ...emptyTypeDoc(), measure: '32 字元' })).toBe(true);
  });

  it('版本預覽抽得到家族名，抽不到就空', () => {
    expect(namesInText('{"families":[{"id":"f-latin","name":"Inter","licence":"x"')).toEqual(['Inter']);
    expect(namesInText('主標用思源黑體')).toEqual([]);
  });
});
