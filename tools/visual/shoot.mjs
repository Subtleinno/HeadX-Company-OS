/**
 * 用 Chrome DevTools Protocol 截圖（issue #73 的視覺驗收用）。
 *
 * 為什麼不用 Playwright：issue 明令不得新增外部依賴，而本機已有 Chrome。
 * Node 22+ 內建 WebSocket，可以直接說 CDP，不需要任何套件。
 *
 * 所有會影響像素的環境因素都在這裡固定：viewport、deviceScaleFactor、locale、
 * timezone、色彩模式、reduced-motion、字體載入。基準與候選共用同一支程式，
 * 所以兩邊的環境必然相同。
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** 找一個空閒的 TCP 端口。 */
function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => {
        done(port);
      });
    });
  });
}

async function waitForDevtools(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json/version`);

      if (response.ok) {
        return response.json();
      }
    } catch {
      // 尚未起來，繼續等。
    }

    await new Promise((done) => setTimeout(done, 100));
  }

  throw new Error('Chrome 的 DevTools 端口沒有起來');
}

/** 一個很小的 CDP session：send(method, params) → Promise<result>，另可訂閱事件。 */
class Session {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);

        if (message.error !== undefined) {
          reject(new Error(`${JSON.stringify(message.error)}`));
        } else {
          resolve(message.result);
        }

        return;
      }

      if (message.method !== undefined) {
        for (const handler of this.listeners.get(message.method) ?? []) {
          handler(message.params);
        }
      }
    });
  }

  /** 訂閱一個 CDP 事件；同一個方法可以有多個訂閱者。 */
  on(method, handler) {
    const current = this.listeners.get(method) ?? [];
    current.push(handler);
    this.listeners.set(method, current);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

/** 工具：把一段 async function 送到頁面執行，等它完成。 */
export async function evaluate(session, expression) {
  const result = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails !== undefined) {
    throw new Error(
      `頁面內執行失敗：${JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)}`,
    );
  }

  return result.result.value;
}

/** 測試端注入的樣式：只停用動效與輸入游標，不改產品樣式。兩邊完全相同。 */
const TEST_STYLESHEET = `
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}
html { scrollbar-width: none !important; }
::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
`;

async function installTestStyles(session) {
  await evaluate(
    session,
    `(() => {
      const style = document.createElement('style');
      style.id = 'visual-test-styles';
      style.textContent = ${JSON.stringify(TEST_STYLESHEET)};
      document.head.appendChild(style);

      return true;
    })()`,
  );
}

/** 等字體就緒 + 自訂 predicate。不靠固定 sleep。 */
async function waitReady(session, readyExpression) {
  await evaluate(
    session,
    `(async () => {
      await document.fonts.ready;

      const deadline = Date.now() + 15000;

      while (Date.now() < deadline) {
        if (${readyExpression}) {
          // 再等兩個 frame，確保樣式與版面已經落地。
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          return true;
        }

        await new Promise((done) => requestAnimationFrame(done));
      }

      throw new Error('畫面未進入就緒狀態：' + document.body.innerText.slice(0, 200));
    })()`,
  );
}

/** 用 React 認得的方式設定受控 input 的值。 */
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

/**
 * 開一個瀏覽器、把 case 的步驟跑完，然後把 session 交給呼叫者做事（截圖或量行為）。
 * 行為驗收與視覺驗收共用同一支程式，環境因素自然相同。
 *
 * @param {{
 *   viewport: { width: number, height: number },
 *   steps: Array<{ kind: string, selector?: string, value?: string, expression?: string }>,
 *   url: string,
 * }} options
 * @param {(session: Session) => Promise<unknown>} run
 */
export async function withPage({ viewport, steps, url }, run) {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'co-visual-'));

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--disable-lcd-text',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-features=CalculateNativeWinOcclusion',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      `--remote-debugging-port=${String(port)}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let socket;
  let ws;

  try {
    await waitForDevtools(port);

    const target = await (
      await fetch(`http://127.0.0.1:${String(port)}/json/new?about:blank`, { method: 'PUT' })
    ).json();

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, fail) => {
      ws.addEventListener('open', done, { once: true });
      ws.addEventListener('error', fail, { once: true });
    });

    socket = new Session(ws);

    await socket.send('Page.enable');
    await socket.send('Runtime.enable');
    await socket.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width < 600,
    });
    await socket.send('Emulation.setLocaleOverride', { locale: 'zh-HK' });
    await socket.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Hong_Kong' });
    await socket.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-color-scheme', value: 'light' },
      ],
    });

    const loaded = new Promise((done) => {
      const handler = (event) => {
        const message = JSON.parse(event.data);

        if (message.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', handler);
          done();
        }
      };

      ws.addEventListener('message', handler);
    });

    await socket.send('Page.navigate', { url });
    await loaded;
    await installTestStyles(socket);

    for (const step of steps) {
      if (step.kind === 'wait') {
        await waitReady(socket, step.expression);
      } else if (step.kind === 'fill') {
        await evaluate(socket, `(${SET_INPUT})(${JSON.stringify(step.selector)}, ${JSON.stringify(step.value)})`);
      } else if (step.kind === 'click') {
        await evaluate(
          socket,
          `(() => {
            const element = document.querySelector(${JSON.stringify(step.selector)});

            if (element === null) {
              throw new Error('找不到元素：' + ${JSON.stringify(step.selector)});
            }

            element.click();
            return true;
          })()`,
        );
      } else {
        throw new Error(`未知的 step：${step.kind}`);
      }
    }

    return await run(socket);
  } finally {
    try {
      ws?.close();
    } catch {
      // 已關。
    }

    chrome.kill();

    // Windows 的 Chrome 有時放不開 user-data-dir，重試幾次再放棄。
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 200));
      }
    }
  }
}

/**
 * 開一個瀏覽器，截一個 case。
 *
 * @param {{
 *   viewport: { width: number, height: number },
 *   steps: Array<{ kind: string, selector?: string, value?: string, expression?: string }>,
 *   url: string,
 * }} options
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function capture(options) {
  return withPage(options, async (session) => {
    const shot = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });

    return Buffer.from(shot.data, 'base64');
  });
}
