import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Frame／Chrome token 閘門（issue #154，F-02P）。
 *
 * 呢張只准「新增」token：既有淺色 token 一個名一個值都唔可以改，
 * 深色區塊喺本輪 light-only 降級下維持原狀。每一個新名都要同時喺
 * tokens.css 定義、並由 src/index.ts 嘅 tokenVar 引用，否則 CSS 會靜默失效。
 *
 * issue 159 退役舊綠色：淺色同深色兩區塊嘅 --hx-brand-green 定義同
 * src/index.ts 嘅 brandGreen 一併移除；凍結快照同步剔除呢一個名，
 * 其餘凍結值一個字都唔改。
 *
 * 深色對等測試同深色 WCAG 屬 DEFERRED (dark UI)，唔喺本檔斷言。
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(packageRoot, 'src/tokens.css'), 'utf8');
const indexSource = readFileSync(resolve(packageRoot, 'src/index.ts'), 'utf8');

/** 只讀指定選擇器底嘅 token，唔好掃全檔，否則深色值會蓋住淺色基準。 */
function tokensOf(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u').exec(css);

  if (match === null) {
    throw new Error(`tokens.css 找不到 ${selector} 的區塊`);
  }

  const tokens = new Map<string, string>();

  for (const line of (match[1] as string).split(/\r?\n/)) {
    const hit = /^\s*(--hx-[a-z0-9-]+)\s*:\s*(.+?);\s*$/.exec(line);

    if (hit !== null) {
      tokens.set(hit[1] as string, (hit[2] as string).replace(/\s+/g, ' ').trim());
    }
  }

  return tokens;
}

const light = tokensOf(':root');
const dark = tokensOf(":root[data-theme='dark']");

/** 合併前（#156 merge SHA 22005ac）既有淺色 token 嘅凍結快照；除咗 issue 159 退役嘅 --hx-brand-green 之外，一個字都唔可以改。 */
const frozenLight: Record<string, string> = {
  '--hx-bg-primary': '#ffffff',
  '--hx-bg-secondary': '#f5f5f7',
  '--hx-bg-tertiary': '#e8e8ed',
  '--hx-text-primary': '#1d1d1f',
  '--hx-text-secondary': '#68686c',
  '--hx-accent': '#000000',
  '--hx-accent-hover': '#1d1d1f',
  '--hx-accent-text': '#ffffff',
  '--hx-border': '#d2d2d7',
  '--hx-border-light': '#e8e8ed',
  '--hx-hairline': 'rgba(0, 0, 0, 0.12)',
  '--hx-fill-quaternary': 'rgba(0, 0, 0, 0.04)',
  '--hx-fill-tertiary': 'rgba(0, 0, 0, 0.06)',
  '--hx-danger': '#ff3b30',
  '--hx-danger-text': '#d70015',
  '--hx-warning': '#ff9500',
  '--hx-success': '#34c759',
  '--hx-floating-bg': 'rgba(255, 255, 255, 0.82)',
  '--hx-floating-blur': 'saturate(160%) blur(14px)',
  '--hx-scrim': 'rgba(0, 0, 0, 0.32)',
  '--hx-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)',
  '--hx-shadow-md': '0 4px 16px rgba(0, 0, 0, 0.08)',
  '--hx-shadow-lg': '0 12px 40px rgba(0, 0, 0, 0.12)',
  '--hx-radius-sm': '8px',
  '--hx-radius-md': '12px',
  '--hx-radius-lg': '16px',
  '--hx-radius-xl': '20px',
  '--hx-size-control': '36px',
  '--hx-size-touch': '44px',
  '--hx-size-bar-control': '38px',
  '--hx-size-toolbar': '52px',
  '--hx-size-subbar': '46px',
  '--hx-size-sidebar': '300px',
  '--hx-size-page-max': '1080px',
  '--hx-space-1': '4px',
  '--hx-space-2': '8px',
  '--hx-space-3': '12px',
  '--hx-space-4': '16px',
  '--hx-space-5': '20px',
  '--hx-space-6': '24px',
  '--hx-space-7': '32px',
  '--hx-space-8': '40px',
  '--hx-font-family': '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
  '--hx-font-mono': 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
  '--hx-font-title': '700 28px/34px var(--hx-font-family)',
  '--hx-font-headline': '600 17px/22px var(--hx-font-family)',
  '--hx-font-body': '400 17px/22px var(--hx-font-family)',
  '--hx-font-callout': '400 16px/21px var(--hx-font-family)',
  '--hx-font-subheadline': '400 15px/20px var(--hx-font-family)',
  '--hx-font-footnote': '400 13px/18px var(--hx-font-family)',
  '--hx-font-caption': '400 12px/16px var(--hx-font-family)',
  '--hx-font-eyebrow': '500 11px/16px var(--hx-font-family)',
  '--hx-tracking-tight': '-0.01em',
  '--hx-motion-fast': '0.12s',
  '--hx-motion-base': '0.15s',
  '--hx-ease': 'cubic-bezier(0.2, 0, 0, 1)',
};

