import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const PORT_VARS = [
  { key: 'WEB_PORT', service: 'web', fallback: 4210 },
  { key: 'API_PORT', service: 'api', fallback: 4420 },
  { key: 'DB_PORT', service: 'db', fallback: 25432 },
];

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

export function resolvePorts(env) {
  const ports = [];
  const errors = [];

  for (const { key, service, fallback } of PORT_VARS) {
    const raw = env[key];

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

  return { ports, errors };
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
 * 判斷一個端口能否安全使用。
 * 回傳問題描述字串，或 null 代表沒有問題。
 * 依賴可注入，測試不需要真的開端口或 Docker。
 */
export async function judgePort(target, deps = {}) {
  const tryBind = deps.tryBind ?? tryBindPort;
  const probe = deps.probe ?? probePort;
  const hosts = deps.hosts ?? PROBE_HOSTS;
  const timeoutMs = deps.timeoutMs ?? PROBE_TIMEOUT_MS;
  const { key, service, port } = target;

  const bound = await tryBind(port);
  if (!bound.ok) {
    return `端口 ${port}（${key}，${service}）${bound.reason}`;
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
    return `端口 ${port}（${key}，${service}）有程式正在回應（${answeringHosts.join('、')}），可能由容器或代理髮布`;
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

  const { ports, errors } = resolvePorts(parseEnv(contents));
  const problems = [...errors];

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

    const problem = await judgePort({ key, service, port });
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
