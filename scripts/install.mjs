/**
 * 一鍵安裝（macOS／Windows／Linux 同一條命令）。
 *
 *   npm run install:stack
 *
 * 為甚麼要有這支：README 舊版叫人「先 copy .env.example 為 .env，然後手動填四個
 * 密碼」。在任何一部新機上，這一步都是安裝失敗的第一名原因 —— 留空就會失敗，
 * 而失敗訊息是 compose 講的「請先複製 .env.example 為 .env」，與真正原因無關。
 * 這支腳本把「填值」變成機器做的事：自己產生密碼學隨機值，自己驗，自己起，
 * 自己等健康，最後自己開好老闆帳戶。
 *
 * 三條原則：
 *   1. **只用 Node 與 `docker` 兩個外部程式**（不用 bash、不用 PowerShell），
 *      所以 Mac 與 Windows 跑的是同一段程式，不是兩份會各自腐壞的腳本。
 *   2. **不覆寫已有的值。** 已存在 `.env` 只補空白項，改過端口或密碼的人不會被蓋掉。
 *   3. **失敗要講人話。** Docker 未啟動、端口被佔、映像建不起來，各自給一句
 *      看得懂的句子，而不是把 compose 的原文倒出來。
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';

/** 需要真正隨機值的必填項。空的 `.env` 一定起不來，所以安裝時直接補。 */
const GENERATED_SECRETS = [
  {
    key: 'POSTGRES_PASSWORD',
    make: () => randomBytes(24).toString('base64url'),
  },
  {
    key: 'MINIO_ROOT_PASSWORD',
    make: () => randomBytes(24).toString('base64url'),
  },
  {
    key: 'LOGIN_FAILURE_HASH_KEY',
    make: () => randomBytes(32).toString('base64url'),
  },
  {
    key: 'INTERNAL_GATEWAY_TOKEN',
    // 格式由 apps/web 的 entrypoint 與 API 兩邊驗：hex，至少 64 字元。
    make: () => randomBytes(32).toString('hex'),
  },
];

const MIN_NODE_MAJOR = 22;
const HEALTH_TIMEOUT_MS = 300_000;

/**
 * 經 gateway（nginx）問 API 時的路徑前綴。
 *
 * `apps/web/nginx.conf` 只把 `/api/` 轉去 api 容器（其餘路徑一律回 index.html，
 * 因為這是單頁應用）。少了這個前綴不會拿到 404，而是拿到一整頁 HTML —— 
 * 症狀是 JSON 解析失敗，看起來像 API 壞了。踩過一次，所以寫成常數。
 */
const API_PREFIX = '/api';

function log(message) {
  console.log(message);
}

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint !== undefined) {
    console.error(`  ${hint}`);
  }
  process.exit(1);
}

/** 跑一個命令，繼承 stdio（建置輸出要看得見）。回傳 exit code。 */
function run(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: options.quiet ? 'ignore' : 'inherit',
      shell: false,
    });

    child.on('error', () => resolvePromise(-1));
    child.on('close', (code) => resolvePromise(code ?? -1));
  });
}

/** 跑一個命令並取回 stdout；失敗回傳 null（給「問一句」用，不當成致命錯誤）。 */
function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });

  if (result.error !== undefined || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function parseEnv(text) {
  const map = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const equals = line.indexOf('=');
    if (equals <= 0) {
      continue;
    }

    map.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
  }

  return map;
}

/**
 * 把 `.env` 內指定 key 的空值填上。保留原有的註解、次序與已填的值。
 * 回傳真正寫入了哪些 key（用來在結尾講清楚做了什麼）。
 */
