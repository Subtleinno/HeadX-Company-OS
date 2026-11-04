/**
 * 真實 API 流程驗收（issue #73 驗收 7）。
 *
 * 用真實瀏覽器、真實 nginx、真實 API 走一次：首次開機 setup → 登出 → 登入
 * → 重新載入（靠 session cookie 取 me）→ 錯誤密碼。所有請求都真的打到 API，
 * 不攔截、不假造。
 *
 * 只用虛構身份；密碼在執行時隨機產生，不寫入報告、不印出來。
 * 全程收集 console 錯誤、未捕捉例外與失敗請求；有任何一條就失敗 ——
 * 這一項就是要證明「沒有新增 Origin 錯誤或 API 行為改動」。
 *
 * 用法：
 *   node tools/visual/flow.mjs --base http://127.0.0.1:5210 --out <out-dir> [--compare <基準 flow.json>]
 *
 * 這支是一次性的：跑完之後那個庫就「已經開機」，再跑之前要先清掉拋棄式資料庫
 * （docker compose -p <專案> down -v 之後重新 up）。不清就會卡在第一步，
 * 所以第一步會明確講「這個庫已經有老闆帳戶」，而不是含含糊糊等逾時。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { evaluate, withPage } from './shoot.mjs';

function readArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 2) {
    args[argv[index].replace(/^--/, '')] = argv[index + 1];
  }

  return args;
}

const args = readArgs(process.argv.slice(2));

if (args.base === undefined || args.out === undefined) {
  console.error('用法：node tools/visual/flow.mjs --base http://127.0.0.1:5210 --out <out-dir>');
  process.exit(2);
}

const base = args.base.replace(/\/$/, '');
const outDir = resolve(args.out);

mkdirSync(outDir, { recursive: true });

// 虛構身份。密碼只存在記憶體，不進報告。
const IDENTITY = {
  displayName: '陳大文',
  email: 'owner@example.com',
  password: randomBytes(18).toString('base64url'),
};
const WRONG_PASSWORD = randomBytes(18).toString('base64url');

const SET_INPUT = `
((selector, value) => {
  const element = document.querySelector(selector);

  if (element === null) {
    throw new Error('找不到欄位：' + selector);
  }

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));

  return true;
})
`;

const CLICK_TEXT = `
((text) => {
  const target = [...document.querySelectorAll('button')].find(
    (element) => (element.textContent ?? '').trim() === text,
  );

  if (target === undefined) {
    throw new Error('找不到按鈕：' + text);
  }

  target.click();

  return true;
})
`;

async function waitFor(session, expression, label) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    if (await evaluate(session, `Boolean(${expression})`)) {
      return;
    }

    await new Promise((done) => setTimeout(done, 50));
  }

  throw new Error(`等不到：${label}`);
}

async function goto(session, path = '/') {
  await session.send('Page.navigate', { url: `${base}${path}` });
}

const steps = [];
const problems = [];

function record(name, detail) {
  steps.push({ name, detail });
  console.log(`${name}：${detail}`);
}

const result = await withPage(
  {
    viewport: { width: 390, height: 844 },
    // 第一步入面已經由 withPage 開好；這裡不再另開。
    steps: [],
    url: `${base}/`,
  },
  async (session) => {
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    await session.send('Network.enable');

    session.on('Runtime.exceptionThrown', (params) => {
      problems.push(`未捕捉例外：${params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? ''}`);
    });

    // 記住 requestId → URL，否則 loadingFailed 只會講一句「Fetch 失敗」，無從判斷。
    const requestUrls = new Map();

    session.on('Network.requestWillBeSent', (params) => {
      requestUrls.set(params.requestId, params.request.url);
    });

    session.on('Network.responseReceived', (params) => {
      if (params.response.status >= 400) {
        problems.push(`HTTP ${String(params.response.status)}：${params.response.url}`);
      }
    });

    session.on('Log.entryAdded', (params) => {
      if (params.entry?.level === 'error') {
        problems.push(`console 錯誤：${params.entry.text}`);
      }
    });

    session.on('Network.loadingFailed', (params) => {
      const url = requestUrls.get(params.requestId) ?? '（未知 URL）';
      problems.push(`請求失敗：${params.errorText}（${params.type}）${url}`);
    });

    // 1) 首次開機
    await waitFor(
      session,
      `document.querySelector('#setup-name') !== null || document.querySelector('#login-email') !== null`,
      '首次開機或登入畫面',
    );

    if (await evaluate(session, `document.querySelector('#setup-name') === null`)) {
      throw new Error('這個庫已經有老闆帳戶，不是空庫。請先清掉拋棄式資料庫再跑。');
    }

    const setupTitle = await evaluate(session, `document.querySelector('h1').textContent.trim()`);
    record('01 首次開機畫面', setupTitle);

    await evaluate(session, `(${SET_INPUT})('#setup-name', ${JSON.stringify(IDENTITY.displayName)})`);
    await evaluate(session, `(${SET_INPUT})('#setup-email', ${JSON.stringify(IDENTITY.email)})`);
    await evaluate(session, `(${SET_INPUT})('#setup-password', ${JSON.stringify(IDENTITY.password)})`);
    await evaluate(session, `(${SET_INPUT})('#setup-confirm', ${JSON.stringify(IDENTITY.password)})`);
    await evaluate(session, `(${CLICK_TEXT})('建立老闆帳戶')`);

    await waitFor(session, `document.querySelector('.toolbar') !== null`, '建立帳戶後進入首頁');
    const homeTitle = await evaluate(session, `document.querySelector('.home__title').textContent.trim()`);
    const toolbarName = await evaluate(session, `document.querySelector('.toolbar').textContent.trim()`);
    record('02 建立帳戶後首頁', `${homeTitle} / 頂欄「${toolbarName}」`);

    // 2) 重新載入：靠 session cookie 取 me，不應該回到登入畫面
    await goto(session);
    await waitFor(session, `document.querySelector('.toolbar') !== null`, '重新載入後仍然是首頁');
    record('03 重新載入（me）', `仍在首頁：${await evaluate(session, `document.querySelector('.home__title').textContent.trim()`)}`);

    // 3) 登出
    await evaluate(session, `(${CLICK_TEXT})('登出')`);
    await waitFor(session, `document.querySelector('#login-email') !== null`, '登出後回到登入畫面');
    record('04 登出', '回到登入畫面');

    // 4) 登出後重新載入，仍然是登入畫面（session 真的清了）
    await goto(session);
    await waitFor(session, `document.querySelector('#login-email') !== null`, '登出後重新載入仍是登入畫面');
    record('05 登出後重新載入', '仍是登入畫面');

    // 5) 錯誤密碼
    await evaluate(session, `(${SET_INPUT})('#login-email', ${JSON.stringify(IDENTITY.email)})`);
    await evaluate(session, `(${SET_INPUT})('#login-password', ${JSON.stringify(WRONG_PASSWORD)})`);
    await evaluate(session, `(${CLICK_TEXT})('登入')`);
    await waitFor(session, `document.querySelector('.form__error') !== null`, '錯誤密碼出現錯誤訊息');
    const wrongMessage = await evaluate(session, `document.querySelector('.form__error').textContent.trim()`);
    record('06 錯誤密碼', wrongMessage);

    // 6) 正確密碼
    await evaluate(session, `(${SET_INPUT})('#login-password', ${JSON.stringify(IDENTITY.password)})`);
    await evaluate(session, `(${CLICK_TEXT})('登入')`);
    await waitFor(session, `document.querySelector('.toolbar') !== null`, '正確密碼後進入首頁');
    record('07 正確密碼', '回到首頁');

    return { steps, problems };
  },
);

// 預期會出現的三條。三條都在基準 e5dc6b2 上同樣出現（見 --compare），
// 屬既有行為，不是本張引入：
//   1) 錯誤密碼那一步本來就應該收到 401 —— 那正是被驗的行為。
//   2) 瀏覽器把同一個 401 記錄成 console 錯誤。
//   3) 登出之後畫面切去登入畫面，logout 那條 fetch 被中止；功能上已經成功
//      （第 04、05 步證明 session 真的清了），只是請求在切換畫面時被取消。
const EXPECTED = [
  /^HTTP 401：https?:\/\/[^/]+\/api\/auth\/login$/,
  /^console 錯誤：Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/,
  /^請求失敗：net::ERR_ABORTED（Fetch）https?:\/\/[^/]+\/api\/auth\/logout$/,
];

const isExpected = (line) => EXPECTED.some((pattern) => pattern.test(line));
const unexpected = result.problems.filter((line) => !isExpected(line));

/** 把 base URL 換掉，令基準與候選的問題清單可以直接比。 */
const normalise = (lines) => lines.map((line) => line.split(base).join('<base>')).sort();

