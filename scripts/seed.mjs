/**
 * 把一份 SQL 檔灌入本機 stack 的 Postgres。
 *
 *   npm run seed:frame                 # 據點目錄三行
 *   npm run seed -- scripts/xxx.sql    # 其他示意資料
 *
 * 為甚麼要有這支：手寫的 `docker compose exec -T db psql … < file.sql` 在
 * PowerShell 內根本行不通 —— PowerShell 不支援 `<` 重定向（會報
 * `The '<' operator is reserved for future use`）。而這份 repo 的目標環境
 * 同時有 macOS 與 Windows，所以讀檔與餵 stdin 都交給 Node 做，
 * 兩個平台跑的是同一段程式。
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_SQL = 'scripts/seed-frame-demo.sql';

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint !== undefined) {
    console.error(`  ${hint}`);
  }
  process.exit(1);
}

const relativePath = process.argv[2] ?? DEFAULT_SQL;
const sqlPath = resolve(repoRoot, relativePath);

if (!existsSync(sqlPath)) {
  fail(`找不到 ${relativePath}。`, '路徑相對於 repo 根目錄。');
}

const sql = readFileSync(sqlPath, 'utf8');

const child = spawn(
  'docker',
  [
    'compose',
    'exec',
    '-T',
    'db',
    // 在容器內用容器自己的環境變數，不在主機猜帳密。
    'sh',
    '-c',
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ],
  { cwd: repoRoot, stdio: ['pipe', 'inherit', 'inherit'], shell: false },
);

child.on('error', () => {
  fail('叫不到 docker。', 'Docker Desktop 要開著；`docker compose ps` 要見到 db 容器在跑。');
});

child.stdin.write(sql);
child.stdin.end();

child.on('close', (code) => {
  if (code !== 0) {
    fail(
      `${relativePath} 灌入失敗（psql 退出碼 ${code}）。`,
      '上面的錯誤訊息是 Postgres 講的原文；最常見是 db 容器未起，或這個 SQL 需要先有另一個檔的資料。',
    );
  }

  console.log(`✓ 已套用 ${relativePath}`);
});
