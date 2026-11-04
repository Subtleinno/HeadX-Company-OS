import { runMain } from './index';

/**
 * 行程入口。為甚麼與 index.ts 分開：index.ts 匯出 `runMain` 給測試用，
 * 如果入口判斷寫在裡面，任何一個 `import runMain` 都會順手起一個監聽中的行程。
 *
 * 失敗時以非 0 退出 —— 載入了壞 app 的容器不應該看起來健康。
 */
void runMain(process.env).then((result) => {
  if (result.code !== 0) {
    process.exitCode = result.code;
  }
});
