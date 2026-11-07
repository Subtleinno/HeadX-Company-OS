import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 外殼版面的靜態閘門（#118 切片 B）。
 *
 * 規格要求「畫面佔滿視窗，不用置中 dashboard 卡片網格」。呢件事唔可以用單元測試
 * 假裝驗到，所以直接讀 CSS：版面規則寫死在一個地方，走樣就紅。
 *
 * 亦順便守住兩條既有紀律：色碼只可以經 var(--hx-*) 取，檔案內不可以有十六進位色碼。
 */

const webSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const css = readFileSync(resolve(webSrc, 'styles/base-shell.css'), 'utf8');

/** 由 CSS 取出某個選擇器的宣告區塊（只支援單層大括號，足夠應付本檔）。 */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 一定要由行首（或上一個規則的收尾）開始，否則 `.selector__button` 會命中
  // `.shell-slot--scope .selector__button` 這種複合選擇器，量到第二條規則。
  const match = new RegExp(`(?:^|\\n|\\})(?:[ \\t]*)${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css);

  if (match === null) {
    throw new Error(`base-shell.css 找不到 ${selector} 的規則`);
  }

  return match[1] as string;
}

describe('外殼佔滿視窗', () => {
  it('.shell-frame 是 grid，而且高度撐滿視窗', () => {
    const rule = block('.shell-frame');

    expect(rule).toMatch(/display:\s*grid/);
    expect(rule).toMatch(/height:\s*(100vh|100dvh)/);
  });

  it('.shell-body 是「工作欄 ＋ 主內容」兩欄', () => {
    const rule = block('.shell-body');

    expect(rule).toMatch(/display:\s*grid/);
    expect(rule).toMatch(/grid-template-columns:/);
  });

  it('主內容區靠左排，不做置中卡片', () => {
    const rule = block('.shell-main');

    expect(rule).not.toMatch(/justify-content:\s*center/);
    expect(rule).not.toMatch(/margin:\s*0\s+auto/);
    expect(rule).not.toMatch(/margin-inline:\s*auto/);
  });
});

describe('設計紀律', () => {
  it('色碼一律經 var(--hx-*)，檔案內沒有十六進位色碼或 rgb(', () => {
    expect(css).toContain('var(--hx-');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\s*\(/);
  });

  it('沒有 emoji', () => {
    expect(/[\p{Extended_Pictographic}\uFE0F]/u.test(css)).toBe(false);
  });

  it('尊重 prefers-reduced-motion', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

/*
 * 2026-11-07：外殼對齊 HxDesign（commit eb079b6）。
 *
 * 這一段釘住「幾何」，而且每個數字都來自運行中實例的 computed style。
 * 目的不是禁止改，而是令「改回舊尺寸」這種退化一定要有人看見：
 * 52 / 46 / 38 / 36 / 30 / 300 / 32 這幾個數字一改，這裡就紅。
 *
 * 不放在截圖裡驗，因為截圖靠人眼看；尺寸靠測試。
 */
describe('對齊 HxDesign 的幾何', () => {
  it('頂欄 52px、左右 16px、玻璃表面，不用 1px 實線邊', () => {
    const rule = block('.shell-topbar');

    expect(rule).toMatch(/height:\s*var\(--hx-size-toolbar\)/);
    expect(rule).toMatch(/padding:\s*0\s+var\(--hx-space-4\)/);
    expect(rule).toMatch(/background:\s*var\(--hx-floating-bg\)/);
    expect(rule).toMatch(/backdrop-filter:\s*var\(--hx-floating-blur\)/);
    // 0.5px 要用偽元素畫，border-bottom 會被向上取整成 1px。
    expect(rule).not.toMatch(/border-bottom/);
  });

  it('頂欄底線用 ::after + scaleY(0.5) 畫真 hairline', () => {
    const rule = block('.shell-topbar::after');

    expect(rule).toMatch(/transform:\s*scaleY\(0\.5\)/);
    expect(rule).toMatch(/background:\s*var\(--hx-hairline\)/);
  });

  it('主選單項 36px、字 14px、左右 14px', () => {
    const tab = block('.shell-tab');

    expect(tab).toMatch(/height:\s*var\(--hx-size-control\)/);
    expect(tab).toMatch(/font-size:\s*14px/);
    expect(tab).toMatch(/padding:\s*0\s+14px/);
  });

  it('主選單的選中是黑底（子選單才用灰底）', () => {
    expect(css).toMatch(
      /\.shell-tab\[aria-current='page'\]\s*\{[^}]*background:\s*var\(--hx-accent\)/u,
    );
    expect(css).toMatch(
      /\.shell-subtab\[aria-current='page'\]\s*\{[^}]*background:\s*var\(--hx-bg-tertiary\)/u,
    );
  });

  it('圖示鍵視覺 38px，另外有 44px 熱區', () => {
    const btn = block('.shell-iconbtn');
    const hit = block('.shell-iconbtn::before');

    expect(btn).toMatch(/width:\s*var\(--hx-size-bar-control\)/);
    expect(btn).toMatch(/height:\s*var\(--hx-size-bar-control\)/);
    expect(hit).toMatch(/inset:\s*-3px/);
  });

  it('第二行 46px；子選單項 30px、字 12.5px', () => {
    const bar = block('.shell-subnav');
    const item = block('.shell-subtab');

    expect(bar).toMatch(/height:\s*var\(--hx-size-subbar\)/);
    expect(item).toMatch(/height:\s*30px/);
    expect(item).toMatch(/font-size:\s*12\.5px/);
  });

  it('工作欄 300px、內距 16/12/18、右邊 0.5px hairline', () => {
    expect(block('.shell-body')).toMatch(/grid-template-columns:\s*var\(--hx-size-sidebar\)\s+1fr/);
    expect(block('.shell-rail')).toMatch(/padding:\s*16px\s+12px\s+18px/);
    expect(block('.shell-rail::after')).toMatch(/transform:\s*scaleX\(0\.5\)/);
  });

  it('主內容內距 32px，最大寬用同一個 token（頁面與原型印章要對齊）', () => {
    expect(block('.shell-main')).toMatch(/padding:\s*var\(--hx-space-7\)/);
    expect(block('.page')).toMatch(/max-width:\s*var\(--hx-size-page-max\)/);
    expect(block('.shell-proto')).toMatch(/max-width:\s*var\(--hx-size-page-max\)/);
  });

  it('選擇器觸發是 38px、無邊框、600 字重 —— 不是一個表單輸入框', () => {
    const button = block('.selector__button');

    expect(button).toMatch(/height:\s*var\(--hx-size-bar-control\)/);
    expect(button).toMatch(/border:\s*0/);
    expect(button).toMatch(/font-size:\s*15px/);
    expect(button).toMatch(/font-weight:\s*600/);
  });

  it('浮層：距 8px、圓角 12、280px 起、大陰影', () => {
    const list = block('.selector__list');

    expect(list).toMatch(/top:\s*calc\(100%\s*\+\s*var\(--hx-space-2\)\)/);
    expect(list).toMatch(/border-radius:\s*var\(--hx-radius-md\)/);
    expect(list).toMatch(/min-width:\s*280px/);
    expect(list).toMatch(/box-shadow:\s*var\(--hx-shadow-lg\)/);
  });

  it('浮層選項 36px、字 14px', () => {
    const option = block('.selector__option');

    expect(option).toMatch(/min-height:\s*var\(--hx-size-control\)/);
    expect(option).toMatch(/font-size:\s*14px/);
  });

  it('第二步與未保存確認用同一個浮層樣式，不是主內容裡的一張卡', () => {
    const popover = block('.shell-popover');

    expect(popover).toMatch(/position:\s*fixed/);
    expect(popover).toMatch(/box-shadow:\s*var\(--hx-shadow-lg\)/);
    expect(popover).toMatch(/width:\s*300px/);
  });

  it('工作範圍的觸發器比 app 名細一級，不會兩個粗體並排', () => {
    const scope = block('.shell-slot--scope .selector__button');

    expect(scope).toMatch(/font-size:\s*14px/);
    expect(scope).toMatch(/font-weight:\s*500/);
    expect(scope).toMatch(/color:\s*var\(--hx-text-secondary\)/);
  });
});
