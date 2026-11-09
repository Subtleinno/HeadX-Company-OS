/**
 * 設計 token 的公開介面。
 *
 * 值的唯一來源是 `tokens.css`；這個檔案只提供「指向那個值」的引用（`var(--hx-*)`），
 * 不重複寫任何色碼、字級或間距數值。若在這裡抄一次 `#ffffff`，就變成兩份真相，
 * 改一邊就會有一邊悄悄過時。
 *
 * CSS 由子路徑 `@company-os/design-tokens/tokens.css` 公開，不叫使用方深入 src。
 */

/** 產生 `var(--hx-<name>)`。名稱不在 tokens.css 內時，CSS 會靜默失效，所以有測試把關。 */
export function tokenVar(name: string): string {
  return `var(--hx-${name})`;
}

/**
 * 常用 token 的引用表。
 * 只是寫法的糖，任何一個都可以直接用 `tokenVar('…')` 取。
 */
export const tokens = {
  bgPrimary: tokenVar('bg-primary'),
  bgSecondary: tokenVar('bg-secondary'),
  bgTertiary: tokenVar('bg-tertiary'),
  textPrimary: tokenVar('text-primary'),
  textSecondary: tokenVar('text-secondary'),
  accent: tokenVar('accent'),
  accentText: tokenVar('accent-text'),
  border: tokenVar('border'),
  hairline: tokenVar('hairline'),
  danger: tokenVar('danger'),
  dangerText: tokenVar('danger-text'),
  warning: tokenVar('warning'),
  success: tokenVar('success'),
  brandGreen: tokenVar('brand-green'),
  radiusSm: tokenVar('radius-sm'),
  radiusMd: tokenVar('radius-md'),
  radiusLg: tokenVar('radius-lg'),
  radiusXl: tokenVar('radius-xl'),
  sizeControl: tokenVar('size-control'),
  sizeTouch: tokenVar('size-touch'),
  sizeToolbar: tokenVar('size-toolbar'),
  sizeSidebar: tokenVar('size-sidebar'),
  space1: tokenVar('space-1'),
  space2: tokenVar('space-2'),
  space3: tokenVar('space-3'),
  space4: tokenVar('space-4'),
  space5: tokenVar('space-5'),
  space6: tokenVar('space-6'),
  space7: tokenVar('space-7'),
  space8: tokenVar('space-8'),
  fontFamily: tokenVar('font-family'),
  motionFast: tokenVar('motion-fast'),
  motionBase: tokenVar('motion-base'),
  ease: tokenVar('ease'),

  /* Frame／Chrome Tokens（issue #154）：只係指向 tokens.css，唔重複寫任何數值。 */
  frameAccent: tokenVar('frame-accent'),
  frameAccentFg: tokenVar('frame-accent-fg'),
  frameAccentSoft: tokenVar('frame-accent-soft'),
  frameInk: tokenVar('frame-ink'),
  frameSecondary: tokenVar('frame-secondary'),
  frameMuted: tokenVar('frame-muted'),
  frameBorder: tokenVar('frame-border'),
  frameSurface: tokenVar('frame-surface'),
  chromeSelected: tokenVar('chrome-selected'),
  chromeInk: tokenVar('chrome-ink'),
  chromeSecondary: tokenVar('chrome-secondary'),
  chromeMuted: tokenVar('chrome-muted'),
  chromeSurface: tokenVar('chrome-surface'),
  chromeBorder: tokenVar('chrome-border'),
  chromeWhite: tokenVar('chrome-white'),
  frameSidebarWidth: tokenVar('frame-sidebar-width'),
  frameSidebarWidth1024: tokenVar('frame-sidebar-width-1024'),
  frameSidebarWidth768: tokenVar('frame-sidebar-width-768'),
  chromeBarPrimaryHeight: tokenVar('chrome-bar-primary-height'),
  chromeBarSecondaryHeight: tokenVar('chrome-bar-secondary-height'),
  frameFontUi: tokenVar('frame-font-ui'),
  frameFontSmall: tokenVar('frame-font-small'),
  frameFontSmallLg: tokenVar('frame-font-small-lg'),
  frameFontTitle: tokenVar('frame-font-title'),
  frameFontSubtitle: tokenVar('frame-font-subtitle'),
  frameFontCard: tokenVar('frame-font-card'),
  frameFontBody: tokenVar('frame-font-body'),
  frameSizeTouch: tokenVar('frame-size-touch'),
  frameSpaceContent: tokenVar('frame-space-content'),
  frameSpaceContentCompact: tokenVar('frame-space-content-compact'),
} as const;

export type TokenName = keyof typeof tokens;
