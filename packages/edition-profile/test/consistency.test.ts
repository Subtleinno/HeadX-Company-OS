import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTAINERS, EDITION_PROFILES, existingPorts, type EditionCode } from '../src/index';

/**
 * 一致性測試：edition-profile 與 docker-compose.yml、.env.example、
 * docs/architecture/REPO-MAP.md 必須說同一件事。
 *
 * 全部用逐行掃描，不引入 YAML／Markdown 解析依賴。每一個掃描器都配一條
 * 「掃到嘅數量不對就紅」的斷言 —— 掃描失效而回空集合，不可以當成通過。
 */

const repoRoot = process.cwd();

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

/** docker-compose.yml：服務名 → 它發佈的端口字串清單。 */
export function parseComposeServices(yaml: string): Map<string, string[]> {
  const services = new Map<string, string[]>();
  let current: string[] | null = null;
  let inPorts = false;
  let portsIndent = 0;
  let inServices = false;

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // 頂層（indent 0）的鍵決定我們還是否在 services: 區段內。
    // 沒有這一層，volumes: 底下的 db_data 會被當成服務。
    if (indent === 0 && !trimmed.startsWith('-')) {
      inServices = /^services:\s*$/.test(trimmed);
      current = null;
      inPorts = false;
      continue;
    }

    if (!inServices) {
      continue;
    }

    if (inPorts && indent > portsIndent) {
      if (trimmed.startsWith('-')) {
        current?.push(trimmed.slice(1).trim().replace(/^["']|["']$/g, ''));
      }
      continue;
    }
    inPorts = false;

    if (indent === 2 && /^[a-z][a-z0-9_-]*:\s*$/.test(trimmed)) {
      const name = trimmed.slice(0, -1);
      current = [];
      services.set(name, current);
      continue;
    }

    if (indent > 2 && /^ports:\s*$/.test(trimmed)) {
      inPorts = true;
      portsIndent = indent;
    }
  }

  return services;
}

/** env 檔：KEY → VALUE（去掉成對引號）。 */
export function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const rawLine of text.split(/\r?\n/)) {
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

    values.set(key, value);
  }

  return values;
}

export type RepoMapRow = {
  name: string;
  ports: number[];
  cn: boolean;
  intl: boolean;
};

/**
 * REPO-MAP 的容器端口表。容器名有括號註解（`platform（含 worker）`、
 * `db（Postgres）`），比較時只取括號前的部分。
 */
export function parseRepoMapTable(markdown: string): RepoMapRow[] {
  const rows: RepoMapRow[] = [];
  let inTable = false;

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed.startsWith('|')) {
      inTable = false;
      continue;
    }

    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

    if (cells.length !== 5) {
      continue;
    }

    if (cells[0] === '容器' && cells[1].includes('變數')) {
      inTable = true;
      continue;
    }

    if (!inTable || /^-+$/.test(cells[0])) {
      continue;
    }

    const name = cells[0].replace(/（[^）]*）/g, '').trim();
    const portsCell = cells[2];
    const ports =
      portsCell === '—'
        ? []
        : portsCell
            .split('、')
            .map((item) => Number(item.trim()))
            .filter((value) => Number.isInteger(value));

    rows.push({
      name,
      ports,
      cn: cells[3] === '有',
      intl: cells[4] === '有',
    });
  }

  return rows;
}

const compose = parseComposeServices(readText('docker-compose.yml'));
const envExample = parseEnvFile(readText('.env.example'));
const repoMap = parseRepoMapTable(readText('docs/architecture/REPO-MAP.md'));

