import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/platform/test/**/*.test.ts',
      'apps/app-host/test/**/*.test.ts',
      'scripts/**/*.test.ts',
      'apps/web/test/**/*.test.{ts,tsx}',
      'tools/**/*.test.ts',
      'packages/**/test/**/*.test.{ts,tsx}',
    ],
    // 整合測試要連真的 storage（platform）或真的 Postgres（app-host），
    // CI 沒有那些服務，只在 Windows 機本地跑（npm run test:integration）。
    exclude: [
      ...configDefaults.exclude,
      'apps/platform/test/integration/**',
      'apps/app-host/test/integration/**',
    ],
    // 逐個檔案順序跑，不並行（issue #26）。
    //
    // 109 個測試檔在 2 核的 CI runner 上同時起 109 個 worker：不是「慢」，
    // 是會 timeout，然後隨機紅一個檔。實際發生過 —— PR #25 第一次跑
    // `setup-form.test.tsx` 紅，同一個 commit 原封重跑全綠。
    //
    // 之前這件事寫在 HANDOFF §6 第 1 條，靠每個人記得在指令後面加
    // `--no-file-parallelism`。但 CI 跑的是 `npm test`，它不會記得。
    // 會偶發紅的閘門，久了就被當成 flake；那時真正的紅燈也會被重跑掉。
    // 所以寫進配置，不寫在文件裡等人記。
    fileParallelism: false,
  },
});
