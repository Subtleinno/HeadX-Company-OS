import { describe, expect, it } from 'vitest';
import { emptyImageDoc, type ImageDoc } from '../src/design/brandImage';
import {
  IMAGE_LISTS,
  PHOTO_FIELDS,
  addBanned,
  addColorLink,
  addExample,
  addLine,
  bannedGaps,
  bannedTerms,
  bannedWithoutReason,
  colourOf,
  colourRoleState,
  exampleGaps,
  exampleLabelsInText,
  gapCount,
  hasAnyValue,
  hasRealExample,
  imageGaps,
  parseImageDoc,
  photoGaps,
  removeBanned,
  removeColorLink,
  removeExample,
  removeLine,
  serializeImageDoc,
  setExample,
  setPhoto,
} from '../src/design/brandImage';
import { colourDoc } from './fixtures/brandColour';
import { exampleWithoutFile, fullImageDoc } from './fixtures/brandImage';

/**
 * 圖像頁的規則（issue #66）。畫面的測試在 `design-brand-image.test.tsx`。
 *
 * 這一支只管**約束對不對**：六格攝影、一件有檔案的真範例（沒有就標缺，不用
 * 圖庫圖假扮）、要與不要、顏色只引用色彩頁的角色名、授權、禁止逐條有原因。
 */

const DOC = fullImageDoc();

const COLOUR = colourDoc({
  'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
  paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
});

describe('攝影六格', () => {
  it('六格，次序固定：由拍咩到擺咩', () => {
    expect(PHOTO_FIELDS).toEqual(['subject', 'composition', 'light', 'tone', 'space', 'props']);
  });

  it('缺一格就講得出缺邊一格', () => {
    expect(photoGaps(DOC)).toEqual([]);
    expect(photoGaps({ ...DOC, photo: { ...DOC.photo, light: '   ' } })).toEqual(['light']);
    expect(photoGaps(emptyImageDoc())).toEqual([...PHOTO_FIELDS]);
  });

  it('改一格不影響其他格', () => {
    const after = setPhoto(DOC, 'light', '兩支柔光燈');

    expect(after.photo.light).toBe('兩支柔光燈');
    expect(after.photo.tone).toBe(DOC.photo.tone);
  });
});

describe('沒有真實範例就標缺', () => {
  it('一件有檔案的真照片，才算有範例（驗收第一條）', () => {
    expect(hasRealExample(DOC)).toBe(true);
    expect(
      hasRealExample({ ...DOC, approved_examples: [exampleWithoutFile()] }),
    ).toBe(false);
    expect(hasRealExample(emptyImageDoc())).toBe(false);
  });

  it('範例三格：名稱、檔案、用在哪', () => {
    expect(exampleGaps(DOC.approved_examples[0] ?? exampleWithoutFile())).toEqual([]);
    expect(exampleGaps(exampleWithoutFile())).toEqual(['file']);
    expect(exampleGaps({ label: '', file_ref: 'x.jpg', use: '' })).toEqual(['label', 'use']);
  });

  it('冇檔案的範例仍然計入缺口，但唔會變成「有範例」', () => {
    const doc: ImageDoc = { ...DOC, approved_examples: [exampleWithoutFile()] };

    expect(imageGaps(doc).realExample).toBe(true);
    expect(imageGaps(doc).examples).toEqual([0]);
  });

  it('加一件空白範例：唔會即刻變成合格', () => {
    const after = addExample(DOC);

    expect(after.approved_examples).toHaveLength(3);
    expect(imageGaps(after).examples).toEqual([2]);
    expect(removeExample(after, 2).approved_examples).toHaveLength(2);
  });

  it('改一件範例只動那一件', () => {
    const after = setExample(DOC, 0, { use: '門市海報' });

    expect(after.approved_examples[0]?.use).toBe('門市海報');
    expect(after.approved_examples[1]).toEqual(DOC.approved_examples[1]);
  });
});

describe('要與不要', () => {
  it('兩邊都要有：空的那一邊標缺', () => {
    expect(IMAGE_LISTS).toEqual(['like', 'unlike']);
    expect(imageGaps(DOC).lists).toEqual([]);
    expect(imageGaps({ ...DOC, unlike: [] }).lists).toEqual(['unlike']);
    expect(imageGaps(emptyImageDoc()).lists).toEqual(['like', 'unlike']);
  });

  it('同一句加兩次不是兩個特徵', () => {
    expect(addLine(DOC, 'like', '手部紋理清楚')).toBe(DOC);
    expect(addLine(DOC, 'like', '   ')).toBe(DOC);
    expect(addLine(DOC, 'like', '手指有墨').like).toHaveLength(4);
  });

  it('刪一句只刪那一句', () => {
    expect(removeLine(DOC, 'unlike', 0).unlike).toEqual(DOC.unlike.slice(1));
  });
});

