import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 正在運行的容器，對應哪一個 main commit（issue #143）。
 *
 * 背景：`docker compose up -d` 不會重建映像，所以正式 stack 可以靜靜落後於 main。
 * 2026-11-07 就發生過 api、gateway-internal、apps 三個映像同時落後，而當時唯一看得出的
 * 辦法是剖開映像內的 dist 去 grep —— 不可重複。這支腳本把「這個容器是哪個 commit」
 * 變成一句可以直接問的問題。
 *
 * 原則（同不變量 4「失敗要看得見」）：
 *   - 標記不存在、值是 unknown、值不是 SHA，一律講「未知」並講出原因，不猜、不補。
 *   - 讀不到本機 commit 時，不會把任何容器講成「相符」。
 *   - 不是由本 repo 建置的映像（db、storage 用固定上游映像）標「不適用」，
 *     不會把它們混進「落後」或「未知」去製造假問題。
 */

export const LABEL_KEY = 'org.opencontainers.image.revision';

/**
 * 由本 repo 的 Dockerfile 建置的 service。
 *
 * 這份清單不可以自己長：`scripts/deploy-revision.test.ts` 會核對它與 compose 內
 * 真正傳 `GIT_REVISION` build arg 的 service 完全一致。多一個少一個，測試紅。
 */
export const REPO_BUILT_SERVICES = ['api', 'gateway-internal', 'apps'];

/**
 * compose project 名的唯一來源是 `docker-compose.yml` 的 `name:`。
 *
 * 不在這裡另存一個常數：兩份一定會漂移，而漂移的後果是這支腳本去查一個
 * 不存在的 project，然後如實報告「全部未知」—— 看起來像標記壞了，其實只是名改過。
 */
function readComposeProject() {
  try {
    const text = readFileSync(resolve(repoRoot, 'docker-compose.yml'), 'utf8');
    return /^name:\s*(\S+)\s*$/m.exec(text)?.[1] ?? 'headx-company-os';
  } catch {
    return 'headx-company-os';
  }
}

export const DEFAULT_PROJECT = readComposeProject();

const MISSING_LABEL_REASON = '沒有標記';
const SKIPPED_REASON = '不是由本 repo 建置';

/** 退出碼。落後優先於未知：落後是具體、可以即刻修的問題。 */
export const EXIT_MATCH = 0;
export const EXIT_STALE = 1;
export const EXIT_UNKNOWN = 2;
export const EXIT_PRECONDITION = 3;

/**
 * 解析 label 的值。只有 7–40 位 hex 才算 commit SHA。
 *
 * `unknown` 與「沒有標記」要分開講：前者是建置時忘了傳 build arg，後者是映像根本
 * 沒有加 label。兩種要改的地方不同，講成同一句就查不出來。
 */
export function parseRevision(raw) {
  if (raw === undefined || raw === null) {
    return { kind: 'unknown', reason: MISSING_LABEL_REASON };
  }

  const value = String(raw).trim();

  // docker inspect 對不存在的 label 會印 `<no value>`，不是空字串。
  if (value === '' || value === '<no value>') {
    return { kind: 'unknown', reason: MISSING_LABEL_REASON };
  }

  if (value === 'unknown') {
    return { kind: 'unknown', reason: '建置時未提供 commit' };
  }

  if (!/^[0-9a-f]{7,40}$/.test(value)) {
    return { kind: 'unknown', reason: `標記不是 commit SHA：${value}` };
  }

  return { kind: 'known', sha: value };
}

/**
 * 把 docker inspect 讀到的 label 正規化。
 *
 * 沒有 label 時，docker inspect 可能印 `<no value>`，也可能印空字串 —— 兩種都是
 * 「沒有標記」。統一成 `null`，報表才會顯示 `—` 而不是一片空白（空白看起來像
 * 讀取失敗，而不是「這個映像沒有標記」）。
 */
export function normaliseLabel(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }

  const value = String(raw).trim();

  return value === '' || value === '<no value>' ? null : value;
}

/**
 * 比對「映像標記」與「本機現行 commit」。
 *
 * 短 SHA 與完整 SHA 的前綴相同就算相符：有人可能只注入 7 位。
 * 但只有在兩邊都有值時才比 —— `null` 代表讀不到，那必須是未知。
 */
export function compareRevision(currentSha, revision) {
  if (revision.kind !== 'known') {
    return { kind: 'unknown', reason: revision.reason };
  }

  if (currentSha === undefined || currentSha === null || String(currentSha).trim() === '') {
    return { kind: 'unknown', reason: '本機讀不到現行 commit' };
  }

  const current = String(currentSha).trim().toLowerCase();
  const image = revision.sha.toLowerCase();

  if (current.startsWith(image) || image.startsWith(current)) {
    return { kind: 'match' };
  }

  return { kind: 'stale' };
}

/** 一個容器的判定：先決定這是不是本 repo 的映像，再比對。 */
export function verdictOf({ currentSha, service, label }) {
  if (!REPO_BUILT_SERVICES.includes(service)) {
    return { kind: 'skipped', reason: SKIPPED_REASON };
  }

  return compareRevision(currentSha, parseRevision(label));
}

/** 由逐行列出的判定決定退出碼。 */
export function exitCodeFor(rows) {
  if (rows.some((row) => row.verdict.kind === 'stale')) {
    return EXIT_STALE;
  }

  if (rows.some((row) => row.verdict.kind === 'unknown')) {
    return EXIT_UNKNOWN;
  }

  return EXIT_MATCH;
}

function verdictText(verdict) {
  if (verdict.kind === 'match') {
    return '相符';
  }

  if (verdict.kind === 'stale') {
    return '落後';
  }

  if (verdict.kind === 'unknown') {
    return `未知（${verdict.reason}）`;
  }

  return `不適用（${verdict.reason}）`;
}

