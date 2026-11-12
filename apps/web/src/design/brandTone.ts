/**
 * 品牌語氣頁的**資料層**（issue #65，取代 #37 的形狀）。
 *
 * 和色彩、字體、標誌三頁一樣，這一支是 `@company-os/contracts` 語氣 payload
 * 的**編輯器轉接層**：存的是同一個 `TonePayload`，所以 prompt 包的語氣段落、
 * HTML 與這一頁看到的必然是同一份。舊版（#37）自己的形狀（`does`／
 * `doesExample`、`bilingual` 三選一、`banned` 是純字串陣列、`situations`）
 * 要靠換算才可以餵 prompt，換算一日存在就有一日不同步。
 *
 * 約束（策略語氣槽原文）：
 *   - 聲音特質**不是形容詞**。每一條要有「會這樣講」「不會這樣講」**加一句
 *     真句**。只有名而沒有示範句，就是「只有形容詞」，標缺（`voice.r1`）。
 *   - 禁用詞逐個要寫**為咩禁**。冇原因的禁用詞，下一次就會被人解禁。
 *   - 語言政策要答得出用哪種語言、何時用 —— 不是系統代答「只用繁中」。
 *   - 五個情境（解釋／邀請／拒絕／道歉／事故）是**同一把聲**在不同場合的
 *     句子，不是五套語氣。
 *   - 樣本比形容詞有用：五句像、五句不像。不像的也要是這間公司可能寫得出來
 *     的句子，否則它只是別人的語氣。
 *   - 最難的一句：拒絕客人而又不失禮。錯與對都要寫。
 */

import { schemaForPage, type TonePayload } from '@company-os/contracts';

export type ToneDoc = TonePayload;

export type ToneTrait = TonePayload['traits'][number];

export type ToneBanned = TonePayload['banned'][number];

/** 三到五個特質。少過三個不夠用，多過五個沒人記得。 */
export const MIN_TRAITS = 3;
export const MAX_TRAITS = 5;

/** 樣本五句像、五句不像。少過就是未夠，不是「差不多」。 */
export const SAMPLE_TARGET = 5;

/** 五個情境，次序固定。用哪一把聲講由這一頁決定，不是按場合換人。 */
export const CONTEXT_KEYS = ['explain', 'invite', 'decline', 'apologize', 'incident'] as const;

export type ContextKey = (typeof CONTEXT_KEYS)[number];

export const SAMPLE_KINDS = ['like', 'unlike'] as const;

export type SampleKind = (typeof SAMPLE_KINDS)[number];

export const HARDEST_FIELDS = ['wrong', 'right'] as const;

export type HardestField = (typeof HARDEST_FIELDS)[number];

const TONE_SCHEMA = schemaForPage('tone', 'fixed');

export const EMPTY_DOC: ToneDoc = {
  stance: '',
  traits: [],
  banned: [],
  language_policy: '',
  contexts: { explain: '', invite: '', decline: '', apologize: '', incident: '' },
  samples: { like: [], unlike: [] },
  hardest_line: { wrong: '', right: '' },
};

export function emptyToneDoc(): ToneDoc {
  return {
    ...EMPTY_DOC,
    traits: [],
    banned: [],
    contexts: { explain: '', invite: '', decline: '', apologize: '', incident: '' },
    samples: { like: [], unlike: [] },
    hardest_line: { wrong: '', right: '' },
  };
}

export function emptyTrait(): ToneTrait {
  return { name: '', do: '', dont: '', sentence: '' };
}

