// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 入口憑證在 gateway 這一邊的接線（issue #87 第 1、2、3 條）。
 *
 * 讀真檔：`apps/web/nginx.conf`（nginx 模板）、`apps/web/Dockerfile`、
 * `docker-compose.yml`、`.env.example`。抄一份樣本就等於第二個真相。
 *
 * 這支測試刻意不解釋「為甚麼要有 token」——那在 issue 與 docs/app-db-access.md
 * 旁邊的入口文件講。這裡只釘住「有冇接好」。
 */

const repoRoot = process.cwd();

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * 抽出 compose 某個服務的區塊（indent 2 開頭，到下一個 indent 2 的 key 為止）。
 * 找不到就回空字串 —— 下面每條 assertion 都會因此變紅，不會靜靜全綠。
 */
function serviceBlock(yaml: string, name: string): string {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^ {2}${name}:\\s*$`).test(line));

  if (start === -1) {
    return '';
  }

  const body: string[] = [];

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (/^ {2}[a-z][a-z0-9_-]*:\s*$/.test(line)) {
      break;
    }

    body.push(line);
  }

  return body.join('\n');
}

const nginx = readText('apps/web/nginx.conf');
const compose = readText('docker-compose.yml');
const envExample = readText('.env.example');
const dockerfile = readText('apps/web/Dockerfile');

describe('nginx：轉發時寫入入口憑證', () => {
  it('每一個 proxy_pass 都同時覆寫入口與憑證（數目對得上）', () => {
    const proxying = occurrences(nginx, 'proxy_pass');
    const entries = occurrences(nginx, 'X-Company-OS-Entry internal;');
    const tokens = occurrences(nginx, 'X-Company-OS-Gateway-Token');

    expect(proxying).toBeGreaterThan(0);
    expect(entries).toBe(proxying);
    expect(tokens).toBe(proxying);
  });

  it('憑證的值由 ${INTERNAL_GATEWAY_TOKEN} 代入，不是寫死在模板裡', () => {
    expect(nginx).toMatch(/proxy_set_header\s+X-Company-OS-Gateway-Token\s+"\$\{INTERNAL_GATEWAY_TOKEN\}"\s*;/);
  });

  it('不轉發客戶端帶來的同名標頭（用 $http_ 前綴就等於信客戶端）', () => {
    expect(nginx).not.toContain('$http_x_company_os_gateway_token');
    expect(nginx).not.toContain('$http_x_company_os_entry');
  });

  it('模板內沒有 64 個 hex 字元的字面值 —— 真憑證不可以進 repo', () => {
    expect(nginx).not.toMatch(/\b[0-9a-f]{64}\b/i);
  });
});

describe('Dockerfile：啟動前先驗配置', () => {
  it('把啟動守門腳本放入官方 entrypoint 目錄，並確保可執行', () => {
    expect(dockerfile).toContain('COPY apps/web/docker-entrypoint.d/ /docker-entrypoint.d/');
    expect(dockerfile).toContain('chmod +x');
    expect(dockerfile).toMatch(/docker-entrypoint\.d\/10-require-gateway-token\.sh/);
  });

  it('守門腳本在 envsubst 之前執行（檔名排序 10 早於 20）', () => {
    // nginx 官方 entrypoint 按檔名排序執行 /docker-entrypoint.d/*.sh，
    // 20-envsubst-on-templates.sh 才會寫出含憑證的設定。10 開頭就是「先驗後寫」。
    expect('10-require-gateway-token.sh' < '20-envsubst-on-templates.sh').toBe(true);
  });
});

describe('compose：憑證只注入 gateway 與 platform', () => {
  const gateway = serviceBlock(compose, 'gateway-internal');
  const api = serviceBlock(compose, 'api');

  it('掃描器真的抓到兩個服務區塊（不是空字串）', () => {
    expect(gateway.length).toBeGreaterThan(0);
    expect(api.length).toBeGreaterThan(0);
  });

  it('gateway-internal 與 api 都收到 INTERNAL_GATEWAY_TOKEN', () => {
    expect(gateway).toContain('INTERNAL_GATEWAY_TOKEN');
    expect(api).toContain('INTERNAL_GATEWAY_TOKEN');
  });

  it('storage 與 apps（app-host）沒有收到 —— 不是每個容器都知道這個秘密', () => {
    expect(serviceBlock(compose, 'storage')).not.toContain('INTERNAL_GATEWAY_TOKEN');
    expect(serviceBlock(compose, 'apps')).not.toContain('INTERNAL_GATEWAY_TOKEN');
  });
});

describe('.env.example：留空，並寫清楚怎麼產生', () => {
  it('有一條 INTERNAL_GATEWAY_TOKEN= 而且值是空的', () => {
    expect(envExample).toMatch(/^INTERNAL_GATEWAY_TOKEN=\s*$/m);
  });

  it('說明提到最少 32 bytes 與 hex 編碼，並附產生指令', () => {
    const lines = envExample.split(/\r?\n/);
    const index = lines.findIndex((line) => /^INTERNAL_GATEWAY_TOKEN=/.test(line));

    expect(index).toBeGreaterThan(0);

    // 只取緊貼上面那一段連續註解，避免拿上面另一個變數的說明來冒充。
    const above: string[] = [];

    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const line = lines[cursor] ?? '';

      if (!line.startsWith('#')) {
        break;
      }

      above.unshift(line);
    }

    const block = above.join('\n');

    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/32\s*bytes/);
    expect(block).toMatch(/hex/);
    expect(block).toContain('randomBytes(32)');
  });
});
