import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Frame 外殼版面嘅靜態閘門（議題 158，取代 base-shell-layout.test.ts）。
 *
 * 規格要求「畫面佔滿視窗，唔用置中 dashboard 卡片網格」，呢件事唔可以用
 * 單元測試假裝驗到，所以直接讀 frame.css：幾何寫死喺一個地方，走樣就紅。
 *
 * 亦守住三條紀律：零十六進位色碼、零 rgb( / rgba(、唔用 overflow: hidden
 * 或收起捲軸去遮導覽；以及品牌綠色同品牌標誌方塊喺 apps/web/src 零出現。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const webSrc = resolve(repoRoot, 'apps/web/src');
const css = readFileSync(resolve(webSrc, 'styles/frame.css'), 'utf8');

function listFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else {
      files.push(full);
    }
  }

  return files;
}

const sources = listFiles(webSrc).filter((file) => ['.ts', '.tsx', '.css'].includes(extname(file)));

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** 由 CSS 取出某個選擇器嘅宣告區塊（只支援單層大括號，足夠應付本檔）。 */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n|\\})(?:[ \\t]*)${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css);

  if (match === null) {
    throw new Error(`frame.css 找不到 ${selector} 的規則`);
  }

  return match[1] as string;
}

describe('frame.css 存在', () => {
  it('讀到內容，唔係空檔', () => {
    expect(css.length).toBeGreaterThan(100);
  });
});

describe('frame.css 只用 token', () => {
  it('無十六進位色碼', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('無 rgb( 或 rgba(', () => {
    expect(css).not.toMatch(/\brgba?\s*\(/);
  });

  it('有 var(--hx-frame-*) 同 var(--hx-chrome-*)', () => {
    expect(css).toContain('var(--hx-frame-');
    expect(css).toContain('var(--hx-chrome-');
  });
});

describe('唔用 overflow: hidden 遮導覽', () => {
  it('frame.css 零出現 overflow: hidden', () => {
    expect(css).not.toMatch(/overflow(-[xy])?:\s*hidden/);
  });

  it('唔收起捲軸', () => {
    expect(css).not.toMatch(/scrollbar-width:\s*none/);
  });
});

describe('三斷點幾何', () => {
  it('側欄 248 / 200 / 180px 三個 token 都有用', () => {
    expect(css).toContain('var(--hx-frame-sidebar-width)');
    expect(css).toContain('var(--hx-frame-sidebar-width-1024)');
    expect(css).toContain('var(--hx-frame-sidebar-width-768)');
  });

  it('頂欄 72px、第二層 60px、頁尾 44px', () => {
    expect(css).toMatch(/\.frame-topbar\s*\{[^}]*height:\s*var\(--hx-chrome-bar-primary-height\)/);
    expect(css).toMatch(/\.frame-subbar\s*\{[^}]*height:\s*var\(--hx-chrome-bar-secondary-height\)/);
    expect(css).toMatch(/\.frame-footer\s*\{[^}]*height:\s*var\(--hx-size-touch\)/);
  });

  it('1024 與 768 兩個 media 斷點都在', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*1180px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)/);
  });
});

describe('外殼幾何', () => {
  it('.frame-shell 係 grid，撐滿視窗，唔用 overflow: hidden 收起內容', () => {
    const rule = block('.frame-shell');

    expect(rule).toMatch(/display:\s*grid/);
    expect(rule).toMatch(/min-height:\s*100dvh/);
    expect(rule).not.toMatch(/overflow:\s*hidden/);
  });

  it('.frame-body 係「子頁導覽 ＋ 主內容」兩欄', () => {
    const rule = block('.frame-body');

    expect(rule).toMatch(/display:\s*grid/);
    expect(rule).toMatch(/grid-template-columns:/);
  });

  it('主內容靠左排，唔做置中卡片', () => {
    const rule = block('.frame-content');

    expect(rule).not.toMatch(/justify-content:\s*center/);
    expect(rule).not.toMatch(/margin:\s*0\s+auto/);
    expect(rule).not.toMatch(/margin-inline:\s*auto/);
  });
});

describe('設計紀律', () => {
  it('無 emoji', () => {
    expect(/[\p{Extended_Pictographic}\uFE0F]/u.test(css)).toBe(false);
  });

  it('尊重 prefers-reduced-motion', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

describe('帳戶與公司名如實顯示（不渲染頭像／不用首字 fallback）', () => {
  it('frame.css 把外殼寫死嘅首字頭像同公司標誌字標全部隱藏', () => {
    // 共用外殼（packages，本張唔改）會輸出 frame-avatar 與
    // frame-mark／frame-mark__initial；本張只擁有 CSS，用 display: none
    // 令佢哋完全唔顯示。移除呢條規則就要紅，唔可以畫返個假頭像或假 Logo。
    const hide = /\.frame-avatar,\s*\.frame-mark,\s*\.frame-mark__initial\s*\{([^}]*)\}/u.exec(css);

    expect(hide).not.toBeNull();
    expect(hide?.[1]).toMatch(/display:\s*none/);
  });

  it('frame-avatar 同 frame-mark__initial 無可見嘅背景／尺寸樣式', () => {
    // 唔可以一邊 display: none、一邊又畀返個圓形背景，否則移除隱藏就即刻破版。
    expect(css).not.toMatch(/\.frame-avatar\s*\{[^}]*background:/);
    expect(css).not.toMatch(/\.frame-mark__initial\s*\{[^}]*background:/);
  });
});

describe('綠色零出現', () => {
  it('apps/web/src 內 brand__mark 同 var(--hx-brand-green) 零出現', () => {
    const offenders = sources
      .filter((file) => {
        const text = read(file);

        return text.includes('brand__mark') || text.includes('var(--hx-brand-green)');
      })
      .map((file) => relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });
});
