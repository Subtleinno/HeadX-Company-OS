/**
 * 品牌語氣的**結構**（issue #37）。
 *
 * 這一頁不是「寫幾句形容詞」，是這個品牌怎樣說話。約束來自
 * `brand_policy_version` 語氣槽的原文：
 *
 *   - 三到五個聲音特質，每個要有**一句做、一句不做，而且兩邊都附實際句子**。
 *     只有「專業、友善、創新」這種形容詞，標成缺。
 *   - 禁用詞。
 *   - 繁中與英文是否並用，要答得出是哪一種。
 *   - 五個情境：說明、邀請、拒絕、致歉、出問題，各有例句。
 *   - 不決定顏色、字體、標誌；不寫渠道尺寸和頁數。
 *
 * 聲音是穩定的，語氣按情境調輕重。所以「情境」是同一把聲音在不同場合的
 * 句子，不是五套語氣。
 */

export type ToneTrait = {
  id: string;
  /** 特質名，例如「直接」。name 之外四樣齊才算一個特質。 */
  name: string;
  /** 做：一句做法說明。 */
  does: string;
  /** 做的實際句子。這一句才是「不是形容詞」的證據。 */
  doesExample: string;
  /** 不做：一句禁令說明。 */
  doesNot: string;
  /** 不做的實際句子。 */
  doesNotExample: string;
};

export const MIN_TRAITS = 3;
export const MAX_TRAITS = 5;

export const SITUATION_KEYS = [
  'explain',
  'invite',
  'refuse',
  'apologise',
  'incident',
] as const;

export type SituationKey = (typeof SITUATION_KEYS)[number];

/**
 * 繁中與英文是否並用。三選一，沒有預設 —— 未答就是缺，不由系統代答。
 */
export const BILINGUAL_MODES = ['zhOnly', 'zhFirst', 'englishPair'] as const;

export type BilingualMode = (typeof BILINGUAL_MODES)[number];

export type ToneDoc = {
  traits: ToneTrait[];
  banned: string[];
  bilingual: BilingualMode | '';
  /** 中英並用的具體規矩，例如「療程名保留英文原名」。可以空。 */
  bilingualNote: string;
  situations: Record<SituationKey, string>;
};

export function emptySituation(): Record<SituationKey, string> {
  return {
    explain: '',
    invite: '',
    refuse: '',
    apologise: '',
    incident: '',
  };
}

export function emptyToneDoc(): ToneDoc {
  return {
    traits: [],
    banned: [],
    bilingual: '',
    bilingualNote: '',
    situations: emptySituation(),
  };
}

export function hasAnyValue(doc: ToneDoc): boolean {
  return (
    doc.traits.length > 0 ||
    doc.banned.length > 0 ||
    doc.bilingual !== '' ||
    doc.bilingualNote.trim() !== '' ||
    SITUATION_KEYS.some((key) => doc.situations[key].trim() !== '')
  );
}

export type TraitGap = 'name' | 'does' | 'doesExample' | 'doesNot' | 'doesNotExample';

export function traitGaps(trait: ToneTrait): TraitGap[] {
  const gaps: TraitGap[] = [];

  if (trait.name.trim() === '') {
    gaps.push('name');
  }

  if (trait.does.trim() === '') {
    gaps.push('does');
  }

  if (trait.doesExample.trim() === '') {
    gaps.push('doesExample');
  }

  if (trait.doesNot.trim() === '') {
    gaps.push('doesNot');
  }

  if (trait.doesNotExample.trim() === '') {
    gaps.push('doesNotExample');
  }

  return gaps;
}

/** 有名但沒有句子 —— 就是「只有形容詞」。 */
export function adjectiveOnly(trait: ToneTrait): boolean {
  return (
    trait.name.trim() !== '' &&
    (trait.doesExample.trim() === '' || trait.doesNotExample.trim() === '')
  );
}

export type ToneGaps = {
  /** 少過三個特質。 */
  tooFew: boolean;
  /** 有缺的特質 id。 */
  traits: string[];
  /** 一個禁用詞都沒有。 */
  banned: boolean;
  /** 未答中英是否並用。 */
  bilingual: boolean;
  /** 未有例句的情境。 */
  situations: SituationKey[];
};

export function toneGaps(doc: ToneDoc): ToneGaps {
  return {
    tooFew: doc.traits.length < MIN_TRAITS,
    traits: doc.traits.filter((trait) => traitGaps(trait).length > 0).map((trait) => trait.id),
    banned: doc.banned.length === 0,
    bilingual: doc.bilingual === '',
    situations: SITUATION_KEYS.filter((key) => doc.situations[key].trim() === ''),
  };
}

export function gapCount(gaps: ToneGaps): number {
  return (
    gaps.traits.length +
    gaps.situations.length +
    (gaps.tooFew ? 1 : 0) +
    (gaps.banned ? 1 : 0) +
    (gaps.bilingual ? 1 : 0)
  );
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseToneResult =
  | { kind: 'ok'; doc: ToneDoc }
  | { kind: 'empty' }
  | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readTraits(raw: unknown): ToneTrait[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const traits: ToneTrait[] = [];

  for (const item of raw) {
    const entry = asRecord(item);

    if (entry === null) {
      continue;
    }

    const id = text(entry.id);

    if (id === '' || traits.some((trait) => trait.id === id)) {
      continue;
    }

    traits.push({
      id,
      name: text(entry.name),
      does: text(entry.does),
      doesExample: text(entry.doesExample),
      doesNot: text(entry.doesNot),
      doesNotExample: text(entry.doesNotExample),
    });
  }

  return traits.slice(0, MAX_TRAITS);
}

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

  // 認得形狀才算語氣表；任意 JSON 硬當成空表就會畫出五個假的「缺」。
  if (!('traits' in record) && !('situations' in record)) {
    return { kind: 'invalid' };
  }

  const situationsRaw = asRecord(record.situations);
  const situations = emptySituation();

  for (const key of SITUATION_KEYS) {
    situations[key] = text(situationsRaw?.[key]);
  }

  const bilingualRaw = text(record.bilingual);

  return {
    kind: 'ok',
    doc: {
      traits: readTraits(record.traits),
      banned: Array.isArray(record.banned)
        ? record.banned.map((item) => text(item)).filter((item) => item !== '')
        : [],
      // 未答就是未答：不代答「只用繁中」。
      bilingual: BILINGUAL_MODES.find((mode) => mode === bilingualRaw) ?? '',
      bilingualNote: text(record.bilingualNote),
      situations,
    },
  };
}

/** 單行，特質排第一：版本列表只拿得到頭 160 字元做預覽。 */
export function serializeToneDoc(doc: ToneDoc): string {
  return JSON.stringify({
    traits: doc.traits,
    banned: doc.banned,
    bilingual: doc.bilingual,
    bilingualNote: doc.bilingualNote,
    situations: doc.situations,
  });
}

/** 版本預覽：特質名。抽不到就空 —— 不會假裝有。 */
export function traitNamesInText(value: string): string[] {
  const found = value.matchAll(/"name":"([^"]{1,40})"/g);

  return Array.from(
    new Set(Array.from(found, (match) => match[1] ?? '').filter((name) => name !== '')),
  );
}
