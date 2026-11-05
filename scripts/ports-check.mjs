import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  DEFAULT_EDITION,
  existingPorts,
  isEditionCode,
} from '../packages/edition-profile/src/index.ts';

const execFileAsync = promisify(execFile);

/**
 * 端口清單的唯一來源是 `packages/edition-profile`：這裡只負責「查這個版本的 exists 容器」，
 * 不再自己維護一份端口表。次序、服務標籤、預設值全部由那份設定決定。
 *
 * 直接 import `.ts`：主機的 Node 22 與容器內的 Node 26 都預設剝離型別，
 * 不需要先 build，也不需要開 flag（已實測 node v22.22.2 可行）。
 */
export function portVarsOf(edition) {
  return existingPorts(edition).map((item) => ({
    key: item.envVar,
    service: item.service,
    fallback: item.defaultPort,
  }));
}

export const PORT_VARS = portVarsOf(DEFAULT_EDITION);

/**
 * 版本由環境變數 `EDITION` 決定，預設 intl。
 * 未知的值要即時報錯，不可以默默當成國際版 —— 那會令大陸版檢查錯的端口。
 */
export function resolveEdition(raw) {
  if (raw === undefined || raw.trim() === '') {
    return { code: DEFAULT_EDITION };
  }

  const value = raw.trim();
  if (!isEditionCode(value)) {
    return { error: `未知版本 EDITION=${value}；只可以是 intl 或 cn` };
  }

  return { code: value };
}

export function parseEnv(contents) {
  const env = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const equals = line.indexOf('=');
    if (equals <= 0) {
      continue;
    }

    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

/**
 * 已改名的端口變數：舊名 → 新名。
 *
 * S1-02／#78 把 `WEB_PORT` 改名為 `GATEWAY_INTERNAL_PORT`（容器由 `web` 改名為
 * `gateway-internal`）。已有的 `.env` 不可以一夜之間壞掉，所以舊名仍然生效，
 * 但要提醒改名 —— 警告不令檢查失敗，因為那不是錯，只是未搬。
 */
const RENAMED_PORT_VARS = { WEB_PORT: 'GATEWAY_INTERNAL_PORT' };

/**
 * 找出一個端口變數的值：新名優先，舊名後備。
 * 回傳 `{ raw, warnings }`；`raw` 是字串（可能 undefined）。
 */
export function readPortValue(env, key) {
  const warnings = [];
  const legacy = Object.keys(RENAMED_PORT_VARS).find((old) => RENAMED_PORT_VARS[old] === key);

  if (legacy !== undefined && env[legacy] !== undefined && env[legacy].trim() !== '') {
    warnings.push(`${legacy} 已改名為 ${key}（舊名仍然生效，請更新 .env）`);
  }

  const raw = env[key];

  // 新名沒有值（未設定或空白）才用舊名。
  if ((raw === undefined || raw.trim() === '') && legacy !== undefined) {
    return { raw: env[legacy], warnings };
  }

  return { raw, warnings };
}

export function resolvePorts(env, edition = DEFAULT_EDITION) {
  const ports = [];
  const errors = [];
  const warnings = [];

  for (const { key, service, fallback } of portVarsOf(edition)) {
    const read = readPortValue(env, key);
    warnings.push(...read.warnings);
    const raw = read.raw;

    if (raw === undefined || raw.trim() === '') {
      ports.push({ key, service, port: fallback });
      continue;
    }

    const value = raw.trim();
    if (!/^\d+$/.test(value)) {
      errors.push(`${key}（${service}）不是有效端口：${value}`);
      continue;
    }

    const port = Number(value);
    if (port < 1 || port > 65535) {
      errors.push(`${key}（${service}）超出 1–65535：${value}`);
      continue;
    }

    ports.push({ key, service, port });
  }

  return { ports, errors, warnings };
}

export function parseExcludedPortRanges(output) {
  const ranges = [];

  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (match === null) {
      continue;
    }

    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start <= end) {
      ranges.push({ start, end });
    }
  }

  return ranges;
}

export function findExcludedRange(port, ranges) {
  return ranges.find((range) => port >= range.start && port <= range.end);
}

function tryBindPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();

    server.once('error', (error) => {
      const code = error.code ?? 'UNKNOWN';
      const reason =
        code === 'EADDRINUSE'
          ? '已被其他程式佔用'
          : code === 'EACCES'
            ? '沒有權限綁定（可能被系統保留）'
            : `無法綁定（${code}）`;
      resolve({ ok: false, reason, code });
    });

    server.once('listening', () => {
      server.close(() => resolve({ ok: true }));
    });

    server.listen({ port, host: '0.0.0.0', exclusive: true });
  });
}

// 「綁得上」不等於「空閒」。Docker Desktop 在 Windows 上以 SO_REUSEADDR 發佈端口，
// 第二個 process 仍然綁得上同一個 0.0.0.0:port，bind 會成功但端口其實已被佔用。
// 所以 bind 之後再探測一次：有沒有人真的在回應。
export const PROBE_HOSTS = ['127.0.0.1', '::1'];
export const PROBE_TIMEOUT_MS = 500;

