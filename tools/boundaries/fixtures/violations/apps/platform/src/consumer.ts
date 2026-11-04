// 故意違反：繞過模組的 index.ts，直接引用模組子資料夾（規則 4）。
import './modules/alpha/src/internal.js';