export function emptyBanned(): ToneBanned {
  return { term: '', reason: '' };
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseToneResult = { kind: 'ok'; doc: ToneDoc } | { kind: 'empty' } | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 認得這份 JSON 是不是一張語氣表。
 *
 * 舊形狀（#37）的特質是 `does`／`doesExample`，另有 `situations` 與
 * `bilingual`。硬讀的話，五個情境全部畫成「缺」、每個特質都說「只有形容詞」
 * —— 一張看起來已檢查、實際全空的假表。形狀不對就講讀不到。
 */
export function parseToneDoc(value: string): ParseToneResult {
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

  const legacyShape = 'situations' in record || 'bilingual' in record || 'bilingualNote' in record;

  const v2Shape =
    Array.isArray(record['traits']) &&
    ('contexts' in record ||
      'hardest_line' in record ||
      'language_policy' in record ||
      'samples' in record);

  if (legacyShape || !v2Shape) {
    return { kind: 'invalid' };
  }

  const doc = TONE_SCHEMA.normalize(raw) as ToneDoc;

  // 上限五個：讀入第六個不是「多寫了一條」，是那條不會被用到。
  return { kind: 'ok', doc: { ...doc, traits: doc.traits.slice(0, MAX_TRAITS) } };
}

/** 存進版本的內容：單行，因為版本預覽只有頭 160 字元。 */
export function serializeToneDoc(doc: ToneDoc): string {
  return JSON.stringify(TONE_SCHEMA.normalize(doc));
}

export function hasAnyValue(doc: ToneDoc): boolean {
  return (
    doc.stance.trim() !== '' ||
    doc.traits.length > 0 ||
    doc.banned.length > 0 ||
    doc.language_policy.trim() !== '' ||
    CONTEXT_KEYS.some((key) => doc.contexts[key].trim() !== '') ||
    doc.samples.like.length > 0 ||
    doc.samples.unlike.length > 0 ||
    doc.hardest_line.wrong.trim() !== '' ||
    doc.hardest_line.right.trim() !== ''
  );
}

/* ── 特質 ─────────────────────────────────────────────────── */

export type TraitGap = 'name' | 'do' | 'dont' | 'sentence';

export function traitGaps(trait: ToneTrait): TraitGap[] {
  const gaps: TraitGap[] = [];

  if (trait.name.trim() === '') {
    gaps.push('name');
  }

  if (trait.do.trim() === '') {
    gaps.push('do');
  }

  if (trait.dont.trim() === '') {
    gaps.push('dont');
  }

  if (trait.sentence.trim() === '') {
    gaps.push('sentence');
  }

  return gaps;
}

/**
 * 有名而沒有示範句 —— 就是「只有形容詞」。
 *
 * 系統判斷不到「專業」是不是形容詞，但判斷得到有冇一句真句。示範句才是
 * 證據，所以缺示範句就當只有形容詞。
 */
export function adjectiveOnly(trait: ToneTrait): boolean {
  return trait.name.trim() !== '' && trait.sentence.trim() === '';
}

export function traitReady(trait: ToneTrait): boolean {
  return traitGaps(trait).length === 0;
}

/** 改名／改句：payload 的特質冇 id，所以用索引認人。 */
export function setTrait(doc: ToneDoc, index: number, patch: Partial<ToneTrait>): ToneDoc {
  return {
    ...doc,
    traits: doc.traits.map((trait, at) => (at === index ? { ...trait, ...patch } : trait)),
  };
}

/** 刪一個特質。整條都空的就不必留著佔位。 */
export function removeTrait(doc: ToneDoc, index: number): ToneDoc {
  return { ...doc, traits: doc.traits.filter((_, at) => at !== index) };
}

export function addTrait(doc: ToneDoc): ToneDoc {
  if (doc.traits.length >= MAX_TRAITS) {
    return doc;
  }

  return { ...doc, traits: [...doc.traits, emptyTrait()] };
}

/* ── 禁用詞 ───────────────────────────────────────────────── */

export type BannedGap = 'term' | 'reason';

export function bannedGaps(item: ToneBanned): BannedGap[] {
  const gaps: BannedGap[] = [];

  if (item.term.trim() === '') {
    gaps.push('term');
  }

  if (item.reason.trim() === '') {
    gaps.push('reason');
  }

  return gaps;
}

/** 有詞但冇原因的那幾條 —— 規則 `voice.r1` 看的就是這個。 */
export function bannedWithoutReason(doc: ToneDoc): number[] {
  return doc.banned.reduce<number[]>((found, item, index) => {
    return item.term.trim() !== '' && item.reason.trim() === '' ? [...found, index] : found;
  }, []);
}

export function bannedTerms(doc: ToneDoc): string[] {
  return doc.banned.map((item) => item.term.trim()).filter((term) => term !== '');
}

/** 加一個禁用詞。同一個詞不重覆 —— 第二個原因是第二份真相。 */
export function addBanned(doc: ToneDoc, term: string, reason: string): ToneDoc {
  const value = term.trim();

  if (value === '' || bannedTerms(doc).includes(value)) {
    return doc;
  }

  return { ...doc, banned: [...doc.banned, { term: value, reason: reason.trim() }] };
}

export function setBanned(doc: ToneDoc, index: number, patch: Partial<ToneBanned>): ToneDoc {
  return {
    ...doc,
    banned: doc.banned.map((item, at) => (at === index ? { ...item, ...patch } : item)),
  };
}

export function removeBanned(doc: ToneDoc, index: number): ToneDoc {
  return { ...doc, banned: doc.banned.filter((_, at) => at !== index) };
}

/* ── 情境 ─────────────────────────────────────────────────── */

export function contextGaps(doc: ToneDoc): ContextKey[] {
  return CONTEXT_KEYS.filter((key) => doc.contexts[key].trim() === '');
}

export function setContext(doc: ToneDoc, key: ContextKey, value: string): ToneDoc {
  return { ...doc, contexts: { ...doc.contexts, [key]: value } };
}

/* ── 樣本 ─────────────────────────────────────────────────── */

/** 數真正有字的句子：陣列有三格但有兩格是空的，就是一句。 */
export function sampleCount(doc: ToneDoc, kind: SampleKind): number {
  return doc.samples[kind].filter((line) => line.trim() !== '').length;
}

/** 未夠五句的那一邊。兩邊都要有，因為「不像」同樣是規則。 */
export function sampleGaps(doc: ToneDoc): SampleKind[] {
  return SAMPLE_KINDS.filter((kind) => sampleCount(doc, kind) < SAMPLE_TARGET);
}

export function setSample(doc: ToneDoc, kind: SampleKind, index: number, value: string): ToneDoc {
  return {
    ...doc,
    samples: { ...doc.samples, [kind]: doc.samples[kind].map((line, at) => (at === index ? value : line)) },
  };
}

export function addSample(doc: ToneDoc, kind: SampleKind): ToneDoc {
  if (doc.samples[kind].length >= SAMPLE_TARGET) {
    return doc;
  }

  return { ...doc, samples: { ...doc.samples, [kind]: [...doc.samples[kind], ''] } };
}

export function removeSample(doc: ToneDoc, kind: SampleKind, index: number): ToneDoc {
  return {
    ...doc,
    samples: { ...doc.samples, [kind]: doc.samples[kind].filter((_, at) => at !== index) },
  };
}

/* ── 最難的一句 ───────────────────────────────────────────── */

export function hardestGaps(doc: ToneDoc): HardestField[] {
  return HARDEST_FIELDS.filter((field) => doc.hardest_line[field].trim() === '');
}

export function setHardest(doc: ToneDoc, field: HardestField, value: string): ToneDoc {
  return { ...doc, hardest_line: { ...doc.hardest_line, [field]: value } };
}

/* ── 缺口 ─────────────────────────────────────────────────── */

export type ToneGaps = {
  /** 未有立場句。 */
  stance: boolean;
  /** 少過三個特質。 */
  tooFew: boolean;
  /** 有缺的特質（索引；payload 的特質冇 id）。 */
  traits: number[];
  /** 一個禁用詞都冇。 */
  banned: boolean;
  /** 有詞但冇原因的禁用詞。 */
  bannedReasons: number[];
  /** 未答用哪種語言、何時用。 */
  languagePolicy: boolean;
  /** 未寫的情境。 */
  contexts: ContextKey[];
  /** 未夠五句的樣本。 */
  samples: SampleKind[];
  /** 未寫的最難的一句。 */
  hardest: HardestField[];
};

export function toneGaps(doc: ToneDoc): ToneGaps {
  return {
    stance: doc.stance.trim() === '',
    tooFew: doc.traits.length < MIN_TRAITS,
    traits: doc.traits.reduce<number[]>((found, trait, index) => {
      return traitGaps(trait).length > 0 ? [...found, index] : found;
    }, []),
    banned: bannedTerms(doc).length === 0,
    bannedReasons: bannedWithoutReason(doc),
    languagePolicy: doc.language_policy.trim() === '',
    contexts: contextGaps(doc),
    samples: sampleGaps(doc),
    hardest: hardestGaps(doc),
  };
}

export function gapCount(gaps: ToneGaps): number {
  return (
    gaps.traits.length +
    gaps.bannedReasons.length +
    gaps.contexts.length +
    gaps.samples.length +
    gaps.hardest.length +
    (gaps.stance ? 1 : 0) +
    (gaps.tooFew ? 1 : 0) +
    (gaps.banned ? 1 : 0) +
    (gaps.languagePolicy ? 1 : 0)
  );
}

/**
 * 版本預覽抽特質名：那一版有哪幾把聲音。
 *
 * 用 `new RegExp` 而不用字面量：模式裡的引號數目是單數，寫成字面量會令
 * i18n 守門的字元掃描器以為字串未收尾。
 */
const NAME_PATTERN = new RegExp('"name":"([^"]{1,40})"', 'g');

export function traitNamesInText(value: string): string[] {
  const found = value.matchAll(NAME_PATTERN);

  return Array.from(new Set(Array.from(found, (match) => match[1] ?? '').filter((name) => name !== '')));
}
