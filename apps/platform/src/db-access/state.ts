import type { PoolClient } from 'pg';
import type { AppTarget } from './naming.js';

/**
 * 資料庫的「現況」（issue #88）。全部是唯讀查詢。
 *
 * 為甚麼要把「查」與「改」分開：`plan` 必須可以在正式庫上安全地跑，
 * 而唯一可以保證它安全的方法，就是它只做 SELECT。`apply` 拿到的計畫
 * 與 `plan` 印出來的計畫是同一份物件 —— 不是兩段各自寫的邏輯。
 */

export type RoleState = {
  exists: boolean;
  canLogin: boolean;
  superuser: boolean;
  createDb: boolean;
  createRole: boolean;
  replication: boolean;
  bypassRls: boolean;
  /** 直接或間接加入了幾多個角色（pg_auth_members 的列數）。runtime 應該是 0。 */
  memberOf: number;
  /** 在目前資料庫擁有幾多個 schema／表／sequence。runtime 應該是 0。 */
  ownedSchemas: string[];
  ownedRelations: number;
};

export const EMPTY_ROLE: RoleState = {
  exists: false,
  canLogin: false,
  superuser: false,
  createDb: false,
  createRole: false,
  replication: false,
  bypassRls: false,
  memberOf: 0,
  ownedSchemas: [],
  ownedRelations: 0,
};

export type TableState = {
  name: string;
  canSelect: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canTruncate: boolean;
};

export type SequenceState = {
  name: string;
  canUse: boolean;
  canUpdate: boolean;
};

export type DefaultAclState = {
  /** 已經在 default ACL 入面的 (objtype, privilege)，例如 ('r','SELECT')。 */
  granted: Set<string>;
  /** 設定 default ACL 的角色（物件建立者）。 */
  owners: string[];
};

export type PublicFunction = {
  signature: string;
  extensionOwned: boolean;
  securityDefiner: boolean;
};

export type PublicState = {
  schemaCreate: boolean;
  tables: Array<{ name: string; privileges: string[] }>;
  sequences: Array<{ name: string; privileges: string[] }>;
  functions: PublicFunction[];
  /** 資料庫層的 PUBLIC 權限，只報告不修改（不在本張授權範圍）。 */
  databasePrivileges: string[];
};

export type AppState = {
  target: AppTarget;
  role: RoleState;
  schemaExists: boolean;
  schemaOwner: string | null;
  /** 角色可不可以連這個資料庫；未存在的角色一律 false。 */
  roleCanConnect: boolean;
  /** 角色在 schema 上有冇 USAGE；schema 未存在一律 false。 */
  roleCanUseSchema: boolean;
  /** 角色可唔可以在 schema 建物件（唔應該）。 */
  roleCanCreateInSchema: boolean;
  tables: TableState[];
  sequences: SequenceState[];
  defaultAcl: DefaultAclState;
};

export async function readRole(client: PoolClient, role: string): Promise<RoleState> {
  const rows = await client.query<{
    rolcanlogin: boolean;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    member_of: number;
    owned_relations: number;
  }>(
    `select r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
            r.rolreplication, r.rolbypassrls,
            (select count(*)::int from pg_auth_members m where m.member = r.oid) as member_of,
            (select count(*)::int from pg_class c where c.relowner = r.oid) as owned_relations
       from pg_roles r
      where r.rolname = $1`,
    [role],
  );

  const row = rows.rows[0];

  if (row === undefined) {
    return { ...EMPTY_ROLE };
  }

  const schemas = await client.query<{ nspname: string }>(
    `select n.nspname
       from pg_namespace n
       join pg_roles r on r.oid = n.nspowner
      where r.rolname = $1
      order by n.nspname`,
    [role],
  );

  return {
    exists: true,
    canLogin: row.rolcanlogin,
    superuser: row.rolsuper,
    createDb: row.rolcreatedb,
    createRole: row.rolcreaterole,
    replication: row.rolreplication,
    bypassRls: row.rolbypassrls,
    memberOf: row.member_of,
    ownedSchemas: schemas.rows.map((item) => item.nspname),
    ownedRelations: row.owned_relations,
  };
}

