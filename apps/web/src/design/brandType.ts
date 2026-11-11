/**
 * 品牌字體的**結構**（issue #38）。
 *
 * 這一支不是「字體清單」，是四個層級加兩個家族之間的約束。約束來自
 * `brand_policy_version` 字體槽的原文，這裡只放它的結論：
 *
 *   - 每個層級都要有角色：display、heading、body、caption。沒有角色的字級
 *     不准存在。
 *   - 一套品牌**最多兩個家族**。中英各一剛好用滿兩個，第三個就是缺。
 *   - 繁中與拉丁分開指定，並講明怎樣配對。缺中文或缺英文就標成缺 ——
 *     **不准用系統預設字充當品牌字**。備用字只作渲染後備，不是品牌字。
 *   - 沒有授權的字不准用；網頁必須有可嵌入的檔。沒有就標成缺。
 *   - 尺寸要寫單位（px／rem／pt）。只寫數字的「18」不是 18 像素，是缺。
 *   - 文字顏色只引用色彩頁的角色名（`ink`、`muted` 或色彩頁那九個），
 *     **不發明色** —— 所以這裡沒有色值欄位。
 *   - 標誌的最小尺寸不在這一頁，屬 #36。
 *
 * 字體名、授權、數值都住在「字體」頁的版本內容（#33），不在原始碼裡。
 * 角色名（display／heading／body／caption）與腳本（latin／chinese）寫死，
 * 因為其他頁（#36 的字標）引用的是這幾個名字。
 */

import { COLOR_ROLES, isColorRole } from './brandColors';

export type Script = 'latin' | 'chinese';

export const SCRIPTS: readonly Script[] = ['latin', 'chinese'];

export type Align = 'left' | 'justify' | 'center';

export const ALIGNS: readonly Align[] = ['left', 'justify', 'center'];

export type TypeRoleKey = 'display' | 'heading' | 'body' | 'caption';

export const TYPE_ROLES: readonly TypeRoleKey[] = ['display', 'heading', 'body', 'caption'];

/** 策略：一套品牌最多兩個家族，除非老闆在策略加例外（這裡沒有那個例外）。 */
export const MAX_FAMILIES = 2;

/** 准用字重。清單寫死，因為「600」與「semibold」是兩個講法同一個東西。 */
export const WEIGHTS: readonly string[] = ['300', '400', '500', '600', '700', '800', '900'];

/** 文字顏色可以揀的角色：就是色彩頁那九個。不另開一份名單。 */
export const TEXT_COLOR_ROLES: readonly string[] = COLOR_ROLES.map((role) => role.key);

export type FontFamily = {
  /** 內部 id：層級用它指去某一個家族。改名不會斷掉。 */
  id: string;
  script: Script;
  name: string;
  /** 授權範圍（人寫的文字）：網頁嵌入、印刷、應用程式、只有桌面… */
  licence: string;
  /** 網頁必須有可嵌入的檔。false 就等於「不可以在網頁用」。 */
  webEmbeddable: boolean;
};

export type RoleSpec = {
  familyId: string;
  /** 帶單位：`56px`、`3.5rem`、`42pt`。 */
  size: string;
  leading: string;
  weight: string;
  minSize: string;
  /** 角色的文字顏色：色彩頁的角色名，不是色值。 */
  colorRole: string;
};

export type TypeDoc = {
  families: FontFamily[];
  roles: Record<TypeRoleKey, RoleSpec>;
  /** 中英怎樣配對（人寫的一兩句）。 */
  pairing: string;
  fallbackLatin: string;
  fallbackChinese: string;
  /** 內文行長，例如「32 字元」或「64ch」。 */
  measure: string;
  align: Align | '';
  /** 錯誤用法：不准做的事。 */
  misuse: string[];
};

export function emptyRole(): RoleSpec {
  return { familyId: '', size: '', leading: '', weight: '', minSize: '', colorRole: '' };
}

export function emptyTypeDoc(): TypeDoc {
  return {
    families: [],
    roles: {
      display: emptyRole(),
      heading: emptyRole(),
      body: emptyRole(),
      caption: emptyRole(),
    },
    pairing: '',
    fallbackLatin: '',
    fallbackChinese: '',
    measure: '',
    align: '',
    misuse: [],
  };
}

export function hasAnyValue(doc: TypeDoc): boolean {
  return (
    doc.families.length > 0 ||
    doc.pairing.trim() !== '' ||
    doc.measure.trim() !== '' ||
    doc.align !== '' ||
    doc.misuse.length > 0 ||
    TYPE_ROLES.some((key) => {
      const role = doc.roles[key];

      return (
        role.familyId !== '' ||
        role.size !== '' ||
        role.leading !== '' ||
        role.weight !== '' ||
        role.minSize !== '' ||
        role.colorRole !== ''
      );
    })
  );
}

/* ── 缺的判斷 ─────────────────────────────────────────────── */

/**
 * 一個家族可不可以用。
 *
 * 三個條件缺一不可：有名、有授權、網頁有可嵌入的檔（策略原文）。任何一個
 * 缺，它就是「缺」—— 不可以用它排版，也不可以由備用字頂上當品牌字。
 */
export function familyUsable(family: FontFamily): boolean {
  return family.name.trim() !== '' && family.licence.trim() !== '' && family.webEmbeddable;
}

export function usableFamilies(doc: TypeDoc): FontFamily[] {
  return doc.families.filter(familyUsable);
}

export function findFamily(doc: TypeDoc, id: string): FontFamily | null {
  return doc.families.find((family) => family.id === id) ?? null;
}