describe('顏色只引用角色名，值住在色彩頁', () => {
  it('認得的角色是 ok，功能色與認不到的分開講', () => {
    expect(colourRoleState('brand.primary')).toBe('ok');
    expect(colourRoleState('danger')).toBe('function');
    expect(colourRoleState('brand.tertiary')).toBe('unknown');
  });

  it('值由色彩頁來；色彩頁未定就係 null，不在這一頁補一個色', () => {
    expect(colourOf(COLOUR, 'brand.primary')).toBe('#0057ff');
    expect(colourOf(COLOUR, 'surface')).toBeNull();
    expect(colourOf(null, 'brand.primary')).toBeNull();
  });

  it('一個角色都未引用就是缺；認不到的角色也算缺', () => {
    expect(imageGaps(DOC).colorLink).toBe(false);
    expect(imageGaps({ ...DOC, color_link: [] }).colorLink).toBe(true);
    expect(imageGaps({ ...DOC, color_link: ['brand.primary', 'brand.tertiary'] }).colorUnknown).toEqual([
      'brand.tertiary',
    ]);
  });

  it('同一個角色唔會引用兩次', () => {
    expect(addColorLink(DOC, 'brand.primary').color_link).toEqual(['brand.primary']);
    expect(addColorLink(DOC, 'paper').color_link).toEqual(['brand.primary', 'paper']);
    expect(removeColorLink(DOC, 'brand.primary').color_link).toEqual([]);
  });
});

describe('禁止逐條有原因', () => {
  it('有詞但冇原因：指出是第幾條', () => {
    const doc: ImageDoc = {
      ...DOC,
      banned: [
        { term: '前後對比圖', reason: '' },
        { term: '', reason: '未有詞' },
      ],
    };

    expect(bannedWithoutReason(doc)).toEqual([0]);
    expect(imageGaps(doc).bannedReasons).toEqual([0]);
    expect(bannedGaps(doc.banned[0] ?? { term: '', reason: '' })).toEqual(['reason']);
  });

  it('一條禁止都冇就是缺；空白的詞不當成一個詞', () => {
    expect(imageGaps({ ...DOC, banned: [] }).banned).toBe(true);
    expect(bannedTerms({ ...DOC, banned: [{ term: '  ', reason: '原因' }] })).toEqual([]);
    expect(imageGaps({ ...DOC, banned: [{ term: '  ', reason: '原因' }] }).banned).toBe(true);
  });

  it('同一個詞加兩次不會出現兩行', () => {
    expect(addBanned(DOC, '前後對比圖', '第二個原因').banned).toHaveLength(2);
    expect(bannedTerms(removeBanned(DOC, 0))).toEqual(['前後對比圖']);
  });
});

describe('缺口總數', () => {
  it('空表十三個缺：立場、六格、真範例、兩邊清單、色彩引用、授權、禁止', () => {
    const gaps = imageGaps(emptyImageDoc());

    expect(gaps.stance).toBe(true);
    expect(gaps.photo).toEqual([...PHOTO_FIELDS]);
    expect(gaps.realExample).toBe(true);
    expect(gaps.rights).toBe(true);
    // 立場 1 ＋ 六格 6 ＋ 真範例 1 ＋ 兩邊清單 2 ＋ 色彩引用 1 ＋ 授權 1 ＋ 禁止 1
    expect(gapCount(gaps)).toBe(13);
    expect(gapCount(imageGaps(DOC))).toBe(0);
  });
});

describe('讀與寫', () => {
  it('空內容是 empty；人話與任意 JSON 都是 invalid', () => {
    expect(parseImageDoc('').kind).toBe('empty');
    expect(parseImageDoc('照片要暖調、自然光。').kind).toBe('invalid');
    expect(parseImageDoc('{"note":"圖像"}').kind).toBe('invalid');
    // photo 一定要是物件：舊的自由文字內容可能剛好是一段 JSON。
    expect(parseImageDoc('{"photo":[]}').kind).toBe('invalid');
  });

  it('寫出去再讀回來是同一個表', () => {
    const parsed = parseImageDoc(serializeImageDoc(DOC));

    if (parsed.kind !== 'ok') {
      throw new Error('應該讀得返');
    }

    expect(parsed.doc).toEqual(DOC);
  });

  it('全空的表不佔一版', () => {
    expect(hasAnyValue(emptyImageDoc())).toBe(false);
    expect(hasAnyValue({ ...emptyImageDoc(), rights: '攝影師 XXX' })).toBe(true);
    expect(hasAnyValue({ ...emptyImageDoc(), like: ['手部紋理清楚'] })).toBe(true);
  });

  it('版本預覽抽得到範例名，抽不到就空', () => {
    expect(exampleLabelsInText('{"approved_examples":[{"label":"診所窗邊","file_ref":"a.jpg"')).toEqual([
      '診所窗邊',
    ]);
    expect(exampleLabelsInText('照片要暖調')).toEqual([]);
  });
});
