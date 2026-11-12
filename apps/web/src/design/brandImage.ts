/**
 * 品牌圖像頁的**資料層**（issue #66，新增）。
 *
 * 和色彩、字體、標誌、語氣四頁一樣，這一支是 `@company-os/contracts` 圖像
 * payload 的**編輯器轉接層**：存的是同一個 `ImagePayload`，所以 prompt 包的
 * 圖像段落、HTML 與這一頁看到的必然是同一份。之前這一頁沒有編輯器，落在
 * 一個自由文字框 —— 打了一段 JSON 進去，prompt 就讀不到，而畫面照樣「有內容」。
 *
 * 約束（策略圖像槽原文）：
 *   - **沒有真實範例就標缺，不用圖庫圖假扮。** 範例要有一件真的檔案；只有
 *     文字描述「暖調、自然光」不是範例。
 *   - 攝影六格（題材／構圖／光線／調子／留白／道具）：寫得愈具體，外判
 *     愈不會猜。六格是**同一張照片的六個決定**，不是六種風格。
 *   - 「要的樣子」與「不要的樣子」並列。不要的那邊要講**為咩**不要。
 *   - 顏色只引用色彩頁的角色名；未定的角色標缺，不在這一頁補一個色。
 *   - 授權與使用權要寫：冇授權的照片不可以用，這不是排版問題。
 *   - 插畫「若有」：唔係每一間公司都有，所以留空不是缺。
 */

import { schemaForPage, type ImagePayload } from '@company-os/contracts';
import { COLOR_ROLES, valuesOf, type ColorDoc } from './brandColors';

export type ImageDoc = ImagePayload;

export type ImagePhoto = ImagePayload['photo'];

export type ImageExample = ImagePayload['approved_examples'][number];

export type ImageBanned = ImagePayload['banned'][number];

/** 攝影六格，次序固定：由「拍咩」到「擺咩」。 */
export const PHOTO_FIELDS = ['subject', 'composition', 'light', 'tone', 'space', 'props'] as const;

export type PhotoField = (typeof PHOTO_FIELDS)[number];

/** 兩個清單：要的樣子、不要的樣子。兩邊都要有，因為「不要」同樣是判斷。 */
export const IMAGE_LISTS = ['like', 'unlike'] as const;

export type ImageListKey = (typeof IMAGE_LISTS)[number];

const IMAGE_SCHEMA = schemaForPage('image', 'fixed');

export const EMPTY_DOC: ImageDoc = {
  stance: '',
  photo: { subject: '', composition: '', light: '', tone: '', space: '', props: '' },
  illustration: '',
  color_link: [],
  like: [],
  unlike: [],
  approved_examples: [],
  rights: '',
  banned: [],
};

export function emptyImageDoc(): ImageDoc {
  return {
    ...EMPTY_DOC,
    photo: { subject: '', composition: '', light: '', tone: '', space: '', props: '' },
    color_link: [],
    like: [],
    unlike: [],
    approved_examples: [],
    banned: [],
  };
}

export function emptyExample(): ImageExample {
  return { label: '', file_ref: '', use: '' };
}

