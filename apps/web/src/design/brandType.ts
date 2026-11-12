/**
 * 品牌字體頁的**資料層**（issue #63，取代 #38 的形狀）。
 *
 * 和色彩頁一樣，這一支是 `@company-os/contracts` 字體 payload 的**編輯器
 * 轉接層**：存的是同一個 `TypePayload`，所以 tokens.json（`typography`）、
 * prompt 包、HTML 與這一頁看到的必然是同一份。
 *
 * 舊版（#38）有自己的形狀（`roles` 是一個以層級為鍵的物件、`licence` 一句
 * 自由文字、`webEmbeddable` 一個勾）。它靠 legacy 轉換餵 renderer，而那個
 * 轉換會**無中生有**：勾了「可嵌入」就寫成 `license_web: '可嵌入'`，可嵌入
 * 檔永遠是空。結果是 tokens 與 prompt 拿到一份看起來齊全、實際上缺檔的家族。
 * 缺就是缺，所以形狀要對齊，不要靠翻譯。
 *
 * 約束不變（策略字體槽原文）：
 *   - 一套品牌**最多兩個家族**；中英各一剛好用滿。
 *   - 沒有授權或沒有可嵌入檔，標缺 —— **不准用系統預設字充當品牌字**。
 *   - 每一級都要有最小尺寸；`18` 不是 18 像素，是缺。
 *   - 文字顏色只引用色彩頁的角色名，這一頁沒有色值欄位。
 */

import { schemaForPage, type TypePayload } from '@company-os/contracts';
import { COLOR_ROLES, isColorRole } from './brandColors';

export type TypeDoc = TypePayload;

export type Script = 'latin' | 'chinese';

export const SCRIPTS: readonly Script[] = ['latin', 'chinese'];

export type TypeRoleKey = 'display' | 'heading' | 'body' | 'caption';

/** 四個層級的名字寫死：其他頁（標誌的字標、主頁的樣本）引用的是這幾個。 */
export const TYPE_ROLES: readonly TypeRoleKey[] = ['display', 'heading', 'body', 'caption'];

/** 策略：一套品牌最多兩個家族。 */
export const MAX_FAMILIES = 2;

/** 准用字重。清單寫死，因為「600」與「semibold」是兩個講法同一個東西。 */
export const WEIGHTS: readonly string[] = ['300', '400', '500', '600', '700', '800', '900'];

/** 文字顏色可以揀的角色：就是色彩頁那九個。不另開一份名單。 */
export const TEXT_COLOR_ROLES: readonly string[] = COLOR_ROLES.map((role) => role.key);

export type FontFamily = TypeDoc['families'][number];
export type RoleSpec = TypeDoc['roles'][number];
export type PrintRow = TypeDoc['print_matrix'][number];
export type Misuse = TypeDoc['misuse'][number];

const TYPE_SCHEMA = schemaForPage('type', 'fixed');

export const EMPTY_DOC: TypeDoc = {
  stance: '',
  philosophy: '',
  families: [],
  roles: [],
  pairing: '',
  sentence_anatomy: '',
  print_matrix: [],
  mixed_setting: '',
  misuse: [],
};

export function emptyTypeDoc(): TypeDoc {
  return { ...EMPTY_DOC, families: [], roles: [], print_matrix: [], misuse: [] };
}

export function emptyRole(role: string): RoleSpec {
  return {
    role,
    family: '',
    weight: '',
    size: '',
    leading: '',
    min: 0,
    measure: '',
    color_role: '',
    reason: '',
  };
}

