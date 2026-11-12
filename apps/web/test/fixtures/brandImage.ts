/**
 * 測試用的圖像表（issue #66）。
 *
 * 一份齊全的圖像表要六格攝影、一件有檔案的真範例、要與不要各幾句、一個
 * 色彩角色、授權、兩條禁止 —— 逐個字寫會令每個測試都多五十行雜訊。
 *
 * 這一支不是 `.test.ts`，所以不會被當成一個測試檔跑。
 */

import { emptyImageDoc, type ImageDoc } from '../../src/design/brandImage';

export function fullImageDoc(): ImageDoc {
  return {
    ...emptyImageDoc(),
    stance: '我們只拍真實做完療程的人，不用模特兒。',
    photo: {
      subject: '客人自己的手，不拍臉',
      composition: '九宮格左下，主體佔三成',
      light: '單一窗光，由左後方',
      tone: '低對比、暖灰',
      space: '主體上方留三成做標題位',
      props: '只用療程用的毛巾與產品',
    },
    illustration: '只用於圖示，不畫人像。',
    color_link: ['brand.primary'],
    like: ['手部紋理清楚', '背景是診所真實的牆', '光由側面來'],
    unlike: ['白到反光的示範照', '笑到不自然的模特兒', '加了濾鏡的暖黃'],
    approved_examples: [
      { label: '診所窗邊治療室', file_ref: 'photos/room-window.jpg', use: '官網首頁' },
      { label: '療程後的手', file_ref: 'photos/hand-after.jpg', use: 'IG 貼文底圖' },
    ],
    rights: '攝影師 XXX，買斷，官網與社交永久可用，不可轉售。',
    banned: [
      { term: '診所 Logo 出現在照片裡', reason: '標誌用法由標誌頁決定' },
      { term: '前後對比圖', reason: '暗示療效，屬醫療聲稱' },
    ],
  };
}

/** 只有名字、冇檔案的範例 —— 「用圖庫圖假扮」的那一種。 */
export function exampleWithoutFile(): ImageDoc['approved_examples'][number] {
  return { label: '暖調自然光', file_ref: '', use: '官網' };
}
