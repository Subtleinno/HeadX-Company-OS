import { defineConfig } from 'vitest/config';

// 整合測試設定：需要 storage 服務在跑（docker compose up -d storage），
// 連主機的 127.0.0.1:${PORT_MINIO_API}。CI 不跑這一份。
export default defineConfig({
  test: {
    include: [
      'apps/platform/test/integration/**/*.test.ts',
      'apps/app-host/test/integration/**/*.test.ts',
    ],
    // 首次寫入 bucket 會慢一點，放寬逾時避免假失敗。
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 同一個 bucket 前綴互相影響，逐個檔案順序跑。
    fileParallelism: false,
  },
});
