import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本機開發時把 /api 轉到 API；正式環境由 nginx 轉發。
const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:4420',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4210,
    proxy: apiProxy,
  },
  preview: {
    port: 4210,
    proxy: apiProxy,
  },
});
