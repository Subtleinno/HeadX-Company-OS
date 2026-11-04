import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 外殼的靜態閘門：不需要瀏覽器，直接讀檔。
 *
 * 這些規則在 issue 裡是硬性要求（不用 emoji、色碼只在 tokens.css、
 * 綠色只給品牌標誌、要尊重 prefers-reduced-motion、nginx 要帶埠），
 * 寫成測試才不會靠人記得。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const webSrc = resolve(repoRoot, 'apps/web/src');

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

function webSource(relativePath: string): string {
  return read(resolve(webSrc, relativePath));
}

describe('apps/web/src 的檔案集合', () => {
  it('掃到檔案（掃描失效時要紅，不可以空集合通過）', () => {
    expect(sources.length).toBeGreaterThan(5);
  });
});

describe('不用 emoji', () => {
  it('apps/web/src 內任何檔案都沒有 emoji', () => {
    const offenders = sources
      .filter((file) => /[\p{Extended_Pictographic}\uFE0F]/u.test(read(file)))
      .map((file) => relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });
});

describe('色碼只在 tokens.css', () => {
  it('其他 CSS 與 TSX 沒有十六進位色碼，也沒有 rgb(／rgba(', () => {
    const offenders: string[] = [];

    for (const file of sources) {
      if (file.endsWith(join('styles', 'tokens.css'))) {
        continue;
      }

      const text = read(file);
      if (/#[0-9a-fA-F]{3,8}\b/.test(text) || /\brgba?\s*\(/.test(text)) {
        offenders.push(relative(repoRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('色碼經由 var(--hx-*) 使用，不是寫死', () => {
    const css = webSource('styles/app.css');

    expect(css).toContain('var(--hx-');
  });
});

describe('品牌綠色只給品牌標誌', () => {
  it('整個 apps/web/src 只出現一次 var(--hx-brand-green)', () => {
    // 數「出現次數」而不是「有幾個檔案」：同一個檔多寫一次也要紅。
    const occurrences = sources.flatMap((file) => {
      const matches = read(file).match(/var\(--hx-brand-green\)/g) ?? [];

      return matches.map(() => relative(repoRoot, file));
    });

    expect(occurrences).toHaveLength(1);
  });

  it('那一次在 .brand__mark 規則內，而且是 8×8 方塊', () => {
    const css = webSource('styles/app.css');
    const rule = /\.brand__mark\s*\{([^}]*)\}/.exec(css);

    expect(rule).not.toBeNull();
    expect(rule?.[1]).toContain('var(--hx-brand-green)');
    expect(rule?.[1]).toMatch(/width:\s*8px/);
    expect(rule?.[1]).toMatch(/height:\s*8px/);
  });
});

describe('動效與焦點', () => {
  it('有 prefers-reduced-motion: reduce 的規則，並關掉 transition 與 animation', () => {
    const css = webSource('styles/app.css');
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\})/.exec(css);

    expect(block).not.toBeNull();
    expect(block?.[1]).toMatch(/transition:\s*none/);
    expect(block?.[1]).toMatch(/animation:\s*none/);
  });

  it('每個互動元素都有 focus ring（2px 實線、offset 2px）', () => {
    const css = webSource('styles/app.css');

    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--hx-[a-z-]+\)/);
    expect(css).toMatch(/outline-offset:\s*2px/);
  });
});

describe('不下載字體', () => {
  it('src 不再 import @fontsource', () => {
    const offenders = sources
      .filter((file) => read(file).includes('@fontsource'))
      .map((file) => relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });

  it('index.html 沒有連到外部字體', () => {
    const html = read(resolve(repoRoot, 'apps/web/index.html'));

    expect(html.includes('fonts.googleapis.com')).toBe(false);
    expect(html.includes('fonts.gstatic.com')).toBe(false);
  });
});

describe('nginx 轉發', () => {
  const nginx = read(resolve(repoRoot, 'apps/web/nginx.conf'));

  it('把瀏覽器的 Host（含埠）傳給 api，否則所有 POST 都會 403 bad_origin', () => {
    expect(nginx).toMatch(/proxy_set_header\s+Host\s+\$http_host;/);
    expect(nginx).not.toMatch(/proxy_set_header\s+Host\s+\$host;/);
  });

  it('上游由 API_UPSTREAM 決定，不是寫死 api:4420', () => {
    expect(nginx).toContain('proxy_pass http://${API_UPSTREAM}/;');
    expect(nginx).not.toContain('proxy_pass http://api:4420/;');
  });

  it('/healthz 行為不變', () => {
    expect(nginx).toMatch(/location = \/healthz\s*\{[\s\S]*?return 200 "ok\\n";/);
  });

  it('Dockerfile 用 nginx 官方映像的 templates 機制，並給 API_UPSTREAM 預設值', () => {
    const dockerfile = read(resolve(repoRoot, 'apps/web/Dockerfile'));

    expect(dockerfile).toContain(
      'COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template',
    );
    expect(dockerfile).toMatch(/ENV API_UPSTREAM=api:4420/);
  });
});
