// 故意違反：app-host 引用 platform 的內部檔案（#77 驗收 3）。
import '../../platform/src/index.js';

export const appHostMain = 'main';
