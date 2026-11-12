import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 色值只可以住在色彩頁的 payload（issue #57 第 3 點）。
 *
 * 品牌 renderer（後端出 HTML／tokens／prompt）原本不受 `gates.test.ts` 管
 * ——那支只掃 `apps/web/src`。結果是同一個規則在一個地方守得住，在另一個
 * 地方可以靜靜寫死一個 `#DADEF8`，然後那一個色會出現在所有品牌的輸出裡。
 *
 * 這一支補上後端那一半：`brand-output` 與 contracts 的品牌模型都不准出現
 * 十六進位色碼或 `rgb()` 寫法。色值要由 payload 來；連「缺」的樣式都用
 * CSS 系統色（`Canvas`／`GrayText`），因為那不是品牌色。
 */

const ROOTS = [
  resolve(process.cwd(), 'apps/platform/src/brand-output'),
  resolve(process.cwd(), 'packages/contracts/src/brand'),
];

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RGB = /\brgba?\s*\(/;
const HSL = /\bhsla?\s*\(/;

function files(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      found.push(...files(path));
      continue;
    }

    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      found.push(path);
    }
  }

  return found;
}

describe('品牌輸出的色值紀律', () => {
  it('renderer 與品牌模型不含色值', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of files(root)) {
        const source = readFileSync(file, 'utf8');
        const lines = source.split('\n');

        lines.forEach((line, index) => {
          // 只有「整行都是註解」才放行：說明文件會舉 `#ABC` 這種格式例子，
          // 那不是畫面上的一個色。有程式碼的行一律唔准。
          const trimmed = line.trim();
          const commentOnly =
            trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');

          if (commentOnly) {
            return;
          }

          if (HEX.test(line) || RGB.test(line) || HSL.test(line)) {
            offenders.push(`${file.replace(process.cwd(), '')}:${index + 1} ${line.trim()}`);
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
