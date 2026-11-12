/**
 * 測試用的主頁表（issue #67）。
 *
 * 一份齊全的主頁要立場、是誰、三個關鍵詞、用色順序、標誌預設、字體分工、
 * 一句語氣樣本、一個系統、兩塊版面 —— 逐個字寫會令每個測試都多四十行雜訊，
 * 所以集中在這裡。
 *
 * 這一支不是 `.test.ts`，所以不會被當成一個測試檔跑。
 */

import { emptyHomeDoc, emptyLayoutRow, type HomeDoc } from '../../src/design/brandHome';

/** 一份齊全的主頁。要「不缺」時用它做底。 */
export function fullHomeDoc(): HomeDoc {
  return {
    stance: '我們相信護理應該講得出理由。',
    who: '滿月堂是一間用中醫調理皮膚與身體的診所，在香港銅鑼灣。',
    keywords: ['中醫', '美容', '香港'],
    color_order: { roles: ['brand.primary', 'paper'], note: '底色佔七成，主色只用在一件事上。' },
    logo_default: 'brand',
    type_split: { serif: 'Noto Serif TC', sans: 'Inter', note: '' },
    voice_samples: ['請你星期三之前回覆。'],
    systems: [{ name: '三層檢查', note: '交出去之前過三關。', refs: [] }],
    layout: [
      { block: 'stance', source: '立場句', emphasis: 'lead', reason: '先講相信什麼，後面才有依據。' },
      { block: 'swatches', source: '色彩頁的角色', emphasis: 'normal', reason: '講完立場就給證據。' },
    ],
  };
}

/** 只有主頁自己擁有的欄位，其餘（引用與版面）留空：用來驗「其餘全部標缺」。 */
export function thinHomeDoc(): HomeDoc {
  return {
    ...emptyHomeDoc(),
    stance: '我們相信護理應該講得出理由。',
    who: '滿月堂是一間中醫診所。',
  };
}

/** 加一塊沒有寫理由的版面：這一塊不應該出現在輸出。 */
export function withBlankReason(doc: HomeDoc): HomeDoc {
  return { ...doc, layout: [...doc.layout, { ...emptyLayoutRow(), block: 'quotes' }] };
}
