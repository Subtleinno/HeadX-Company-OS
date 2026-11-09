import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 設計 token 的閘門。
 *
 * 顏色、字級、間距全部集中在 tokens.css；這幾條測試把它綁回 issue 的規格，
 * 之後任何人手改一個色碼都會在這裡變紅，而不是等到畫面走樣才發現。
 */

// token 已搬入 packages/design-tokens（#73 R3）：路徑由本檔位置推出，不再假設它在 apps/web。
const tokensPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/tokens.css');

function readTokens(): Map<string, string> {
  const css = readFileSync(tokensPath, 'utf8');

  /*
   * 只讀 `:root { … }` 那一段（淺色基準）。
   *
   * tokens.css 自 #118 起有第二個區塊 `:root[data-theme='dark']`。如果照舊掃全檔，
   * 同名 token 會被深色值覆蓋，這一檔就會變成「用深色值去驗淺色期望」——
   * 表面綠，實際上基準已經換了。深色的值由 dark-tokens.test.ts 獨立驗。
   */
  const light = /:root\s*\{([\s\S]*?)\n\}/u.exec(css);

  if (light === null) {
    throw new Error('tokens.css 找不到 :root 區塊');
  }

  const tokens = new Map<string, string>();

  for (const line of (light[1] as string).split(/\r?\n/)) {
    const match = /^\s*(--hx-[a-z0-9-]+)\s*:\s*(.+?);\s*$/.exec(line);

    if (match === null) {
      continue;
    }

    tokens.set(match[1] as string, (match[2] as string).replace(/\s+/g, ' ').trim());
  }

  return tokens;
}

const tokens = readTokens();

function token(name: string): string {
  const value = tokens.get(name);

  if (value === undefined) {
    throw new Error(`tokens.css 沒有 ${name}`);
  }

  return value;
}

/** #rrggbb → 相對亮度（WCAG 2.x）。 */
function luminance(hex: string): number {
  const value = hex.trim().replace(/^#/, '');

  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`不是六位十六進位色碼：${hex}`);
  }

  const channels = [0, 2, 4].map((offset) => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  });

  return (channels[0] as number) * 0.2126 + (channels[1] as number) * 0.7152 + (channels[2] as number) * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('tokens.css 的值與規格一致', () => {
  it('讀到 token（掃描失效時要紅，不可以空集合通過）', () => {
    expect(tokens.size).toBeGreaterThan(30);
  });

  const expected: Record<string, string> = {
    '--hx-bg-primary': '#ffffff',
    '--hx-bg-secondary': '#f5f5f7',
    '--hx-bg-tertiary': '#e8e8ed',
    '--hx-text-primary': '#1d1d1f',
    '--hx-text-secondary': '#68686c',
    '--hx-accent': '#000000',
    '--hx-accent-text': '#ffffff',
    '--hx-border': '#d2d2d7',
    '--hx-hairline': 'rgba(0, 0, 0, 0.12)',
    '--hx-danger': '#ff3b30',
    '--hx-warning': '#ff9500',
    '--hx-success': '#34c759',
    '--hx-radius-sm': '8px',
    '--hx-radius-md': '12px',
    '--hx-radius-lg': '16px',
    '--hx-radius-xl': '20px',
    '--hx-size-control': '36px',
    '--hx-size-touch': '44px',
    '--hx-size-toolbar': '52px',
    '--hx-size-sidebar': '300px',
    '--hx-space-1': '4px',
    '--hx-space-2': '8px',
    '--hx-space-3': '12px',
    '--hx-space-4': '16px',
    '--hx-space-5': '20px',
    '--hx-space-6': '24px',
    '--hx-space-7': '32px',
    '--hx-space-8': '40px',
    '--hx-font-title': '700 28px/34px var(--hx-font-family)',
    '--hx-font-headline': '600 17px/22px var(--hx-font-family)',
    '--hx-font-body': '400 17px/22px var(--hx-font-family)',
    '--hx-font-footnote': '400 13px/18px var(--hx-font-family)',
    '--hx-motion-fast': '0.12s',
    '--hx-motion-base': '0.15s',
    '--hx-ease': 'cubic-bezier(0.2, 0, 0, 1)',
  };

  for (const [name, value] of Object.entries(expected)) {
    it(`${name} 是 ${value}`, () => {
      expect(token(name)).toBe(value);
    });
  }

  it('--hx-brand-green 已退役，淺色區塊唔再定義呢個 token', () => {
    expect(tokens.has('--hx-brand-green')).toBe(false);
  });

  it('字體堆疊一字不差，而且不下載字體', () => {
    expect(token('--hx-font-family')).toBe(
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
    );
  });
});

