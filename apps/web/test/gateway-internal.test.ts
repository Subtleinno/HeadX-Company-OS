// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * gateway-internal 的靜態契約（issue #78）。
 *
 * 這一組讀真正的 `apps/web/nginx.conf`、`docker-compose.yml` 與 `.env.example`，
 * 不是讀一份抄出來的樣本 —— 抄一份就等於第二個真相，改完真檔而樣本沒改，測試照樣綠。
 *
 * 每一條都配一個「掃描失效就會紅」的斷言（例如「找到幾個 location」），
 * 因為解析器回空集合時，`for` 迴圈一條都不會檢查，看起來全綠。
 */

const repoRoot = process.cwd();

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

type Block = { header: string; body: string };

/** 抽出 nginx 內所有 `location … { … }` 區塊（用大括號深度計數，不用正則硬套）。 */
export function locationBlocks(conf: string): Block[] {
  const blocks: Block[] = [];
  const lines = conf.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const header = (lines[index] ?? '').trim();
    if (!/^location\s+\S+.*\{$/.test(header)) {
      continue;
    }

    const body: string[] = [];
    let depth = 1;
    let cursor = index + 1;

    for (; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? '';
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      if (depth <= 0) {
        break;
      }
      body.push(line);
    }

    blocks.push({ header, body: body.join('\n') });
    index = cursor;
  }

  return blocks;
}

/** compose 檔內 indent 2 的服務名。 */
export function composeServices(yaml: string): string[] {
  const services: string[] = [];
  let inServices = false;

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inServices = /^services:\s*$/.test(trimmed);
      continue;
    }

    if (inServices && indent === 2 && /^[a-z][a-z0-9_-]*:\s*$/.test(trimmed)) {
      services.push(trimmed.slice(0, -1));
    }
  }

  return services;
}

const nginx = readText('apps/web/nginx.conf');
const compose = readText('docker-compose.yml');
const envExample = readText('.env.example');

describe('nginx.conf：入口標記', () => {
  const locations = locationBlocks(nginx);
  const proxying = locations.filter((block) => block.body.includes('proxy_pass'));

  it('掃描器真的找到 location，而且有一個轉發去後端', () => {
    expect(locations.length).toBeGreaterThan(0);
    expect(proxying.length).toBeGreaterThan(0);
  });

  it('每一個轉發的 location 都覆寫 X-Company-OS-Entry 為 internal', () => {
    for (const block of proxying) {
      expect(block.body, block.header).toMatch(
        /proxy_set_header\s+X-Company-OS-Entry\s+"?internal"?\s*;/,
      );
    }
  });

  it('不需要轉發的 location（例如 /healthz）不必帶入口標記', () => {
    const healthz = locations.find((block) => block.header.includes('/healthz'));
    expect(healthz).toBeDefined();
    expect(healthz?.body).not.toContain('X-Company-OS-Entry');
  });

  it('不採用客戶端帶來的入口值（不可轉發 $http_x_company_os_entry）', () => {
    expect(nginx.toLowerCase()).not.toContain('$http_x_company_os_entry');
  });
});

describe('nginx.conf：回應標頭', () => {
  const HEADERS: { name: string; value: string }[] = [
    { name: 'X-Content-Type-Options', value: 'nosniff' },
    { name: 'X-Frame-Options', value: 'DENY' },
    { name: 'Referrer-Policy', value: 'same-origin' },
  ];

  it('三個標頭都存在，而且都帶 always（404 與 5xx 都要有）', () => {
    for (const header of HEADERS) {
      const pattern = new RegExp(
        `add_header\\s+${header.name}\\s+"?${header.value}"?\\s+always\\s*;`,
        'i',
      );
      expect(nginx, header.name).toMatch(pattern);
    }
  });

  it('本張不加 Content-Security-Policy（會涉及 Vite 輸出，另案處理）', () => {
    // 只看真正的指令；註釋提到這個名字是說明「為甚麼不加」，不算加了。
    expect(nginx).not.toMatch(/^\s*add_header\s+Content-Security-Policy/mi);
  });
});

describe('nginx.conf：原有行為不變', () => {
  it('/healthz 仍然是 200 ok', () => {
    expect(nginx).toMatch(/location\s+=\s+\/healthz\s*\{/);
    expect(nginx).toMatch(/return\s+200\s+"?ok\\n"?\s*;/);
  });

  it('上傳上限仍然是 200m', () => {
    expect(nginx).toMatch(/client_max_body_size\s+200m\s*;/);
  });

  it('API 上游仍然由 API_UPSTREAM 模板變數決定', () => {
    expect(nginx).toMatch(/proxy_pass\s+http:\/\/\$\{API_UPSTREAM\}\//);
  });

  it('Host 仍然帶埠（$http_host），否則 CSRF 的 Origin 檢查會誤判', () => {
    expect(nginx).toMatch(/proxy_set_header\s+Host\s+\$http_host\s*;/);
  });

  it('X-Real-IP、X-Forwarded-For、X-Forwarded-Proto 不變', () => {
    expect(nginx).toMatch(/proxy_set_header\s+X-Real-IP\s+\$remote_addr\s*;/);
    expect(nginx).toMatch(/proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for\s*;/);
    expect(nginx).toMatch(/proxy_set_header\s+X-Forwarded-Proto\s+\$scheme\s*;/);
  });

  it('靜態檔案與 SPA fallback 不變', () => {
    expect(nginx).toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html\s*;/);
  });
});

describe('docker-compose.yml：服務改名', () => {
  const services = composeServices(compose);

  it('掃描器讀到多個服務（不是空集合）', () => {
    expect(services.length).toBeGreaterThan(3);
  });

  it('不再有名為 web 的服務', () => {
    expect(services).not.toContain('web');
  });

  it('有 gateway-internal 服務', () => {
    expect(services).toContain('gateway-internal');
  });

  it('端口用新變數，並保留舊名作後備（${GATEWAY_INTERNAL_PORT:-${WEB_PORT:-4210}}）', () => {
    expect(compose).toContain('127.0.0.1:${GATEWAY_INTERNAL_PORT:-${WEB_PORT:-4210}}:80');
  });
});

describe('.env.example：端口變數改名', () => {
  it('用新名稱 GATEWAY_INTERNAL_PORT，值仍然是 4210', () => {
    expect(envExample).toMatch(/^GATEWAY_INTERNAL_PORT=4210$/m);
  });

  it('不再有舊名稱 WEB_PORT', () => {
    expect(envExample).not.toMatch(/^WEB_PORT=/m);
  });
});