describe('掃描器本身', () => {
  it('compose 讀到四個服務', () => {
    expect([...compose.keys()].sort()).toEqual(['api', 'db', 'storage', 'web']);
  });

  it('compose 每個服務都讀到至少一條端口', () => {
    for (const [service, entries] of compose) {
      expect(entries.length, service).toBeGreaterThan(0);
    }
  });

  it('.env.example 讀到現有五個端口變數', () => {
    for (const key of ['WEB_PORT', 'API_PORT', 'DB_PORT', 'PORT_MINIO_API', 'PORT_MINIO_CONSOLE']) {
      expect(envExample.has(key), key).toBe(true);
    }
  });

  it('REPO-MAP 讀到十二列，而不是空表', () => {
    expect(repoMap).toHaveLength(12);
    expect(repoMap.map((row) => row.name)).toContain('gateway-internal');
    expect(repoMap.map((row) => row.name)).toContain('storage');
  });
});

describe('與 docker-compose.yml 一致', () => {
  const exists = CONTAINERS.filter((item) => item.status === 'exists');

  it('四個 exists 容器都有對應的 compose 服務', () => {
    expect(exists).toHaveLength(4);

    for (const item of exists) {
      expect(item.composeService, item.name).not.toBeNull();
      expect(compose.has(item.composeService ?? ''), item.name).toBe(true);
    }
  });

  it('每個 exists 容器的端口都用 ${envVar:-defaultPort} 發佈，預設值與設定檔相同', () => {
    for (const item of exists) {
      const entries = compose.get(item.composeService ?? '') ?? [];

      for (const port of item.ports) {
        const expected = `\${${port.envVar}:-${port.defaultPort}}`;
        const matched = entries.filter((entry) => entry.includes(expected));

        expect(matched, `${item.name} 期待 ${expected}，實際 ${entries.join(' / ')}`).toHaveLength(1);
      }
    }
  });
});

describe('與 .env.example 一致', () => {
  it('每個 exists 容器的端口變數都存在，值等於預設端口', () => {
    for (const item of CONTAINERS.filter((entry) => entry.status === 'exists')) {
      for (const port of item.ports) {
        expect(envExample.get(port.envVar), port.envVar).toBe(String(port.defaultPort));
      }
    }
  });
});

describe('與 REPO-MAP 的容器端口表一致', () => {
  it('每一列的容器名稱都在設定檔內', () => {
    const known = new Set(CONTAINERS.map((item) => item.name));

    for (const row of repoMap) {
      expect(known.has(row.name), row.name).toBe(true);
    }
  });

  it('每一列的預設端口都與設定檔相同', () => {
    for (const row of repoMap) {
      const spec = CONTAINERS.find((item) => item.name === row.name);
      expect(spec?.ports.map((port) => port.defaultPort), row.name).toEqual(row.ports);
    }
  });

  it('每一列的大陸版／國際版欄位都與設定檔相同', () => {
    for (const row of repoMap) {
      const spec = CONTAINERS.find((item) => item.name === row.name);
      expect(spec?.editions.includes('cn'), row.name).toBe(row.cn);
      expect(spec?.editions.includes('intl'), row.name).toBe(row.intl);
    }
  });

  it('設定檔內每個容器都在表內（不會有表上沒有的容器）', () => {
    const listed = new Set(repoMap.map((row) => row.name));

    for (const item of CONTAINERS) {
      expect(listed.has(item.name), item.name).toBe(true);
    }
  });
});

describe('版本層面', () => {
  it('兩版的 exists 端口與 ports:check 讀到的完全一樣', () => {
    for (const code of Object.keys(EDITION_PROFILES) as EditionCode[]) {
      expect(existingPorts(code).map((item) => item.defaultPort), code).toEqual([
        4210, 4420, 25432, 29000, 29001,
      ]);
    }
  });

  it('REPO-MAP 那個 4431 同時屬於 apps（大陸版）與 apps-internal（國際版），不是重複', () => {
    const specs = CONTAINERS.filter((item) => item.ports.some((port) => port.defaultPort === 4431));

    expect(specs.map((item) => item.name).sort()).toEqual(['apps', 'apps-internal']);
    expect(specs[0]?.editions).not.toEqual(specs[1]?.editions);
  });
});