/** 這個角色指去的家族，可用就回它，否則 null（＝缺）。 */
export function roleFamily(doc: TypeDoc, key: TypeRoleKey): FontFamily | null {
  const family = findFamily(doc, doc.roles[key].familyId);

  return family !== null && familyUsable(family) ? family : null;
}

/** 哪幾個腳本沒有可用的家族。缺中文就在這裡講，不靜靜用系統字。 */
export function missingScripts(doc: TypeDoc): Script[] {
  const usable = usableFamilies(doc);

  return SCRIPTS.filter((script) => !usable.some((family) => family.script === script));
}

/** 尺寸一定要帶單位。`18` 不是 18 像素，是缺。 */
export function sizeHasUnit(value: string): boolean {
  return /^\d+(\.\d+)?(px|rem|pt)$/.test(value.trim());
}

/** 行距可以是倍數（1.5）也可以是帶單位的值（26px、120%）。 */
export function leadingOk(value: string): boolean {
  return /^\d+(\.\d+)?(px|rem|pt|%)?$/.test(value.trim());
}

export type RoleGap = 'family' | 'size' | 'leading' | 'weight' | 'minSize' | 'color';

export function roleGaps(doc: TypeDoc, key: TypeRoleKey): RoleGap[] {
  const role = doc.roles[key];
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

  if (!sizeHasUnit(role.minSize)) {
    gaps.push('minSize');
  }

  if (!isColorRole(role.colorRole)) {
    gaps.push('color');
  }

  return gaps;
}

export function roleMissing(doc: TypeDoc, key: TypeRoleKey): boolean {
  return roleGaps(doc, key).length > 0;
}

export type TypeGaps = {
  scripts: Script[];
  roles: TypeRoleKey[];
  pairing: boolean;
  measure: boolean;
  align: boolean;
};

export function typeGaps(doc: TypeDoc): TypeGaps {
  return {
    scripts: missingScripts(doc),
    roles: TYPE_ROLES.filter((key) => roleMissing(doc, key)),
    pairing: doc.pairing.trim() === '',
    measure: doc.measure.trim() === '',
    align: doc.align === '',
  };
}

export function gapCount(gaps: TypeGaps): number {
  return (
    gaps.scripts.length +
    gaps.roles.length +
    (gaps.pairing ? 1 : 0) +
    (gaps.measure ? 1 : 0) +
    (gaps.align ? 1 : 0)
  );
}

/* ── 讀與寫 ───────────────────────────────────────────────── */

export type ParseTypeResult =
  | { kind: 'ok'; doc: TypeDoc }
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

function readFamilies(raw: unknown): FontFamily[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const families: FontFamily[] = [];

  for (const item of raw) {
    const entry = asRecord(item);

    if (entry === null) {
      continue;
    }

    const script = entry.script === 'chinese' ? 'chinese' : entry.script === 'latin' ? 'latin' : null;
    const id = text(entry.id);

    if (script === null || id === '') {
      continue;
    }

    families.push({
      id,
      script,
      name: text(entry.name),
      licence: text(entry.licence),
      webEmbeddable: entry.webEmbeddable === true,
    });
  }

  // 第一個以外的多餘家族：讀入時丟掉。策略只准兩個，畫面也加不到第三個，
  // 所以走到這裡代表內容是由外面寫入的 —— 留著只會出現畫面解釋不到的第三行。
  return families.slice(0, MAX_FAMILIES);
}

function readRole(raw: unknown, previous: RoleSpec): RoleSpec {
  const entry = asRecord(raw);

  if (entry === null) {
    return previous;
  }

  return {
    familyId: text(entry.familyId),
    size: text(entry.size),
    leading: text(entry.leading),
    weight: text(entry.weight),
    minSize: text(entry.minSize),
    colorRole: text(entry.colorRole),
  };
}

export function parseTypeDoc(value: string): ParseTypeResult {
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

  // 認得形狀才算字體表。任意 JSON 硬當成空表，就會畫出四行假的「缺」。
  if (!('families' in record) && !('roles' in record)) {
    return { kind: 'invalid' };
  }

  const rolesRaw = asRecord(record.roles);
  const roles = {} as Record<TypeRoleKey, RoleSpec>;

  for (const key of TYPE_ROLES) {
    roles[key] = readRole(rolesRaw?.[key], emptyRole());
  }

  const alignRaw = text(record.align);
  const align = ALIGNS.find((item) => item === alignRaw) ?? '';

  const misuse = Array.isArray(record.misuse)
    ? record.misuse.map((item) => text(item)).filter((item) => item !== '')
    : [];

  return {
    kind: 'ok',
    doc: {
      families: readFamilies(record.families),
      roles,
      pairing: text(record.pairing),
      fallbackLatin: text(record.fallbackLatin),
      fallbackChinese: text(record.fallbackChinese),
      measure: text(record.measure),
      align,
      misuse,
    },
  };
}

/**
 * 存進版本的內容。單行、家族排第一 —— 版本列表只拿得到頭 160 字元做預覽，
 * 家族名寫在最前面，那一版用了什麼字才抽得出來（`namesInText`）。
 */
export function serializeTypeDoc(doc: TypeDoc): string {
  return JSON.stringify({
    families: doc.families,
    roles: doc.roles,
    pairing: doc.pairing,
    fallbackLatin: doc.fallbackLatin,
    fallbackChinese: doc.fallbackChinese,
    measure: doc.measure,
    align: doc.align,
    misuse: doc.misuse,
  });
}

/** 版本預覽裡的家族名。抽不到就空 —— 不會假裝有。 */
export function namesInText(value: string): string[] {
  const found = value.matchAll(/"name":"([^"]{1,40})"/g);

  return Array.from(new Set(Array.from(found, (match) => match[1] ?? '').filter((name) => name !== '')));
}
