/**
 * 自定義頁的**結構**（issue #41）。
 *
 * 自定義頁不是「第六頁」，是**第六種頁**：一個品牌可以有零到多張，隨設計師
 * 需要加（包裝、攝影、命名、陳列……）。這一支寫的是「任何一張自定義頁」的
 * 規則，不是某一張的內容 —— 包裝的盒型、攝影的打燈，都是那一頁自己的事。
 *
 * 四樣來源，缺任何一樣就標缺，不自己補：
 *   1. #34 的「自定義頁通用」槽：所有自定義頁共用的規則。
 *   2. 這一頁自己的 brief：建立時寫的那句「這一頁要決定什麼」。
 *   3. 色彩頁的角色名、字體頁的文字角色（**只引用名字**，值由那兩頁來）。
 *   4. 語氣頁：這一頁所有文字都照它寫，包括禁用詞。
 *
 * 兩條硬規矩：
 *   - brief 太空泛就講「未寫這一頁要決定什麼」，不自己發明一個方向。
 *   - brief 要求通用槽禁止的事（發明新色／新字／新標誌），**停手**並講明是
 *     哪兩句撞，不自己選一邊。通用槽贏。
 */

import { CHANNEL_SCOPE_PATTERN, INVENT_ASSET_PATTERN, pickPolicyLine } from '@company-os/i18n';
import { COLOR_ROLES, valuesOf, type ColorDoc } from './brandColors';
import { TYPE_ROLES, type TypeDoc } from './brandType';
import type { ToneDoc } from './brandTone';

/** brief 少於這個字數就當「只寫了名詞」：一句講得出要決定什麼，通常過十個字。 */
export const BRIEF_MIN_CHARS = 10;

export const CUSTOM_SECTIONS = [
  'decided',
  'notDecided',
  'rules',
  'examples',
  'badExamples',
] as const;

export type CustomSectionKey = (typeof CUSTOM_SECTIONS)[number];

export type CustomDoc = {
  /** 這一頁決定什麼：要回應 brief。 */
  decided: string;
  /** 不准決定什麼。 */
  notDecided: string;
  rules: string[];
  examples: string[];
  /** 錯誤例子：故意示範錯的東西，所以不用來查禁用詞。 */
  badExamples: string[];
  /** 引用的色彩頁角色名（只寫名字）。 */
  colorRoles: string[];
  /** 引用的字體頁文字角色名（只寫名字）。 */
  typeRoles: string[];
};

export function emptyCustomDoc(): CustomDoc {
  return {
    decided: '',
    notDecided: '',
    rules: [],
    examples: [],
    badExamples: [],
    colorRoles: [],
    typeRoles: [],
  };
}

export function hasAnyValue(doc: CustomDoc): boolean {
  return (
    doc.decided.trim() !== '' ||
    doc.notDecided.trim() !== '' ||
    doc.rules.length > 0 ||
    doc.examples.length > 0 ||
    doc.badExamples.length > 0
  );
}

export type BriefState = 'ok' | 'empty' | 'vague';

export function briefState(brief: string): BriefState {
  const value = brief.trim();

  if (value === '') {
    return 'empty';
  }

  return value.length < BRIEF_MIN_CHARS ? 'vague' : 'ok';
}

/* ── brief 與通用槽相撞 ───────────────────────────────────── */

/**
 * 「發明自己的顏色／字體／標誌」這類講法。字詞本身住在 @company-os/i18n 的
 * zh-words（那是唯一容許中文的地方），這裡只負責拿它去比對 brief。
 *
 * 只看 brief，不看頁面內容 —— 頁面的「不准決定什麼」本來就會寫「不發明新
 * 標誌」，那是守規則，不是違規。
 */

export type Conflict = {
  /** brief 裡撞上的那一段。 */
  phrase: string;
  /** 通用槽裡被撞的那一句。 */
  policyLine: string;
};

export function conflictInBrief(brief: string, policyText: string): Conflict | null {
  const value = brief.trim();

  if (value === '') {
    return null;
  }

  const invent = INVENT_ASSET_PATTERN.exec(value);
  const channel = CHANNEL_SCOPE_PATTERN.exec(value);
  const match = invent ?? channel;

  if (match === null) {
    return null;
  }

  const lines = policyText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  return { phrase: match[0].trim(), policyLine: pickPolicyLine(lines) };
}

/* ── 缺 ───────────────────────────────────────────────────── */

