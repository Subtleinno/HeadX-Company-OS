/* global window, document, HTMLElement */
import assert from 'node:assert/strict';
import console from 'node:console';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HEADX_SMOKE_BASE_URL ?? 'http://127.0.0.1:4210';
const email = process.env.HEADX_SMOKE_EMAIL;
const password = process.env.HEADX_SMOKE_PASSWORD;
/** 本機自動驗收可注入臨時 session；外部使用仍應走真登入。 */
const sessionToken = process.env.HEADX_SMOKE_SESSION_TOKEN;
const screenshotDir = process.env.HEADX_SMOKE_SCREENSHOTS ?? join(tmpdir(), 'headx-design-navigation-smoke');

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

async function open(hash, selector) {
  await page.goto(`${baseUrl}/${hash}`, { waitUntil: 'networkidle' });
  await page.locator(selector).waitFor();
  await assertNoHorizontalOverflow();
}

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

async function assertSingleColumnAt768() {
  const layout = await page.evaluate(() => {
    const rail = document.querySelector('[data-frame-rail]');
    const main = document.querySelector('[data-frame-main]');
    if (!(rail instanceof HTMLElement) || !(main instanceof HTMLElement) || rail.offsetParent === null) {
      return { railVisible: false, stacked: true };
    }
    const railBox = rail.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    return { railVisible: true, stacked: mainBox.top >= railBox.bottom - 1 };
  });
  assert.ok(!layout.railVisible || layout.stacked, `768 不是單欄：${JSON.stringify(layout)}`);
}

async function assertModuleTabsFullyVisible() {
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
    tabs.length === 5 && tabs.every((tab) => tab.visible),
    `模組標籤被裁切：${JSON.stringify(tabs)}`,
  );
}

try {
  if (sessionToken) {
    await page.context().addCookies([
      { name: 'co_session', value: sessionToken, url: baseUrl, httpOnly: true, sameSite: 'Lax' },
    ]);
    await page.goto(`${baseUrl}/#/design/create/projects`, { waitUntil: 'networkidle' });
    await page.locator('.projects-screen').waitFor();
  } else {
    await page.goto(`${baseUrl}/#/login`, { waitUntil: 'networkidle' });
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: '登入', exact: true }).click();
    await page.waitForURL(/#\/(boss|design)/);
  }

  const projectTitle = `Browser 驗收 Project ${Date.now()}`;
  const originalRequest = '為 Moonic 建立五頁 IG Carousel；這是由真瀏覽器建立的本機驗收要求。';
  await open('#/design/create/projects', '.projects-screen');
  await page.locator('.projects-toolbar').getByRole('button', { name: '新增 Project', exact: true }).click();
  await page.locator('#project-title').fill(projectTitle);
  await page.locator('#project-request').fill(originalRequest);
  await page.getByRole('button', { name: '保存並建立 Project', exact: true }).click();
  await page.waitForURL(/#\/design\/create\/projects\/[0-9a-f-]+\/brief$/);
  await page.locator('.project-detail').waitFor();
  await page.getByText(originalRequest, { exact: true }).waitFor();
  const detailUrl = page.url();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.project-detail').waitFor();
  await page.getByText(originalRequest, { exact: true }).waitFor();
  assert.equal(page.url(), detailUrl);
  await page.screenshot({ path: join(screenshotDir, 'project-detail-1440.png'), fullPage: true });
  await open('#/design/create/projects', '.projects-screen');
  await page.getByRole('button', { name: projectTitle, exact: true }).waitFor();
  console.log('通過真實 Project：新增 → 詳情 → 重新整理 → 列表讀回');

  const routes = [
    ['#/design/create/projects', '.projects-screen'],
    ['#/design/create/outputs', '[data-design-page="outputs"][data-design-module-state="empty"]'],
    ['#/design/material/library', '[data-design-page="library"][data-design-module="material"]'],
    ['#/design/knowledge/list', '[data-design-page="list"][data-design-module="knowledge"]'],
    ['#/design/templates/library', '[data-design-page="library"][data-design-module="templates"]'],
  ];

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });

    for (const [hash, selector] of routes) {
      await open(hash, selector);
      if (width === 768) {
        await assertSingleColumnAt768();
      }
    }

    await open('#/design/brand/home', '[data-brand-page="home"]');
    await page.screenshot({
      path: join(screenshotDir, `brand-home-${width}.png`),
      fullPage: true,
    });

    await open('#/design/create/projects', '[data-design-page="projects"]');
    const moduleLabels = await page.locator('[data-frame-slot="modules"] button').allTextContents();
    assert.deepEqual(moduleLabels, ['製作', '品牌', '素材', '知識', '模板']);
    await assertModuleTabsFullyVisible();
    assert.equal(await page.locator('[data-frame-slot="modules"]').getByText('Needs').count(), 0);
    await page.screenshot({
      path: join(screenshotDir, `projects-${width}.png`),
      fullPage: true,
    });

    await open('#/boss', '.boss-metrics');
    const bossModuleLabels = await page.locator('[data-frame-slot="modules"] button').allTextContents();
    assert.deepEqual(bossModuleLabels, ['總覽', '據點與機器', '人員', '策略', '存取紀錄']);
    await assertModuleTabsFullyVisible();
    await page.screenshot({
      path: join(screenshotDir, `boss-overview-${width}.png`),
      fullPage: true,
    });

    console.log(`通過 ${width}px：Projects 真列表、其餘四個工作區誠實空態、Brand 深連結、五個頂層入口、Boss Portal 總覽、無橫向溢出`);
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await open('#/design/create/projects', '[data-design-page="projects"]');
  await page.locator('[data-frame-subbar]').getByRole('button', { name: '成品', exact: true }).click();
  await page.waitForURL(/#\/design\/create\/outputs$/);
  await page.locator('[data-design-page="outputs"]').waitFor();
  await page.locator('[data-frame-rail]').getByRole('button', { name: '全部作品', exact: true }).click();
  await page.waitForURL(/#\/design\/create\/projects$/);

  for (const [label, hash] of [
    ['素材', '#/design/material/library'],
    ['知識', '#/design/knowledge/list'],
    ['模板', '#/design/templates/library'],
    ['品牌', '#/design/brand/home'],
    ['製作', '#/design/create/projects'],
  ]) {
    await page.locator('[data-frame-slot="modules"]').getByRole('button', { name: label, exact: true }).click();
    await page.waitForURL((url) => url.hash === hash);
  }

  console.log('通過 768px 實際點擊：Create 兩個子頁與五個頂層入口都可觸達');

  await open('#/boss', '.boss-metrics');
  await page.locator('[data-frame-slot="modules"]').getByRole('button', { name: '人員', exact: true }).click();
  await page.waitForURL(/#\/boss\/people\/members$/);
  await page.locator('.boss-members__bar').waitFor();
  await assertNoHorizontalOverflow();
  console.log('通過 768px Boss Portal 實際點擊：共享模組導覽可進入人員與部門');
  console.log(`驗收截圖暫存：${screenshotDir}`);
} finally {
  await browser.close();
}
