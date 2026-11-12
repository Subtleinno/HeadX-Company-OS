/**
 * 測試用的已核准範例表（issue #68）。
 *
 * 這一支不是 `.test.ts`，所以不會被當成一個測試檔跑。
 */

import type { ExampleDoc } from '../../src/design/brandExamples';

/** 一件齊全的範例：名、格式、檔案、兩頁版本、為咩好。 */
export function fullExampleDoc(): ExampleDoc {
  return {
    examples: [
      {
        title: '春季療程社交貼文',
        format: '社交貼文 1080×1080',
        file_ref: '/api/files/f-1/content',
        page_refs: [
          { page: 'color', version: 1 },
          { page: 'tone', version: 1 },
        ],
        why: '標題只講一句，其餘留白給照片 —— 這是我們平日不敢做的。',
      },
      {
        title: '診所門貼',
        format: '印刷 A2',
        file_ref: '/api/files/f-2/content',
        page_refs: [{ page: 'logo', version: 1 }],
        why: '標誌只出現一次，而且用反白：門口的燈光會把深色底壓暗。',
      },
    ],
    prompts: [
      {
        prompt: '用品牌色做一張正方形貼文，只有一句標題。',
        output_ref: '/api/files/f-1/content',
        brand_ref: '色彩 v1 · 語氣 v1',
        note: '第一次就過的版本。',
      },
    ],
  };
}

/** 一件只有名、其餘全空的範例：用來驗逐項標缺。 */
export function thinExampleDoc(): ExampleDoc {
  return {
    examples: [{ title: '未完成', format: '', file_ref: '', page_refs: [], why: '' }],
    prompts: [],
  };
}
