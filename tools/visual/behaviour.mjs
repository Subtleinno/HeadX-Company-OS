/**
 * 行為與無障礙探測（issue #73 驗收 4）。
 *
 * 為什麼要一支獨立程式：像素相同不代表行為沒退化。這裡逐個 case 量
 * 橫向捲動、文字截斷、可存取名稱、aria 關聯、載入後的初始焦點，
 * 再用真實的 Tab／Enter／Space 鍵事件走出焦點順序並操作密碼顯示切換。
 * 瀏覽器設定與截圖程式完全相同，所以基準與候選的環境必然一致。
 *
 * 判定方式：候選的每一項量度必須與基準逐字相同，而且候選自身不得有新的問題。
 *
 * 一個量度上的教訓（第一版寫錯過）：原本在「按完送出、等錯誤訊息出現」之後
 * 直接讀 document.activeElement 當作靜止焦點。同一版本重跑會給出相反結果
 * （field-error 桌面基準有焦點、候選沒有；login-error 手機反過來），
 * 因為那是量度自己與非同步回應競態，不是產品差異。
 * 所以靜止焦點改成只量「載入完成、未有任何互動」那一刻 —— 那是確定的；
 * 互動之後的焦點則用輪詢等到出現為止，而不是隨手快照。
 *
 * 用法：
 *   node tools/visual/behaviour.mjs --dist <dist-dir> --out <out-dir> --port 4620
 *   node tools/visual/behaviour.mjs --compare --baseline <baseline.json> --candidate <candidate.json>
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CASES, VIEWPORTS } from './cases.mjs';
import { startServer } from './server.mjs';
import { evaluate, withPage } from './shoot.mjs';

function readArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);

    if (key === 'compare') {
      args.compare = true;
      continue;
    }

    args[key] = argv[index + 1];
    index += 1;
  }

  return args;
}

/**
 * 頁面內量度。全部只看 DOM 與 computed style，不碰產品 CSS。
 * 回傳的每一項都是「有問題才算」的清單，正常畫面應該全部是空陣列。
 */
