// 故意違反：繞過 package 的 index.ts，直接引用子資料夾（規則 4）。
import '../../../packages/kit/src/button.js';