/**
 * 顯示寬度：CJK 字每個佔兩格，其餘一格。
 *
 * 用 `padEnd()` 直接對字數補位，中英夾雜的表格會歪 —— 而歪掉的表格最容易
 * 令人看錯行，例如把上一行的 commit 看成下一個容器的。
 */
export function textWidth(text) {
  let width = 0;

  for (const char of String(text)) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }

  return width;
}

/** 補到指定顯示寬度；寧願多補空格，不要少補（少補就會撞在一起）。 */
function pad(text, width) {
  const value = String(text);
  const missing = width - textWidth(value);

  return missing > 0 ? value + ' '.repeat(missing) : value;
}

/** 欄與欄之間至少留兩格，令長容器名與 40 位 SHA 都不會黏住下一個欄。 */
const COLUMN_GAP = 2;

/** 人看的報表。每一行都寫出實際讀到的 label，不摘要成一句「大致正常」。 */
export function renderReport(rows, currentSha) {
  const lines = [];

  lines.push(
    currentSha === null || currentSha === undefined || String(currentSha).trim() === ''
      ? '現行 commit：讀不到現行 commit（沒有 git，或不在 git 工作區內）'
      : `現行 commit：${currentSha}`,
  );

  if (rows.length === 0) {
    lines.push('沒有任何容器可以比對。');
    return lines.join('\n');
  }

  const table = rows.map((row) => [
    row.container,
    row.service,
    row.label === undefined || row.label === null ? '—' : String(row.label),
    verdictText(row.verdict),
  ]);

  const header = ['容器', '服務', '標記 commit', '結果'];
  const widths = header.map((title, column) =>
    Math.max(textWidth(title), ...table.map((cells) => textWidth(cells[column]))),
  );

  const renderRow = (cells) =>
    cells
      .map((cell, column) => (column === cells.length - 1 ? cell : pad(cell, widths[column] + COLUMN_GAP)))
      .join('')
      .trimEnd();

  lines.push('');
  lines.push(renderRow(header));

  for (const cells of table) {
    lines.push(renderRow(cells));
  }

  const count = (kind) => rows.filter((row) => row.verdict.kind === kind).length;

  lines.push('');
  lines.push(
    `相符 ${count('match')}、落後 ${count('stale')}、未知 ${count('unknown')}、不適用 ${count('skipped')}`,
  );

  if (count('stale') > 0 || count('unknown') > 0) {
    lines.push('重建並重啟：npm run deploy:build && docker compose up -d');
    lines.push('apps 在 profile 之下，要另外：docker compose --profile apps up -d apps');
  }

  return lines.join('\n');
}

async function gitCommit() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { windowsHide: true, cwd: process.cwd() });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function listContainers(project) {
  const { stdout } = await execFileAsync(
    'docker',
    ['ps', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Names}}'],
    { windowsHide: true, maxBuffer: 4 << 20 },
  );

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

async function inspectContainer(name) {
  // 一次問完兩個值：修訂標記與 compose service 名。
  const { stdout } = await execFileAsync(
    'docker',
    [
      'inspect',
      '--format',
      `{{ index .Config.Labels "${LABEL_KEY}" }}|{{ index .Config.Labels "com.docker.compose.service" }}`,
      name,
    ],
    { windowsHide: true },
  );

  const [label, service] = stdout.trim().split('|');

  return { label, service };
}

function parseArgs(argv) {
  const options = { project: DEFAULT_PROJECT, current: null, json: false, help: false };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--project=')) {
      options.project = arg.slice('--project='.length);
      continue;
    }

    if (arg.startsWith('--current=')) {
      options.current = arg.slice('--current='.length);
    }
  }

  return options;
}

export async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(`用法：npm run deploy:revision -- [--project=${DEFAULT_PROJECT}] [--current=<sha>] [--json]`);
    console.log(`退出碼：0 全部相符、${EXIT_STALE} 有落後、${EXIT_UNKNOWN} 有未知、${EXIT_PRECONDITION} 前置條件失敗`);
    return;
  }

  const currentSha = options.current ?? (await gitCommit());

  if (currentSha === null) {
    console.error('讀不到現行 commit（git rev-parse HEAD 失敗）；沒有基準就不可以講相符。');
    process.exitCode = EXIT_PRECONDITION;
    return;
  }

  let names;
  try {
    names = await listContainers(options.project);
  } catch (error) {
    console.error(
      `查不到專案 ${options.project} 的容器（docker 不可用？）：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = EXIT_PRECONDITION;
    return;
  }

  if (names.length === 0) {
    console.log(`專案 ${options.project} 沒有正在運行的容器；沒有東西可以比對。`);
    console.log('不是「全部相符」—— 是這一刻沒有容器。');
    return;
  }

  const rows = [];

  for (const name of names) {
    try {
      const { label, service } = await inspectContainer(name);
      const normalised = normaliseLabel(label);
      rows.push({
        container: name,
        service,
        label: normalised,
        verdict: verdictOf({ currentSha, service, label: normalised }),
      });
    } catch (error) {
      rows.push({
        container: name,
        service: '（讀不到）',
        label: null,
        verdict: {
          kind: 'unknown',
          reason: `讀不到容器標記（${error instanceof Error ? error.message : String(error)}）`,
        },
      });
    }
  }

  const code = exitCodeFor(rows);

  if (options.json) {
    console.log(JSON.stringify({ currentCommit: currentSha, project: options.project, rows, exitCode: code }, null, 2));
  } else {
    console.log(renderReport(rows, currentSha));
  }

  process.exitCode = code;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    console.error(`deploy:revision 失敗：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = EXIT_PRECONDITION;
  });
}