const PROBE = `(() => {
  const viewportWidth = window.innerWidth;
  const describe = (element) => {
    if (element === null || element === undefined) {
      return null;
    }

    const id = element.id === '' ? '' : '#' + element.id;
    const cls = element.className === '' ? '' : '.' + String(element.className).trim().split(/\\s+/).join('.');

    return element.tagName.toLowerCase() + id + cls;
  };

  // 1) 橫向捲動
  const documentScrollWidth = document.documentElement.scrollWidth;
  const bodyScrollWidth = document.body.scrollWidth;

  // 2) 超出左右邊界的元素
  const overflowing = [];

  for (const element of document.querySelectorAll('body *')) {
    const rect = element.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      continue;
    }

    if (rect.right > viewportWidth + 1 || rect.left < -1) {
      overflowing.push({ element: describe(element), left: Math.round(rect.left), right: Math.round(rect.right) });
    }
  }

  // 3) 文字截斷：有文字、但被 overflow 剪掉
  const truncated = [];

  for (const element of document.querySelectorAll('body *')) {
    const style = getComputedStyle(element);
    const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip' || style.textOverflow === 'ellipsis';
    const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';

    if ((element.textContent ?? '').trim() === '') {
      continue;
    }

    if (clipsX && element.scrollWidth > element.clientWidth + 1) {
      truncated.push({ element: describe(element), axis: 'x', scroll: element.scrollWidth, client: element.clientWidth });
    }

    if (clipsY && element.scrollHeight > element.clientHeight + 1) {
      truncated.push({ element: describe(element), axis: 'y', scroll: element.scrollHeight, client: element.clientHeight });
    }
  }

  // 4) 可存取名稱
  const textOf = (element) => (element === null ? '' : (element.textContent ?? '').trim());

  const accessibleName = (element) => {
    const aria = element.getAttribute('aria-label');

    if (aria !== null && aria.trim() !== '') {
      return aria.trim();
    }

    const labelledBy = element.getAttribute('aria-labelledby');

    if (labelledBy !== null) {
      const text = labelledBy
        .split(/\\s+/)
        .map((id) => textOf(document.getElementById(id)))
        .join(' ')
        .trim();

      if (text !== '') {
        return text;
      }
    }

    const id = element.getAttribute('id');

    if (id !== null && id !== '') {
      const label = document.querySelector('label[for="' + CSS.escape(id) + '"]');

      if (label !== null && textOf(label) !== '') {
        return textOf(label);
      }
    }

    const wrapping = element.closest('label');

    if (wrapping !== null && textOf(wrapping) !== '') {
      return textOf(wrapping);
    }

    return textOf(element);
  };

  const unnamed = [];

  for (const element of document.querySelectorAll('input, select, textarea, button, a[href]')) {
    if (element.getAttribute('type') === 'hidden') {
      continue;
    }

    if (accessibleName(element) === '') {
      unnamed.push({ element: describe(element) });
    }
  }

  // 5) aria 關聯是否指得到東西
  const brokenAria = [];

  for (const element of document.querySelectorAll('[aria-describedby], [aria-labelledby]')) {
    for (const attribute of ['aria-describedby', 'aria-labelledby']) {
      const value = element.getAttribute(attribute);

      if (value === null) {
        continue;
      }

      for (const id of value.split(/\\s+/).filter((part) => part !== '')) {
        if (document.getElementById(id) === null) {
          brokenAria.push({ element: describe(element), attribute, missing: id });
        }
      }
    }
  }

  // 6) 出錯欄位是否同時有 aria-invalid 與描述文字
  const errorFields = [];

  for (const element of document.querySelectorAll('input[aria-invalid="true"]')) {
    const describedBy = element.getAttribute('aria-describedby');
    const description = describedBy === null
      ? ''
      : describedBy
          .split(/\\s+/)
          .map((id) => textOf(document.getElementById(id)))
          .join(' ')
          .trim();

    errorFields.push({ element: describe(element), describedBy, description });
  }

  return {
    viewportWidth,
    documentScrollWidth,
    bodyScrollWidth,
    overflowing,
    truncated,
    unnamed,
    brokenAria,
    errorFields,
  };
})()`;

const INITIAL_FOCUS = `(() => {
  const element = document.activeElement;

  if (element === null || element === document.body) {
    return null;
  }

  const id = element.id === '' ? '' : '#' + element.id;
  const cls = element.className === '' ? '' : '.' + String(element.className).trim().split(/\\s+/).join('.');

  return element.tagName.toLowerCase() + id + cls;
})()`;

/** 目前的焦點，連文字一起記，方便人睇順序。 */
const ACTIVE = `(() => {
  const element = document.activeElement;

  if (element === null || element === document.body) {
    return null;
  }

  const id = element.id === '' ? '' : '#' + element.id;
  const kind = element.tagName.toLowerCase();
  const label = (element.textContent ?? '').trim();

  return kind + id + (label === '' ? '' : ' 「' + label + '」');
})()`;

/**
 * 按鍵。用真實鍵盤事件，不是程式呼叫 focus 或 click ——
 * 這樣驗到的才是「鍵盤能不能用」，而不是「JS 能不能叫得動」。
 *
 * Enter 一定要帶 text，否則 Chrome 不會執行預設行為（按鈕不會被按下）。
 * 實測：rawKeyDown 或 keyDown 不帶 text 都只會令 type 停在 password；
 * keyDown 帶 text: '\r' 或者補一個 char 事件才會真的觸發。Space 靠 keyup，
 * 帶不帶 text 都會動。
 */
async function pressKey(session, { key, code, keyCode, text, downType = 'rawKeyDown' }) {
  await session.send('Input.dispatchKeyEvent', {
    type: downType,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    key,
    code,
    ...(text === undefined ? {} : { text }),
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    key,
    code,
  });
}

