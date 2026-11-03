import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
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
      const reason =
        error.code === 'EADDRINUSE'
          ? '已被其他程式佔用'
          : error.code === 'EACCES'
            ? '沒有權限綁定（可能被系統保留）'
            : `無法綁定（${error.code ?? 'UNKNOWN'}）`;
      resolve({ ok: false, reason });
    });

    server.once('listening', () => {
      server.close(() => resolve({ ok: true }));
    });

    server.listen({ port, host: '0.0.0.0', exclusive: true });
  });
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

    const result = await tryBindPort(port);
    if (!result.ok) {
      problems.push(`端口 ${port}（${key}，${service}）${result.reason}`);
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
