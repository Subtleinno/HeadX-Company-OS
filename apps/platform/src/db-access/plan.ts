import { readAppState, readPublicState, type AppState, type PublicState } from './state.js';
import type { AppTarget } from './naming.js';

/**
 * `db:app-access` 的計畫、執行與核對（issue #88）。
 *
 * 一個原則：**plan 與 apply 是同一份物件**。`plan` 印出來的每一步，就是 `apply`
 * 會執行的每一步；沒有「計畫說會做 A，實際做了 B」這種空間。
 *
 * 另一條線：**不改已存在但唔對的 role**。角色是 cluster 級物件，同一個 cluster
 * 可能有其他安裝的帳號。遇到屬性不符、有成員資格、擁有物件的 role，一律阻擋
 * 並列出具體差異 —— 不降權、不改密碼、不接管。
 */

/** Postgres 識別碼引用。名稱本身已由 naming.ts 驗證，這裡只是最後一道。 */
export function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export type Step =
  | { kind: 'create-role'; role: string }
  | { kind: 'ensure-schema'; schema: string }
  | { kind: 'default-acl'; schema: string; role: string; owner: string }
  | { kind: 'grant-database'; role: string }
  | { kind: 'grant-schema-usage'; schema: string; role: string }
  | { kind: 'grant-tables'; schema: string; role: string }
  | { kind: 'grant-sequences'; schema: string; role: string }
  | { kind: 'revoke-table-extras'; schema: string; role: string }
  | { kind: 'revoke-schema-create'; schema: string; role: string }
  | { kind: 'revoke-public-schema-create' }
  | { kind: 'revoke-public-tables' }
  | { kind: 'revoke-public-sequences' }
  | { kind: 'revoke-public-function'; signature: string };

export type AppPlan = {
  appId: string;
  schema: string;
  role: string;
  steps: Step[];
  /** 有任何一項就拒絕 apply 與 verify。 */
  blockers: string[];
  /** 只是提醒，不阻擋（例如擴充套件的函數仍然對 PUBLIC 開放）。 */
  notes: string[];
};

export type AccessPlan = {
  database: string;
  apps: AppPlan[];
  publicFindings: string[];
  publicSteps: Step[];
  publicBlockers: string[];
  publicNotes: string[];
};

export function describeStep(step: Step): string {
  switch (step.kind) {
    case 'create-role':
      return `建立 LOGIN role ${step.role}（NOSUPERUSER／NOCREATEDB／NOCREATEROLE／NOREPLICATION／NOBYPASSRLS）`;
    case 'ensure-schema':
      return `建立 schema ${step.schema}（由目前連線的 migration 身份擁有）`;
    case 'default-acl':
      return `為 ${step.owner} 在 ${step.schema} 設定 default ACL：SELECT／INSERT／UPDATE 與 sequence USAGE 給 ${step.role}`;
    case 'grant-database':
      return `GRANT CONNECT ON DATABASE 給 ${step.role}`;
    case 'grant-schema-usage':
      return `GRANT USAGE ON SCHEMA ${step.schema} 給 ${step.role}`;
    case 'grant-tables':
      return `GRANT SELECT／INSERT／UPDATE ON ALL TABLES IN SCHEMA ${step.schema} 給 ${step.role}`;
    case 'grant-sequences':
      return `GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${step.schema} 給 ${step.role}`;
    case 'revoke-table-extras':
      return `REVOKE DELETE／TRUNCATE ON ALL TABLES IN SCHEMA ${step.schema} FROM ${step.role}`;
    case 'revoke-schema-create':
      return `REVOKE CREATE ON SCHEMA ${step.schema} FROM ${step.role}`;
    case 'revoke-public-schema-create':
      return 'REVOKE CREATE ON SCHEMA public FROM PUBLIC';
    case 'revoke-public-tables':
      return 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC';
    case 'revoke-public-sequences':
      return 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC';
    case 'revoke-public-function':
      return `REVOKE EXECUTE ON FUNCTION ${step.signature} FROM PUBLIC`;
  }
}

const REQUIRED_DEFAULT_ACL = ['r:SELECT', 'r:INSERT', 'r:UPDATE', 'S:USAGE'] as const;

function roleBlockers(state: AppState): string[] {
  const { role, target } = state;

  if (!role.exists) {
    return [];
  }

  const problems: string[] = [];

  if (role.superuser) problems.push('rolsuper = true');
  if (role.createDb) problems.push('rolcreatedb = true');
  if (role.createRole) problems.push('rolcreaterole = true');
  if (role.replication) problems.push('rolreplication = true');
  if (role.bypassRls) problems.push('rolbypassrls = true');
  if (!role.canLogin) problems.push('冇 LOGIN');

  if (role.memberOf > 0) {
    problems.push(`加入了 ${role.memberOf} 個角色（可以 SET ROLE，等於有別人嘅權限）`);
  }

  if (role.ownedSchemas.length > 0) {
    problems.push(`擁有 schema ${role.ownedSchemas.join('、')}`);
  }

  if (role.ownedRelations > 0) {
    problems.push(`擁有 ${role.ownedRelations} 個表／sequence`);
  }

  if (problems.length === 0) {
    return [];
  }

  // 刻意不修：降權或改密碼等於接管一個可能屬於其他安裝的角色。
  return [
    `${target.role} 已經存在，但唔符合預期（${problems.join('；')}）。` +
      '不會自動修正、降權或改密碼；請人手確認它是否屬於這個安裝。',
  ];
}

