import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 深色 token 的閘門（#118 切片 B、決策 C49）。
 *
 * 深色唔可以係「另一套頁面」，所以佢必須係同一組 token 名、另一組值：
 * 少一個名，用嗰個名的元件在深色下就會靜靜跌返淺色值。
 *
 * 呢個檔獨立於 tokens.test.ts，因為嗰邊驗淺色為基準值，唔應該被深色遮住。
 */

const tokensPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/tokens.css');
const css = readFileSync(tokensPath, 'utf8');

/** 取出某個選擇器底下的 token（同名 token 只會在一個區塊出現）。 */
function tokensOf(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u').exec(css);

  if (match === null) {
    throw new Error(`tokens.css 找不到 ${selector} 的區塊`);
  }

  const tokens = new Map<string, string>();

  for (const line of (match[1] as string).split(/\r?\n/)) {
    const token = /^\s*(--hx-[a-z0-9-]+)\s*:\s*(.+?);\s*$/.exec(line);

    if (token !== null) {
      tokens.set(token[1] as string, (token[2] as string).replace(/\s+/g, ' ').trim());
    }
  }

  return tokens;
}

const light = tokensOf(':root');
const dark = tokensOf(":root[data-theme='dark']");

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

function darkToken(name: string): string {
  const value = dark.get(name);

  if (value === undefined) {
    throw new Error(`深色沒有定義 ${name}：用這個 token 的元件在深色下會跌返淺色值`);
  }

  return value;
}

describe('深色區塊齊全', () => {
  it('讀到深色 token（掃描失效時要紅，不可以空集合通過）', () => {
    expect(dark.size).toBeGreaterThanOrEqual(12);
  });

  it('淺色有的顏色 token，深色一個都不可以少', () => {
    // 2026-11-07 加入 fill／floating／scrim／shadow：玻璃、hover 底色與浮層陰影
    // 一樣是「同一個名、另一組值」，漏一個就會在深色跌返淺色值。
    const colourTokens = [...light.keys()].filter((name) =>
      /^--hx-(bg|text|accent|border|hairline|danger|warning|success|brand|fill|floating|scrim|shadow)/.test(
        name,
      ),
    );

    expect(colourTokens.length).toBeGreaterThan(10);

    const missing = colourTokens.filter((name) => !dark.has(name));

    expect(missing).toEqual([]);
  });

  it('深色不會定義淺色沒有的新 token 名（避免兩邊各有一套）', () => {
    const extra = [...dark.keys()].filter((name) => !light.has(name));

    expect(extra).toEqual([]);
  });

  it('深色主畫布真的是深色，不是淺色的另一個名', () => {
    expect(luminance(darkToken('--hx-bg-primary'))).toBeLessThan(0.05);
    expect(luminance(darkToken('--hx-text-primary'))).toBeGreaterThan(0.5);
  });
});

describe('深色文字對比度不低於 4.5:1', () => {
  const cases: [string, string, string][] = [
    ['--hx-text-primary', '--hx-bg-primary', '正文'],
    ['--hx-text-secondary', '--hx-bg-primary', '次要文字'],
    ['--hx-accent-text', '--hx-accent', '主要按鈕'],
    ['--hx-danger-text', '--hx-bg-primary', '錯誤文字'],
    ['--hx-text-primary', '--hx-bg-secondary', '工作欄上的正文'],
  ];

  for (const [foreground, background, label] of cases) {
    it(`${label}：${foreground} 在 ${background} 上`, () => {
      expect(contrast(darkToken(foreground), darkToken(background))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('品牌綠色不隨主題改變', () => {
  it('深色的 --hx-brand-green 與淺色相同（只作點綴，不重新配色）', () => {
    expect(darkToken('--hx-brand-green')).toBe(light.get('--hx-brand-green'));
  });
});
