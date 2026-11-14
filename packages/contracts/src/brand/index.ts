/**
 * 品牌模型（issue #57）：外殼、各頁欄位、四種輸出。
 *
 * 三個入口是給外面用的：
 *   `parseBrandDocument`  寫入前的驗證（後端）。
 *   `schemaForPage`       這一頁有哪些段落、怎樣由 payload 出 token 與 prompt。
 *   `buildTokens` / `buildPromptPack` / `renderBrandHtml`  四種輸出。
 *
 * 這一支**不讀資料庫、不讀檔案**：所有輸入都是已組成的資料，所以它可以被
 * 純函式測試，也可以在瀏覽器（web 的唯讀畫面）跑同一份定義。
 */

export {
  BRAND_BLOCK_KINDS,
  BRAND_FIXED_PAGES,
  BRAND_FIXED_PAGE_KEYS,
  BRAND_GAP_TYPES,
  BRAND_SLOTS,
  changedPaths,
  emptyBrandDocument,
  parseBrandDocument,
  readPath,
  writePath,
} from './document.ts';

export type {
  BrandBlock,
  BrandBlockKind,
  BrandDocument,
  BrandGapDraft,
  BrandGapType,
  BrandLayout,
  BrandPayload,
  BrandRef,
  BrandSlot,
  DocumentParse,
} from './document.ts';

/* 品牌主題（整個 app 的皮膚）。同文件一樣是純資料，不讀資料庫。 */
export {
  BRAND_THEME_FONTS,
  BRAND_THEME_PRESETS,
  DEFAULT_BRAND_THEME,
  parseBrandTheme,
  sameBrandTheme,
} from './theme.ts';

export type { BrandTheme, BrandThemeFontId, BrandThemeWash, ThemeParse } from './theme.ts';

/* 品牌手冊（重啟）：內容形狀與起始模板。同主題一樣係純資料。 */
export { HANDBOOK_STARTER_SECTIONS, handbookSampleDoc } from './handbook.ts';
export type { HandbookDoc, HandbookSection } from './handbook.ts';

export {
  COLOR_GROUPS,
  familyLicensed,
  IMAGE_LIST_TARGET,
  familyOfVoice,
  familyReady,
  homeLayoutIssues,
  PAGE_KEYS_ORDERED,
  PAGE_SCHEMAS,
  REQUIRED_COLOR_ROLES,
  roleMissingFields,
  schemaForPage,
  scriptsWithoutFamily,
  TYPE_ROLES,
  TYPE_SCRIPTS,
  TYPE_VOICES,
  typeSizePx,
  voiceStack,
} from './schemas.ts';

export type {
  ColorGroup,
  ColorPayload,
  ColorRole,
  CustomAsset,
  CustomPayload,
  ExamplePayload,
  Field,
  FieldKind,
  HomeCompiledRef,
  HomeDesignerNote,
  HomeLayoutBlock,
  HomePayload,
  ImageLike,
  ImagePayload,
  ImageReferencePhoto,
  ImageRights,
  ImageUnlike,
  LogoPayload,
  MascotCharacter,
  MascotPayload,
  PageSchema,
  PlatformPayload,
  PromptSection,
  Section,
  SectionKind,
  TokenGroups,
  TokenValue,
  ToneBoundary,
  TonePayload,
  TypeFamily,
  TypePayload,
  TypeRole,
  VideoExample,
  VideoPayload,
} from './schemas.ts';

export { buildPromptPack, buildTokens, renderBrandHtml } from './output.ts';

export type { ComposedBrand, ComposedGap, ComposedPage, HtmlOptions, PromptPack, TokensOutput } from './output.ts';

export { BODY_FLOOR, contrastRatio, hexToRgb, isHex, LARGE_FLOOR, readableOn, relativeLuminance } from './contrast.ts';

export { documentFromStored } from './legacy.ts';
