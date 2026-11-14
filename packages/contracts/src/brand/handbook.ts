/**
 * 品牌手冊（handbook）的內容形狀與起始模板（品牌模組重啟）。
 *
 * 為什麼喺 contracts：起始模板（01色彩–09速查＋附錄嘅預設章節）係**資料**，
 * 唔係畫面 —— 同 `DEFAULT_BRAND_THEME` 一個道理。畫面（apps/web）只負責渲染；
 * 給人睇嘅字要來自 i18n（守門測試），而品牌內容本身就係品牌嘅資料，
 * 新品牌開手冊時嘅起點就係呢一份。
 *
 * 真資料層（頁 4）接上之後，手冊內容由資料庫供應；呢一份係
 * (1) 頁 1–3 嘅 fixture，(2) 新品牌嘅起始模板庫第一件。
 *
 * 標誌用 `/brand-samples/` 嘅示例資產（brand kit 出貨嘅 mark 與鎖定）。
 * 每個品牌有自己嘅資產；資產引用會喺頁 4 跟資料層一齊接上。
 */
import { BRAND_THEME_PRESETS, type BrandTheme } from './theme.ts';

export type HandbookSection = {
  /** 章節鍵：網址 anchor 嘅一部分（`#hb-<key>`），改一個字就跳不到。 */
  key: string;
  /** 編號：01–09，附錄用 —。 */
  num: string;
  titleEn: string;
  titleZh: string;
  /** 目錄入面嘅一句：呢一章講乜。 */
  blurb: string;
};

export type HandbookDoc = {
  brandName: string;
  docTitle: string;
  docTitleZh: string;
  version: string;
  date: string;
  /** 封面下嗰句：呢份手冊點樣排成。 */
  note: string;
  badge: string;
  theme: BrandTheme;
  sampleLogo: { mark: string; lockup: string };
  sections: readonly HandbookSection[];
};

/** 起始模板嘅十章：九章＋附錄。每個品牌開手冊時先見到呢一副骨架。 */
export const HANDBOOK_STARTER_SECTIONS: readonly HandbookSection[] = [
  { key: 'color', num: '01', titleEn: 'Colour', titleZh: '色彩', blurb: '三色、比例、服務色、天色系統' },
  { key: 'type', num: '02', titleEn: 'Typography', titleZh: '字體', blurb: '四款字、字級階梯、印刷字級、規則' },
  { key: 'logo', num: '03', titleEn: 'Logo', titleZh: '標誌', blurb: '鎖定、色法、淨空間、構造、服務標記' },
  { key: 'voice', num: '04', titleEn: 'Voice', titleZh: '語氣', blurb: '品牌怎麼說話、場合與聲線' },
  { key: 'imagery', num: '05', titleEn: 'Imagery', titleZh: '影像', blurb: '光線、色調、主題、構圖' },
  { key: 'apply', num: '06', titleEn: 'Applications', titleZh: '應用', blurb: '社交卡片、通知單、名片' },
  { key: 'mascot', num: '07', titleEn: 'Mascot', titleZh: '吉祥物', blurb: '角色、身體、花色' },
  { key: 'misuse', num: '08', titleEn: 'Misuse', titleZh: '錯誤用法', blurb: '常見錯誤，附示範' },
  { key: 'quickref', num: '09', titleEn: 'Quick reference', titleZh: '速查', blurb: '一頁帶走的規則' },
  { key: 'appendix', num: '—', titleEn: 'Appendix', titleZh: '附錄', blurb: '工具、資產、版本記錄、未決事項' },
];

function sampleTheme(): BrandTheme {
  const dusk = BRAND_THEME_PRESETS.find((preset) => preset.id === 'dusk');

  if (dusk === undefined) {
    throw new Error('dusk 主題預設唔見咗：品牌手冊示例要靠佢示範「每個品牌一套設計」');
  }

  return dusk.theme;
}

/** 起始模板嘅示例手冊。真品牌資料喺頁 4 之前由呢一份供應畫面。 */
export function handbookSampleDoc(): HandbookDoc {
  return {
    brandName: 'Moonic 滿月堂',
    docTitle: 'Brand Kit',
    docTitleZh: '品牌手冊',
    version: 'v1',
    date: '2026-11-13',
    note: '本手冊以品牌自身的字體、色彩與間距排成——它遵守它所教的每一條規則。',
    badge: 'Starter · 起始模板',
    theme: sampleTheme(),
    sampleLogo: { mark: '/brand-samples/mark.svg', lockup: '/brand-samples/lockup.svg' },
    sections: HANDBOOK_STARTER_SECTIONS,
  };
}