const TAB = { key: 'Tab', code: 'Tab', keyCode: 9 };
const ENTER = { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r', downType: 'keyDown' };
const SPACE = { key: ' ', code: 'Space', keyCode: 32, downType: 'keyDown' };

/** 輪詢到條件成立為止；不成立就拋錯，不會靜靜當成通過。 */
async function waitFor(session, expression, label) {
  const deadline = Date.now() + 8000;

  while (Date.now() < deadline) {
    if (await evaluate(session, `Boolean(${expression})`)) {
      return;
    }

    await new Promise((done) => setTimeout(done, 50));
  }

  throw new Error(`等不到：${label}`);
}

const passwordType = `document.querySelector('#login-password').getAttribute('type')`;

/**
 * 鍵盤操作：Tab 到密碼欄的「顯示」按鈕，Enter 顯示、Space 收回；
 * 登入失敗的 case 另外驗「在密碼欄按 Enter 會送出表單」。
 * 只對登入畫面做 —— 那是唯一有切換按鈕的既有畫面。
 *
 * 只記錄 type 屬性與錯誤訊息文字，不記錄欄位值。
 */
async function keyboardChecks(session, mode) {
  const result = { toggleByEnter: null, toggleBySpace: null, enterSubmits: null };

  // 焦點在 #login-email，Tab 一次到密碼欄。
  await pressKey(session, TAB);

  if (mode === 'login-error') {
    await session.send('Input.insertText', { text: '唔係呢個密碼' });
    await pressKey(session, ENTER);
    await waitFor(session, `document.querySelector('.form__error') !== null`, '按 Enter 送出後出現錯誤訊息');

    result.enterSubmits = await evaluate(
      session,
      `document.querySelector('.form__error').textContent.trim()`,
    );
  }

  // 再 Tab 一次到「顯示」按鈕。
  await pressKey(session, TAB);

  const onToggle = await evaluate(session, ACTIVE);

  if (onToggle === null || !onToggle.startsWith('button')) {
    throw new Error(`Tab 之後應該在顯示按鈕上，實際是：${String(onToggle)}`);
  }

  const before = await evaluate(session, passwordType);

  await pressKey(session, ENTER);
  await waitFor(session, `${passwordType} !== ${JSON.stringify(before)}`, 'Enter 扭轉密碼顯示');
  const afterEnter = await evaluate(session, passwordType);

  await pressKey(session, SPACE);
  await waitFor(session, `${passwordType} !== ${JSON.stringify(afterEnter)}`, 'Space 收回密碼顯示');
  const afterSpace = await evaluate(session, passwordType);

  result.toggleByEnter = `${String(before)} → ${String(afterEnter)}`;
  result.toggleBySpace = `${String(afterEnter)} → ${String(afterSpace)}`;

  return result;
}

const compareArgs = readArgs(process.argv.slice(2));

if (compareArgs.compare === true) {
  const baseline = JSON.parse(readFileSync(resolve(compareArgs.baseline), 'utf8'));
  const candidate = JSON.parse(readFileSync(resolve(compareArgs.candidate), 'utf8'));

  const baselineKeys = baseline.cases.map((entry) => entry.key);
  const candidateKeys = candidate.cases.map((entry) => entry.key);

  if (baselineKeys.join('|') !== candidateKeys.join('|')) {
    console.error('兩邊的案例清單不同，直接失敗。');
    process.exit(1);
  }

  const rows = [];
  let failures = 0;

  for (const [index, key] of baselineKeys.entries()) {
    const before = baseline.cases[index];
    const after = candidate.cases[index];
    const differences = [];

    for (const name of [
      'overflowing',
      'truncated',
      'unnamed',
      'brokenAria',
      'errorFields',
      'focusOrder',
      'initialFocus',
      'keyboard',
    ]) {
      const left = JSON.stringify(before.checks[name]);
      const right = JSON.stringify(after.checks[name]);

      if (left !== right) {
        differences.push(`${name}：基準 ${left} / 候選 ${right}`);
      }
    }

    const noNewProblem =
      after.checks.overflowing.length === 0 &&
      after.checks.truncated.length === 0 &&
      after.checks.unnamed.length === 0 &&
      after.checks.brokenAria.length === 0 &&
      after.checks.documentScrollWidth <= after.checks.viewportWidth;

    if (!noNewProblem) {
      differences.push(
        `候選自身有問題：橫向捲動 ${String(after.checks.documentScrollWidth)}>${String(after.checks.viewportWidth)}、溢出 ${String(after.checks.overflowing.length)}、截斷 ${String(after.checks.truncated.length)}、無名稱 ${String(after.checks.unnamed.length)}、壞 aria ${String(after.checks.brokenAria.length)}`,
      );
    }

    const passed = differences.length === 0;

    if (!passed) {
      failures += 1;
    }

    rows.push({ key, passed, differences });

    console.log(
      `${key} | 焦點順序 ${String(after.checks.focusOrder.length)} 站 | 初始焦點 ${String(after.checks.initialFocus)} | 差異 ${String(differences.length)} 項 | ${passed ? 'PASS' : 'FAIL'}`,
    );

    for (const line of differences) {
      console.log(`    ${line}`);
    }
  }

  console.log(`\n共 ${String(rows.length)} 組，失敗 ${String(failures)} 組。`);
  process.exit(failures === 0 ? 0 : 1);
}

if (compareArgs.dist === undefined || compareArgs.out === undefined) {
  console.error('用法：node tools/visual/behaviour.mjs --dist <dist-dir> --out <out-dir> [--port 4620]');
  process.exit(2);
}

const distDir = resolve(compareArgs.dist);
const outDir = resolve(compareArgs.out);
const port = Number(compareArgs.port ?? 4620);

mkdirSync(outDir, { recursive: true });

const report = { cases: [] };

for (const testCase of CASES) {
  const server = await startServer({ distDir, mode: testCase.mode, port });

  try {
    for (const viewport of VIEWPORTS) {
      const key = `${testCase.name}__${viewport.name}`;
      const viewportSize = { width: viewport.width, height: viewport.height };

      const measured = await withPage(
        { viewport: viewportSize, steps: testCase.steps, url: `${server.url}/` },
        async (session) => {
          const probe = await evaluate(session, PROBE);
          const focusOrder = [];

          // 走 40 步：目前最多是 setup 的 6 個可聚焦元素，40 足夠繞一圈以上，
          // 繞回去會看到重複，重複本身也是紀錄的一部分。
          for (let step = 0; step < 40; step += 1) {
            await pressKey(session, TAB);

            const active = await evaluate(session, ACTIVE);

            if (active === null) {
              break;
            }

            focusOrder.push(active);
          }

          return { ...probe, focusOrder };
        },
      );

      // 初始焦點要另外開一次乾淨載入來量：互動過的頁面，焦點已經不是「載入後」那個。
      const initialFocus = await withPage(
        { viewport: viewportSize, steps: [testCase.steps[0]], url: `${server.url}/` },
        async (session) => evaluate(session, INITIAL_FOCUS),
      );

      // 鍵盤操作只在登入畫面成立。
      let keyboard = null;

      if (testCase.mode === 'login' || testCase.mode === 'field-error' || testCase.mode === 'login-error') {
        keyboard = await withPage(
          { viewport: viewportSize, steps: [testCase.steps[0]], url: `${server.url}/` },
          async (session) => keyboardChecks(session, testCase.mode),
        );
      }

      const checks = { ...measured, initialFocus, keyboard };

      report.cases.push({
        key,
        case: testCase.name,
        viewport: `${String(viewport.width)}x${String(viewport.height)}`,
        checks,
      });

      console.log(
        `${key} | 橫向捲動 ${String(measured.documentScrollWidth)}/${String(measured.viewportWidth)} | 溢出 ${String(measured.overflowing.length)} | 截斷 ${String(measured.truncated.length)} | 無名稱 ${String(measured.unnamed.length)} | 壞 aria ${String(measured.brokenAria.length)} | 焦點 ${String(measured.focusOrder.length)} 站 | 初始 ${String(initialFocus)}`,
      );
    }
  } finally {
    await server.close();
  }
}

writeFileSync(join(outDir, 'behaviour.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n輸出於 ${join(outDir, 'behaviour.json')}`);
