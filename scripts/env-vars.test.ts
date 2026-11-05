import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkEnvVars,
  composeVarRefs,
  envExampleKeys,
  loadAllowlist,
  usageTexts,
} from './env-vars.mjs';

/**
 * docker-compose.yml 與 .env.example 的變數對照（issue #79）。
 *
 * 為甚麼要這一組：兩邊各寫一份就會漂移。有人在 compose 加了 `${NEW_VAR}` 而忘記寫進範本，
 * 部署時那個值永遠是空；有人在範本加了變數但那東西根本沒有人讀，讀者以為設了會有用。
 * 兩種都不會在 lint／test／build 出現，只會在上線時咬人。
 *
 * 檢查器本身是純函數（`scripts/env-vars.mjs`），所以「掃描失效」「突變」都可以用
 * 人手造的輸入驗，不需要改真檔。
 */

const repoRoot = process.cwd();

const composeText = readFileSync(resolve(repoRoot, 'docker-compose.yml'), 'utf8');
const envText = readFileSync(resolve(repoRoot, '.env.example'), 'utf8');
const allowlist = loadAllowlist(resolve(repoRoot, 'config/env-allowlist.json'));
const sources = usageTexts(repoRoot);

describe('掃描器本身', () => {
  it('讀到 compose 的變數引用，包含嵌套寫法（${A:-${B:-x}}）', () => {
    const refs = composeVarRefs(
      ['ports:', '  - "127.0.0.1:${A:-${B:-4210}}:80"', 'env:', '  KEY: ${C:?請先設定}'].join('\n'),
    );

    expect(refs.map((item) => item.name)).toEqual(['A', 'B', 'C']);
  });

  it('註解行內的 ${…} 不算引用', () => {
    const refs = composeVarRefs(['# 這裡提到 ${NOT_REAL}', 'env:', '  KEY: ${REAL}'].join('\n'));

    expect(refs.map((item) => item.name)).toEqual(['REAL']);
  });

  it('範本讀到 VAR= 與被註解的 # VAR= 兩種寫法', () => {
    const keys = envExampleKeys(['REAL=1', '# TEMPLATE=2', '# 說明文字', 'not_a_var=3'].join('\n'));

    expect(keys.map((item) => `${item.key}:${item.commented}`)).toEqual([
      'REAL:false',
      'TEMPLATE:true',
    ]);
  });

  it('真的讀到 compose、範本與原始碼的內容（不是空集合通過）', () => {
    expect(composeVarRefs(composeText).length).toBeGreaterThan(5);
    expect(envExampleKeys(envText).length).toBeGreaterThan(10);
    expect(sources.length).toBeGreaterThan(5);
  });
});

describe('真檔的變數對照', () => {
  const result = checkEnvVars({ composeText, envText, sources, allowlist });

  it('compose 用到的每個變數都有寫進 .env.example', () => {
    expect(result.composeUnknown.map((item) => `${item.name}（第 ${item.line} 行）`)).toEqual([]);
  });

  it('.env.example 的每個有效變數都真的有人讀', () => {
    expect(result.envUnused.map((item) => `${item.key}（第 ${item.line} 行）`)).toEqual([]);
  });

  it('allowlist 沒有多餘的項目（越積越多就等於沒有檢查）', () => {
    expect(result.allowlistUnused.map((item) => item.name)).toEqual([]);
  });
});

describe('突變：對照真的咬得住', () => {
  it('compose 加了沒有寫進範本的變數 → 失敗並指出變數名', () => {
    const mutated = `${composeText}\n  extra:\n    environment:\n      X: \${NEW_UNDOCUMENTED_VAR:-x}\n`;
    const result = checkEnvVars({ composeText: mutated, envText, sources, allowlist });

    expect(result.composeUnknown.map((item) => item.name)).toContain('NEW_UNDOCUMENTED_VAR');
  });

  it('範本加了沒有人讀的變數 → 失敗並指出變數名', () => {
    const mutated = `${envText}\nNOBODY_READS_ME=1\n`;
    const result = checkEnvVars({ composeText, envText: mutated, sources, allowlist });

    expect(result.envUnused.map((item) => item.key)).toContain('NOBODY_READS_ME');
  });

  it('allowlist 放了不需要的項目 → 失敗', () => {
    const result = checkEnvVars({
      composeText,
      envText,
      sources,
      allowlist: [...allowlist, { name: 'NOT_NEEDED_ANYWHERE', reason: '測試用' }],
    });

    expect(result.allowlistUnused.map((item) => item.name)).toEqual(['NOT_NEEDED_ANYWHERE']);
  });

  it('allowlist 的項目必須寫明理由', () => {
    expect(() => checkEnvVars({
      composeText,
      envText,
      sources,
      allowlist: [{ name: 'WEB_PORT', reason: '' }],
    })).toThrow(/理由/);
  });
});

describe('allowlist 檔本身', () => {
  it('每一項都有 name 與非空 reason', () => {
    expect(allowlist.length).toBeGreaterThan(0);

    for (const item of allowlist) {
      expect(item.name, JSON.stringify(item)).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(item.reason.trim().length, item.name).toBeGreaterThan(0);
    }
  });
});