/** 合併前深色區塊嘅凍結快照：除咗 issue 159 退役嘅 --hx-brand-green 之外，本輪唔加、唔改任何深色 token。 */
const frozenDark: Record<string, string> = {
  '--hx-bg-primary': '#000000',
  '--hx-bg-secondary': '#1c1c1e',
  '--hx-bg-tertiary': '#2c2c2e',
  '--hx-text-primary': '#f5f5f7',
  '--hx-text-secondary': '#a1a1a6',
  '--hx-accent': '#ffffff',
  '--hx-accent-hover': '#e5e5ea',
  '--hx-accent-text': '#000000',
  '--hx-border': '#38383a',
  '--hx-border-light': '#2c2c2e',
  '--hx-hairline': 'rgba(255, 255, 255, 0.16)',
  '--hx-fill-quaternary': 'rgba(255, 255, 255, 0.04)',
  '--hx-fill-tertiary': 'rgba(255, 255, 255, 0.08)',
  '--hx-danger': '#ff453a',
  '--hx-danger-text': '#ff7a70',
  '--hx-warning': '#ffa726',
  '--hx-success': '#30d158',
  '--hx-floating-bg': 'rgba(28, 28, 30, 0.82)',
  '--hx-floating-blur': 'saturate(160%) blur(14px)',
  '--hx-scrim': 'rgba(0, 0, 0, 0.5)',
  '--hx-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.5)',
  '--hx-shadow-md': '0 4px 16px rgba(0, 0, 0, 0.5)',
  '--hx-shadow-lg': '0 12px 40px rgba(0, 0, 0, 0.6)',
};

/**
 * 新增 token 嘅淺色值。
 *
 * `--hx-frame-*` 八個值直接抄 #154 範圍第 4 節表格；
 * `--hx-chrome-*` 六個值交接文件冇列，由 repo 內 Ardot 匯出嘅
 * docs/design/frame/*.png 逐像素取樣得出（#FFFFFF／#191919／#6E6E6E／
 * #A3A3A3／#E1E4E8／#F0F1F3），同交接文件第 2.10 節 Frame Tokens
 * 色票完全一致；`--hx-chrome-selected` 另由第 2.3 節明訂 #F0F1F3。
 * 全部係可量度嘅既有色票，唔係自行調色。
 */
const added: Record<string, string> = {
  '--hx-frame-accent': '#0057ff',
  '--hx-frame-accent-fg': '#0057ff',
  '--hx-frame-accent-soft': '#eaf0ff',
  '--hx-frame-ink': '#191919',
  '--hx-frame-secondary': '#6e6e6e',
  '--hx-frame-muted': '#a3a3a3',
  '--hx-frame-border': '#e1e4e8',
  '--hx-frame-surface': '#f5f6fa',
  '--hx-chrome-selected': '#f0f1f3',
  '--hx-chrome-ink': '#191919',
  '--hx-chrome-secondary': '#6e6e6e',
  '--hx-chrome-muted': '#a3a3a3',
  '--hx-chrome-surface': '#ffffff',
  '--hx-chrome-border': '#e1e4e8',
  '--hx-chrome-white': '#ffffff',
  '--hx-frame-sidebar-width': '248px',
  '--hx-frame-sidebar-width-1024': '200px',
  '--hx-frame-sidebar-width-768': '180px',
  '--hx-chrome-bar-primary-height': '72px',
  '--hx-chrome-bar-secondary-height': '60px',
  '--hx-frame-font-ui': '400 15px/20px var(--hx-font-family)',
  '--hx-frame-font-small': '400 13px/18px var(--hx-font-family)',
  '--hx-frame-font-small-lg': '400 14px/20px var(--hx-font-family)',
  '--hx-frame-font-title': '700 40px/48px var(--hx-font-family)',
  '--hx-frame-font-subtitle': '400 17px/26px var(--hx-font-family)',
  '--hx-frame-font-card': '600 22px/30px var(--hx-font-family)',
  '--hx-frame-font-body': '400 16px/26px var(--hx-font-family)',
  '--hx-frame-size-touch': '40px',
  '--hx-frame-space-content': '56px',
  '--hx-frame-space-content-compact': '48px',
};

