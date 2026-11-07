import { execFile, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { REPO_BUILT_SERVICES, parseRevision } from './deploy-revision.mjs';

const execFileAsync = promisify(execFile);

/**
 * 建置三個由本 repo 負責的映像，並把建置時的 commit 寫進映像（issue #143）。
 *
 * 為甚麼要有這支腳本，而不是叫人在 README 手打 `GIT_REVISION=$(git rev-parse HEAD) docker compose build`：
 * 那個寫法在 Windows／cmd／PowerShell／Git Bash 各有不同的語法，而這個 repo 的目標機是 Windows。
 * 手打錯一次，就會建出一個 label 是空或 unknown 的映像 —— 正是這張 issue 要消滅的東西。
 *
 * 讀不到 commit 就**拒絕建置**：一個查不到出處的映像，上線之後沒有人能證明它跑的是哪一版。
 */
export async function resolveCommit() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      windowsHide: true,
      cwd: process.cwd(),
    });
    const parsed = parseRevision(stdout.trim());

    return parsed.kind === 'known' ? parsed.sha : null;
  } catch {
    return null;
  }
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });

    child.once('error', (error) => reject(error));
    child.once('close', (code) => resolve(code ?? 1));
  });
}

export async function main() {
  const commit = await resolveCommit();

  if (commit === null) {
    console.error('讀不到現行 commit（git rev-parse HEAD 失敗）；拒絕建置一個查不到出處的映像。');
    process.exitCode = 1;
    return;
  }

  console.log(`建置 ${REPO_BUILT_SERVICES.join('、')}，revision = ${commit}`);

  let code;
  try {
    code = await run('docker', ['compose', 'build', ...REPO_BUILT_SERVICES], {
      ...process.env,
      GIT_REVISION: commit,
    });
  } catch (error) {
    console.error(`叫不到 docker：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (code !== 0) {
    console.error(`docker compose build 失敗（exit ${code}）；映像沒有更新，容器仍然跑舊版。`);
    process.exitCode = code;
    return;
  }

  console.log('建置完成。下一步：');
  console.log('  docker compose up -d');
  console.log('  docker compose --profile apps up -d apps');
  console.log('  npm run deploy:revision   # 確認每個容器都對應到這個 commit');
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    console.error(`deploy:build 失敗：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
