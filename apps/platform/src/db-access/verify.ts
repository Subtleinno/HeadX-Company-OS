import type { PoolClient } from 'pg';
import { allBlockers, buildPlan, describeStep, type AccessPlan } from './plan.js';
import type { AppTarget } from './naming.js';

/**
 * 核對（issue #88）。
 *
 * `verify` 的定義很窄：**如果現在再計畫一次，還有沒有事要做**。
 * 這樣 plan／apply／verify 三者永遠講同一件事 —— 不會出現「verify 說 OK，
 * 但 plan 仍然有十步未做」這種兩套標準。
 *
 * 它同時覆蓋「有效權限」：狀態查的是 `has_table_privilege` 之類的函數，
 * 所以繼承回來的、經 PUBLIC 得來的權限一樣算數。
 */

export type VerifyFailure = {
  scope: string;
  problem: string;
};

export type VerifyResult = {
  ok: boolean;
  database: string;
  failures: VerifyFailure[];
  notes: string[];
};

function failuresFromPlan(plan: AccessPlan): VerifyFailure[] {
  const failures: VerifyFailure[] = [];

  for (const blocker of allBlockers(plan)) {
    failures.push({ scope: 'blocker', problem: blocker });
  }

  for (const app of plan.apps) {
    for (const step of app.steps) {
      failures.push({ scope: app.appId, problem: `未完成：${describeStep(step)}` });
    }
  }

  for (const step of plan.publicSteps) {
    failures.push({ scope: 'public', problem: `未完成：${describeStep(step)}` });
  }

  return failures;
}

export async function verifyAccess(
  client: PoolClient,
  targets: readonly AppTarget[],
  migrationRole: string,
): Promise<VerifyResult> {
  const plan = await buildPlan({ client, targets, migrationRole });
  const failures = failuresFromPlan(plan);

  return {
    ok: failures.length === 0,
    database: plan.database,
    failures,
    notes: [
      ...plan.apps.flatMap((app) => app.notes.map((note) => `${app.appId}：${note}`)),
      ...plan.publicNotes,
    ],
  };
}