function fillEnvValues(envPath, values) {
  const original = readFileSync(envPath, 'utf8');
  const lines = original.split(/\r?\n/);
  const filled = [];
  const missing = [];

  for (const [key, value] of values) {
    let found = false;

    for (let index = 0; index < lines.length; index += 1) {
      const match = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`).exec(lines[index]);

      if (match === null) {
        continue;
      }

      found = true;

      if (match[1].trim() === '') {
        lines[index] = `${key}=${value}`;
        filled.push(key);
      }

      break;
    }

    if (!found) {
      // 範本沒有這個 key：加在結尾，不要靜靜地當它不存在。
      lines.push(`${key}=${value}`);
      filled.push(key);
      missing.push(key);
    }
  }

  if (filled.length > 0) {
    writeFileSync(envPath, lines.join('\n'), 'utf8');
  }

  return { filled, missing };
}

function readEnvValue(envPath, key, fallback) {
  if (!existsSync(envPath)) {
    return fallback;
  }

  return parseEnv(readFileSync(envPath, 'utf8')).get(key) ?? fallback;
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);

  if (Number.isNaN(major) || major < MIN_NODE_MAJOR) {
    fail(
      `Node 版本太舊：目前 ${process.versions.node}，至少要 ${MIN_NODE_MAJOR}。`,
      `請安裝 Node ${MIN_NODE_MAJOR} 或以上（repo 的 .nvmrc 寫的是建議版本）。`,
    );
  }
}

function ensureDocker() {
  const version = capture('docker', ['--version']);

  if (version === null) {
    fail(
      '找不到 docker 指令。',
      isWindows
        ? '請安裝並啟動 Docker Desktop（要等它右下角的鯨魚圖示變成綠色），然後重開終端機。'
        : '請安裝並啟動 Docker Desktop（或 colima），確認 `docker --version` 有輸出。',
    );
  }

  const compose = capture('docker', ['compose', 'version']);

  if (compose === null) {
    fail(
      'docker 有，但 `docker compose` 用不了。',
      '需要 Docker Compose v2（`docker compose`，不是舊的 `docker-compose`）。更新 Docker Desktop 就會有。',
    );
  }

  // `docker --version` 只證明 CLI 存在，不證明 daemon 起得來。
  // Docker Desktop 未啟動時，之後每一步的錯誤都很難讀，所以在這裡先問一次。
  if (capture('docker', ['info', '--format', '{{.ServerVersion}}']) === null) {
    fail(
      'Docker 未啟動（CLI 有回應，但 daemon 連不上）。',
      isWindows
        ? '開 Docker Desktop，等它顯示 Running 之後再跑一次。'
        : '開 Docker Desktop／`colima start`，確認 `docker info` 有輸出之後再跑一次。',
    );
  }
}

async function ensureDependencies() {
  if (existsSync(resolve(repoRoot, 'node_modules'))) {
    return;
  }

  log('→ 第一次安裝，先裝 Node 依賴（npm ci）…');

  if ((await run(npmCommand, ['ci'])) !== 0) {
    fail('npm ci 失敗。', '通常是網絡問題；重跑一次。若一直失敗，刪掉 node_modules 再試。');
  }
}

function ensureEnvFile() {
  const envPath = resolve(repoRoot, '.env');
  const examplePath = resolve(repoRoot, '.env.example');

  if (!existsSync(examplePath)) {
    fail('找不到 .env.example，repo 不完整。', '請重新 clone 這個 repo。');
  }

  if (!existsSync(envPath)) {
    writeFileSync(envPath, readFileSync(examplePath, 'utf8'), 'utf8');
    log('→ 已由 .env.example 建立 .env');
  }

  const values = GENERATED_SECRETS.map((item) => [item.key, item.make()]);
  const { filled } = fillEnvValues(envPath, values);

  if (filled.length > 0) {
    log(`→ 已自動填入隨機密碼：${filled.join('、')}（只寫在本機 .env，不會入 git）`);
  }

  return envPath;
}

function stackIsRunning() {
  const ids = capture('docker', ['compose', 'ps', '-q']);

  return ids !== null && ids !== '';
}

async function checkPorts() {
  log('→ 檢查端口有沒有被佔用…');

  const code = await run(process.execPath, ['scripts/ports-check.mjs']);

  if (code !== 0) {
    fail(
      '端口檢查未通過（上面有講是哪一個、被誰佔用）。',
      '改 .env 內的 *_PORT 值，或者先關掉佔用的程式，然後再跑一次。',
    );
  }
}

async function buildAndStart() {
  log('→ 建置映像（第一次要幾分鐘：會由原始碼編譯 MinIO）…');

  // 有 git 時用 deploy:build 把 commit SHA 寫進映像標記，之後 `npm run deploy:revision`
  // 才答得出「這個容器跑的是哪個 commit」。沒有 git 就直接 build，標記會是 unknown。
  const hasGit = capture('git', ['rev-parse', 'HEAD']) !== null;
  const buildCode = hasGit
    ? await run(process.execPath, ['scripts/deploy-build.mjs'])
    : await run('docker', ['compose', 'build']);

  if (buildCode !== 0) {
    fail(
      '建置失敗（上面有出錯的那一行）。',
      '最常見是網絡中斷（npm 或 github.com 拉不到）。重跑一次通常會過。',
    );
  }

  log('→ 啟動容器…');

  if ((await run('docker', ['compose', 'up', '-d'])) !== 0) {
    fail(
      '啟動失敗。',
      '如果講的是端口已被佔用，就是另一個程式正在用同一個端口；改 .env 或關掉它。',
    );
  }
}

function containerIds() {
  const ids = capture('docker', ['compose', 'ps', '-q']);

  return ids === null || ids === '' ? [] : ids.split(/\r?\n/).map((line) => line.trim());
}

function healthOf(containerId) {
  const status = capture('docker', [
    'inspect',
    '--format',
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
    containerId,
  ]);

  return status ?? 'unknown';
}

async function waitForHealthy() {
  log('→ 等所有容器健康…');

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastReport = 0;

  while (Date.now() < deadline) {
    const ids = containerIds();

    if (ids.length === 0) {
      fail('啟動之後看不到任何容器。', '請把上面 docker compose 的輸出貼出來。');
    }

    const statuses = ids.map((id) => healthOf(id));

    if (statuses.every((status) => status === 'healthy')) {
      log(`  ✓ ${ids.length} 個容器全部健康`);
      return;
    }

    const broken = statuses.find((status) => status === 'unhealthy' || status === 'exited');

    if (broken !== undefined) {
      fail(
        `有容器起不來（狀態：${broken}）。`,
        '看 `docker compose logs api` 或 `docker compose logs gateway-internal` 的第一個錯誤。',
      );
    }

    if (Date.now() - lastReport > 20_000) {
      log(`  … 仍是 ${statuses.join('／')}`);
      lastReport = Date.now();
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3_000));
  }

  fail('等了五分鐘仍未全部健康。', '看 `docker compose logs` 找出卡住的是哪一個。');
}

async function apiJson(baseUrl, path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);

  if (!response.ok) {
    return { ok: false, status: response.status, body: null };
  }

  return { ok: true, status: response.status, body: await response.json() };
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * 等入口真的答得出 `/auth/state`。
 *
 * 為甚麼不能「健康就當通」：api 的 healthcheck 打的是 `/livez`，那條路徑刻意
 * 不檢查任何依賴 —— 它的意思是「進程還在」。而 migration 是啟動時才套用的，
 * 所以會出現「容器 healthy，但 /auth/state 還在 500」的幾秒窗口。
 * 實測就是這樣：四個容器全綠之後第一次問，回到非 2xx。
 */
async function waitForGateway(gatewayUrl) {
  const deadline = Date.now() + 120_000;
  let last = '未取得回應';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${gatewayUrl}${API_PREFIX}/auth/state`);

      if (response.ok) {
        return await response.json();
      }

      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }

    await sleep(2_000);
  }

  fail(
    `${gatewayUrl} 兩分鐘內仍未有正常回應（最後一次：${last}）。`,
    '容器健康但網頁不通，通常是 migration 未套完或端口設定與 .env 不一致；看 `docker compose logs api` 的最後幾行。',
  );
}

