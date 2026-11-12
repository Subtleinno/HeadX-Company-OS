/**
 * 對比計算（issue #57 提供，給 #59 的 checker 與畫面共用）。
 *
 * 三個函式都是純函式，輸入是 payload 裡的色值字串。**原始碼不出現任何色值**
 * —— 這裡只有公式（WCAG 2.1 relative luminance），沒有樣本色。
 *
 * 為什麼要自己寫：瀏覽器沒有 `contrast()`；而 checker 在後端跑，也不能用
 * canvas 取色。公式只有十幾行，比拉一個套件更容易核對。
 */

export type Rgb = { r: number; g: number; b: number };

/** `#ABC`／`#AABBCC` → 0–255。讀不到回 `null`（不是回黑色）。 */
export function hexToRgb(input: string): Rgb | null {
  const value = input.trim().replace(/^#/, '');

  if (value.length === 3) {
    const r = Number.parseInt(value[0] ?? '', 16);
    const g = Number.parseInt(value[1] ?? '', 16);
    const b = Number.parseInt(value[2] ?? '', 16);

    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }

    return { r: r * 17, g: g * 17, b: b * 17 };
  }

  if (value.length !== 6) {
    return null;
  }

  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }

  return { r, g, b };
}

/**
 * 策略明講的對比下限：內文 4.5:1、大字 3:1。
 *
 * 寫在這裡而不是各頁各寫一次：checker（後端）、色彩頁（前端）、tokens 的
 * 說明都用同一組數字。三個地方各寫一次，就會出現「檢查用 4.5、畫面寫 4.0」
 * 這種沒有人會發現的分歧。
 */
export const BODY_FLOOR = 4.5;
export const LARGE_FLOOR = 3;

/** 是不是一個讀得明的色值。空字串、顏色名、函式寫法（`rgb`／`hsl`）一律不是。 */
export function isHex(input: string): boolean {
  return hexToRgb(input) !== null;
}

function channel(value: number): number {
  const ratio = value / 255;

  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance。 */
export function relativeLuminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/**
 * 對比比值，四捨五入到兩位小數。
 *
 * 任何一邊讀不到就回 `null` —— 「計不出」與「等於 1」是兩件事，前者是缺資料，
 * 後者是同一個色。checker 靠這個分別決定「無法判斷」還是「不通過」。
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);

  if (fg === null || bg === null) {
    return null;
  }

  const light = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const dark = Math.min(relativeLuminance(fg), relativeLuminance(bg));

  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

/**
 * 色樣上的文字用黑還是白。
 *
 * 回 CSS 關鍵字而不是色值：這一支是「計出來」的，不是品牌色；寫死一個 hex
 * 會令它看起來像一個品牌角色（而色值只可以住在色彩頁）。
 */
export function readableOn(background: string): 'black' | 'white' | null {
  const bg = hexToRgb(background);

  if (bg === null) {
    return null;
  }

  const luminance = relativeLuminance(bg);

  // 白字在深底、黑字在淺底：兩個候選之中取對比高的那個。
  const onBlack = (luminance + 0.05) / 0.05;
  const onWhite = 1.05 / (luminance + 0.05);

  return onBlack >= onWhite ? 'black' : 'white';
}
