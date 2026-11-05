import { main } from './cli.js';

/**
 * 維運入口。只有這裡會呼叫 process.exit —— 其餘模組回傳退出碼，
 * 測試才可以 import 它們而不會被 process.exit 帶走。
 */
void main(process.argv.slice(2)).then((code) => {
  process.exit(code);
});