// 這些錯誤代表「該地址沒有東西在聽」或「本機沒有這個地址族」，都算空閒。
// 其他錯誤（例如逾時）屬於無法確認，要報出來，不可以當成綠燈。
const NOT_ANSWERING = new Set(['ECONNREFUSED', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'ENETUNREACH']);

export function probePort(host, port, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = connect({ host, port });

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ answering: false, reason: 'TIMEOUT' }), timeoutMs);
    timer.unref?.();

    socket.once('connect', () => {
      clearTimeout(timer);
      finish({ answering: true, reason: 'connect' });
    });

    socket.once('error', (error) => {
      clearTimeout(timer);
      finish({ answering: false, reason: error.code ?? 'UNKNOWN' });
    });
  });
}

/**
 * 由 `netstat -ano` 的輸出找出 Listening 該端口的 PID（issue #45）。
 *
 * 只認 `LISTENING`：`ESTABLISHED` 代表「有連線」，唔代表「有程式霸住個端口」，
 * 而我們要答的問題係「邊個唔放個端口」。
 *
 * 端口比對用 `local` 欄的 `:port` 結尾，不是 `includes`：否則 4210 會撞到
 * 14210 與 42100。IPv4 與 IPv6 兩行都會出現（`0.0.0.0:4210`、`[::]:4210`），
 * 同一個 PID 只回一次。
 */
export function parseNetstatPids(stdout, port) {
  const pids = [];
  const suffix = `:${port}`;

  for (const rawLine of String(stdout ?? '').split(/\r?\n/)) {
    const columns = rawLine.trim().split(/\s+/);

    // Proto、Local、Foreign、State、PID —— 少過五欄就不是我們要的行。
    if (columns.length < 5) {
      continue;
    }

    const [proto, local, , state, pid] = columns;

    if (proto !== 'TCP' || state !== 'LISTENING') {
      continue;
    }

    if (!local.endsWith(suffix)) {
      continue;
    }

    const value = Number(pid);

    if (!Number.isInteger(value) || value <= 0) {
      continue;
    }

    if (!pids.includes(value)) {
      pids.push(value);
    }
  }

  return pids;
}

/**
 * 由 `tasklist /FO CSV /NH` 的第一欄取程序名（issue #45）。
 *
 * 用 CSV 而不是預設的空白對齊：`tasklist` 的空白對齊不是固定分隔，程序名本身
 * 亦可能有空格（例如 `Windows Defender.exe`），用 split 會切爛。
 *
 * 查不到時 `tasklist` 會印一句本地化訊息（沒有引號），一律回 null ——
 * 「查不到」與「查到但無名」都不可以當成識別成功。
 */
export function parseTasklistName(stdout) {
  const firstLine = String(stdout ?? '')
    .split(/\r?\n/)
    .find((line) => line.trim() !== '');

  if (firstLine === undefined) {
    return null;
  }

  const match = /^"([^"]*)"/.exec(firstLine.trim());

  if (match === null || match[1] === '') {
    return null;
  }

  return match[1];
}

async function runNetstat() {
  const { stdout } = await execFileAsync('netstat', ['-ano'], { windowsHide: true, maxBuffer: 8 << 20 });

  return stdout;
}

async function runTasklist(pid) {
  const { stdout } = await execFileAsync(
    'tasklist',
    ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
    { windowsHide: true },
  );

  return stdout;
}

/**
 * 認出佔用某個端口的程序（issue #45）。
 *
 * 回傳三種結果，呼叫者不可以把第二種當成第一種：
 *   `{ kind: 'identified', name, pid }` —— 認得到，訊息會寫出程序名與 PID。
 *   `{ kind: 'unidentified', reason }` —— 查不到。**仍然是問題**，exit code 不變。
 *   `{ kind: 'unsupported' }` —— 非 Windows。`netstat` 參數不同，寧願唔講，
 *                                都唔可以亂猜一個 PID 出嚟。
 *
 * 只用系統內建工具（netstat、tasklist），不依賴 Docker CLI —— 佔用者可能係
 * 另一個 compose 專案、一個 python 腳本，或者任何東西。
 */
export async function describeOwner(port, deps = {}) {
  const platform = deps.platform ?? process.platform;

  if (platform !== 'win32') {
    return { kind: 'unsupported' };
  }

  const netstat = deps.netstat ?? runNetstat;
  const tasklist = deps.tasklist ?? runTasklist;

  let output;

  try {
    output = await netstat();
  } catch {
    // 權限、netstat 不存在、輸出過大：都是「識別不到」，不是「無問題」。
    return { kind: 'unidentified', reason: 'netstat 執行失敗' };
  }

  const pids = parseNetstatPids(output, port);

  if (pids.length === 0) {
    return { kind: 'unidentified', reason: 'netstat 沒有對應 PID' };
  }

  const pid = pids[0];

  let listing;

  try {
    listing = await tasklist(pid);
  } catch {
    return { kind: 'unidentified', reason: `tasklist 查不到 PID ${pid}` };
  }

  const name = parseTasklistName(listing);

  if (name === null) {
    return { kind: 'unidentified', reason: `tasklist 查不到 PID ${pid}` };
  }

  return { kind: 'identified', name, pid };
}

