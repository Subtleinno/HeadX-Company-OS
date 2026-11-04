import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 這兩組測試是倉庫層的閘門，讀檔檢查，不需要 Docker，也不需要起任何服務。
 * 目的：把「端口只綁本機」「範本內沒有可用密碼」變成機器可驗的事實，
 * 而不是靠人記得。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

/**
 * 抽出 docker-compose.yml 內所有 ports: 之下以 `- ` 開頭的項目值。
 * 不引入 YAML 解析依賴：這個檔的結構固定，逐行掃描已足夠，
 * 而且掃不到任何項目時下面會有一條測試把它變成紅色。
 */
function extractPortEntries(yaml: string): string[] {
  const entries: string[] = [];
  let portsIndent: number | null = null;

  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;

    if (portsIndent !== null) {
      if (indent <= portsIndent) {
        portsIndent = null;
      } else if (trimmed.startsWith('-')) {
        entries.push(trimmed.slice(1).trim().replace(/^["']|["']$/g, ''));
        continue;
      }
    }

    if (/^ports:\s*$/.test(trimmed)) {
      portsIndent = indent;
    }
  }

  return entries;
}

/** 抽出 env 檔的 KEY=VALUE，忽略註解與空行，去掉成對引號。 */
function parseEnvAssignments(text: string): { key: string; value: string; line: number }[] {
  const assignments: { key: string; value: string; line: number }[] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      return;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      return;
    }

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    assignments.push({ key: trimmed.slice(0, separator).trim(), value, line: index + 1 });
  });

  return assignments;
}

describe('docker-compose.yml 的端口發佈', () => {
  const entries = extractPortEntries(readText('docker-compose.yml'));

  // 端口項目由 3 個變成 5 個（新增 storage 的 API 與 console），數量是刻意改的門檻，
  // 不是為了讓測試通過而放寬：任何端口項目被刪或被合併都會在這裡變紅。
  it('讀到五個端口項目（掃描失效時要紅，不可以空集合通過）', () => {
    expect(entries).toHaveLength(5);
  });

  it('每一個端口項目都以 127.0.0.1: 開頭，只綁本機', () => {
    const notLoopback = entries
      .filter((entry) => !entry.startsWith('127.0.0.1:'))
      .map((entry) => `未綁 127.0.0.1：${entry}`);

    expect(notLoopback).toEqual([]);
  });
});

describe('.env.example 的密碼與密鑰變數', () => {
  const assignments = parseEnvAssignments(readText('.env.example'));

  it('讀到環境變數（掃描失效時要紅，不可以空集合通過）', () => {
    expect(assignments.length).toBeGreaterThan(0);
  });

  it('名稱含 PASSWORD 或 SECRET 的變數全部為空值', () => {
    const sensitive = assignments.filter((assignment) => /PASSWORD|SECRET/i.test(assignment.key));

    // 一個都沒有，等於這條測試沒有檢查對象，同樣要紅。
    expect(sensitive.length).toBeGreaterThan(0);

    const withValue = sensitive
      .filter((assignment) => assignment.value !== '')
      .map((assignment) => `${assignment.key}（第 ${assignment.line} 行）有非空值`);

    expect(withValue).toEqual([]);
  });
});

/**
 * 上傳上限有三個地方要對得上：API 的 MAX_UPLOAD_BYTES、nginx 的 client_max_body_size
 * （預設 1 MiB，不改的話瀏覽器上傳會先被 nginx 擋掉）、以及 .env.example 的預設值。
 * 靠人記得會漂移，所以讀檔驗。
 */
describe('上傳上限：nginx 與 API 一致', () => {
  const nginx = readText('apps/web/nginx.conf');
  const assignments = parseEnvAssignments(readText('.env.example'));
  const maxUpload = assignments.find((assignment) => assignment.key === 'MAX_UPLOAD_BYTES');

  it('.env.example 有 MAX_UPLOAD_BYTES，預設 209715200（200 MiB）', () => {
    expect(maxUpload?.value).toBe('209715200');
  });

  it('apps/web/nginx.conf 的 client_max_body_size 等於同一個上限', () => {
    const matched = /client_max_body_size\s+(\d+)m\s*;/.exec(nginx);

    expect(matched).not.toBeNull();

    const bytes = Number(matched?.[1] ?? '0') * 1024 * 1024;
    expect(bytes).toBe(Number(maxUpload?.value));
  });

  it('docker-compose.yml 把 MAX_UPLOAD_BYTES 傳入 api 容器', () => {
    expect(readText('docker-compose.yml')).toContain(
      'MAX_UPLOAD_BYTES: ${MAX_UPLOAD_BYTES:-209715200}',
    );
  });
});
