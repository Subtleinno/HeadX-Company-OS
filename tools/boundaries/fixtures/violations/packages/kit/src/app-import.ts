// 故意違規（issue #82）：共用 package 反過來引用某個 app。
// 這樣的話，這個 package 只在那個 app 存在的地方跑得起來 —— 它就不再是「共用」了。
import '../../../apps/alpha/src/main.js';

export const leaked = 'app';
