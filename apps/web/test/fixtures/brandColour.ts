/**
 * 測試用的色彩文件（issue #62）。
 *
 * 舊的四支測試各自寫一份 `{ light: {...}, dark: {...}, ramps }`。新形狀是
 * `roles[]` 一張表，逐個字寫會令每個測試都多三十行雜訊，所以集中在這裡：
 * 一個角色一項，其餘欄位補空。
 *
 * 這一支不是 `.test.ts`，所以不會被當成一個測試檔跑。
 */

import { EMPTY_DOC, groupOfRole, type ColorDoc } from '../../src/design/brandColors';

export type ColourValueInput = { hex: string; cmyk?: string; dark?: string; name?: string };

/** `{ 'brand.primary': { hex, cmyk } }` → 一份色彩文件。 */
export function colourDoc(values: Record<string, ColourValueInput>, stance = ''): ColorDoc {
  return {
    ...EMPTY_DOC,
    stance,
    roles: Object.entries(values).map(([id, value]) => ({
      id,
      group: groupOfRole(id) ?? 'brand',
      name: value.name ?? '',
      hex: value.hex,
      cmyk: value.cmyk ?? '',
      dark: value.dark ?? '',
      usage: '',
      reason: '',
    })),
  };
}

/** 四個必要角色齊全的一份文件。測試要「不缺」的時候用它做底。 */
export function fullColourDoc(): ColorDoc {
  return colourDoc({
    'brand.primary': { hex: '#0057ff', cmyk: '100 90 0 0' },
    ink: { hex: '#191919', cmyk: '0 0 0 90' },
    paper: { hex: '#ffffff', cmyk: '0 0 0 0' },
    surface: { hex: '#17171d', cmyk: '0 0 0 90' },
  });
}

/** 去掉一個角色，其餘不動。用嚟做「這個角色未定」的情境。 */
export function withoutRole(doc: ColorDoc, id: string): ColorDoc {
  return { ...doc, roles: doc.roles.filter((role) => role.id !== id) };
}

/** 改一個角色的 HEX，其餘不動。 */
export function withRoleHex(doc: ColorDoc, id: string, hex: string): ColorDoc {
  return {
    ...doc,
    roles: doc.roles.map((role) => (role.id === id ? { ...role, hex, cmyk: role.cmyk } : role)),
  };
}