describe('文字對比度不低於 4.5:1', () => {
  const cases: [string, string, string][] = [
    ['--hx-text-primary', '--hx-bg-primary', '正文'],
    ['--hx-text-secondary', '--hx-bg-primary', '次要文字'],
    ['--hx-accent-text', '--hx-accent', '主要按鈕'],
    ['--hx-danger-text', '--hx-bg-primary', '錯誤文字'],
  ];

  for (const [foreground, background, label] of cases) {
    it(`${label}：${foreground} 在 ${background} 上`, () => {
      const ratio = contrast(token(foreground), token(background));

      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('--hx-danger 本身在白底不足 4.5:1，所以只可以做邊框與填色', () => {
    expect(contrast(token('--hx-danger'), token('--hx-bg-primary'))).toBeLessThan(4.5);
  });

  it('--hx-danger-text 比 --hx-danger 深（不是同一個色）', () => {
    expect(token('--hx-danger-text')).not.toBe(token('--hx-danger'));
    expect(luminance(token('--hx-danger-text'))).toBeLessThan(luminance(token('--hx-danger')));
  });
});

/*
 * 2026-11-07：外殼視覺對齊 HxDesign（commit eb079b6）。下面每一個值都取自
 * 運行中實例的 computed style，不是憑感覺調出來的；來源見
 * docs/product/BASE-UI-HXDESIGN-ALIGNMENT.md。
 */
describe('外殼對齊 HxDesign 的幾何與表面', () => {
  const aligned: Record<string, string> = {
    '--hx-size-toolbar': '52px',
    '--hx-size-subbar': '46px',
    '--hx-size-bar-control': '38px',
    '--hx-size-control': '36px',
    '--hx-size-sidebar': '300px',
    '--hx-size-page-max': '1080px',
    '--hx-border-light': '#e8e8ed',
    '--hx-fill-quaternary': 'rgba(0, 0, 0, 0.04)',
    '--hx-fill-tertiary': 'rgba(0, 0, 0, 0.06)',
    '--hx-accent-hover': '#1d1d1f',
    '--hx-floating-bg': 'rgba(255, 255, 255, 0.82)',
    '--hx-floating-blur': 'saturate(160%) blur(14px)',
    '--hx-shadow-lg': '0 12px 40px rgba(0, 0, 0, 0.12)',
  };

  for (const [name, value] of Object.entries(aligned)) {
    it(`${name} 是 ${value}`, () => {
      expect(token(name)).toBe(value);
    });
  }

  it('有等寬字體堆疊（頁面小標與編號要用）', () => {
    expect(token('--hx-font-mono')).toContain('ui-monospace');
  });

  it('字級階梯有 15px 正文與 11px 小標（不是只有 17px 與 13px）', () => {
    expect(token('--hx-font-subheadline')).toBe('400 15px/20px var(--hx-font-family)');
    expect(token('--hx-font-eyebrow')).toBe('500 11px/16px var(--hx-font-family)');
  });
});

describe('字級 token 一定要是有效的 font 簡寫', () => {
  /*
   * 2026-11-07：外殼對齊時用 computed style 發現，`font: 400 15px/20px` 少了
   * 字體家族就是無效宣告，瀏覽器靜靜丟棄，元件沿用上一層的 17px。
   * 表面上「有字」，實際字級錯了，而且截圖看上去只是「字有點大」。
   * 所以每一個字級 token 都要自帶 family。
   */
  const typeTokens = [...tokens.keys()].filter((name) => /^--hx-font-(title|headline|body|callout|subheadline|footnote|caption|eyebrow)$/.test(name));

  it('掃到 8 個字級 token（掃描失效時要紅）', () => {
    expect(typeTokens).toHaveLength(8);
  });

  for (const name of typeTokens) {
    it(`${name} 帶 var(--hx-font-family)，可以直接放進 font:`, () => {
      expect(token(name)).toContain('var(--hx-font-family)');
    });
  }
});
