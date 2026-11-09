import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeVarRefs, envExampleKeys } from './env-vars.mjs';
import {
  DEMO_BUCKET,
  DEMO_DATABASE,
  DEMO_PROJECT,
  REAL_PORTS,
  auditDemoConfig,
  auditDemoLocalConfig,
} from './demo-stack.mjs';

/**
 * Demo Public Stack 的隔離契約（issue #145／決策 C52）。
 *
 * 這支測試守兩件事：
 *   1. 真檔的形狀（compose、env 範本、文件）沒有退化 —— 不需要 docker。
 *   2. 檢查器本身咬得住 —— 用明顯壞掉的設定餵它，必須紅，而且紅在正確那一項。
 *
 * 第 2 點是重點。一個「永遠回空陣列」的檢查器會令第 1 點全綠而毫無意義，
 * 所以每個違規都要有一條對應的突變測試。
 */

const repoRoot = process.cwd();

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

/** 去掉整行註解。註解會提及 `ports:`、`--url` 等字，不應該當成設定。 */
function withoutComments(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
}

const composeText = readText('docker-compose.demo.yml');
const localText = readText('docker-compose.demo.local.yml');
const envText = readText('.env.demo.example');
const realComposeText = readText('docker-compose.yml');

describe('docker-compose.demo.yml：公開組合的形狀', () => {
  it('project name 寫死在檔內，不靠 -p', () => {
    expect(composeText).toMatch(/^name: company-os-demo$/m);
  });

  it('完全沒有 ports：主機上一個端口都不開', () => {
    const hits = withoutComments(composeText).filter((line) => /^\s*ports:/.test(line));

    expect(hits).toEqual([]);
  });

  it('沒有 bind mount（只可以 named volume）', () => {
    const hits = withoutComments(composeText).filter((line) => /^\s*-\s*\.{0,2}\//.test(line));

    expect(hits).toEqual([]);
  });

  it('用與正式 stack 相同的 Dockerfile 建置（同一個映像定義，不是另一份程式）', () => {
    expect(composeText).toContain('dockerfile: apps/platform/Dockerfile');
    expect(composeText).toContain('dockerfile: apps/web/Dockerfile');
    expect(realComposeText).toContain('dockerfile: apps/platform/Dockerfile');
    expect(realComposeText).toContain('dockerfile: apps/web/Dockerfile');
  });

  it('cloudflared 用固定版本，不用 latest', () => {
    const image = /image:\s*(cloudflare\/cloudflared:[^\s]+)/.exec(composeText)?.[1] ?? '';

    expect(image).not.toBe('');
    expect(image.endsWith(':latest')).toBe(false);
  });

  it('cloudflared 的 command 沒有 --url（路由只由 Cloudflare 遠端設定決定）', () => {
    const lines = withoutComments(composeText);

    expect(lines.some((line) => line.includes('--url'))).toBe(false);
  });

  it('五個服務，不多不少（多一個就可能多一道沒人看的門）', () => {
    const services = withoutComments(composeText)
      .map((line) => /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined && name !== 'volumes')
      .sort();

    expect(services).toEqual(['api', 'cloudflared', 'db', 'gateway-internal', 'storage']);
  });

  it('沒有 apps 容器（六個 app 全部 available:false，起一個空容器只會誤導）', () => {
    expect(withoutComments(composeText).some((line) => /^ {2}apps:\s*$/.test(line))).toBe(false);
  });
});

describe('.env.demo.example：範本不可以有可用的 secret', () => {
  const keys = envExampleKeys(envText);

  it('compose 用到的每個變數都寫進範本', () => {
    const documented = new Set(keys.map((item) => item.key));
    const missing = composeVarRefs(composeText)
      .filter((item) => !documented.has(item.name))
      .map((item) => `${item.name}（第 ${item.line} 行）`);

    expect(missing).toEqual([]);
  });

  it('本機 override 用到的每個變數也寫進範本', () => {
    const documented = new Set(keys.map((item) => item.key));
    const missing = composeVarRefs(localText)
      .filter((item) => !documented.has(item.name))
      .map((item) => `${item.name}（第 ${item.line} 行）`);

    expect(missing).toEqual([]);
  });

  it('密碼、token、HMAC key 全部留空', () => {
    const secrets = [
      'DEMO_POSTGRES_PASSWORD',
      'DEMO_MINIO_ROOT_PASSWORD',
      'DEMO_LOGIN_FAILURE_HASH_KEY',
      'DEMO_INTERNAL_GATEWAY_TOKEN',
      'DEMO_CLOUDFLARE_TUNNEL_TOKEN',
    ];
    const active = new Map(
      keys.filter((item) => !item.commented).map((item) => [item.key, item.line]),
    );
    const values = new Map(
      withoutComments(envText)
        .map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim()))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => [match[1], match[2]]),
    );

    for (const name of secrets) {
      expect(active.has(name), `${name} 應該在範本內（有效行，不是註解）`).toBe(true);
      expect(values.get(name), `${name} 必須留空`).toBe('');
    }
  });

  it('資料庫名與 bucket 名都與正式不同', () => {
    expect(envText).toContain(`DEMO_POSTGRES_DB=${DEMO_DATABASE}`);
    expect(envText).toContain(`DEMO_MINIO_BUCKET=${DEMO_BUCKET}`);

    // 正式 stack 的預設值不可以出現在 Demo 範本的「有效值」之中。
    const active = withoutComments(envText).join('\n');

    expect(active).not.toMatch(/^POSTGRES_DB=company_os$/m);
    expect(active).not.toMatch(/^MINIO_BUCKET=company-os$/m);
  });

  it('本機除錯端口不與正式 stack 的端口重複', () => {
    for (const name of [
      'DEMO_GATEWAY_INTERNAL_PORT',
      'DEMO_API_PORT',
      'DEMO_DB_PORT',
      'DEMO_MINIO_API_PORT',
      'DEMO_MINIO_CONSOLE_PORT',
    ]) {
      const value = new RegExp(`^${name}=(\\d+)$`, 'm').exec(envText)?.[1];

      expect(value, `${name} 應該有具體預設值`).toBeDefined();
      expect(REAL_PORTS).not.toContain(Number(value));
    }
  });
});

