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
  },
});
