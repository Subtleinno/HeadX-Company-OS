/**
 * 測試用的字體表（issue #63）。
 *
 * 新形狀是 `families[]` 兩張卡加 `roles[]` 四個層級，逐個字寫會令每個測試
 * 都多四十行雜訊，所以集中在這裡：一級一行，其餘欄位補空。
 *
 * 這一支不是 `.test.ts`，所以不會被當成一個測試檔跑。
 */

import { emptyTypeDoc, emptyFamily, emptyRole, type TypeDoc } from '../../src/design/brandType';

/** 一套齊全的家族：名字、授權、可嵌入檔三樣都有。 */
export function fullFamily(id: string, name: string, script: 'latin' | 'chinese') {
  return {
    ...emptyFamily(id),
    name,
    script,
    license_web: 'SIL OFL 1.1，可嵌入',
    license_print: 'OFL，可印刷',
    file_ref: `fonts/${name}.woff2`,
  };
}

export type RoleInput = {
  family: string;
  size?: string;
  leading?: string;
  weight?: string;
  min?: number;
  measure?: string;
  color_role?: string;
  reason?: string;
};

/** `{ body: { family: 'f-1', size: '17px' } }` → 一份字體表。 */
export function typeDoc(values: Record<string, RoleInput>): TypeDoc {
  return {
    ...emptyTypeDoc(),
    roles: Object.entries(values).map(([role, value]) => ({
      ...emptyRole(role),
      family: value.family,
      size: value.size ?? '17px',
      leading: value.leading ?? '26px',
      weight: value.weight ?? '400',
      min: value.min ?? 14,
      measure: value.measure ?? '32 字元',
      color_role: value.color_role ?? 'ink',
      reason: value.reason ?? '',
    })),
  };
}

/** 中英各一、四級齊、搭配與取態都寫了的一份：測試要「不缺」時用它做底。 */
export function fullTypeDoc(): TypeDoc {
  return {
    ...typeDoc({
      display: { family: 'f-chinese', size: '56px', leading: '64px', weight: '700', min: 32 },
      heading: { family: 'f-chinese', size: '28px', leading: '1.3', weight: '600', min: 20 },
      body: { family: 'f-latin', size: '17px', leading: '26px', weight: '400', min: 14 },
      caption: { family: 'f-latin', size: '13px', leading: '18px', weight: '400', min: 11, color_role: 'muted' },
    }),
    stance: '',
    philosophy: '字要撐得住一整頁價目表。',
    families: [fullFamily('f-latin', 'Inter', 'latin'), fullFamily('f-chinese', '思源黑體', 'chinese')],
    pairing: '中文用思源黑體講資訊，拉丁用 Inter 講數字。',
    sentence_anatomy: '主張用 display，後面那句用 body。',
    mixed_setting: '行高取中文的，數字用拉丁的。',
    print_matrix: [{ item: '名片', spec: '8pt／11pt' }],
    misuse: [{ example: '假粗體', reason: '筆畫會疊死' }],
  };
}

/** 去掉一個層級，其餘不動。用嚟做「這一級未填」的情境。 */
export function withoutRole(doc: TypeDoc, role: string): TypeDoc {
  return { ...doc, roles: doc.roles.filter((row) => row.role !== role) };
}

/** 改一個家族的其中一格，其餘不動。 */
export function withFamily(doc: TypeDoc, id: string, patch: Partial<TypeDoc['families'][number]>): TypeDoc {
  return {
    ...doc,
    families: doc.families.map((family) => (family.id === id ? { ...family, ...patch } : family)),
  };
}
