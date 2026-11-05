import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CI 設定檔的閘門（issue #79 第 3、4 項）。
 *
 * 為甚麼要測試一個 yml：`ci-ok` 的價值全部在「needs 齊不齊」與「if: always()」這兩行。
 * 少了 always()，某個檢查紅了之後 ci-ok 會被跳過 —— 在有 required check 的分支保護下，
 * 「跳過」等於永遠等不到結論，PR 卡死；而這件事在 yml 上看起來完全正常。
 *
 * 所以這裡把 workflow 當資料讀（純文字，不引入 YAML 依賴），並且**真的用 sh 跑一次**
 * ci-ok 的判斷邏輯：只檢查「檔案裡有這幾個字」證明不了它會紅。
 */

const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
const lines = workflow.split(/\r?\n/);

/** jobs: 底下第一層的 job 名（兩個空格縮進）。 */
function jobNames(): string[] {
  const start = lines.findIndex((line) => line.trim() === 'jobs:');
  if (start < 0) {
    throw new Error('ci.yml 沒有 jobs:');
  }

  const names: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line)) {
      break;
    }
    const match = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (match !== null) {
      names.push(match[1]);
    }
  }

  return names;
}

/** 一個 job 的原始文字。 */
function jobBlock(name: string): string {
  const header = `  ${name}:`;
  const start = lines.indexOf(header);
  if (start < 0) {
    throw new Error(`ci.yml 沒有 job ${name}`);
  }

  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) || /^ {2}[a-z][a-z0-9-]*:$/.test(line)) {
      break;
    }
    body.push(line);
  }

  return body.join('\n');
}

/** 一個 job 裡某個 step（以 `- name:` 認）的 run 腳本，去掉縮排。 */
function stepScript(job: string, stepName: string): string {
  const body = jobBlock(job).split('\n');
  const start = body.findIndex((line) => line.trim() === `- name: ${stepName}`);
  if (start < 0) {
    throw new Error(`job ${job} 沒有 step「${stepName}」`);
  }

  const runIndex = body.findIndex(
    (line, index) => index > start && /^\s+run: \|/.test(line),
  );
  if (runIndex < 0) {
    throw new Error(`step「${stepName}」沒有 run: |`);
  }

  const indent = /^(\s*)run: \|/.exec(body[runIndex])?.[1].length ?? 0;

  // YAML 的 block scalar 在「縮排回到 run: 的層級」時結束。
  // 這一條一定要寫對：多收幾行下游的註解，抽出來的腳本會拿註解的文字當命令跑（exit 127）。
  const scriptLines: string[] = [];
  for (let index = runIndex + 1; index < body.length; index += 1) {
    const line = body[index];
    const leading = /^\s*/.exec(line)?.[0].length ?? 0;

    if (line.trim() !== '' && leading <= indent) {
      break;
    }

    scriptLines.push(line.slice(indent + 2));
  }

  return scriptLines.join('\n');
}

