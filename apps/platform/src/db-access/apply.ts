import type { Pool, PoolClient } from 'pg';
import { buildPlan, describeStep, ident, type AccessPlan, type Step } from './plan.js';
import type { AppTarget } from './naming.js';

/**
 * 執行計畫（issue #88）。
 *
 * 三個不可省的手續：
 *   1. **在交易內重新計畫**。plan 與 apply 之間可能有人建了表、加了權限；
 *      拿著舊計畫去執行等於閉著眼寫入。所以 apply 自己再算一次，而且是在
 *      advisory lock 之後才算。
 *   2. **資料庫範圍的 advisory lock**。兩個 apply 同時跑（例如兩個 app 的部署
 *      腳本同時啟動）會互相踩到 GRANT／REVOKE 的次序。
 *   3. **任何一步失敗整筆回滾**。寧願「一套都冇」，不要「有 role 但冇權限」
 *      或者「有權限但冇 default ACL」這種半套狀態。
 */

export const ACCESS_LOCK_KEY = 4_206_003;

export type ApplyInput = {
  pool: Pool;
  targets: readonly AppTarget[];
  migrationRole: string;
  /** role 名 → 密碼。只會用於新建立的 role；既有 role 一定不改密碼。 */
  passwords: Map<string, string>;
};

export type ApplyResult = {
  database: string;
  executed: string[];
  plan: AccessPlan;
};

export class AccessBlockedError extends Error {
  constructor(readonly blockers: string[]) {
    super(`db:app-access 拒絕執行：\n- ${blockers.join('\n- ')}`);
    this.name = 'AccessBlockedError';
  }
}

/** 執行一步。SQL 全部由已驗證的識別碼拼成，值一律經參數或 format(%L)。 */
async function runStep(
  client: PoolClient,
  step: Step,
  database: string,
  passwords: Map<string, string>,
): Promise<void> {
  switch (step.kind) {
    case 'create-role': {
      const password = passwords.get(step.role);

      if (password === undefined || password === '') {
        throw new Error(`建立 ${step.role} 需要密碼，但冇提供`);
      }

      // 密碼經 format(%L) 由伺服器引用，所以不需自己拼字串。
      // 它只會出現在這一條 DDL 裡面：不進 stdout、不進錯誤訊息、不進審計。
      const built = await client.query<{ sql: string }>(
        `select format(
           'create role %I login password %L nosuperuser nocreatedb nocreaterole noreplication nobypassrls',
           $1::text, $2::text) as sql`,
        [step.role, password],
      );

      const sql = built.rows[0]?.sql;

      if (sql === undefined) {
        throw new Error('組不出 create role 語句');
      }

      await client.query(sql);
      return;
    }

    case 'ensure-schema':
      await client.query(`create schema if not exists ${ident(step.schema)}`);
      return;

    case 'default-acl':
      await client.query(
        `alter default privileges for role ${ident(step.owner)} in schema ${ident(step.schema)}
           grant select, insert, update on tables to ${ident(step.role)}`,
      );
      await client.query(
        `alter default privileges for role ${ident(step.owner)} in schema ${ident(step.schema)}
           grant usage on sequences to ${ident(step.role)}`,
      );
      return;

    case 'grant-database':
      await client.query(`grant connect on database ${ident(database)} to ${ident(step.role)}`);
      return;

    case 'grant-schema-usage':
      await client.query(
        `grant usage on schema ${ident(step.schema)} to ${ident(step.role)}`,
      );
      return;

    case 'grant-tables':
      await client.query(
        `grant select, insert, update on all tables in schema ${ident(step.schema)} to ${ident(step.role)}`,
      );
      return;

    case 'grant-sequences':
      await client.query(
        `grant usage on all sequences in schema ${ident(step.schema)} to ${ident(step.role)}`,
      );
      return;

    case 'revoke-table-extras':
      await client.query(
        `revoke delete, truncate on all tables in schema ${ident(step.schema)} from ${ident(step.role)}`,
      );
      return;

    case 'revoke-schema-create':
      await client.query(
        `revoke create on schema ${ident(step.schema)} from ${ident(step.role)}`,
      );
      return;

    case 'revoke-public-schema-create':
      await client.query('revoke create on schema public from public');
      return;

    case 'revoke-public-tables':
      await client.query('revoke all privileges on all tables in schema public from public');
      return;

    case 'revoke-public-sequences':
      await client.query('revoke all privileges on all sequences in schema public from public');
      return;

    case 'revoke-public-function':
      // signature 由 pg 產生（例如 `f(integer)`），不是使用者輸入。
      await client.query(`revoke all privileges on function ${step.signature} from public`);
      return;
  }
}

export async function applyAccess(input: ApplyInput): Promise<ApplyResult> {
  const client = await input.pool.connect();

  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [ACCESS_LOCK_KEY]);

    const plan = await buildPlan({
      client,
      targets: input.targets,
      migrationRole: input.migrationRole,
    });

    const blockers = [
      ...plan.apps.flatMap((app) => app.blockers.map((item) => `${app.appId}：${item}`)),
      ...plan.publicBlockers,
    ];

    if (blockers.length > 0) {
      await client.query('rollback');
      throw new AccessBlockedError(blockers);
    }

    const executed: string[] = [];

    for (const app of plan.apps) {
      for (const step of app.steps) {
        await runStep(client, step, plan.database, input.passwords);
        executed.push(`${app.appId}：${describeStep(step)}`);
      }
    }

    for (const step of plan.publicSteps) {
      await runStep(client, step, plan.database, input.passwords);
      executed.push(describeStep(step));
    }

    await client.query('commit');

    return { database: plan.database, executed, plan };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
