#!/usr/bin/env node
/**
 * Demo Public Stack 的隔離檢查（issue #145）。
 *
 * 只做 `docker compose config`，**不 build、不 up、不 pull**：驗的是「設定是否仍然
 * 隔離」，不是「服務是否跑得起來」。跑得起來屬於部署驗收，另見
 * docs/deployment/demo-public-stack.md。
 *
 * 退出碼：
 *   0 通過
 *   1 有違規（會逐條列出，不是一句「失敗」）
 *   2 前置條件不成立（沒有 docker、compose 設定本身壞了）
 *
 * 用法：
 *   npm run demo:check              # 公開組合：必須零主機端口
 *   npm run demo:check -- --local   # 本機除錯組合：端口只准綁 127.0.0.1 且不撞正式端口
 *   npm run demo:check -- --env-file .env.demo   # 用真的 demo env（仍不會起容器）
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  DEMO_PROJECT,
  auditDemoConfig,
  auditDemoLocalConfig,
  publishedPorts,
} from './demo-stack.mjs';

const run = promisify(execFile);

const BASE_FILE = 'docker-compose.demo.yml';
const LOCAL_FILE = 'docker-compose.demo.local.yml';

/**
 * 給 `config` 用的假值。全部明顯不是 secret，而且只在臨時檔存在幾秒。
 *
 * 為甚麼要假值：`.env.demo.example` 的密碼與 token 刻意留空（範本不可以放可用的
 * 憑證），但 compose 的 `:?` 必填檢查會因此失敗。這裡補上假值，令檢查驗得到
 * 「結構是否隔離」，而不是驗到「有沒有人填了密碼」。
 */
const FAKE_ENV = {
  DEMO_POSTGRES_USER: 'company_os_demo',
  DEMO_POSTGRES_PASSWORD: 'not-a-secret-demo-check',
  DEMO_POSTGRES_DB: 'company_os_demo',
  DEMO_MINIO_ROOT_USER: 'demo-storage',
  DEMO_MINIO_ROOT_PASSWORD: 'not-a-secret-demo-check',
  // 刻意不提供 DEMO_MINIO_BUCKET：要驗的是 compose 檔內的預設值本身是 Demo bucket。
  // 若在這裡補一個值，就把「預設值被改成正式 bucket」這個退化遮住了。
  DEMO_LOGIN_FAILURE_HASH_KEY: 'not-a-secret-demo-check-32-bytes',
  DEMO_INTERNAL_GATEWAY_TOKEN: 'not-a-secret-demo-check-hex',
  // 留空：cloudflared 的 token 用 ${VAR:-}，空值時 config 仍然通過。
  DEMO_CLOUDFLARE_TUNNEL_TOKEN: '',
};

function usage() {
  return [
    '用法：node scripts/demo-stack-check.mjs [--local] [--env-file <path>] [--json]',
    '',
    '  --local             加上 docker-compose.demo.local.yml（本機除錯端口）',
    '  --env-file <path>   用指定的 env 檔（預設用臨時假值，不寫入 repo）',
    '  --json              以 JSON 輸出結果（給 CI／工具讀）',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { local: false, envFile: null, json: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--local') {
      options.local = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--env-file') {
      const value = argv[index + 1];

      if (value === undefined) {
        throw new Error('--env-file 後面要接一個路徑');
      }

      options.envFile = value;
      index += 1;
    } else {
      throw new Error(`不認識的參數：${arg}`);
    }
  }

  return options;
}

/** 有 --env-file 就用它；沒有就開一個臨時檔，用完即刪。 */
function prepareEnvFile(explicitPath) {
  if (explicitPath !== null) {
    return { path: resolve(process.cwd(), explicitPath), cleanup: () => {} };
  }

  const dir = mkdtempSync(join(tmpdir(), 'demo-stack-check-'));
  const path = join(dir, 'demo.env');
  const body = Object.entries(FAKE_ENV)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  writeFileSync(path, `${body}\n`, 'utf8');

  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function resolvedConfig(files, envFile) {
  const { stdout } = await run(
    'docker',
    ['compose', '-f', files[0], ...(files[1] === undefined ? [] : ['-f', files[1]]), '--env-file', envFile, 'config', '--format', 'json'],
    { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 },
  );

  return JSON.parse(stdout);
}

function renderReport({ files, config, violations }) {
  const ports = publishedPorts(config);
  const lines = [
    `Demo Public Stack 隔離檢查（${files.length === 1 ? '公開組合' : '本機除錯組合'}）`,
    `compose 檔：${files.join(' + ')}`,
    `project：${config?.name ?? '（讀不到）'}`,
    `服務：${Object.keys(config?.services ?? {}).join(', ')}`,
    `發佈的主機端口：${ports.length === 0 ? '0 個' : `${ports.length} 個（${ports.map((port) => `${port.hostIp || '*'}:${port.published}`).join('、')}）`}`,
    '',
  ];

  if (violations.length === 0) {
    lines.push(`結果：PASS（與正式 stack 沒有共用的 project、volume、資料庫、bucket 或端口）`);
    return lines.join('\n');
  }

  lines.push(`結果：FAIL（${violations.length} 項）`);

  for (const violation of violations) {
    lines.push(`  - ${violation}`);
  }

  return lines.join('\n');
}

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`\n${error.message}\n\n${usage()}`);
    return 2;
  }

  if (options.help) {
    console.log(usage());
    return 0;
  }

  const files = options.local ? [BASE_FILE, LOCAL_FILE] : [BASE_FILE];
  const env = prepareEnvFile(options.envFile);

  try {
    let config;

    try {
      config = await resolvedConfig(files, env.path);
    } catch (error) {
      // 沒有 docker 與「設定壞了」是兩種不同的失敗，但都不是「通過」。
      if (error?.code === 'ENOENT') {
        console.error('找不到 docker；這一步雖然不啟動容器，但要用 docker compose 解析設定。');
        return 2;
      }

      // compose 設定本身壞了（語法、缺必填值）→ 前置條件失敗，不是「隔離很好」。
      const detail = [error?.stderr, error?.message].filter((part) => typeof part === 'string' && part.trim() !== '').join('\n');
      console.error(`讀不到 compose 設定（${DEMO_PROJECT}）：\n${detail}`);
      console.error('\n這不是「通過」。設定要先修好，檢查才有意義。');
      return 2;
    }

    const violations = options.local ? auditDemoLocalConfig(config) : auditDemoConfig(config);

    if (options.json) {
      console.log(JSON.stringify({ files, project: config?.name ?? null, violations }, null, 2));
    } else {
      console.log(renderReport({ files, config, violations }));
    }

    return violations.length === 0 ? 0 : 1;
  } finally {
    env.cleanup();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 2;
  },
);