/** 用 sh 跑一段腳本（alpine 與 git bash 都有 sh），回傳退出碼與輸出。 */
function runShell(script: string, env: Record<string, string>, prelude = ''): { code: number; output: string } {
  const result = spawnSync('sh', ['-c', `${prelude}\n${script}`], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

  if (result.error !== undefined) {
    throw new Error(`找不到 sh，無法驗證 CI 腳本：${result.error.message}`);
  }

  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

const CI_OK_STEP = '六個檢查的結果';
const ALL_OK = {
  LINT: 'success',
  TEST: 'success',
  BUILD: 'success',
  BOUNDARIES: 'success',
  COMPOSE: 'success',
};

describe('workflow 的形狀', () => {
  it('六個 job，一個不多一個不少', () => {
    expect(jobNames().sort()).toEqual([
      'boundaries',
      'build',
      'ci-ok',
      'compose',
      'lint',
      'test',
    ]);
  });

  it('每一個 job 都只在 PR 與 push 到 main 時跑，沒有 paths 過濾', () => {
    expect(workflow).toMatch(/on:\s*\n\s*pull_request:\s*\n\s*branches:\s*\n\s*- main/);
    expect(workflow).toMatch(/\n\s*push:\s*\n\s*branches:\s*\n\s*- main/);

    // 路徑過濾會讓「改了某個資料夾就不用跑檢查」——那就等於沒有檢查。
    expect(/^\s*paths(-ignore)?:/m.test(workflow)).toBe(false);
  });

  it('ci-ok 的 needs 就是另外五個，少一個就有檢查不受總閘門管', () => {
    const block = jobBlock('ci-ok');
    const needs = [...block.matchAll(/^ {6}- ([a-z][a-z0-9-]*)$/gm)].map((match) => match[1]);

    expect(needs.sort()).toEqual(['boundaries', 'build', 'compose', 'lint', 'test']);
  });

  it('ci-ok 有 if: always()，否則失敗時它會被跳過', () => {
    expect(jobBlock('ci-ok')).toMatch(/^\s*if: always\(\)$/m);
  });

  it('compose job 驗證預設組合與 apps profile，並有一個反向測試', () => {
    const block = jobBlock('compose');

    expect(block).toContain('docker compose --env-file .env.example config -q');
    expect(block).toContain('docker compose --env-file .env.example --profile apps config -q');
    expect(block).toContain('反向測試');
  });

  it('compose job 用的假值明顯是假的，不會被誤當真密碼', () => {
    const block = jobBlock('compose');
    const values = [...block.matchAll(/^\s{6}([A-Z_]+): (ci-dummy[^\s]*)$/gm)];

    expect(values.length).toBeGreaterThanOrEqual(3);
    for (const [, name, value] of values) {
      expect(value, name).toMatch(/^ci-dummy-not-a-secret/);
    }
  });
});

describe('ci-ok 的判斷邏輯真的會紅', () => {
  const script = stepScript('ci-ok', CI_OK_STEP);

  it('五個都 success → 通過並印出 CI_OK', () => {
    const result = runShell(script, ALL_OK);

    expect(result.output).toContain('CI_OK');
    expect(result.code).toBe(0);
  });

  it('任何一個 failure → 失敗，並指出是哪一個', () => {
    for (const key of ['LINT', 'TEST', 'BUILD', 'BOUNDARIES', 'COMPOSE'] as const) {
      const result = runShell(script, { ...ALL_OK, [key]: 'failure' });

      expect(result.code, key).toBe(1);
      expect(result.output, key).toContain(`檢查 ${key.toLowerCase()} 的結果是 failure`);
      expect(result.output, key).not.toContain('CI_OK');
    }
  });

  it('skipped 與 cancelled 都不算通過', () => {
    for (const value of ['skipped', 'cancelled']) {
      const result = runShell(script, { ...ALL_OK, COMPOSE: value });

      expect(result.code, value).toBe(1);
      expect(result.output, value).toContain(value);
    }
  });

  it('空字串（needs 沒算出來）也不算通過', () => {
    expect(runShell(script, { ...ALL_OK, LINT: '' }).code).toBe(1);
  });
});

describe('compose 的反向步驟會擋住「必填檢查被拿掉」', () => {
  const script = stepScript('compose', '反向測試：不給密碼時必須失敗');

  /** 假的 docker：config 的結果由 stub 決定，不需要真的 Docker。 */
  const stub = (code: number, message: string) =>
    `docker() {\n  printf '%s\\n' '${message}'\n  return ${code}\n}\n`;

  it('缺密碼時 docker compose 失敗且訊息正確 → 這一步通過', () => {
    const result = runShell(script, {}, stub(1, '請先複製 .env.example 為 .env'));

    expect(result.output).toContain('反向測試通過');
    expect(result.code).toBe(0);
  });

  it('缺密碼時 docker compose 竟然成功 → 這一步必須紅', () => {
    const result = runShell(script, {}, stub(0, 'services: {}'));

    expect(result.code).toBe(1);
    expect(result.output).toContain('必填檢查已經失效');
  });

  it('失敗了但不是預期訊息 → 這一步也必須紅', () => {
    const result = runShell(script, {}, stub(1, 'yaml: line 3: mapping values are not allowed'));

    expect(result.code).toBe(1);
    expect(result.output).toContain('不是預期的訊息');
  });
});