/**
 * 開好老闆帳戶。
 *
 * 系統本身的設計是「裝完是空的，由老闆建立第一個帳戶」（`POST /auth/setup`，
 * 只在一個 owner 都未有的時候接受）。但這一步在瀏覽器還未有對應畫面，
 * 沒有它就會出現「裝好但登入不到」。所以在這裡代老闆做一次，
 * 並且把帳號密碼印在結尾。
 */
async function ensureOwner(gatewayUrl, state, options) {
  if (state?.setupRequired !== true) {
    log('  ✓ 已經有老闆帳戶，不用建立');
    return null;
  }

  const email = options.ownerEmail ?? 'boss@company.local';
  const displayName = options.ownerName ?? '老闆';
  const password = options.ownerPassword ?? randomBytes(12).toString('base64url');

  const created = await apiJson(gatewayUrl, `${API_PREFIX}/auth/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: gatewayUrl },
    body: JSON.stringify({ displayName, email, password }),
  });

  if (!created.ok) {
    log(`  ！建立老闆帳戶失敗（HTTP ${created.status}），可以之後在網頁再做一次。`);
    return null;
  }

  return { email, password };
}

function parseArgs(argv) {
  const options = {};

  for (const raw of argv) {
    if (raw === '--yes' || raw === '-y') {
      options.yes = true;
      continue;
    }

    const match = /^--(owner-email|owner-password|owner-name)=(.*)$/.exec(raw);

    if (match !== null) {
      const key = {
        'owner-email': 'ownerEmail',
        'owner-password': 'ownerPassword',
        'owner-name': 'ownerName',
      }[match[1]];

      options[key] = match[2];
    }
  }

  return options;
}

async function askOwner(options) {
  // 已經用參數指定了 email 與密碼就不要再問 —— 自動化／CI／背景執行時 stdin 可能
  // 仍然報告自己是 TTY，於是腳本會停在一個永遠沒有人回答的提示上（實測踩過）。
  const fullySpecified =
    typeof options.ownerEmail === 'string' && typeof options.ownerPassword === 'string';
  const interactive = process.stdin.isTTY === true && options.yes !== true && !fullySpecified;

  if (!interactive) {
    return options;
  }

  log('');
  log('建立老闆帳戶（直接按 Enter 用括號內的預設值；密碼留空＝自動產生）');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const name = (await rl.question('  名字（老闆）：')).trim();
    const email = (await rl.question('  登入 email（boss@company.local）：')).trim();
    const password = (await rl.question('  密碼（留空＝自動產生）：')).trim();

    return {
      ...options,
      ownerName: name === '' ? options.ownerName : name,
      ownerEmail: email === '' ? options.ownerEmail : email,
      ownerPassword: password === '' ? options.ownerPassword : password,
    };
  } finally {
    rl.close();
  }
}

function summary({ gatewayUrl, owner, envPath }) {
  const port = new URL(gatewayUrl).port;

  log('');
  log('────────────────────────────────────────────');
  log('  裝好了');
  log('────────────────────────────────────────────');
  log(`  網址：${gatewayUrl}`);
  log(`  端口：gateway-internal ${port}、api ${readEnvValue(envPath, 'API_PORT', '4420')}`);

  if (owner !== null) {
    log('');
    log('  老闆帳戶（只顯示這一次，請即刻改密碼）：');
    log(`    email：${owner.email}`);
    log(`    密碼：${owner.password}`);
  } else if (readEnvValue(envPath, 'POSTGRES_PASSWORD', '') !== '') {
    log('');
    log('  已有帳戶，用你原本的 email 與密碼登入。');
  }

  log('');
  log('  之後常用：');
  log('    npm run install:stack      再跑一次（會保留 .env 與資料）');
  log('    npm run deploy:build       code 更新後重建映像');
  log('    docker compose down        停止（不會刪資料）');
  log('');
  log('  第一個要設的：備份根目錄 COMPANY_OS_BACKUP_ROOT（.env 內），要指到另一粒實體碟。');
  log('');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  log('HeadX Company OS — 一鍵安裝');
  log('');

  ensureNodeVersion();
  ensureDocker();

  await ensureDependencies();

  const envPath = ensureEnvFile();
  const gatewayPort = readEnvValue(
    envPath,
    'GATEWAY_INTERNAL_PORT',
    readEnvValue(envPath, 'WEB_PORT', '4210'),
  );
  const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;

  if (stackIsRunning()) {
    log('→ 這套已經在跑，跳過端口檢查（它會把己方 stack 誤報成衝突）');
  } else {
    await checkPorts();
  }

  await buildAndStart();
  await waitForHealthy();

  log('→ 確認入口有回應…');

  const state = await waitForGateway(gatewayUrl);
  log('  ✓ 入口正常');

  const owner = await ensureOwner(gatewayUrl, state, await askOwner(options));

  summary({ gatewayUrl, owner, envPath });
}

await main();