/**
 * 佔用者那一段文字。
 *
 * `vague` 代表原本那句「可能由容器或代理髮布」是否適用（只有在「有程式回應」
 * 那條分支才有）。識別得到就講具體，識別不到就明講識別不到 —— 唔可以沿用
 * 一句聽起來好似已經解釋咗嘅話。
 */
function ownerClause(owner, vague) {
  if (owner === undefined || owner === null) {
    return vague ? '，可能由容器或代理髮布' : '';
  }

  if (owner.kind === 'identified') {
    return `，佔用者 ${owner.name}（PID ${owner.pid}），可能是其他 compose 專案`;
  }

  if (owner.kind === 'unidentified') {
    return `，${vague ? '但' : '且'}無法識別佔用者（${owner.reason}）`;
  }

  // unsupported：與以前一樣，唔假裝識別到。
  return vague ? '，可能由容器或代理髮布' : '';
}

/**
 * 判斷一個端口能否安全使用。
 * 回傳問題描述字串，或 null 代表沒有問題。
 * 依賴可注入，測試不需要真的開端口或 Docker。
 */
export async function judgePort(target, deps = {}) {
  const tryBind = deps.tryBind ?? tryBindPort;
  const probe = deps.probe ?? probePort;
  const hosts = deps.hosts ?? PROBE_HOSTS;
  const timeoutMs = deps.timeoutMs ?? PROBE_TIMEOUT_MS;
  const owner = deps.owner;
  const { key, service, port } = target;

  const bound = await tryBind(port);
  if (!bound.ok) {
    // 只有真的有問題才去查佔用者：空閒的端口不需要跑 netstat。
    const reported = owner === undefined ? undefined : await owner(port);
    return `端口 ${port}（${key}，${service}）${bound.reason}${ownerClause(reported, false)}`;
  }

  const answeringHosts = [];
  let unknown = null;

  for (const host of hosts) {
    const result = await probe(host, port, timeoutMs);

    if (result.answering) {
      answeringHosts.push(host);
      continue;
    }

    if (!NOT_ANSWERING.has(result.reason)) {
      unknown = unknown ?? `${host}：${result.reason}`;
    }
  }

  if (answeringHosts.length > 0) {
    const reported = owner === undefined ? undefined : await owner(port);
    return `端口 ${port}（${key}，${service}）有程式正在回應（${answeringHosts.join('、')}）${ownerClause(reported, true)}`;
  }

  if (unknown !== null) {
    return `端口 ${port}（${key}，${service}）無法確認是否空閒（${unknown}）`;
  }

  return null;
}

async function readWindowsExcludedRanges() {
  if (process.platform !== 'win32') {
    return [];
  }

  const { stdout } = await execFileAsync(
    'netsh',
    ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'],
    { windowsHide: true },
  );

  return parseExcludedPortRanges(stdout);
}

export async function main() {
  // 版本先驗：未知的 EDITION 不可以當成國際版繼續跑。
  const edition = resolveEdition(process.env.EDITION);
  if (edition.error !== undefined) {
    console.error(edition.error);
    process.exitCode = 1;
    return;
  }

  let contents;
  try {
    contents = await readFile('.env', 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('找不到 .env；請先複製 .env.example 為 .env');
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const { ports, errors, warnings } = resolvePorts(parseEnv(contents), edition.code);
  const problems = [...errors];

  // 改名提醒不是錯：印出來但照樣繼續檢查，也不會令退出碼變成 1。
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }

  for (let i = 0; i < ports.length; i += 1) {
    for (let j = i + 1; j < ports.length; j += 1) {
      if (ports[i].port === ports[j].port) {
        problems.push(
          `端口 ${ports[i].port} 同時被 ${ports[i].key}（${ports[i].service}）與 ${ports[j].key}（${ports[j].service}）使用`,
        );
      }
    }
  }

  let excludedRanges = [];
  try {
    excludedRanges = await readWindowsExcludedRanges();
  } catch (error) {
    problems.push(
      `無法讀取 Windows 排除端口範圍：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  for (const { key, service, port } of ports) {
    const excluded = findExcludedRange(port, excludedRanges);
    if (excluded !== undefined) {
      problems.push(
        `端口 ${port}（${key}，${service}）落在 Windows 系統保留範圍 ${excluded.start}–${excluded.end}`,
      );
      continue;
    }

    const problem = await judgePort(
      { key, service, port },
      // 只在 Windows 有效；其他平台 describeOwner 會回 unsupported，
      // 訊息與以前一樣（唔會亂報 PID）。
      { owner: (value) => describeOwner(value) },
    );
    if (problem !== null) {
      problems.push(problem);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('PORTS_OK');
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    console.error(`ports:check 失敗：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
