import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { loadModules } from '../modules/registry/index.js';
import { applyAccess, AccessBlockedError } from './apply.js';
import { buildPlan, allBlockers, describeStep, isEmpty } from './plan.js';
import { parseAppList, resolveTargets, type AppTarget } from './naming.js';
import { verifyAccess } from './verify.js';

/**
 * `npm run db:app-access -- plan|apply|verify`（issue #88）。
 *
 * 三件要守住的紀律：
 *   1. **plan 唯讀**，所以可以安全地在正式庫跑；計畫與 apply 是同一份物件。
 *   2. **apply 要兩個明確訊號**：`--database` 指定目標、`--confirm` 表示確認。
 *      少一個就拒絕 —— 沒有「預設作用正式庫」這回事。
 *   3. **密碼只由 env 或檔案讀**，不接受命令列參數，也不會出現在輸出。
 */

export const USAGE = `用法：
  npm run db:app-access -- plan   --apps <a,b> [--database <db>] [--apps-dir <dir>] [--json]
  npm run db:app-access -- apply  --apps <a,b> --database <db> --confirm [--secrets-file <path>] [--apps-dir <dir>] [--json]
  npm run db:app-access -- verify --apps <a,b> [--database <db>] [--apps-dir <dir>] [--json]

秘密：APP_DB_<ID>_PASSWORD（env），或 --secrets-file 指一個 KEY=VALUE 檔。
連線：PGHOST／PGPORT（或 DB_PORT）／PGUSER（或 POSTGRES_USER）／PGPASSWORD（或 POSTGRES_PASSWORD）。
`;

export type Command = 'plan' | 'apply' | 'verify';

export type Options = {
  command: Command;
  apps: string[];
  database: string | undefined;
  appsDir: string;
  confirm: boolean;
  secretsFile: string | undefined;
  json: boolean;
};

export class UsageError extends Error {}

const COMMANDS: readonly Command[] = ['plan', 'apply', 'verify'];

export function parseArgs(argv: readonly string[]): Options {
  const [rawCommand, ...rest] = argv;

  if (rawCommand === undefined || !COMMANDS.includes(rawCommand as Command)) {
    throw new UsageError(`第一個參數必須是 plan／apply／verify（收到 ${String(rawCommand)}）`);
  }

  const options: Options = {
    command: rawCommand as Command,
    apps: [],
    database: undefined,
    appsDir: resolve(process.cwd(), 'apps'),
    confirm: false,
    secretsFile: undefined,
    json: false,
  };

  let appsRaw: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];

    if (item === undefined) {
      continue;
    }

    const value = (): string => {
      const next = rest[index + 1];

      if (next === undefined || next.startsWith('--')) {
        throw new UsageError(`${item} 需要一個值`);
      }

      index += 1;
      return next;
    };

    switch (item) {
      case '--apps':
        appsRaw = value();
        break;
      case '--database':
        options.database = value();
        break;
      case '--apps-dir':
        options.appsDir = resolve(process.cwd(), value());
        break;
      case '--secrets-file':
        options.secretsFile = resolve(process.cwd(), value());
        break;
      case '--confirm':
        options.confirm = true;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new UsageError(`未知參數：${item}`);
    }
  }

  options.apps = parseAppList(appsRaw);

  if (options.apps.length === 0) {
    throw new UsageError('必須用 --apps 指定要處理的 app（例如 --apps sales,support）');
  }

  if (options.command === 'apply') {
    if (options.database === undefined || options.database.trim() === '') {
      throw new UsageError('apply 必須用 --database 明確指定目標資料庫');
    }

    if (!options.confirm) {
      throw new UsageError('apply 必須帶 --confirm（表示你確認目標資料庫）');
    }
  }

  return options;
}

/** 只保留指定的 app，任何一個不在 manifest 入面就拒絕。 */
export function selectTargets(appsDir: string, appIds: readonly string[]): AppTarget[] {
  const registry = loadModules(appsDir);
  const known = new Set(registry.listModules().map((module) => module.id));
  const unknown = appIds.filter((id) => !known.has(id));

  if (unknown.length > 0) {
    throw new UsageError(
      `apps 目錄入面冇這幾個 app：${unknown.join('、')}（現有：${[...known].sort().join('、') || '（冇）'}）`,
    );
  }

  return resolveTargets(appIds);
}

type Secrets = Map<string, string>;

/**
 * 讀密碼。只由 env 與檔案來，不接受命令列參數 —— 命令列會留在 shell 歷史與
 * 程序清單，兩者都唔受這個工具控制。
 */
