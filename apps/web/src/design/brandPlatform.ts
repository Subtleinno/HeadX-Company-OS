/**
 * 平台頁的內容模型（issue #61）。
 *
 * 這一頁是**整本品牌書的根**：立場句之後每一頁第一屏都會用它。所以它必須是
 * 有名字的欄位，不是一段自由文字 —— 「立場句」與「定位六格」是兩件事，混在
 * 一段文字裡，之後每一頁都只能靠人眼去抄。
 *
 * 純函式，沒有 React、沒有 fetch：畫面（`BrandPlatformEditor`）與測試用同一份。
 *
 * 三個誠實位：
 *   1. 讀不到就是讀不到。舊的自由文字不猜它屬於哪一格。
 *   2. 候選由 agent 出。沒有候選就講沒有，不自己砌三句看起來很像的話。
 *   3. 三檢缺證據是「缺」，不是「未填」—— 它會變成一個判斷型缺口，只有老闆補得。
 */

export type PlatformPositioning = {
  for: string;
  who: string;
  category: string;
  benefit: string;
  unlike: string;
  because: string;
};

export type PlatformDoc = {
  stance: string;
  positioning: PlatformPositioning;
  purpose: string;
  values: { name: string; do: string; dont: string }[];
  traits: string[];
  essence: string;
  audience: string;
  references: string[];
  stance_candidates: { text: string; reason: string }[];
  tests: { real: string; relevant: string; unique: string };
};

export const EMPTY_PLATFORM_DOC: PlatformDoc = {
  stance: '',
  positioning: { for: '', who: '', category: '', benefit: '', unlike: '', because: '' },
  purpose: '',
  values: [],
  traits: [],
  essence: '',
  audience: '',
  references: [],
  stance_candidates: [],
  tests: { real: '', relevant: '', unique: '' },
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 把任何形狀讀成一份文件。缺的欄位是空字串，不是 undefined。 */
export function buildPlatformDoc(raw: unknown): PlatformDoc {
  const source = record(raw);
  const positioning = record(source.positioning);
  const tests = record(source.tests);

  return {
    stance: text(source.stance),
    positioning: {
      for: text(positioning.for),
      who: text(positioning.who),
      category: text(positioning.category),
      benefit: text(positioning.benefit),
      unlike: text(positioning.unlike),
      because: text(positioning.because),
    },
    purpose: text(source.purpose),
    values: list(source.values).map((item) => {
      const value = record(item);
      return { name: text(value.name), do: text(value.do), dont: text(value.dont) };
    }),
    traits: list(source.traits).filter((item): item is string => typeof item === 'string'),
    essence: text(source.essence),
    audience: text(source.audience),
    references: list(source.references).filter((item): item is string => typeof item === 'string'),
    stance_candidates: list(source.stance_candidates).map((item) => {
      const value = record(item);
      return { text: text(value.text), reason: text(value.reason) };
    }),
    tests: { real: text(tests.real), relevant: text(tests.relevant), unique: text(tests.unique) },
  };
}

export type ParseResult = { ok: true; doc: PlatformDoc } | { ok: false; reason: 'not_json' | 'not_object' };

/**
 * 讀現行內容。
 *
 * 舊版是自由文字（`legacy_text`）或者空白：兩者都回「讀不到」，畫面如實講，
 * 不畫一堆假的空欄叫人以為填過。新的一頁由 `EMPty` 起手，所以「讀不到」
 * 只在真的有舊內容時出現。
 */
export function parsePlatformDoc(content: string): ParseResult {
  const trimmed = content.trim();

  if (trimmed === '') {
    return { ok: true, doc: EMPTY_PLATFORM_DOC };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: 'not_json' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'not_object' };
  }

  // 舊的自定義／自由文字 JSON（例如 `{content: '…'}`）不當成平台文件。
  if (!('stance' in parsed) && !('positioning' in parsed)) {
    return { ok: false, reason: 'not_object' };
  }

  return { ok: true, doc: buildPlatformDoc(parsed) };
}

export function serializePlatformDoc(doc: PlatformDoc): string {
  return JSON.stringify(doc);
}

/** 整份文件是不是一個字都未填。全空就交空字串，讓「未有內容」的判斷繼續有效。 */
export function hasAnyValue(doc: PlatformDoc): boolean {
  return (
    doc.stance.trim() !== '' ||
    doc.purpose.trim() !== '' ||
    doc.essence.trim() !== '' ||
    doc.audience.trim() !== '' ||
    Object.values(doc.positioning).some((value) => value.trim() !== '') ||
    doc.values.some((value) => value.name.trim() !== '' || value.do.trim() !== '' || value.dont.trim() !== '') ||
    doc.traits.length > 0 ||
    doc.references.length > 0 ||
    doc.stance_candidates.length > 0 ||
    TESTS.some((test) => doc.tests[test.key].trim() !== '')
  );
}

export const TESTS = [
  { key: 'real', labelKey: 'brand.platform.test.real' },
  { key: 'relevant', labelKey: 'brand.platform.test.relevant' },
  { key: 'unique', labelKey: 'brand.platform.test.unique' },
] as const;

export const POSITIONING_FIELDS = [
  { key: 'for', labelKey: 'brand.platform.field.for' },
  { key: 'who', labelKey: 'brand.platform.field.who' },
  { key: 'category', labelKey: 'brand.platform.field.category' },
  { key: 'benefit', labelKey: 'brand.platform.field.benefit' },
  { key: 'unlike', labelKey: 'brand.platform.field.unlike' },
  { key: 'because', labelKey: 'brand.platform.field.because' },
] as const;

/** 有候選才算三個候選；少過三個就是少，不補空位。 */
export function candidatesOf(doc: PlatformDoc): { text: string; reason: string }[] {
  return doc.stance_candidates.filter((candidate) => candidate.text.trim() !== '');
}

/** 三檢缺證據的項目。判斷型缺口：只有老闆補得（C115）。 */
export function missingTests(doc: PlatformDoc): string[] {
  return TESTS.filter((test) => doc.tests[test.key].trim() === '').map((test) => test.key);
}

/**
 * 缺口數：立場句一句 ＋ 三檢每一項。與 `contracts` 的 `platform.gaps()` 同一組，
 * 因為兩邊講的必須是同一個數字（#53 的面板讀這一個）。
 */
export function platformGapCount(doc: PlatformDoc): number {
  return (
    (doc.stance.trim() === '' ? 1 : 0) +
    missingTests(doc).length +
    (candidatesOf(doc).length < 3 ? 1 : 0)
  );
}
