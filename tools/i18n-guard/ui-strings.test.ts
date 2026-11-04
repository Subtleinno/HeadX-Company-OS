import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * i18n 守門測試（issue #73 要做 3／驗收 5）。
 *
 * 規則：apps/web/src、packages/ui-kit/src、packages/app-shell/src 之内，
 * 註解以外不可以再出現中文介面文字 —— 所有給人看的字都要來自 @company-os/i18n。
 *
 * 為什麼要自己掃描而不是簡單 grep：這個 repo 的註解全部是中文，直接搜「有沒有中文」
 * 會把「// 一改動就收起錯誤」這種註解也當成違規。所以先逐字掃描把註解去掉
 * （同時正確處理字串內的 `//` 與 `/*`），剩下的才是真正會出現在畫面上的內容。
 *
 * 沒有用「大範圍排除檔案」來讓它變綠：排除清單只有一個，就是 i18n 的字串表本身
 * （那是唯一應該有中文的地方，而且它在 packages/i18n，本來就不在掃描範圍內）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

/** 要掃描的原始碼目錄（相對 repo 根）。 */
const SCAN_DIRS = ['apps/web/src', 'packages/ui-kit/src', 'packages/app-shell/src'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

/** 中日韓統一字元（含擴充 A）。 */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(full);
    }
  }

  return files;
}

/**
 * 去掉註解，保留字串與 JSX 文字。
 *
 * 逐字掃描：只有在「不在字串內」時，`//` 與 `/*` 才開始一段註解。
 * 字串內的 `//`（例如網址）因此不會被誤刪。
 */
function stripComments(source: string): string {
  let out = '';
  let index = 0;
  let quote: string | null = null;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (quote !== null) {
      out += char;

      if (char === '\\') {
        out += next ?? '';
        index += 2;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
    }

    out += char;
    index += 1;
  }

  return out;
}

type Violation = { file: string; line: number; text: string };

function findHardcodedChinese(files: string[]): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    const stripped = stripComments(readFileSync(file, 'utf8'));
    const lines = stripped.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (CJK.test(line)) {
        violations.push({
          file: relative(repoRoot, file).replace(/\\/g, '/'),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }

  return violations;
}

describe('i18n 守門：介面文字只可以來自字串表', () => {
  it('掃到檔案（掃描失效時要紅，不可以空集合通過）', () => {
    const files = SCAN_DIRS.flatMap((dir) => listSourceFiles(resolve(repoRoot, dir)));

    expect(files.length).toBeGreaterThan(10);
  });

  it('apps/web/src、ui-kit、app-shell 之内沒有寫死的中文介面文字', () => {
    const files = SCAN_DIRS.flatMap((dir) => listSourceFiles(resolve(repoRoot, dir)));
    const violations = findHardcodedChinese(files);

    expect(
      violations.map((violation) => `${violation.file}:${String(violation.line)} ${violation.text}`),
    ).toEqual([]);
  });

  it('註解內的中文不算違規（證明不是「見中文就咬」）', () => {
    const files = [
      // 這個檔案本身就是反例：它的註解全是中文，而它不在掃描範圍內。
      join(here, 'ui-strings.test.ts'),
    ];

    // 直接驗 stripComments 的行為：註解被去掉，字串被保留。
    const stripped = stripComments('// 這是註解\nconst a = "文字";\n/* 也是註解 */');

    expect(CJK.test(stripped)).toBe(true);
    expect(stripped).not.toContain('這是註解');
    expect(stripped).not.toContain('也是註解');
    expect(files.length).toBe(1);
  });
});
