/* global window, document, HTMLElement */
import assert from 'node:assert/strict';
import console from 'node:console';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

/**
 * Marketing Design 空骨架驗收（2026-11-17）。
 *
 * 老闆指示四個模組（Create／Materials／Knowledge／Templates）前後端清空、由零重做，
 * 畫面上只應該見到三塊空白：第二層頂欄、左側欄、右側內容區。這支真瀏覽器腳本
 * 要證明四件事：
 *   1. 六條網址都仍然可達，而且第二行／左欄／內容區都真的是空（冇頁籤、冇項目、
 *      冇麵包屑、冇頁名、冇「未提供」佔位卡）；
 *   2. 那兩條空 bar 真的有佔位（高度／寬度 > 0），不是被 hidden 收起；
 *   3. 畫面完全不再打已刪的 API（projects／materials／knowledge／templates／outputs）；
 *   4. 五個頂層入口、品牌頁、Boss Portal 仍然可達；1440／1024／768 沒有橫向溢出。
 */

const baseUrl = process.env.HEADX_SMOKE_BASE_URL ?? 'http://127.0.0.1:4210';
const email = process.env.HEADX_SMOKE_EMAIL;
const password = process.env.HEADX_SMOKE_PASSWORD;
/** 本機自動驗收可注入臨時 session；外部使用仍應走真登入。 */
const sessionToken = process.env.HEADX_SMOKE_SESSION_TOKEN;
const screenshotDir = process.env.HEADX_SMOKE_SCREENSHOTS ?? join(tmpdir(), 'headx-design-blank');

if (!sessionToken && (!email || !password)) {
  throw new Error('請用 HEADX_SMOKE_EMAIL 與 HEADX_SMOKE_PASSWORD 提供本機測試帳戶，或注入臨時 HEADX_SMOKE_SESSION_TOKEN。');
}

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20_000);

/** 已刪除的 API：任何一條都不應該再被請求。 */
const REMOVED_API = /\/api\/(projects|materials|knowledge|templates|outputs|agent\/(materials|knowledge|templates|outputs))/;
const removedCalls = [];
page.on('request', (request) => {
  if (REMOVED_API.test(request.url())) {
    removedCalls.push(request.url());
  }
});

const ROUTES = [
  ['#/design/create/projects', 'create'],
  ['#/design/create/outputs', 'outputs'],
  ['#/design/material/library', 'material'],
  ['#/design/knowledge/list', 'knowledge'],
  ['#/design/templates/library', 'templates'],
];

/** 空白骨架的落點：第二行有畫出來，但標了 blank。 */
const BLANK = '[data-frame-subbar][data-frame-blank="true"]';

async function assertNoHorizontalOverflow() {
  const size = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    size.document <= size.viewport + 1 && size.body <= size.viewport + 1,
    `橫向溢出：${JSON.stringify(size)}`,
  );
}

async function open(hash) {
  await page.goto(`${baseUrl}/${hash}`, { waitUntil: 'networkidle' });
  await page.locator(BLANK).waitFor();
  await assertNoHorizontalOverflow();
}

/** 三塊空白逐塊驗：存在、有佔位、內容真的空。 */
async function assertBlankSkeleton(hash) {
  const subbar = await page.locator('[data-frame-subbar]').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      blank: node.getAttribute('data-frame-blank'),
      hidden: node.hasAttribute('hidden'),
      buttons: node.querySelectorAll('button').length,
      text: (node.textContent ?? '').trim(),
      height: rect.height,
      width: rect.width,
    };
  });
  assert.equal(subbar.blank, 'true', `${hash} 第二行不是空骨架`);
  assert.equal(subbar.hidden, false, `${hash} 第二行被 hidden 收起`);
  assert.equal(subbar.buttons, 0, `${hash} 第二行仍有頁籤`);
  assert.equal(subbar.text, '', `${hash} 第二行仍有文字：${subbar.text}`);
  assert.ok(subbar.height > 20 && subbar.width > 0, `${hash} 第二行沒有佔位：${JSON.stringify(subbar)}`);

  const sidebar = await page.locator('[data-frame-rail]').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      blank: node.getAttribute('data-frame-blank'),
      buttons: node.querySelectorAll('button').length,
      text: (node.textContent ?? '').trim(),
      height: rect.height,
      width: rect.width,
    };
  });
  assert.equal(sidebar.blank, 'true', `${hash} 左欄不是空骨架`);
  assert.equal(sidebar.buttons, 0, `${hash} 左欄仍有項目`);
  assert.equal(sidebar.text, '', `${hash} 左欄仍有文字：${sidebar.text}`);
  // 768px 起外殼本身會把側欄轉成內容上方的橫向條（見 frame.css），所以這裡
  // 只驗「有佔位」而唔鎖死高度。
  assert.ok(sidebar.width > 60 && sidebar.height > 10, `${hash} 左欄沒有佔位：${JSON.stringify(sidebar)}`);

  const content = await page.locator('[data-frame-main]').evaluate((node) => ({
    text: (node.textContent ?? '').trim(),
    headings: node.querySelectorAll('h1, h2, h3').length,
    breadcrumb: node.querySelectorAll('[data-frame-breadcrumb]').length,
    cards: node.querySelectorAll('[class*="stub"], [class*="empty"]').length,
    width: node.getBoundingClientRect().width,
  }));
  assert.equal(content.text, '', `${hash} 內容區仍有文字：${content.text}`);
  assert.equal(content.headings, 0, `${hash} 內容區仍有標題`);
  assert.equal(content.breadcrumb, 0, `${hash} 內容區仍有麵包屑`);
  assert.equal(content.cards, 0, `${hash} 內容區仍有佔位卡`);
  assert.ok(content.width > 200, `${hash} 內容區沒有佔位`);
}