export function readSecrets(
  targets: readonly AppTarget[],
  env: NodeJS.ProcessEnv,
  secretsFile: string | undefined,
): Secrets {
  const fromFile: Record<string, string> = {};

  if (secretsFile !== undefined) {
    for (const line of readFileSync(secretsFile, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      const index = trimmed.indexOf('=');

      if (index <= 0) {
        continue;
      }

      fromFile[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
  }

  const secrets: Secrets = new Map();
  const missing: string[] = [];

  for (const target of targets) {
    const value = env[target.env.password] ?? fromFile[target.env.password];

    if (value === undefined || value === '') {
      missing.push(target.env.password);
      continue;
    }

    if (value.length < 16) {
      throw new UsageError(`${target.env.password} 太短（最少 16 個字元）`);
    }

    secrets.set(target.role, value);
  }

  if (missing.length > 0) {
    throw new UsageError(`缺少密碼：${missing.join('、')}（由 env 或 --secrets-file 提供）`);
  }

  return secrets;
}

export function connectionConfig(
  env: NodeJS.ProcessEnv,
  database: string | undefined,
): { host: string; port: number; user: string; password: string; database: string } {
  return {
    host: env.PGHOST ?? '127.0.0.1',
    port: Number(env.PGPORT ?? env.DB_PORT ?? 5432),
    user: env.PGUSER ?? env.POSTGRES_USER ?? 'company_os',
    password: env.PGPASSWORD ?? env.POSTGRES_PASSWORD ?? '',
    database: database ?? env.PGDATABASE ?? env.POSTGRES_DB ?? 'company_os',
  };
}

function printPlan(
  plan: Awaited<ReturnType<typeof buildPlan>>,
  json: boolean,
): void {
  if (json) {
    console.log(
      JSON.stringify(
        {
          database: plan.database,
          apps: plan.apps.map((app) => ({
            appId: app.appId,
            schema: app.schema,
            role: app.role,
            steps: app.steps.map(describeStep),
            blockers: app.blockers,
            notes: app.notes,
          })),
          publicFindings: plan.publicFindings,
          publicSteps: plan.publicSteps.map(describeStep),
          publicBlockers: plan.publicBlockers,
          publicNotes: plan.publicNotes,
        },
        null,
        2,
      ),
    );

    return;
  }

  console.log(`資料庫：${plan.database}`);

  for (const app of plan.apps) {
    console.log(`\n[${app.appId}] schema=${app.schema} role=${app.role}`);

    if (app.steps.length === 0) {
      console.log('  已經符合（冇事要做）');
    }

    for (const step of app.steps) {
      console.log(`  + ${describeStep(step)}`);
    }

    for (const note of app.notes) {
      console.log(`  ! ${note}`);
    }

    for (const blocker of app.blockers) {
      console.log(`  ✗ ${blocker}`);
    }
  }

  if (plan.publicFindings.length > 0) {
    console.log('\n[public]');
    for (const finding of plan.publicFindings) {
      console.log(`  現況：${finding}`);
    }
    for (const step of plan.publicSteps) {
      console.log(`  + ${describeStep(step)}`);
    }
    for (const note of plan.publicNotes) {
      console.log(`  ! ${note}`);
    }
    for (const blocker of plan.publicBlockers) {
      console.log(`  ✗ ${blocker}`);
    }
  }

  if (isEmpty(plan) && allBlockers(plan).length === 0) {
    console.log('\n沒有需要變更的地方。');
  }
}

async function withClient<T>(
  config: ReturnType<typeof connectionConfig>,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ ...config, max: 1 });
  const client = await pool.connect();

  try {
    return await run(client);
  } finally {
    client.release();
    await pool.end();
  }
}

export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let options: Options;
  let targets: AppTarget[];

  try {
    options = parseArgs(argv);
    targets = selectTargets(options.appsDir, options.apps);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`錯誤：${error.message}\n\n${USAGE}`);
      return 2;
    }

    throw error;
  }

  const config = connectionConfig(env, options.database);

  if (options.command === 'plan') {
    return withClient(config, async (client) => {
      const plan = await buildPlan({ client, targets, migrationRole: config.user });
      printPlan(plan, options.json);

      return allBlockers(plan).length > 0 ? 1 : 0;
    });
  }

  if (options.command === 'verify') {
    return withClient(config, async (client) => {
      const result = await verifyAccess(client, targets, config.user);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.ok) {
        console.log(`OK：${result.database} 的 ${targets.map((t) => t.appId).join('、')} 符合預期。`);
      } else {
        console.log(`不符合預期（${result.database}）：`);
        for (const failure of result.failures) {
          console.log(`  ✗ [${failure.scope}] ${failure.problem}`);
        }
      }

      for (const note of result.notes) {
        console.log(`  ! ${note}`);
      }

      return result.ok ? 0 : 1;
    });
  }

  let secrets: Secrets;

  try {
    secrets = readSecrets(targets, env, options.secretsFile);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`錯誤：${error.message}`);
      return 2;
    }

    throw error;
  }

  const pool = new Pool({ ...config, max: 2 });

  try {
    const result = await applyAccess({
      pool,
      targets,
      migrationRole: config.user,
      passwords: secrets,
    });

    if (options.json) {
      console.log(
        JSON.stringify({ database: result.database, executed: result.executed }, null, 2),
      );
    } else {
      console.log(`資料庫：${result.database}`);

      if (result.executed.length === 0) {
        console.log('沒有需要變更的地方（已經是這個狀態）。');
      }

      for (const line of result.executed) {
        console.log(`  ✓ ${line}`);
      }
    }

    return 0;
  } catch (error) {
    if (error instanceof AccessBlockedError) {
      console.error(error.message);
      return 1;
    }

    throw error;
  } finally {
    await pool.end();
  }
}