describe('docker-compose.demo.local.yml：除錯端口只綁 loopback', () => {
  it('每個端口都綁 127.0.0.1，而且用 DEMO_ 變數', () => {
    const ports = withoutComments(localText).filter((line) => /^\s*-\s*"/.test(line));

    expect(ports.length).toBeGreaterThan(0);

    for (const line of ports) {
      expect(line).toContain('127.0.0.1:${DEMO_');
    }
  });
});

describe('文件：契約寫得明，不是靠人記得', () => {
  const deployment = readText('docs/deployment/demo-public-stack.md');
  const index = readText('docs/INDEX.md');
  const agents = readText('AGENTS.md');
  const decisions = readText('docs/product/DECISIONS.md');

  it('INDEX 有指向部署契約', () => {
    expect(index).toContain('docs/deployment/demo-public-stack.md');
  });

  it('契約寫明 Tunnel 只指向 Demo gateway', () => {
    expect(deployment).toContain('http://gateway-internal:80');
    expect(deployment).toMatch(/不可以填 `127\.0\.0\.1:4210`/);
  });

  it('契約寫明 Demo 帳戶與正式帳戶分開、密碼不進 repo', () => {
    expect(deployment).toContain('@demo.invalid');
    expect(deployment).toMatch(/密碼只由老闆在瀏覽器輸入|密碼只由老闆/);
    expect(deployment).toMatch(/不經 agent、不寫入 repo/);
  });

  it('契約寫明更新與清除步驟，並警告不要用 prune', () => {
    expect(deployment).toContain('down -v');
    expect(deployment).toMatch(/docker system prune/);
  });

  it('AGENTS.md 第 15 條有 Demo 例外，並指向 C52', () => {
    const item15 = agents.split(/\r?\n/).find((line) => /^15\./.test(line)) ?? '';

    expect(item15).toContain('Demo Public Stack');
    expect(item15).toContain('C52');
    // 原有的不變量不可以被順手刪掉。
    expect(item15).toContain('都不得對互聯網發佈');
  });

  it('DECISIONS 有 C52，而 C26 指向它', () => {
    expect(decisions).toContain('- C52 ');
    expect(decisions).toMatch(/C26.*（Demo Public Stack 的例外見 C52）/);
  });

  it('.gitignore 放行 .env.demo.example，但真正的 .env.demo 仍然被忽略', () => {
    const ignore = readText('.gitignore');

    expect(ignore).toContain('!.env.demo.example');
    expect(ignore).toMatch(/^\.env\.\*$/m);
  });
});

/** 一份「合法」的解析結果，逐項破壞之後看檢查器是否紅在正確那一項。 */
function validConfig(): Record<string, unknown> {
  return {
    name: DEMO_PROJECT,
    services: {
      db: {
        environment: { POSTGRES_DB: DEMO_DATABASE },
        volumes: [{ type: 'volume', source: 'db_data', target: '/var/lib/postgresql/data' }],
      },
      storage: {
        environment: {},
        volumes: [{ type: 'volume', source: 'storage_data', target: '/data' }],
      },
      api: {
        environment: {
          PGHOST: 'db',
          PGDATABASE: DEMO_DATABASE,
          MINIO_ENDPOINT: 'http://storage:9000',
          MINIO_BUCKET: DEMO_BUCKET,
        },
      },
      'gateway-internal': { environment: {} },
      cloudflared: {
        command: ['tunnel', '--no-autoupdate', 'run'],
        environment: { TUNNEL_TOKEN: '' },
      },
    },
    volumes: {
      db_data: { name: `${DEMO_PROJECT}_db_data` },
      storage_data: { name: `${DEMO_PROJECT}_storage_data` },
    },
    networks: { default: { name: `${DEMO_PROJECT}_default` } },
  };
}

type Mutable = ReturnType<typeof validConfig> & {
  services: Record<string, Record<string, unknown>>;
};

describe('突變：檢查器真的咬得住', () => {
  it('合法設定是空的（不是永遠有東西紅）', () => {
    expect(auditDemoConfig(validConfig())).toEqual([]);
  });

  it('加回一個主機端口 → 指出是哪個服務與哪個端口', () => {
    const config = validConfig() as Mutable;
    config.services.api.ports = [{ host_ip: '127.0.0.1', published: '4620', target: '4420' }];

    const violations = auditDemoConfig(config);

    expect(violations.some((item) => item.includes('api 發佈了主機端口 127.0.0.1:4620'))).toBe(true);
  });

  it('project name 改成正式的 → 紅', () => {
    const config = validConfig() as Mutable;
    config.name = 'company-os';

    expect(auditDemoConfig(config).some((item) => item.includes('project name'))).toBe(true);
  });

  it('bucket 改成正式的 → 紅', () => {
    const config = validConfig() as Mutable;
    (config.services.api.environment as Record<string, string>).MINIO_BUCKET = 'company-os';

    expect(auditDemoConfig(config).some((item) => item.includes('MINIO_BUCKET'))).toBe(true);
  });

  it('PGHOST 指向外部資料庫 → 紅', () => {
    const config = validConfig() as Mutable;
    (config.services.api.environment as Record<string, string>).PGHOST = 'host.docker.internal';

    expect(auditDemoConfig(config).some((item) => item.includes('PGHOST'))).toBe(true);
  });

  it('換成 bind mount → 紅（可能指到正式資料夾）', () => {
    const config = validConfig() as Mutable;
    config.services.storage.volumes = [{ type: 'bind', source: './.data/minio', target: '/data' }];

    expect(auditDemoConfig(config).some((item) => item.includes('Demo 只准用 named volume'))).toBe(true);
  });

  it('volume 實際名改成正式那個 → 紅', () => {
    const config = validConfig() as Mutable;
    (config.volumes as Record<string, { name: string }>).db_data.name = 'company-os_db_data';

    expect(
      auditDemoConfig(config).some((item) => item.includes('必須以 company-os-demo_ 開頭')),
    ).toBe(true);
  });

  it('少了 cloudflared → 紅（公開 Demo 的唯一入口）', () => {
    const config = validConfig() as Mutable;
    delete config.services.cloudflared;

    expect(auditDemoConfig(config).some((item) => item.includes('沒有 cloudflared'))).toBe(true);
  });

  it('cloudflared 自己寫死 --url → 紅（路由變成第二個真相）', () => {
    const config = validConfig() as Mutable;
    config.services.cloudflared.command = ['tunnel', '--url', 'http://127.0.0.1:4210', 'run'];

    expect(auditDemoConfig(config).some((item) => item.includes('--url'))).toBe(true);
  });

  it('本機組合：用了正式端口 → 紅', () => {
    const config = validConfig() as Mutable;
    config.services.api.ports = [{ host_ip: '127.0.0.1', published: '4420', target: '4420' }];

    expect(
      auditDemoLocalConfig(config).some((item) => item.includes('正式 stack 的端口 4420')),
    ).toBe(true);
  });

  it('本機組合：端口綁 0.0.0.0 → 紅', () => {
    const config = validConfig() as Mutable;
    config.services.api.ports = [{ host_ip: '0.0.0.0', published: '4620', target: '4420' }];

    expect(
      auditDemoLocalConfig(config).some((item) => item.includes('只准綁 127.0.0.1')),
    ).toBe(true);
  });

  it('本機組合：完全沒有端口 → 紅（那樣根本除錯不到）', () => {
    expect(auditDemoLocalConfig(validConfig()).some((item) => item.includes('沒有任何端口'))).toBe(
      true,
    );
  });
});