async function assertModuleTabsFullyVisible(expectedCount) {
  const tabs = await page.locator('[data-frame-slot="modules"] button').evaluateAll((buttons) => {
    const container = document.querySelector('[data-frame-slot="modules"]');
    if (!(container instanceof HTMLElement)) {
      return [];
    }
    const bounds = container.getBoundingClientRect();
    return buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        label: button.textContent,
        visible: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
      };
    });
  });
  assert.ok(
    tabs.length > 0 && (expectedCount === undefined || tabs.length === expectedCount) && tabs.every((tab) => tab.visible),
    `模組標籤被裁切：${JSON.stringify(tabs)}`,
  );
}

try {
  if (sessionToken) {
    await page.context().addCookies([
      { name: 'co_session', value: sessionToken, url: baseUrl, httpOnly: true, sameSite: 'Lax' },
    ]);
    await page.goto(`${baseUrl}/#/design/create/projects`, { waitUntil: 'networkidle' });
    await page.locator(BLANK).waitFor();
  } else {
    await page.goto(`${baseUrl}/#/login`, { waitUntil: 'networkidle' });
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: '登入', exact: true }).click();
    await page.waitForURL(/#\/(boss|design)/);
  }

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });

    for (const [hash, label] of ROUTES) {
      await open(hash);
      await assertBlankSkeleton(hash);
      await page.screenshot({ path: join(screenshotDir, `blank-${label}-${width}.png`), fullPage: true });
    }

    await open('#/design/create/projects');
    const moduleLabels = await page.locator('[data-frame-slot="modules"] button').allTextContents();
    assert.deepEqual(moduleLabels, ['製作', '品牌', '素材', '知識', '模板']);
    await assertModuleTabsFullyVisible(5);
    assert.equal(await page.locator('[data-frame-slot="modules"]').getByText('Needs').count(), 0);

    // 品牌頁仍然是真頁面：有頁名、有麵包屑，而且不是 blank 骨架。
    await page.goto(`${baseUrl}/#/design/brand/dashboard`, { waitUntil: 'networkidle' });
    await page.locator('[data-frame-main] h1').waitFor();
    assert.equal(await page.locator('[data-frame-subbar][data-frame-blank="true"]').count(), 0);
    assert.equal(await page.locator('[data-frame-breadcrumb]').count(), 1);
    await assertNoHorizontalOverflow();

    await page.goto(`${baseUrl}/#/boss`, { waitUntil: 'networkidle' });
    await page.locator('[data-boss-overview]').waitFor();
    await assertModuleTabsFullyVisible();
    await assertNoHorizontalOverflow();

    console.log(`通過 ${width}px：五頁空骨架（第二行／左欄／內容區）、五個頂層入口、品牌頁、Boss Portal、無橫向溢出`);
  }

  // 768px 實際點擊：五個頂層入口都仍然可以離開空骨架。
  await page.setViewportSize({ width: 768, height: 900 });
  await open('#/design/create/projects');

  for (const [label, hash] of [
    ['素材', '#/design/material/library'],
    ['知識', '#/design/knowledge/list'],
    ['模板', '#/design/templates/library'],
    ['品牌', '#/design/brand/dashboard'],
    ['製作', '#/design/create/projects'],
  ]) {
    await page.locator('[data-frame-slot="modules"]').getByRole('button', { name: label, exact: true }).click();
    await page.waitForURL((url) => url.hash === hash);
    await assertNoHorizontalOverflow();
  }

  console.log('通過 768px 實際點擊：空骨架之間與品牌頁都可互相到達');

  assert.deepEqual(removedCalls, [], `畫面仍然請求已刪除的 API：${removedCalls.join('、')}`);
  console.log('通過：整個流程沒有再請求任何已刪除的 Design API');
  console.log(`驗收截圖暫存：${screenshotDir}`);
} finally {
  await browser.close();
}