export type CustomGaps = {
  /** brief 未寫或太空泛。 */
  brief: 'empty' | 'vague' | null;
  /** 缺的欄目。 */
  sections: CustomSectionKey[];
  /** 引用了但色彩頁未定值的角色名。 */
  colorRoles: string[];
  /** 引用了但字體頁未有可用值的角色名。 */
  typeRoles: string[];
  /** 語氣頁未有現行版本。 */
  tone: boolean;
  /** 例子裡用了語氣頁的禁用詞。 */
  banned: string[];
  /** brief 與通用槽相撞。 */
  conflict: Conflict | null;
};

export type CustomGapInput = {
  doc: CustomDoc;
  brief: string;
  colour: ColorDoc | null;
  type: TypeDoc | null;
  tone: ToneDoc | null;
  policyText: string;
};

/** 這個色彩角色在色彩頁有 HEX 才算數：只有 CMYK 沒有螢幕上的色。 */
export function colourRoleValue(colour: ColorDoc | null, role: string): string | null {
  if (colour === null) {
    return null;
  }

  const hex = valuesOf(colour, 'light')[role]?.hex ?? '';

  return hex === '' ? null : hex;
}

/** 字體頁的這個文字角色有沒有被指定家族（家族本身可不可用由字體頁自己講）。 */
export function typeRoleResolved(type: TypeDoc | null, role: string): boolean {
  if (type === null) {
    return false;
  }

  const entry = type.roles[role as (typeof TYPE_ROLES)[number]];

  return entry !== undefined && entry.familyId.trim() !== '';
}

export function bannedHits(doc: CustomDoc, tone: ToneDoc | null): string[] {
  if (tone === null || tone.banned.length === 0) {
    return [];
  }

  const haystack = doc.examples.join('\n');

  return tone.banned.filter((word) => word !== '' && haystack.includes(word));
}

export function customGaps(input: CustomGapInput): CustomGaps {
  const brief = briefState(input.brief);

  const sections = CUSTOM_SECTIONS.filter((key) => {
    if (key === 'rules' || key === 'examples' || key === 'badExamples') {
      return input.doc[key].length === 0;
    }

    return input.doc[key].trim() === '';
  });

  return {
    brief: brief === 'ok' ? null : brief,
    sections,
    colorRoles: input.doc.colorRoles.filter((role) => colourRoleValue(input.colour, role) === null),
    typeRoles: input.doc.typeRoles.filter((role) => !typeRoleResolved(input.type, role)),
    tone: input.tone === null,
    banned: bannedHits(input.doc, input.tone),
    conflict: conflictInBrief(input.brief, input.policyText),
  };
}

export function gapCount(gaps: CustomGaps): number {
  return (
    gaps.sections.length +
    gaps.colorRoles.length +
    gaps.typeRoles.length +
    gaps.banned.length +
    (gaps.brief === null ? 0 : 1) +
    (gaps.tone ? 1 : 0) +
    (gaps.conflict === null ? 0 : 1)
  );
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseCustomResult =
  | { kind: 'ok'; doc: CustomDoc }
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

function lines(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item)).filter((item) => item !== '') : [];
}

/** 引用只認色彩頁與字體頁的名字：打錯的名字讀入時丟掉，不留一個永遠缺的引用。 */
function knownRoles(value: unknown, allowed: readonly string[]): string[] {
  const wanted = lines(value);

  return allowed.filter((role) => wanted.includes(role));
}

export function parseCustomDoc(value: string): ParseCustomResult {
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

  // 認得形狀才算自定義頁的表；任意 JSON 硬當成空表就會畫五個假的「缺」。
  if (!('decided' in record) && !('rules' in record)) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'ok',
    doc: {
      decided: text(record.decided),
      notDecided: text(record.notDecided),
      rules: lines(record.rules),
      examples: lines(record.examples),
      badExamples: lines(record.badExamples),
      colorRoles: knownRoles(
        record.colorRoles,
        COLOR_ROLES.map((role) => role.key),
      ),
      typeRoles: knownRoles(record.typeRoles, TYPE_ROLES),
    },
  };
}

/** 單行，「這一頁決定什麼」排第一：版本列表只拿得到頭 160 字元做預覽。 */
export function serializeCustomDoc(doc: CustomDoc): string {
  return JSON.stringify({
    decided: doc.decided,
    notDecided: doc.notDecided,
    rules: doc.rules,
    examples: doc.examples,
    badExamples: doc.badExamples,
    colorRoles: doc.colorRoles,
    typeRoles: doc.typeRoles,
  });
}

/** 版本預覽：第一句。抽不到就空 —— 不會假裝有。 */
export function leadingLineInText(value: string): string {
  const match = /"decided":"([^"\\]{1,80})/.exec(value);

  return match?.[1]?.trim() ?? '';
}