export function planForApp(state: AppState, migrationRole: string): AppPlan {
  const { target } = state;
  const steps: Step[] = [];
  const notes: string[] = [];
  const blockers = roleBlockers(state);

  if (blockers.length > 0) {
    return { appId: target.appId, schema: target.schema, role: target.role, steps, blockers, notes };
  }

  if (!state.role.exists) {
    steps.push({ kind: 'create-role', role: target.role });
  }

  if (!state.schemaExists) {
    steps.push({ kind: 'ensure-schema', schema: target.schema });
  } else if (state.schemaOwner === target.role) {
    blockers.push(
      `schema ${target.schema} 由 runtime role ${target.role} 擁有 —— runtime 唔應該擁有 schema。` +
        '不會自動改擁有權，請人手處理。',
    );

    return { appId: target.appId, schema: target.schema, role: target.role, steps, blockers, notes };
  }

  const missingDefaults = REQUIRED_DEFAULT_ACL.filter(
    (item) => !state.defaultAcl.granted.has(item),
  );

  if (missingDefaults.length > 0) {
    steps.push({
      kind: 'default-acl',
      schema: target.schema,
      role: target.role,
      owner: migrationRole,
    });
  }

  if (!state.roleCanConnect) {
    steps.push({ kind: 'grant-database', role: target.role });
  }

  if (!state.roleCanUseSchema) {
    steps.push({ kind: 'grant-schema-usage', schema: target.schema, role: target.role });
  }

  const tablesMissing = state.tables.some(
    (table) => !table.canSelect || !table.canInsert || !table.canUpdate,
  );
  const tablesWithExtras = state.tables.some((table) => table.canDelete || table.canTruncate);

  if (tablesMissing || tablesWithExtras) {
    steps.push({ kind: 'grant-tables', schema: target.schema, role: target.role });
  }

  if (tablesWithExtras) {
    steps.push({ kind: 'revoke-table-extras', schema: target.schema, role: target.role });
  }

  if (state.roleCanCreateInSchema) {
    steps.push({ kind: 'revoke-schema-create', schema: target.schema, role: target.role });
  }

  if (state.sequences.some((sequence) => !sequence.canUse)) {
    steps.push({ kind: 'grant-sequences', schema: target.schema, role: target.role });
  }

  return { appId: target.appId, schema: target.schema, role: target.role, steps, blockers, notes };
}

/**
 * `public` 的收斂。extension 擁有的函數不撤：那些物件不屬於本安裝的 migration，
 * 而且撤了可能令擴充套件失效。它們會出現在 plan 的 notes 入面，不會靜靜放過。
 */
export function planPublic(state: PublicState): {
  findings: string[];
  steps: Step[];
  blockers: string[];
  notes: string[];
} {
  const findings: string[] = [];
  const steps: Step[] = [];
  const blockers: string[] = [];
  const notes: string[] = [];

  if (state.schemaCreate) {
    findings.push('PUBLIC 在 schema public 有 CREATE（任何帳號都可以建物件）');
    steps.push({ kind: 'revoke-public-schema-create' });
  }

  if (state.tables.length > 0) {
    findings.push(
      `PUBLIC 對 public 的 ${state.tables.length} 張表有權限：` +
        state.tables.map((table) => `${table.name}(${table.privileges.join('、')})`).join('；'),
    );
    steps.push({ kind: 'revoke-public-tables' });
  }

  if (state.sequences.length > 0) {
    findings.push(
      `PUBLIC 對 public 的 ${state.sequences.length} 個 sequence 有權限：` +
        state.sequences.map((item) => `${item.name}(${item.privileges.join('、')})`).join('；'),
    );
    steps.push({ kind: 'revoke-public-sequences' });
  }

  for (const fn of state.functions) {
    if (fn.extensionOwned) {
      const detail = `擴充套件函數 ${fn.signature} 仍然對 PUBLIC 開放 EXECUTE`;
      notes.push(detail);

      if (fn.securityDefiner) {
        blockers.push(
          `${detail}，而且是 SECURITY DEFINER —— 本工具不會改擴充套件的物件，` +
            '請人手確認它是否真的可以被任何帳號呼叫。',
        );
      }

      continue;
    }

    steps.push({ kind: 'revoke-public-function', signature: fn.signature });

    if (fn.securityDefiner) {
      findings.push(`SECURITY DEFINER 函數 ${fn.signature} 對 PUBLIC 開放 EXECUTE`);
    }
  }

  return { findings, steps, blockers, notes };
}

export type PlanInput = {
  client: Parameters<typeof readAppState>[0];
  targets: readonly AppTarget[];
  migrationRole: string;
};

export async function buildPlan(input: PlanInput): Promise<AccessPlan> {
  const apps: AppPlan[] = [];

  for (const target of input.targets) {
    apps.push(planForApp(await readAppState(input.client, target), input.migrationRole));
  }

  const publicState = await readPublicState(input.client);
  const publicPlan = planPublic(publicState);

  const database = await input.client.query<{ datname: string }>('select current_database() as datname');

  return {
    database: database.rows[0]?.datname ?? '(unknown)',
    apps,
    publicFindings: publicPlan.findings,
    publicSteps: publicPlan.steps,
    publicBlockers: publicPlan.blockers,
    publicNotes: publicPlan.notes,
  };
}

export function allBlockers(plan: AccessPlan): string[] {
  return [
    ...plan.apps.flatMap((app) => app.blockers.map((item) => `${app.appId}：${item}`)),
    ...plan.publicBlockers.map((item) => `public：${item}`),
  ];
}

export function isEmpty(plan: AccessPlan): boolean {
  return (
    plan.apps.every((app) => app.steps.length === 0) &&
    plan.publicSteps.length === 0
  );
}