export function emptyBanned(): ImageBanned {
  return { term: '', reason: '' };
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseImageResult = { kind: 'ok'; doc: ImageDoc } | { kind: 'empty' } | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 認得這份 JSON 是不是一張圖像表。
 *
 * 這一頁之前落在自由文字框：舊內容可能是一段人話、也可能是任意 JSON。兩者
 * 都不可以硬讀 —— 硬讀會畫出六格空的攝影規格加一句「沒有真實範例」，看起
 * 來像已經檢查過，其實一個字都冇讀到。
 */
export function parseImageDoc(value: string): ParseImageResult {
  if (value.trim() === '') {
    return { kind: 'empty' };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(value);
  } catch {
    return { kind: 'invalid' };
  }

  const record = asRecord(raw);

  if (record === null) {
    return { kind: 'invalid' };
  }

  const photo = record['photo'];
  const photoIsNew = photo === undefined || asRecord(photo) !== null;

  const v2Shape =
    (photo !== undefined || Array.isArray(record['approved_examples'])) &&
    ('photo' in record || 'color_link' in record || 'rights' in record || 'approved_examples' in record);

  if (!v2Shape || !photoIsNew) {
    return { kind: 'invalid' };
  }

  return { kind: 'ok', doc: IMAGE_SCHEMA.normalize(raw) as ImageDoc };
}

/** 存進版本的內容：單行，因為版本預覽只有頭 160 字元。 */
export function serializeImageDoc(doc: ImageDoc): string {
  return JSON.stringify(IMAGE_SCHEMA.normalize(doc));
}

export function hasAnyValue(doc: ImageDoc): boolean {
  return (
    doc.stance.trim() !== '' ||
    PHOTO_FIELDS.some((field) => doc.photo[field].trim() !== '') ||
    doc.illustration.trim() !== '' ||
    doc.color_link.length > 0 ||
    doc.like.length > 0 ||
    doc.unlike.length > 0 ||
    doc.approved_examples.length > 0 ||
    doc.rights.trim() !== '' ||
    doc.banned.length > 0
  );
}

/* ── 攝影六格 ─────────────────────────────────────────────── */

export function photoGaps(doc: ImageDoc): PhotoField[] {
  return PHOTO_FIELDS.filter((field) => doc.photo[field].trim() === '');
}

export function setPhoto(doc: ImageDoc, field: PhotoField, value: string): ImageDoc {
  return { ...doc, photo: { ...doc.photo, [field]: value } };
}

/* ── 已核准範例 ───────────────────────────────────────────── */

export type ExampleGap = 'label' | 'file' | 'use';

export function exampleGaps(example: ImageExample): ExampleGap[] {
  const gaps: ExampleGap[] = [];

  if (example.label.trim() === '') {
    gaps.push('label');
  }

  if (example.file_ref.trim() === '') {
    gaps.push('file');
  }

  if (example.use.trim() === '') {
    gaps.push('use');
  }

  return gaps;
}

/**
 * 有沒有**一件真的**範例。
 *
 * 這是這一頁最重要的一條：沒有真實範例就標缺，不用圖庫圖假扮。所以判斷的
 * 是檔案，不是「有沒有寫過一行」—— 一行只寫了名字的示範，交出去只會換來
 * 一張圖庫圖。
 */
export function hasRealExample(doc: ImageDoc): boolean {
  return doc.approved_examples.some((example) => example.file_ref.trim() !== '');
}

export function addExample(doc: ImageDoc): ImageDoc {
  return { ...doc, approved_examples: [...doc.approved_examples, emptyExample()] };
}

export function setExample(doc: ImageDoc, index: number, patch: Partial<ImageExample>): ImageDoc {
  return {
    ...doc,
    approved_examples: doc.approved_examples.map((example, at) =>
      at === index ? { ...example, ...patch } : example,
    ),
  };
}

export function removeExample(doc: ImageDoc, index: number): ImageDoc {
  return { ...doc, approved_examples: doc.approved_examples.filter((_, at) => at !== index) };
}

/* ── 要與不要 ─────────────────────────────────────────────── */

export function addLine(doc: ImageDoc, key: ImageListKey, line: string): ImageDoc {
  const value = line.trim();

  // 同一句加兩次不是兩個特徵，是同一個講了兩次。
  if (value === '' || doc[key].includes(value)) {
    return doc;
  }

  return { ...doc, [key]: [...doc[key], value] };
}

export function removeLine(doc: ImageDoc, key: ImageListKey, index: number): ImageDoc {
  return { ...doc, [key]: doc[key].filter((_, at) => at !== index) };
}

/* ── 與色彩的關係 ─────────────────────────────────────────── */

/** 引用的角色要存在於色彩頁的清單；不在清單裡就是「認不到」。 */
export function colourRoleState(role: string): 'ok' | 'function' | 'unknown' {
  const entry = COLOR_ROLES.find((item) => item.key === role);

  if (entry === undefined) {
    return 'unknown';
  }

  return entry.group === 'function' ? 'function' : 'ok';
}

/** 這個角色在色彩頁的值。色彩頁未定就回 null —— 不在這一頁補一個色。 */
export function colourOf(colour: ColorDoc | null, role: string): string | null {
  if (colour === null) {
    return null;
  }

  const hex = valuesOf(colour, 'light')[role]?.hex ?? '';

  return hex === '' ? null : hex;
}

export function availableRoles(doc: ImageDoc): string[] {
  return COLOR_ROLES.map((role) => role.key).filter((key) => !doc.color_link.includes(key));
}

export function addColorLink(doc: ImageDoc, role: string): ImageDoc {
  if (role === '' || doc.color_link.includes(role)) {
    return doc;
  }

  return { ...doc, color_link: [...doc.color_link, role] };
}

export function removeColorLink(doc: ImageDoc, role: string): ImageDoc {
  return { ...doc, color_link: doc.color_link.filter((item) => item !== role) };
}

/* ── 禁止 ─────────────────────────────────────────────────── */

export type BannedGap = 'term' | 'reason';

export function bannedGaps(item: ImageBanned): BannedGap[] {
  const gaps: BannedGap[] = [];

  if (item.term.trim() === '') {
    gaps.push('term');
  }

  if (item.reason.trim() === '') {
    gaps.push('reason');
  }

  return gaps;
}

export function bannedTerms(doc: ImageDoc): string[] {
  return doc.banned.map((item) => item.term.trim()).filter((term) => term !== '');
}

/** 有詞但冇原因的那幾條。 */
export function bannedWithoutReason(doc: ImageDoc): number[] {
  return doc.banned.reduce<number[]>((found, item, index) => {
    return item.term.trim() !== '' && item.reason.trim() === '' ? [...found, index] : found;
  }, []);
}

export function addBanned(doc: ImageDoc, term: string, reason: string): ImageDoc {
  const value = term.trim();

  if (value === '' || bannedTerms(doc).includes(value)) {
    return doc;
  }

  return { ...doc, banned: [...doc.banned, { term: value, reason: reason.trim() }] };
}

export function setBanned(doc: ImageDoc, index: number, patch: Partial<ImageBanned>): ImageDoc {
  return {
    ...doc,
    banned: doc.banned.map((item, at) => (at === index ? { ...item, ...patch } : item)),
  };
}

export function removeBanned(doc: ImageDoc, index: number): ImageDoc {
  return { ...doc, banned: doc.banned.filter((_, at) => at !== index) };
}

/* ── 缺口 ─────────────────────────────────────────────────── */

export type ImageGaps = {
  /** 未有立場句。 */
  stance: boolean;
  /** 未寫的攝影格。 */
  photo: PhotoField[];
  /** 寫得不齊的範例（索引）。 */
  examples: number[];
  /** 一件真的範例都冇（冇檔案）。 */
  realExample: boolean;
  /** 要的樣子、不要的樣子：空的那一邊。 */
  lists: ImageListKey[];
  /** 一個色彩角色都未引用。 */
  colorLink: boolean;
  /** 引用了色彩頁認不到的角色。 */
  colorUnknown: string[];
  /** 未寫授權與使用權。 */
  rights: boolean;
  /** 一條禁止都冇。 */
  banned: boolean;
  /** 有詞但冇原因的禁止。 */
  bannedReasons: number[];
};

export function imageGaps(doc: ImageDoc): ImageGaps {
  return {
    stance: doc.stance.trim() === '',
    photo: photoGaps(doc),
    examples: doc.approved_examples.reduce<number[]>((found, example, index) => {
      return exampleGaps(example).length > 0 ? [...found, index] : found;
    }, []),
    realExample: !hasRealExample(doc),
    lists: IMAGE_LISTS.filter((key) => doc[key].length === 0),
    colorLink: doc.color_link.length === 0,
    colorUnknown: doc.color_link.filter((role) => colourRoleState(role) === 'unknown'),
    rights: doc.rights.trim() === '',
    banned: bannedTerms(doc).length === 0,
    bannedReasons: bannedWithoutReason(doc),
  };
}

export function gapCount(gaps: ImageGaps): number {
  return (
    gaps.photo.length +
    gaps.examples.length +
    gaps.lists.length +
    gaps.colorUnknown.length +
    gaps.bannedReasons.length +
    (gaps.stance ? 1 : 0) +
    (gaps.realExample ? 1 : 0) +
    (gaps.colorLink ? 1 : 0) +
    (gaps.rights ? 1 : 0) +
    (gaps.banned ? 1 : 0)
  );
}

/**
 * 版本預覽抽範例名：那一版引用過哪幾件。
 *
 * 用 `new RegExp` 而不用字面量：模式裡的引號數目是單數，寫成字面量會令
 * i18n 守門的字元掃描器以為字串未收尾。
 */
const LABEL_PATTERN = new RegExp('"label":"([^"]{1,40})"', 'g');

export function exampleLabelsInText(value: string): string[] {
  const found = value.matchAll(LABEL_PATTERN);

  return Array.from(new Set(Array.from(found, (match) => match[1] ?? '').filter((name) => name !== '')));
}
