/**
 * docker-compose.yml 與 .env.example 的變數對照（issue #79 第 1 項）。
 *
 * 兩邊各寫一份就會漂移，而且兩種漂移都不會在 lint／test／build 出現：
 *
 *   1. compose 讀 `${VAR}`，但範本沒寫 → 這個值永遠是空（有預設值時永遠是預設值），
 *      上線時才發現「明明設了卻沒有生效」。
 *   2. 範本寫了 `VAR=`，但程式沒有人讀 → 讀者以為設了有用，實際上是裝飾品。
 *
 * 這個檔只做文字比對，不啟動任何東西：把「寫錯」變成合併前的紅燈，成本最低。
 * 例外寫在 `config/env-allowlist.json`，每一項都要有理由 —— 而且理由空著就當錯誤，
 * 否則它會變成「不想修的都可以丟進來」的抽屜。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(import.meta.dirname, '..');

/** 變數名的形狀：大寫開頭，只可以大寫字母、數字、底線。 */
const VAR_NAME = '[A-Z][A-Z0-9_]*';

/**
 * `${VAR}`、`${VAR:-預設}`、`${VAR:?訊息}` 都算引用。
 *
 * 前面不可以是 `$`：compose 的 `$${VAR}` 是「跳脫」，那個 `${VAR}` 會原樣交給容器，
 * 由容器的 shell 展開（見 db 的 healthcheck），不是 compose 的插值，不可以當成引用。
 *
 * 嵌套寫法 `${A:-${B:-4210}}` 會依序抓到 A 與 B —— 因為每個 match 只吃 `${` 加名字，
 * 掃描位置停在名字之後，內層的 `${B` 仍然會被看到。
 */
const COMPOSE_REF = new RegExp(`(?<!\\$)\\$\\{(${VAR_NAME})`, 'g');

/** 註解行：整行（去掉縮進後）以 # 開頭。 */
const isComment = (line) => /^\s*#/.test(line);

/**
 * compose 檔裡所有被插值的變數，按首次出現的順序去重。
 *
 * @param {string} text
 * @returns {{ name: string, line: number }[]}
 */
export function composeVarRefs(text) {
  /** @type {{ name: string, line: number }[]} */
  const refs = [];
  const seen = new Set();

  text.split(/\r?\n/).forEach((raw, index) => {
    if (isComment(raw)) {
      return;
    }

    for (const match of raw.matchAll(COMPOSE_REF)) {
      const name = match[1];
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      refs.push({ name, line: index + 1 });
    }
  });

  return refs;
}

/**
 * 範本裡宣告的變數。
 *
 * 兩種寫法都收：真的 `VAR=`，以及被註解的 `# VAR=`（範本裡示範「可以設但預設不設」的
 * 寫法，例如 MINIO_DATA_DIR 同時有示範行與有效行）。註解行的 `commented` 是 true，
 * 代表「文件有提到」，可以滿足 compose 的引用，但不會被要求「一定要有人讀」。
 *
 * 小寫開頭的不是變數（`not_a_var=3` 這種說明文字），直接略過。
 * 同一個名字出現兩次時，有效的（非註解）那一次勝出。
 *
 * @param {string} text
 * @returns {{ key: string, line: number, commented: boolean }[]}
 */
export function envExampleKeys(text) {
  /** @type {Map<string, { key: string, line: number, commented: boolean }>} */
  const byKey = new Map();

  text.split(/\r?\n/).forEach((raw, index) => {
    const match = /^(#\s*)?([A-Z][A-Z0-9_]*)=/.exec(raw);
    if (match === null) {
      return;
    }

    const key = match[2];
    const commented = match[1] !== undefined;
    const previous = byKey.get(key);

    if (previous === undefined) {
      byKey.set(key, { key, line: index + 1, commented });
      return;
    }

    if (previous.commented && !commented) {
      byKey.set(key, { key, line: index + 1, commented });
    }
  });

  return [...byKey.values()];
}

/** 會被掃「有沒有人讀」的副檔名。刻意不含 .md 與 .json：文件提到名字不等於程式讀它。 */
const USAGE_EXTENSIONS = new Set([
  '.ts',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.yml',
  '.yaml',
  '.sh',
  '.conf',
  '.template',
  '.html',
]);

/** 不用看的資料夾：依賴、產出、暫存。 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.workbuddy',
  'fixtures',
]);

/** 測試檔不算「有人讀」：閘門要擋的是真的程式與設定。 */
const isTestFile = (name) => /\.(test|spec)\.[cm]?[jt]s$/.test(name);

/**
 * 掃 scripts/、apps/、packages/ 的原始碼與設定，回傳每一份的文字。
 * 呼叫者只會用 `some(text => ...)`，所以回傳陣列就夠。
 *
 * @param {string} root
 * @returns {{ file: string, text: string }[]}
 */
export function usageTexts(root) {
  /** @type {{ file: string, text: string }[]} */
  const collected = [];

  const walk = (dir, depth) => {
    if (depth > 8) {
      return;
    }

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(full, depth + 1);
        }
        continue;
      }

      if (!entry.isFile() || isTestFile(entry.name)) {
        continue;
      }

      const dot = entry.name.lastIndexOf('.');
      if (dot < 0 || !USAGE_EXTENSIONS.has(entry.name.slice(dot))) {
        continue;
      }

      try {
        if (statSync(full).size > 1024 * 1024) {
          continue;
        }
        collected.push({ file: full.slice(root.length + 1).replaceAll('\\', '/'), text: readFileSync(full, 'utf8') });
      } catch {
        // 讀不到就當沒有；這一支不負責診斷權限。
      }
    }
  };

  for (const dir of ['scripts', 'apps', 'packages']) {
    walk(join(root, dir), 0);
  }

  return collected;
}