describe('新增 Frame／Chrome token 存在、值正確，並由 index.ts 引用', () => {
  it('淺色區塊掃描失效要紅，唔可以空集合通過', () => {
    expect(light.size).toBeGreaterThan(57);
  });

  for (const [name, value] of Object.entries(added)) {
    it(`${name} = ${value}，而且 index.ts 有 tokenVar 引用`, () => {
      expect(light.get(name)?.toLowerCase()).toBe(value.toLowerCase());
      expect(indexSource).toContain(`tokenVar('${name.slice('--hx-'.length)}')`);
    });
  }

  it('新增名全部用 --hx-frame- 或 --hx-chrome- 前綴', () => {
    for (const name of Object.keys(added)) {
      expect(/^--hx-(frame|chrome)-/.test(name)).toBe(true);
    }
  });

  it('新增嘅字級 token 自帶 font family，唔係無效 font 簡寫', () => {
    const fonts = Object.keys(added).filter((name) => name.startsWith('--hx-frame-font-'));

    expect(fonts.length).toBeGreaterThanOrEqual(6);

    for (const name of fonts) {
      expect(light.get(name)).toContain('var(--hx-font-family)');
    }
  });
});

describe('既有 token 零改動（現有畫面任何像素唔變）', () => {
  it('淺色區塊每一個既有名同值都同合併前一模一樣', () => {
    for (const [name, value] of Object.entries(frozenLight)) {
      expect(light.get(name)).toBe(value);
    }
  });

  it('冇刪走任何既有淺色 token 名', () => {
    const missing = Object.keys(frozenLight).filter((name) => !light.has(name));

    expect(missing).toEqual([]);
  });

  it('深色區塊其餘 token 維持原狀（退役綠色除外）', () => {
    expect(Object.fromEntries(dark)).toEqual(frozenDark);
  });

  it('--hx-brand-green 已退役：淺色同深色都唔再定義，index.ts 亦唔再導出 brandGreen', () => {
    expect(light.has('--hx-brand-green')).toBe(false);
    expect(dark.has('--hx-brand-green')).toBe(false);
    expect(indexSource).not.toMatch(/^\s*brandGreen\s*:/mu);
  });
});

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

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function valueOf(name: string): string {
  const value = light.get(name);

  if (value === undefined) {
    throw new Error(`tokens.css 淺色區塊冇 ${name}`);
  }

  return value;
}

describe('淺色 WCAG 2.x 對比度唔低於 4.5:1', () => {
  const cases: [string, string, string][] = [
    ['--hx-frame-ink', '--hx-frame-surface', '正文喺內容卡'],
    ['--hx-frame-secondary', '--hx-frame-surface', '次要文字喺內容卡'],
    ['--hx-frame-ink', '--hx-chrome-surface', '正文喺 chrome'],
    ['--hx-frame-secondary', '--hx-chrome-surface', '次要文字喺 chrome'],
    ['--hx-frame-accent-fg', '--hx-chrome-surface', '連結／圖示喺 chrome'],
    ['--hx-frame-accent-fg', '--hx-frame-accent-soft', '連結／圖示喺空狀態底'],
    ['--hx-frame-ink', '--hx-chrome-selected', '選中 pill 上嘅字'],
  ];

  for (const [foreground, background, label] of cases) {
    it(`${label}：${foreground} 喺 ${background} 上`, () => {
      expect(contrast(valueOf(foreground), valueOf(background))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('白字喺主要按鈕 --hx-frame-accent 上', () => {
    expect(contrast('#ffffff', valueOf('--hx-frame-accent'))).toBeGreaterThanOrEqual(4.5);
  });

  it('--hx-frame-muted 對比不足 4.5，只可以做停用或裝飾，唔可以做正文', () => {
    expect(contrast(valueOf('--hx-frame-muted'), valueOf('--hx-chrome-surface'))).toBeLessThan(4.5);
  });
});
