/**
 * 視覺驗收的案例表（issue #73 驗收 4／5）。
 *
 * 必測三個既有畫面：setup、login、已登入首頁。
 * 另測四種既有狀態：欄位驗證錯誤、登入失敗、無法連線、載入中。
 * 每種狀態都用同一支伺服器（tools/visual/server.mjs）給出固定回應重現。
 *
 * 每個案例只描述「怎麼到達那個狀態」，不描述外觀 —— 外觀由產品程式決定。
 */

export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

/** 等「載入中」以外的畫面都已經落地。 */
const READY_APP = `document.querySelector('main, header.toolbar') !== null`;

const waitText = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;

export const CASES = [
  {
    name: 'setup',
    mode: 'setup',
    steps: [
      { kind: 'wait', expression: `${READY_APP} && ${waitText('建立老闆帳戶')}` },
    ],
  },
  {
    name: 'login',
    mode: 'login',
    steps: [{ kind: 'wait', expression: `${READY_APP} && ${waitText('登入 Company OS')}` }],
  },
  {
    name: 'home',
    mode: 'home',
    steps: [
      { kind: 'wait', expression: `document.querySelector('header.toolbar') !== null` },
    ],
  },
  {
    name: 'field-error',
    mode: 'field-error',
    steps: [
      { kind: 'wait', expression: `${READY_APP} && ${waitText('登入 Company OS')}` },
      { kind: 'fill', selector: '#login-email', value: 'not-an-email' },
      { kind: 'fill', selector: '#login-password', value: 'short' },
      { kind: 'click', selector: 'button[type="submit"]' },
      { kind: 'wait', expression: `document.querySelector('.field__error') !== null` },
    ],
  },
  {
    name: 'login-error',
    mode: 'login-error',
    steps: [
      { kind: 'wait', expression: `${READY_APP} && ${waitText('登入 Company OS')}` },
      { kind: 'fill', selector: '#login-email', value: 'owner@example.com' },
      { kind: 'fill', selector: '#login-password', value: 'wrong password' },
      { kind: 'click', selector: 'button[type="submit"]' },
      { kind: 'wait', expression: `document.querySelector('.form__error') !== null` },
    ],
  },
  {
    name: 'unreachable',
    mode: 'unreachable',
    steps: [{ kind: 'wait', expression: `${READY_APP} && ${waitText('無法連線到伺服器')}` }],
  },
  {
    name: 'loading',
    mode: 'loading',
    steps: [
      { kind: 'wait', expression: `document.querySelector('.screen__status') !== null` },
    ],
  },
];