/**
 * 讀 allowlist。格式是一個陣列，每項 `{ name, reason }`。
 *
 * @param {string} file
 * @returns {{ name: string, reason: string }[]}
 */
export function loadAllowlist(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));

  if (!Array.isArray(parsed)) {
    throw new Error(`${file} 必須是一個陣列（每項 { name, reason }）`);
  }

  return parsed;
}

/** 變數名是否出現在任何一份原始碼裡（整字比對，避免 BACKUP 撞到 BACKUP_ROOT）。 */
export function isReadBySources(name, sources) {
  const pattern = new RegExp(`\\b${name}\\b`);
  return sources.some((source) => pattern.test(source.text));
}

/**
 * 跑完整對照。
 *
 * @param {{
 *   composeText: string,
 *   envText: string,
 *   sources: { file: string, text: string }[],
 *   allowlist: { name: string, reason: string }[],
 * }} input
 * @returns {{
 *   composeUnknown: { name: string, line: number }[],
 *   envUnused: { key: string, line: number }[],
 *   allowlistUnused: { name: string, reason: string }[],
 *   checked: { composeRefs: number, envKeys: number, sources: number, allowlist: number },
 * }}
 */
export function checkEnvVars({ composeText, envText, sources, allowlist }) {
  for (const item of allowlist) {
    if (typeof item?.name !== 'string' || item.name.trim() === '') {
      throw new Error(`allowlist 有項目缺少 name：${JSON.stringify(item)}`);
    }
    if (typeof item?.reason !== 'string' || item.reason.trim() === '') {
      throw new Error(`allowlist 的 ${item.name} 沒有寫理由（reason 不可以是空字串）`);
    }
  }

  const allowed = new Set(allowlist.map((item) => item.name));
  const composeRefs = composeVarRefs(composeText);
  const envKeys = envExampleKeys(envText);

  const documented = new Set(envKeys.map((item) => item.key));

  // 1. compose 讀了、範本沒寫、也不是已記錄的例外。
  const composeUnknown = composeRefs.filter(
    (ref) => !documented.has(ref.name) && !allowed.has(ref.name),
  );

  // 2. 範本的有效變數（非註解）沒有任何程式／設定引用，也不是已記錄的例外。
  const composeNames = new Set(composeRefs.map((ref) => ref.name));
  const envUnused = envKeys.filter(
    (item) =>
      !item.commented &&
      !composeNames.has(item.key) &&
      !allowed.has(item.key) &&
      !isReadBySources(item.key, sources),
  );

  // 3. allowlist 的每一項都要真的需要，否則它只是抽屜。
  //    「需要」= 補了一個 compose 有而範本沒有的變數，或補了一個範本有而沒有人讀的變數。
  const composeUnknownNames = new Set(composeUnknown.map((ref) => ref.name));
  const envUnusedNames = new Set(envUnused.map((item) => item.key));

  const allowlistUnused = allowlist.filter((item) => {
    const needed =
      composeUnknownNames.has(item.name) ||
      envUnusedNames.has(item.name) ||
      (!documented.has(item.name) && composeNames.has(item.name)) ||
      (documented.has(item.name) &&
        !composeNames.has(item.name) &&
        !isReadBySources(item.name, sources));

    return !needed;
  });

  return {
    composeUnknown,
    envUnused,
    allowlistUnused,
    checked: {
      composeRefs: composeRefs.length,
      envKeys: envKeys.length,
      sources: sources.length,
      allowlist: allowlist.length,
    },
  };
}

/** 把結果印成人看得懂的樣子；有問題回傳非 0。 */
function main() {
  const { composeUnknown, envUnused, allowlistUnused, checked } = checkEnvVars({
    composeText: readFileSync(join(REPO_ROOT, 'docker-compose.yml'), 'utf8'),
    envText: readFileSync(join(REPO_ROOT, '.env.example'), 'utf8'),
    sources: usageTexts(REPO_ROOT),
    allowlist: loadAllowlist(join(REPO_ROOT, 'config/env-allowlist.json')),
  });

  console.log(
    `掃描 ${checked.composeRefs} 個 compose 變數、${checked.envKeys} 個範本變數、${checked.sources} 個檔案、${checked.allowlist} 條例外`,
  );

  let failed = false;

  for (const item of composeUnknown) {
    failed = true;
    console.error(
      `docker-compose.yml 第 ${item.line} 行讀 ${item.name}，但 .env.example 沒有寫（也沒列在 config/env-allowlist.json）`,
    );
  }

  for (const item of envUnused) {
    failed = true;
    console.error(
      `.env.example 第 ${item.line} 行的 ${item.key} 沒有任何程式或設定讀它（也沒列在 config/env-allowlist.json）`,
    );
  }

  for (const item of allowlistUnused) {
    failed = true;
    console.error(`config/env-allowlist.json 的 ${item.name} 已經不需要了，請刪掉（理由：${item.reason}）`);
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log('ENV_VARS_OK');
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
