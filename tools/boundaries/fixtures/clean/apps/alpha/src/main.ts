// 乾淨樣本：app 內部的合法方向 web → api → domain，以及經 index.ts 引用 package。
import '../../../packages/kit/index.js';
import './api/route.js';
import './web/screen.js';

export const cleanMain = 'main';
