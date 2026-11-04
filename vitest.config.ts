import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/platform/test/**/*.test.ts',
      'scripts/**/*.test.ts',
      'apps/web/test/**/*.test.{ts,tsx}',
      'tools/**/*.test.ts',
    ],
    // 整合測試要連真的 storage，CI 沒有 MinIO 容器，只在 Windows 機本地跑（npm run test:integration）。
    exclude: [...configDefaults.exclude, 'apps/platform/test/integration/**'],
  },
});
