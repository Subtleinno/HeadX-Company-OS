// 故意違反：web 直接引用 domain（分層方向只能 web → api → domain → db）。
import '../domain/logic.js';

export const screenValue = 'screen';