export async function readSchema(
  client: PoolClient,
  schema: string,
): Promise<{ exists: boolean; owner: string | null }> {
  const rows = await client.query<{ owner: string }>(
    `select pg_get_userbyid(n.nspowner) as owner from pg_namespace n where n.nspname = $1`,
    [schema],
  );

  const row = rows.rows[0];

  return row === undefined ? { exists: false, owner: null } : { exists: true, owner: row.owner };
}

export async function readTables(
  client: PoolClient,
  role: string | null,
  schema: string,
): Promise<TableState[]> {
  // 角色未建立時查不到有效權限（has_table_privilege 會擲錯），
  // 但**表名仍然要讀** —— 否則「新角色 + 已有表」這種情況會漏了授權那一步。
  if (role === null) {
    const names = await client.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relkind in ('r', 'p') order by c.relname`,
      [schema],
    );

    return names.rows.map((row) => ({
      name: row.relname,
      canSelect: false,
      canInsert: false,
      canUpdate: false,
      canDelete: false,
      canTruncate: false,
    }));
  }

  const rows = await client.query<{
    relname: string;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_truncate: boolean;
  }>(
    `select c.relname,
            has_table_privilege($1, c.oid, 'SELECT') as can_select,
            has_table_privilege($1, c.oid, 'INSERT') as can_insert,
            has_table_privilege($1, c.oid, 'UPDATE') as can_update,
            has_table_privilege($1, c.oid, 'DELETE') as can_delete,
            has_table_privilege($1, c.oid, 'TRUNCATE') as can_truncate
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $2 and c.relkind in ('r', 'p')
      order by c.relname`,
    [role, schema],
  );

  return rows.rows.map((row) => ({
    name: row.relname,
    canSelect: row.can_select,
    canInsert: row.can_insert,
    canUpdate: row.can_update,
    canDelete: row.can_delete,
    canTruncate: row.can_truncate,
  }));
}

export async function readSequences(
  client: PoolClient,
  role: string | null,
  schema: string,
): Promise<SequenceState[]> {
  if (role === null) {
    const names = await client.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relkind = 'S' order by c.relname`,
      [schema],
    );

    return names.rows.map((row) => ({ name: row.relname, canUse: false, canUpdate: false }));
  }

  const rows = await client.query<{ relname: string; can_use: boolean; can_update: boolean }>(
    `select c.relname,
            has_sequence_privilege($1, c.oid, 'USAGE') as can_use,
            has_sequence_privilege($1, c.oid, 'UPDATE') as can_update
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $2 and c.relkind = 'S'
      order by c.relname`,
    [role, schema],
  );

  return rows.rows.map((row) => ({
    name: row.relname,
    canUse: row.can_use,
    canUpdate: row.can_update,
  }));
}

/**
 * 這個 schema 的 default ACL 現況。
 *
 * `ALTER DEFAULT PRIVILEGES` 是**按物件建立者**記錄的：設定在錯的角色上，
 * 之後 migration 建的表一樣不會有授權，而且沒有一個測試會叫。所以這裡一定要
 * 記錄「是哪個角色設的」，plan 亦會用同一個角色去補。
 */
export async function readDefaultAcl(
  client: PoolClient,
  schema: string,
  role: string,
): Promise<DefaultAclState> {
  const rows = await client.query<{ objtype: string; grantee: string; privilege: string }>(
    `select d.defaclobjtype as objtype,
            pg_get_userbyid(a.grantee) as grantee,
            a.privilege_type as privilege
       from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
       cross join lateral aclexplode(d.defaclacl) a
      where n.nspname = $1`,
    [schema],
  );

  const granted = new Set<string>();
  const owners = new Set<string>();

  const ownerRows = await client.query<{ owner: string }>(
    `select pg_get_userbyid(d.defaclrole) as owner
       from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname = $1`,
    [schema],
  );

  for (const row of ownerRows.rows) {
    owners.add(row.owner);
  }

  for (const row of rows.rows) {
    if (row.grantee === role) {
      granted.add(`${row.objtype}:${row.privilege}`);
    }
  }

  return { granted, owners: [...owners].sort() };
}

/**
 * `public` schema 與其中的物件，PUBLIC 角色實際持有的權限。
 *
 * 為甚麼要查這個：`REVOKE … FROM app_role` 只回答「這個帳號有沒有」，
 * 但如果權限其實來自 PUBLIC，任何一個新建的帳號都會自動擁有同一份權限 ——
 * 隔離等於沒有做。所以要查 PUBLIC 本身。
 */
