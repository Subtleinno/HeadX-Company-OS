import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 邊界檢查的「故意違反」測試（issue #71）。
 *
 * 這裡不信任設定檔寫得對：fixtures 內有一組刻意違規的假程式碼，每條規則至少一個案例。
 * 測試用同一個 dependency-cruiser 與同一組規則去掃 fixtures，要求每個案例都被抓到，
 * 而且抓到它的正是預期那條規則。另外有一組「乾淨樣本」必須零違規 —— 否則一條
 * 「見人就咬」的規則也會令上面的案例全綠。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const depcruiseBin = resolve(repoRoot, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');
const fixturesConfig = resolve(here, 'fixtures/depcruise.config.mjs');

type Violation = {
  from: string;
  to: string;
  rule: { name: string; severity: string };
};

/**
 * 用本機 node 跑 depcruise，取 JSON 違規清單。
 * 注意：`-T json` 之下 depcruise 的退出碼固定是 0（它當你在做後續處理），
 * 所以「CI 會不會紅」另外用 exitCodeOf() 量真正的程序退出碼，不靠這一個。
 */
function cruise(roots: string[], config: string): Violation[] {
  const result = spawnSync(
    process.execPath,
    [depcruiseBin, ...roots, '--config', config, '--output-type', 'json', '--no-progress'],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  const stdout = result.stdout ?? '';
  if (stdout.trim() === '') {
    throw new Error(
      `depcruise 沒有輸出（exit=${String(result.status)}）：\n${result.stderr ?? ''}`,
    );
  }

  const parsed = JSON.parse(stdout) as { summary?: { violations?: Violation[] } };

  return parsed.summary?.violations ?? [];
}

/** 量 depcruise 真正那個程序的退出碼（預設 err reporter，即 lint:boundaries 用的那一個）。 */
function exitCodeOf(roots: string[], config: string): number {
  const result = spawnSync(
    process.execPath,
    [depcruiseBin, ...roots, '--config', config, '--no-progress'],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  return result.status ?? -1;
}

/**
 * 每個刻意違規的案例：哪個檔案、預期被哪條規則抓到。
 * 規則是動態按 app／package／模組資料夾生成的，所以名字帶 id。
 */
const CASES: { file: string; rule: string; what: string }[] = [
  {
    file: 'fixtures/violations/apps/alpha/src/main.ts',
    rule: 'app-cross-import-alpha',
    what: 'app 之間不可互相 import',
  },
  {
    file: 'fixtures/violations/apps/platform/src/index.ts',
    rule: 'platform-no-app-import',
    what: 'platform 不可引用任何 app',
  },
  {
    file: 'fixtures/violations/apps/alpha/src/deep-package.ts',
    rule: 'package-deep-import-kit',
    what: 'package 只可經 index.ts 被引用',
  },
  {
    file: 'fixtures/violations/apps/platform/src/consumer.ts',
    rule: 'module-deep-import-platform-alpha',
    what: '模組只可經 index.ts 被引用',
  },
  {
    file: 'fixtures/violations/apps/alpha/src/loop-a.ts',
    rule: 'no-circular',
    what: '不允許循環依賴',
  },
  {
    file: 'fixtures/violations/apps/alpha/src/web/screen.ts',
    rule: 'layer-web-no-domain-db',
    what: 'web 不可引用 domain 或 db',
  },
  {
    file: 'fixtures/violations/apps/alpha/src/domain/logic.ts',
    rule: 'layer-domain-no-framework',
    what: 'domain 不可引用 fastify、pg、react',
  },
  {
    file: 'fixtures/violations/apps/alpha/src/api/route.ts',
    rule: 'layer-api-no-web',
    what: 'api 不可引用 web',
  },
];

/** 規則家族：動態生成的名字帶 id，這裡按家族核對「每條規則都有案例」。 */
const FAMILIES = [
  'app-cross-import',
  'platform-no-app-import',
  'package-deep-import',
  'module-deep-import',
  'no-circular',
  'layer-web-no-domain-db',
  'layer-domain-no-framework',
  'layer-api-no-web',
];

function familyOf(ruleName: string): string {
  const matched = FAMILIES.find(
    (family) => ruleName === family || ruleName.startsWith(`${family}-`),
  );
  return matched ?? ruleName;
}

describe('邊界檢查：故意違反的 fixtures', () => {
  // depcruise 每次都要重新解析整個 fixture 圖；跟其他測試檔並行跑時，5 秒預設會不夠。
  // 這是量測工具的啟動成本，不是斷言放寬。
  const TIMEOUT_MS = 60_000;

  it('每個刻意違規的案例都被抓到，而且是由預期的那條規則抓到', () => {
    const violations = cruise(['tools/boundaries/fixtures/violations'], fixturesConfig);

    expect(violations.length).toBeGreaterThan(0);

    for (const testCase of CASES) {
      const hits = violations.filter(
        (violation) =>
          violation.from.endsWith(testCase.file) && violation.rule.name === testCase.rule,
      );

      expect(
        hits.length,
        `${testCase.what}：${testCase.file} 應該被 ${testCase.rule} 抓到，實際違規：${JSON.stringify(
          violations.map((violation) => `${violation.rule.name} @ ${violation.from}`),
          null,
          2,
        )}`,
      ).toBeGreaterThan(0);
    }

    // 違規存在時 depcruise 必須以非零退出，否則 CI 會假綠。
    expect(exitCodeOf(['tools/boundaries/fixtures/violations'], fixturesConfig)).not.toBe(0);
  }, TIMEOUT_MS);

  it('乾淨樣本零違規，證明規則不是見人就咬', () => {
    const violations = cruise(['tools/boundaries/fixtures/clean'], fixturesConfig);

    expect(
      violations.map((violation) => `${violation.rule.name} @ ${violation.from}`),
    ).toEqual([]);
    expect(exitCodeOf(['tools/boundaries/fixtures/clean'], fixturesConfig)).toBe(0);
  }, TIMEOUT_MS);

  it('每條規則家族都有至少一個 fixture 案例', () => {
    const covered = new Set(CASES.map((testCase) => familyOf(testCase.rule)));

    expect([...covered].sort()).toEqual([...new Set(FAMILIES)].sort());
  });

  it('倉庫現況沒有違規', () => {
    const config = resolve(repoRoot, '.dependency-cruiser.mjs');
    const violations = cruise(['apps', 'packages'], config);

    expect(
      violations.map((violation) => `${violation.rule.name} @ ${violation.from}`),
    ).toEqual([]);
    expect(exitCodeOf(['apps', 'packages'], config)).toBe(0);
  }, TIMEOUT_MS);
});
