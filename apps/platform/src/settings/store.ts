import { DEFAULT_EDITION, isEditionCode, type EditionCode } from '@company-os/edition-profile';
import type { Pool } from 'pg';
import type { PolicyAction, PolicyCondition } from './policy.js';
import type { SettingKey } from './schema.js';

/**
 * company_setting 與 policy_rule 的讀寫（issue #80）。
 *
 * SQL 集中在這裡：路由只管 HTTP 的形狀與權限，不直接寫 SQL。
 * 兩張表都在 public（platform schema），不放進任何 app 的 schema。
 */

export type SettingRow = {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: Date;
};

export type SettingView = {
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy: string | null;
};

const SETTING_COLUMNS = 'key, value, updated_by, updated_at';

export function toSettingView(row: SettingRow): SettingView {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

/** 按 key 排序：API 的次序不依賴 insert 的次序。 */
export async function listSettings(db: Pool): Promise<SettingRow[]> {
  const result = await db.query<SettingRow>(
    `select ${SETTING_COLUMNS} from company_setting order by key asc`,
  );

  return result.rows;
}

export async function findSetting(db: Pool, key: string): Promise<SettingRow | null> {
  const result = await db.query<SettingRow>(
    `select ${SETTING_COLUMNS} from company_setting where key = $1`,
    [key],
  );

  return result.rows[0] ?? null;
}

/**
 * 寫入一個設定。已存在的話整列更新（updated_by、updated_at 一齊換），
 * 沒有的話新增 —— 種子只在第一次啟動填，之後補寫由這裡負責。
 */
export async function upsertSetting(
  db: Pool,
  input: { key: SettingKey; value: unknown; updatedBy: string },
): Promise<SettingRow> {
  const result = await db.query<SettingRow>(
    `insert into company_setting (key, value, updated_by, updated_at)
     values ($1, $2::jsonb, $3, now())
     on conflict (key) do update
       set value = excluded.value,
           updated_by = excluded.updated_by,
           updated_at = now()
     returning ${SETTING_COLUMNS}`,
    [input.key, JSON.stringify(input.value), input.updatedBy],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`寫入設定 ${input.key} 之後沒有回傳列`);
  }

  return row;
}

/**
 * 目前這個安裝是哪一個版本。
 *
 * 這是一切驗證的前提（notification_channels 的可選代碼由版本決定），所以讀不到就回
 * 預設版本 —— 但只在「種子還沒跑」的情況下才會發生，正常啟動時一定已經填好。
 */
export async function readEdition(db: Pool): Promise<EditionCode> {
  const row = await findSetting(db, 'edition');
  const value = row?.value;

  return typeof value === 'string' && isEditionCode(value) ? value : DEFAULT_EDITION;
}

export type PolicyRuleRow = {
  id: string;
  domain: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  note: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PolicyRuleView = {
  id: string;
  domain: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

const RULE_COLUMNS = 'id, domain, condition, action, priority, enabled, note, created_at, updated_at';

export function toRuleView(row: PolicyRuleRow): PolicyRuleView {
  return {
    id: row.id,
    domain: row.domain,
    condition: row.condition,
    action: row.action,
    priority: row.priority,
    enabled: row.enabled,
    note: row.note,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** 不含已刪除的規則；有的話按 domain 過濾，次序是 (priority, created_at)。 */
export async function listPolicyRules(
  db: Pool,
  options: { domain?: string } = {},
): Promise<PolicyRuleRow[]> {
  const values: unknown[] = [];
  let where = 'deleted_at is null';

  if (options.domain !== undefined) {
    values.push(options.domain);
    where += ` and domain = $${values.length}`;
  }

  const result = await db.query<PolicyRuleRow>(
    `select ${RULE_COLUMNS} from policy_rule where ${where} order by priority asc, created_at asc`,
    values,
  );

  return result.rows;
}

export async function findPolicyRule(db: Pool, id: string): Promise<PolicyRuleRow | null> {
  const result = await db.query<PolicyRuleRow>(
    `select ${RULE_COLUMNS} from policy_rule where id = $1 and deleted_at is null`,
    [id],
  );

  return result.rows[0] ?? null;
}

export type NewPolicyRule = {
  domain: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  note: string | null;
  createdBy: string;
};

export async function insertPolicyRule(db: Pool, input: NewPolicyRule): Promise<PolicyRuleRow> {
  const result = await db.query<PolicyRuleRow>(
    `insert into policy_rule (domain, condition, action, priority, enabled, note, created_by)
     values ($1, $2::jsonb, $3, $4, $5, $6, $7)
     returning ${RULE_COLUMNS}`,
    [
      input.domain,
      JSON.stringify(input.condition),
      input.action,
      input.priority,
      input.enabled,
      input.note,
      input.createdBy,
    ],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error('新增政策規則之後沒有回傳列');
  }

  return row;
}

export type PolicyRulePatch = Partial<{
  domain: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
  enabled: boolean;
  note: string | null;
}>;

/** 部分更新；只改有帶的欄位，updated_at 一定會換。找不到（或已刪除）回 null。 */
export async function updatePolicyRule(
  db: Pool,
  id: string,
  patch: PolicyRulePatch,
): Promise<PolicyRuleRow | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  const set = (column: string, value: unknown, cast = ''): void => {
    values.push(value);
    assignments.push(`${column} = $${values.length}${cast}`);
  };

  if (patch.domain !== undefined) {
    set('domain', patch.domain);
  }
  if (patch.condition !== undefined) {
    set('condition', JSON.stringify(patch.condition), '::jsonb');
  }
  if (patch.action !== undefined) {
    set('action', patch.action);
  }
  if (patch.priority !== undefined) {
    set('priority', patch.priority);
  }
  if (patch.enabled !== undefined) {
    set('enabled', patch.enabled);
  }
  if (patch.note !== undefined) {
    set('note', patch.note);
  }

  assignments.push('updated_at = now()');

  values.push(id);

  const result = await db.query<PolicyRuleRow>(
    `update policy_rule set ${assignments.join(', ')}
     where id = $${values.length} and deleted_at is null
     returning ${RULE_COLUMNS}`,
    values,
  );

  return result.rows[0] ?? null;
}

/** 軟刪除：只寫 deleted_at，列仍然留著（不變量 7）。回傳是否真的刪到一列。 */
export async function softDeletePolicyRule(db: Pool, id: string): Promise<boolean> {
  const result = await db.query(
    `update policy_rule set deleted_at = now(), updated_at = now()
     where id = $1 and deleted_at is null`,
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}