export async function readPublicState(client: PoolClient): Promise<PublicState> {
  const schemaRows = await client.query<{ privilege: string }>(
    `select a.privilege_type as privilege
       from pg_namespace n
       cross join lateral aclexplode(n.nspacl) a
      where n.nspname = 'public' and a.grantee = 0`,
  );

  const tableRows = await client.query<{ relname: string; privilege: string }>(
    `select c.relname, a.privilege_type as privilege
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relkind in ('r', 'p') and a.grantee = 0
      order by c.relname, a.privilege_type`,
  );

  const sequenceRows = await client.query<{ relname: string; privilege: string }>(
    `select c.relname, a.privilege_type as privilege
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relkind = 'S' and a.grantee = 0
      order by c.relname, a.privilege_type`,
  );

  // proacl 是 null 代表「預設權限」，而函數的預設就是 PUBLIC 有 EXECUTE。
  // 所以 null 亦要當成公開，不可以當成「未設定」。
  const functionRows = await client.query<{
    signature: string;
    extension_owned: boolean;
    security_definer: boolean;
    public_execute: boolean;
  }>(
    `select p.oid::regprocedure::text as signature,
            exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') as extension_owned,
            p.prosecdef as security_definer,
            (p.proacl is null
             or exists (select 1 from aclexplode(p.proacl) a
                         where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as public_execute
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by signature`,
  );

  const databaseRows = await client.query<{ privilege: string }>(
    `select a.privilege_type as privilege
       from pg_database d
       cross join lateral aclexplode(d.datacl) a
      where d.datname = current_database() and a.grantee = 0`,
  );

  return {
    schemaCreate: schemaRows.rows.some((row) => row.privilege === 'CREATE'),
    tables: groupPrivileges(tableRows.rows),
    sequences: groupPrivileges(sequenceRows.rows),
    functions: functionRows.rows
      .filter((row) => row.public_execute)
      .map((row) => ({
        signature: row.signature,
        extensionOwned: row.extension_owned,
        securityDefiner: row.security_definer,
      })),
    databasePrivileges: databaseRows.rows.map((row) => row.privilege).sort(),
  };
}

function groupPrivileges(
  rows: Array<{ relname: string; privilege: string }>,
): Array<{ name: string; privileges: string[] }> {
  const map = new Map<string, string[]>();

  for (const row of rows) {
    const list = map.get(row.relname) ?? [];
    list.push(row.privilege);
    map.set(row.relname, list);
  }

  return [...map.entries()].map(([name, privileges]) => ({ name, privileges }));
}

export async function readAppState(
  client: PoolClient,
  target: AppTarget,
): Promise<AppState> {
  const role = await readRole(client, target.role);
  const schema = await readSchema(client, target.schema);

  // 角色未建立時，權限一律當 false，但**表名照讀**：新角色配上既有表，
  // 一樣要行 `grant … on all tables`，唔可以因為「角色未有」就當冇事做。
  const privilegeRole = role.exists ? target.role : null;

  // schema 未存在時 has_schema_privilege 會直接擲錯，所以要分開問。
  const grants =
    !schema.exists || privilegeRole === null
      ? { rows: [] as Array<{ can_connect: boolean; can_use_schema: boolean; can_create: boolean }> }
      : await client.query<{
          can_connect: boolean;
          can_use_schema: boolean;
          can_create: boolean;
        }>(
          `select has_database_privilege($1, current_database(), 'CONNECT') as can_connect,
                  has_schema_privilege($1, $2, 'USAGE') as can_use_schema,
                  has_schema_privilege($1, $2, 'CREATE') as can_create`,
          [privilegeRole, target.schema],
        );

  return {
    target,
    role,
    schemaExists: schema.exists,
    schemaOwner: schema.owner,
    roleCanConnect: grants.rows[0]?.can_connect === true,
    roleCanUseSchema: grants.rows[0]?.can_use_schema === true,
    roleCanCreateInSchema: grants.rows[0]?.can_create === true,
    tables: schema.exists ? await readTables(client, privilegeRole, target.schema) : [],
    sequences: schema.exists ? await readSequences(client, privilegeRole, target.schema) : [],
    defaultAcl: schema.exists
      ? await readDefaultAcl(client, target.schema, target.role)
      : { granted: new Set(), owners: [] },
  };
}

