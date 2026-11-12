import { describe, expect, it } from 'vitest';
import {
  MAX_FAMILIES,
  TEXT_COLOR_ROLES,
  TYPE_ROLES,
  emptyFamily,
  emptyRole,
  emptyTypeDoc,
  familyGaps,
  familyUsable,
  gapCount,
  hasAnyValue,
  leadingOk,
  missingScripts,
  namesInText,
  nextFamilyId,
  parseTypeDoc,
  roleFamily,
  roleGaps,
  roleOf,
  serializeTypeDoc,
  setRole,
  sizeHasUnit,
  typeGaps,
} from '../src/design/brandType';
import { fullTypeDoc, typeDoc, withFamily, withoutRole } from './fixtures/brandTypeface';

/**
 * 字體頁的規則（issue #63）。畫面的測試在 `design-brand-type.test.tsx`。
 *
 * 這一支只管**約束對不對**：兩個家族上限、缺授權或欠可嵌入檔不可用、
 * 字級要帶單位、缺中文要標得出來、文字色只可以揀色彩頁的角色。
 */

const DOC = fullTypeDoc();

describe('家族與授權', () => {
  it('三個條件缺一不可：有名、有授權、有可嵌入的檔', () => {
    const base = {
      ...emptyFamily('f-1'),
      name: 'Inter',
      license_print: 'OFL',
      file_ref: 'fonts/Inter.woff2',
    };

    expect(familyUsable(base)).toBe(true);
    expect(familyGaps(base)).toEqual([]);

    expect(familyGaps({ ...base, name: '   ' })).toEqual(['name']);
    expect(familyGaps({ ...base, license_print: '' })).toEqual(['licence']);
    expect(familyGaps({ ...base, file_ref: '' })).toEqual(['file']);
    expect(familyGaps({ ...base, name: '', license_print: '', file_ref: '' })).toEqual([
      'name',
      'licence',
      'file',
    ]);
  });

  it('四個授權渠道任一有寫就算有授權，不是只認網頁那一格', () => {
    const base = { ...emptyFamily('f-1'), name: 'Inter', file_ref: 'fonts/Inter.woff2' };

    expect(familyGaps({ ...base, license_web: 'OFL' })).toEqual([]);
    expect(familyGaps({ ...base, license_app: 'App Store 內嵌授權' })).toEqual([]);
    expect(familyGaps({ ...base, license_desktop: '桌面 5 席' })).toEqual([]);
    expect(familyGaps(base)).toEqual(['licence']);
  });

  it('一套品牌最多兩個家族：讀入時第三個丟掉', () => {
    expect(MAX_FAMILIES).toBe(2);

    const parsed = parseTypeDoc(
      JSON.stringify({
        families: [
          { id: 'a', name: 'A', script: 'latin', license_web: 'x', file_ref: 'a.woff2' },
          { id: 'b', name: 'B', script: 'chinese', license_web: 'x', file_ref: 'b.woff2' },
          { id: 'c', name: 'C', script: 'latin', license_web: 'x', file_ref: 'c.woff2' },
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
    expect(missingScripts({ ...DOC, families: DOC.families.slice(0, 1) })).toEqual(['chinese']);
    expect(missingScripts(emptyTypeDoc())).toEqual(['latin', 'chinese']);
  });

  it('未授權的家族不算可用，所以那個腳本仍然算缺', () => {
    const unlicensed = withFamily(DOC, 'f-chinese', { license_web: '', license_print: '' });

    expect(missingScripts(unlicensed)).toEqual(['chinese']);
  });

  it('新家族的 id 不會撞：刪走中間那個之後重用細號', () => {
    expect(nextFamilyId(emptyTypeDoc())).toBe('f-1');
    expect(nextFamilyId(DOC)).toBe('f-3');
    expect(nextFamilyId(withoutRole(DOC, 'body'))).toBe('f-3');
  });
});

describe('字階', () => {
  it('四個層級齊全就沒有缺', () => {
    expect(TYPE_ROLES).toEqual(['display', 'heading', 'body', 'caption']);
    expect(gapCount(typeGaps(DOC))).toBe(0);

    for (const key of TYPE_ROLES) {
      expect(roleGaps(DOC, key), key).toEqual([]);
    }
  });

  it('字級要帶單位：18 不是 18 像素', () => {
    expect(sizeHasUnit('18')).toBe(false);
    expect(sizeHasUnit('18px')).toBe(true);
    expect(sizeHasUnit('3.5rem')).toBe(true);
    expect(sizeHasUnit('42pt')).toBe(true);
    expect(sizeHasUnit('18 px')).toBe(false);
    expect(sizeHasUnit('')).toBe(false);
  });

  it('行高可以是倍數，也可以帶單位', () => {
    expect(leadingOk('1.5')).toBe(true);
    expect(leadingOk('26px')).toBe(true);
    expect(leadingOk('120%')).toBe(true);
    expect(leadingOk('')).toBe(false);
    expect(leadingOk('行高')).toBe(false);
  });

  it('一級缺幾樣就報幾樣，次序固定', () => {
    const broken = typeDoc({
      body: { family: '', size: '18', leading: '', weight: '', min: 0, color_role: '#191919' },
    });

    expect(roleGaps(broken, 'body')).toEqual(['family', 'size', 'leading', 'weight', 'min', 'color']);
  });

  it('最小尺寸是數字：0 等於未填', () => {
    const noMin = {
      ...DOC,
      roles: DOC.roles.map((row) => (row.role === 'body' ? { ...row, min: 0 } : row)),
    };

    expect(roleGaps(noMin, 'body')).toEqual(['min']);
  });

  it('指去未授權或未存在的家族，算缺家族', () => {
    const unlicensed = withFamily(DOC, 'f-chinese', { file_ref: '' });

    expect(roleGaps(unlicensed, 'display')).toContain('family');
    expect(roleFamily(unlicensed, 'display')).toBeNull();

    const dangling = typeDoc({ heading: { family: 'f-gone' } });

    expect(roleGaps(dangling, 'heading')).toEqual(['family']);
  });

  it('文字色只可以是色彩頁的角色名，色值一律不算', () => {
    expect(TEXT_COLOR_ROLES).toContain('ink');

    const withColor = (color_role: string) => ({
      ...DOC,
      roles: DOC.roles.map((row) => (row.role === 'body' ? { ...row, color_role } : row)),
    });

    expect(roleGaps(withColor('#000000'), 'body')).toEqual(['color']);
    expect(roleGaps(withColor(''), 'body')).toEqual(['color']);
    expect(roleGaps(withColor('not-a-role'), 'body')).toEqual(['color']);
    expect(roleGaps(withColor('muted'), 'body')).toEqual([]);
  });

  it('改一格會保留同一級的其餘值；整行清空就刪走，不留空殼', () => {
    const filled = typeDoc({ body: { family: 'f-latin', size: '17px' } });
    const patched = setRole(filled, 'body', { weight: '500' });

    expect(roleOf(patched, 'body')).toMatchObject({ family: 'f-latin', size: '17px', weight: '500' });

    const cleared = setRole(filled, 'body', {
      family: '',
      size: '',
      leading: '',
      weight: '',
      min: 0,
      measure: '',
      color_role: '',
      reason: '',
    });

    expect(cleared.roles).toEqual([]);
  });
});

describe('缺口', () => {
  it('配對與取態缺了都算缺，一個缺一件', () => {
    const gaps = typeGaps({ ...DOC, pairing: '', philosophy: '' });

    expect(gaps.pairing).toBe(true);
    expect(gaps.philosophy).toBe(true);
    expect(gapCount(gaps)).toBe(2);
  });

  it('缺口數＝每一件未完成的事，不是每一個分類', () => {
    const gaps = typeGaps(emptyTypeDoc());

    // 零個家族（沒有家族就算 0 件）、兩個腳本、四級、搭配、取態。
    expect(gaps.families).toEqual([]);
    expect(gapCount(gaps)).toBe(2 + 4 + 1 + 1);
  });

  it('家族不齊逐個計一件', () => {
    const gaps = typeGaps(
      withFamily(withFamily(DOC, 'f-latin', { file_ref: '' }), 'f-chinese', { name: '' }),
    );

    expect(gaps.families).toEqual(['f-latin', 'f-chinese']);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty，舊的自由文字與舊形狀是 invalid', () => {
    expect(parseTypeDoc('').kind).toBe('empty');
    expect(parseTypeDoc('主標用思源黑體。').kind).toBe('invalid');
    expect(parseTypeDoc('{"note":"字體"}').kind).toBe('invalid');

    // #38 的形狀：roles 是物件、licence 一句字。硬讀會畫出一張假的齊全表。
    expect(
      parseTypeDoc(
        JSON.stringify({
          families: [{ id: 'f', name: 'Inter', licence: '網頁嵌入', webEmbeddable: true }],
          roles: { body: { familyId: 'f', size: '17px' } },
        }),
      ).kind,
    ).toBe('invalid');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseTypeDoc(serializeTypeDoc(DOC));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(DOC);
  });

  it('讀不到的東西不會無中生有：舊的 webEmbeddable 不會變成授權', () => {
    const parsed = parseTypeDoc(
      JSON.stringify({ families: [{ id: 'f', name: 'Inter', webEmbeddable: true, licence: '可嵌入' }] }),
    );

    if (parsed.kind !== 'ok') {
      throw new Error('families 存在就是新形狀，應該讀得返');
    }

    expect(parsed.doc.families[0]?.license_web).toBe('');
    expect(parsed.doc.families[0]?.file_ref).toBe('');
  });

  it('全空的表不佔一版', () => {
    expect(hasAnyValue(emptyTypeDoc())).toBe(false);
    expect(hasAnyValue({ ...emptyTypeDoc(), philosophy: '字要撐得住價目表。' })).toBe(true);
    expect(hasAnyValue({ ...emptyTypeDoc(), families: [emptyFamily('f-1')] })).toBe(true);
    expect(hasAnyValue({ ...emptyTypeDoc(), roles: [emptyRole('body')] })).toBe(true);
  });

  it('版本預覽抽得到家族名，抽不到就空', () => {
    expect(namesInText('{"families":[{"id":"f-latin","name":"Inter","script":"latin"')).toEqual([
      'Inter',
    ]);
    expect(namesInText('主標用思源黑體')).toEqual([]);
  });
});