export function emptyFamily(id: string): FontFamily {
  return {
    id,
    name: '',
    script: 'latin',
    license_web: '',
    license_print: '',
    license_app: '',
    license_desktop: '',
    file_ref: '',
  };
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseTypeResult = { kind: 'ok'; doc: TypeDoc } | { kind: 'empty' } | { kind: 'invalid' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 認得這份 JSON 是不是一張字體表。
 *
 * 舊形狀（`roles` 是物件、`licence` 一句字）雖然解析得到，但它不是這一份
 * 表 —— 硬讀就會畫出一張看起來齊全、實際上缺檔的表。所以形狀不認就講
 * 讀不到，並提供「由空白起手」。
 */
export function parseTypeDoc(content: string): ParseTypeResult {
  if (content.trim() === '') {
    return { kind: 'empty' };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(content);
  } catch {
    return { kind: 'invalid' };
  }

  const record = asRecord(raw);

  if (record === null) {
    return { kind: 'invalid' };
  }

  const v2Shape =
    (Array.isArray(record['families']) ||
      'philosophy' in record ||
      'print_matrix' in record ||
      'mixed_setting' in record ||
      'sentence_anatomy' in record) &&
    // 舊形狀（#38）的 `roles` 是一個以層級為鍵的物件。留著它只會畫出一張
    // 看起來齊全、實際上每格都空的表，所以形狀不對就講讀不到。
    (record['roles'] === undefined || Array.isArray(record['roles']));

  if (!v2Shape) {
    return { kind: 'invalid' };
  }

  const doc = TYPE_SCHEMA.normalize(raw) as TypeDoc;

  // 策略上限：一套品牌兩個家族。多出來的不是「一起用」，是沒有決定。
  return { kind: 'ok', doc: { ...doc, families: doc.families.slice(0, MAX_FAMILIES) } };
}

/** 存進版本的內容：單行，因為版本預覽只有頭 160 字元。 */
export function serializeTypeDoc(doc: TypeDoc): string {
  return JSON.stringify(TYPE_SCHEMA.normalize(doc));
}

export function hasAnyValue(doc: TypeDoc): boolean {
  return (
    doc.families.length > 0 ||
    doc.roles.length > 0 ||
    doc.philosophy.trim() !== '' ||
    doc.pairing.trim() !== '' ||
    doc.sentence_anatomy.trim() !== '' ||
    doc.mixed_setting.trim() !== '' ||
    doc.print_matrix.length > 0 ||
    doc.misuse.length > 0
  );
}

/* ── 家族 ─────────────────────────────────────────────────── */

export type FamilyGap = 'name' | 'licence' | 'file';

/**
 * 一個家族缺甚麼。
 *
 * `type.r3` 要的是「至少寫明一種授權」—— 四個渠道（網頁、印刷、應用程式、
 * 桌面）任一個有寫就當有授權，四個都空才是缺。可嵌入檔是另一件事：沒有檔
 * 就畫不出真樣本。
 */
export function familyGaps(family: FontFamily): FamilyGap[] {
  const gaps: FamilyGap[] = [];

  if (family.name.trim() === '') {
    gaps.push('name');
  }

  const licensed = [
    family.license_web,
    family.license_print,
    family.license_app,
    family.license_desktop,
  ].some((value) => value.trim() !== '');

  if (!licensed) {
    gaps.push('licence');
  }

  if (family.file_ref.trim() === '') {
    gaps.push('file');
  }

  return gaps;
}

/** 可用＝三個條件齊。任何一個缺，它就不可以用來排版。 */
export function familyUsable(family: FontFamily): boolean {
  return familyGaps(family).length === 0;
}

export function usableFamilies(doc: TypeDoc): FontFamily[] {
  return doc.families.filter(familyUsable);
}

export function findFamily(doc: TypeDoc, id: string): FontFamily | null {
  return doc.families.find((family) => family.id === id) ?? null;
}

/** 哪幾個腳本沒有可用的家族。缺中文就在這裡講，不靜靜用系統字。 */
export function missingScripts(doc: TypeDoc): Script[] {
  const usable = usableFamilies(doc);

  return SCRIPTS.filter((script) => !usable.some((family) => family.script === script));
}

/* ── 字階 ─────────────────────────────────────────────────── */

export function roleOf(doc: TypeDoc, key: TypeRoleKey): RoleSpec {
  return doc.roles.find((role) => role.role === key) ?? emptyRole(key);
}

/** 改一級的一格；整行都空了就刪走，不留空殼。 */
export function setRole(
  doc: TypeDoc,
  key: TypeRoleKey,
  patch: Partial<Omit<RoleSpec, 'role'>>,
): TypeDoc {
  const next: RoleSpec = { ...roleOf(doc, key), ...patch };
  const blank =
    next.family.trim() === '' &&
    next.weight.trim() === '' &&
    next.size.trim() === '' &&
    next.leading.trim() === '' &&
    next.min <= 0 &&
    next.measure.trim() === '' &&
    next.color_role.trim() === '' &&
    next.reason.trim() === '';

  const others = doc.roles.filter((role) => role.role !== key);

  return { ...doc, roles: blank ? others : [...others, next] };
}

/** 這個層級指去的家族，可用就回它，否則 null（＝缺）。 */
export function roleFamily(doc: TypeDoc, key: TypeRoleKey): FontFamily | null {
  const family = findFamily(doc, roleOf(doc, key).family);

  return family !== null && familyUsable(family) ? family : null;
}

/** 尺寸一定要帶單位。`18` 不是 18 像素，是缺。 */
export function sizeHasUnit(value: string): boolean {
  return /^\d+(\.\d+)?(px|rem|pt)$/.test(value.trim());
}

/** 行距可以是倍數（1.5）也可以是帶單位的值（26px、120%）。 */
export function leadingOk(value: string): boolean {
  return /^\d+(\.\d+)?(px|rem|pt|%)?$/.test(value.trim());
}

export type RoleGap = 'family' | 'size' | 'leading' | 'weight' | 'min' | 'color';

export function roleGaps(doc: TypeDoc, key: TypeRoleKey): RoleGap[] {
  const role = roleOf(doc, key);
  const gaps: RoleGap[] = [];

  if (roleFamily(doc, key) === null) {
    gaps.push('family');
  }

  if (!sizeHasUnit(role.size)) {
    gaps.push('size');
  }

  if (!leadingOk(role.leading)) {
    gaps.push('leading');
  }

  if (role.weight.trim() === '') {
    gaps.push('weight');
  }

  if (role.min <= 0) {
    gaps.push('min');
  }

  if (!isColorRole(role.color_role)) {
    gaps.push('color');
  }

  return gaps;
}

export function roleMissing(doc: TypeDoc, key: TypeRoleKey): boolean {
  return roleGaps(doc, key).length > 0;
}

/* ── 缺口 ─────────────────────────────────────────────────── */

export type TypeGaps = {
  /** 有缺的家族（家族 id）。 */
  families: string[];
  scripts: Script[];
  roles: TypeRoleKey[];
  pairing: boolean;
  philosophy: boolean;
};

export function typeGaps(doc: TypeDoc): TypeGaps {
  return {
    families: doc.families.filter((family) => familyGaps(family).length > 0).map((family) => family.id),
    scripts: missingScripts(doc),
    roles: TYPE_ROLES.filter((key) => roleMissing(doc, key)),
    pairing: doc.pairing.trim() === '',
    philosophy: doc.philosophy.trim() === '',
  };
}

/** 缺口數＝每一件未完成的事算一項。數字要對得上畫面，不是對得上分類。 */
export function gapCount(gaps: TypeGaps): number {
  return (
    gaps.families.length +
    gaps.scripts.length +
    gaps.roles.length +
    (gaps.pairing ? 1 : 0) +
    (gaps.philosophy ? 1 : 0)
  );
}

/**
 * 版本預覽抽家族名：那一版用了什麼字。
 *
 * 用 `new RegExp` 而不用字面量：模式裡的引號數目是單數，寫成字面量會令
 * i18n 守門的字元掃描器以為字串未收尾，之後的註解就不再被當成註解
 * （那個守門要逐字判斷是否在字串內）。
 */
const NAME_PATTERN = new RegExp('"name":"([^"]{1,40})"', 'g');

export function namesInText(value: string): string[] {
  const found = value.matchAll(NAME_PATTERN);

  return Array.from(new Set(Array.from(found, (match) => match[1] ?? '').filter((name) => name !== '')));
}

/**
 * 下一個家族 id：`f-1`、`f-2`…，刪走之後重用細號也不撞。
 *
 * 用細號而不是時間戳：同一份內容重讀幾次都一樣。
 */
export function nextFamilyId(doc: TypeDoc): string {
  let index = doc.families.length + 1;

  while (doc.families.some((family) => family.id === `f-${index}`)) {
    index += 1;
  }

  return `f-${index}`;
}