const report = {
  base,
  identity: { displayName: IDENTITY.displayName, email: IDENTITY.email, password: '（不記錄）' },
  steps: result.steps,
  problems: result.problems,
  unexpected,
};

writeFileSync(join(outDir, 'flow.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n收集到的問題：${String(result.problems.length)} 條（預期以外 ${String(unexpected.length)} 條）`);

for (const line of result.problems) {
  console.log(`  ${isExpected(line) ? '預期' : '非預期'}  ${line}`);
}

let sameAsBaseline = true;

if (args.compare !== undefined) {
  const baselineReport = JSON.parse(readFileSync(resolve(args.compare), 'utf8'));
  const baselineBase = baselineReport.base.replace(/\/$/, '');
  const before = baselineReport.problems.map((line) => line.split(baselineBase).join('<base>')).sort();
  const after = normalise(result.problems);

  sameAsBaseline = JSON.stringify(before) === JSON.stringify(after);

  console.log(`\n與基準的問題清單比較：${sameAsBaseline ? '完全相同' : '不同'}`);

  if (!sameAsBaseline) {
    console.log(`  基準：${JSON.stringify(before, null, 2)}`);
    console.log(`  候選：${JSON.stringify(after, null, 2)}`);
  }
}

process.exit(unexpected.length === 0 && sameAsBaseline ? 0 : 1);
