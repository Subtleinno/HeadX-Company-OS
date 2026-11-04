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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tokensPath = resolve(repoRoot, 'apps/web/src/styles/tokens.css');

function readTokens(): Map<string, string> {
  const css = readFileSync(tokensPath, 'utf8');
  const tokens = new Map<string, string>();

  for (const line of css.split(/\r?\n/)) {
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
    '--hx-brand-green': '#b8f36b',
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
    '--hx-font-title': '700 28px/34px',
    '--hx-font-headline': '600 17px/22px',
    '--hx-font-body': '400 17px/22px',
    '--hx-font-footnote': '400 13px/18px',
    '--hx-motion-fast': '0.12s',
    '--hx-motion-base': '0.15s',
    '--hx-ease': 'cubic-bezier(0.2, 0, 0, 1)',
  };

  for (const [name, value] of Object.entries(expected)) {
    it(`${name} 是 ${value}`, () => {
      expect(token(name)).toBe(value);
    });
  }

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
