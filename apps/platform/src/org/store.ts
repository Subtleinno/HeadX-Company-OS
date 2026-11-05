import type { Pool } from 'pg';

/**
 * 組織單位、邊、單位設定的讀寫（issue #81）。
 *
 * SQL 集中在這裡：路由只管 HTTP 形狀與權限，不直接寫 SQL。
 * 三張表都在 public（platform schema），不放進任何 app 的 schema。
 *
 * 防成環的**權威是資料庫 trigger**，不是這裡：addParent() 只負責把 trigger 的
 * 錯誤碼翻譯成一個講得清楚的回應。兩個人同時加邊時，「先查再寫」一定有窗口。
 */

export type UnitRow = {
  id: string;
  name: string;
  type: string;
  is_root: boolean;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type UnitView = {
  id: string;
  name: string;
  type: string;
  isRoot: boolean;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EdgeRow = {
  parent_id: string;
  child_id: string;
  position: number;
};

export type EdgeView = {
  parentId: string;
  childId: string;
  position: number;
};

export type UnitSettingRow = {
  unit_id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: Date;
};

export type UnitSettingView = {
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy: string | null;
};

export function toUnitView(row: UnitRow): UnitView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isRoot: row.is_root,
    country: row.country,
    currency: row.currency,
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toEdgeView(row: EdgeRow): EdgeView {
  return { parentId: row.parent_id, childId: row.child_id, position: row.position };
}

export function toUnitSettingView(row: UnitSettingRow): UnitSettingView {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

const UNIT_COLUMNS =
  'id, name, type, is_root, country, currency, timezone, created_at, updated_at, deleted_at';

/** 未刪除的單位，按建立次序（root 一定排第一：它是種子最早建的）。 */
export async function listUnits(db: Pool): Promise<UnitRow[]> {
  const result = await db.query<UnitRow>(
    `select ${UNIT_COLUMNS} from org_unit where deleted_at is null order by created_at asc, id asc`,
  );

  return result.rows;
}

/** 兩端都未刪除的邊；一端被刪除的邊不再算數（軟刪除的單位不參與繼承）。 */
export async function listEdges(db: Pool): Promise<EdgeRow[]> {
  const result = await db.query<EdgeRow>(
    `select e.parent_id, e.child_id, e.position
       from org_unit_edge e
       join org_unit child on child.id = e.child_id and child.deleted_at is null
       join org_unit parent on parent.id = e.parent_id and parent.deleted_at is null
      order by e.child_id asc, e.position asc, e.parent_id asc`,
  );

  return result.rows;
}

export async function findUnit(db: Pool, id: string): Promise<UnitRow | null> {
  const result = await db.query<UnitRow>(
    `select ${UNIT_COLUMNS} from org_unit where id = $1 and deleted_at is null`,
    [id],
  );

  return result.rows[0] ?? null;
}

export type NewUnit = {
  name: string;
  type: string;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  parentIds: string[];
  isRoot?: boolean;
};

/**
 * 建立單位與它的所有上級邊，同一個交易。
 * 有邊加不進去（成環、重複）就整個 rollback —— 不可以留下一個沒有上級的單位。
 */
export async function insertUnit(
  db: Pool,
  input: NewUnit,
): Promise<{ unit: UnitRow; parents: EdgeRow[] }> {
  const client = await db.connect();

  try {
    await client.query('begin');

    const inserted = await client.query<UnitRow>(
      `insert into org_unit (name, type, country, currency, timezone, is_root)
       values ($1, $2, $3, $4, $5, $6)
       returning ${UNIT_COLUMNS}`,
      [
        input.name,
        input.type,
        input.country,
        input.currency,
        input.timezone,
        input.isRoot === true,
      ],
    );

    const unit = inserted.rows[0];

    if (unit === undefined) {
      throw new Error('新增組織單位之後沒有回傳列');
    }

    const parents: EdgeRow[] = [];

    for (const [index, parentId] of input.parentIds.entries()) {
      const edge = await client.query<EdgeRow>(
        `insert into org_unit_edge (parent_id, child_id, position)
         values ($1, $2, $3)
         returning parent_id, child_id, position`,
        [parentId, unit.id, index],
      );

      const row = edge.rows[0];

      if (row !== undefined) {
        parents.push(row);
      }
    }

    await client.query('commit');

    return { unit, parents };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type UnitPatch = Partial<Omit<NewUnit, 'parentIds'>>;

/** 部分更新；只改有帶的欄位，updated_at 一定會換。找不到（或已刪除）回 null。 */
export async function updateUnit(db: Pool, id: string, patch: UnitPatch): Promise<UnitRow | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  const set = (column: string, value: unknown): void => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if (patch.name !== undefined) {
    set('name', patch.name);
  }
  if (patch.type !== undefined) {
    set('type', patch.type);
  }
  if (patch.country !== undefined) {
    set('country', patch.country);
  }
  if (patch.currency !== undefined) {
    set('currency', patch.currency);
  }
  if (patch.timezone !== undefined) {
    set('timezone', patch.timezone);
  }

  if (assignments.length === 0) {
    return findUnit(db, id);
  }

  assignments.push('updated_at = now()');
  values.push(id);

  const result = await db.query<UnitRow>(
    `update org_unit set ${assignments.join(', ')}
      where id = $${values.length} and deleted_at is null
      returning ${UNIT_COLUMNS}`,
    values,
  );

  return result.rows[0] ?? null;
}

/** 軟刪除（不變量 7）。回傳是否真的刪到一列。 */
export async function softDeleteUnit(db: Pool, id: string): Promise<boolean> {
  const result = await db.query(
    `update org_unit set deleted_at = now(), updated_at = now()
      where id = $1 and deleted_at is null`,
    [id],
  );

  return (result.rowCount ?? 0) > 0;
}

/** 還有幾個未刪除的下級（用來擋「有下級不可刪」）。 */
export async function countChildren(db: Pool, id: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    `select count(*)::int as count
       from org_unit_edge e
       join org_unit child on child.id = e.child_id and child.deleted_at is null
      where e.parent_id = $1`,
    [id],
  );

  return result.rows[0]?.count ?? 0;
}

export async function countParents(db: Pool, id: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    'select count(*)::int as count from org_unit_edge where child_id = $1',
    [id],
  );

  return result.rows[0]?.count ?? 0;
}

export type AddEdgeResult = 'added' | 'duplicate_edge' | 'cycle';

/**
 * 加一條邊。成環與重複由資料庫決定（trigger 的 23514、主鍵的 23505），
 * 這裡只翻譯成呼叫者看得懂的三種結果。
 */
export async function addParent(
  db: Pool,
  input: { childId: string; parentId: string; position: number },
): Promise<AddEdgeResult> {
  try {
    await db.query(
      'insert into org_unit_edge (parent_id, child_id, position) values ($1, $2, $3)',
      [input.parentId, input.childId, input.position],
    );

    return 'added';
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code === '23505') {
      return 'duplicate_edge';
    }

    // 23514 是 trigger 的「不可以成環」，也包含 check 約束的自指。
    if (code === '23514') {
      return 'cycle';
    }

    throw error;
  }
}

/** 移除一條邊。回傳是否真的刪到（沒有那條邊就是 false）。 */
export async function removeParent(db: Pool, childId: string, parentId: string): Promise<boolean> {
  const result = await db.query(
    'delete from org_unit_edge where child_id = $1 and parent_id = $2',
    [childId, parentId],
  );

  return (result.rowCount ?? 0) > 0;
}

/** 全部單位的覆寫（一次讀完，繼承解析在記憶體做）。 */
export async function listUnitSettings(db: Pool): Promise<UnitSettingRow[]> {
  const result = await db.query<UnitSettingRow>(
    `select unit_id, key, value, updated_by, updated_at
       from org_unit_setting
      order by unit_id asc, key asc`,
  );

  return result.rows;
}

export async function listUnitSettingsFor(db: Pool, unitId: string): Promise<UnitSettingRow[]> {
  const result = await db.query<UnitSettingRow>(
    `select unit_id, key, value, updated_by, updated_at
       from org_unit_setting
      where unit_id = $1
      order by key asc`,
    [unitId],
  );

  return result.rows;
}

export async function upsertUnitSetting(
  db: Pool,
  input: { unitId: string; key: string; value: unknown; updatedBy: string },
): Promise<UnitSettingRow> {
  const result = await db.query<UnitSettingRow>(
    `insert into org_unit_setting (unit_id, key, value, updated_by, updated_at)
     values ($1, $2, $3::jsonb, $4, now())
     on conflict (unit_id, key) do update
       set value = excluded.value,
           updated_by = excluded.updated_by,
           updated_at = now()
     returning unit_id, key, value, updated_by, updated_at`,
    [input.unitId, input.key, JSON.stringify(input.value), input.updatedBy],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`寫入單位設定 ${input.key} 之後沒有回傳列`);
  }

  return row;
}

export async function deleteUnitSetting(db: Pool, unitId: string, key: string): Promise<boolean> {
  const result = await db.query('delete from org_unit_setting where unit_id = $1 and key = $2', [
    unitId,
    key,
  ]);

  return (result.rowCount ?? 0) > 0;
}

/** company_setting 的全部值，供繼承解析回退使用。 */
export async function companySettingValues(db: Pool): Promise<Record<string, unknown>> {
  const result = await db.query<{ key: string; value: unknown }>(
    'select key, value from company_setting',
  );
  const values: Record<string, unknown> = {};

  for (const row of result.rows) {
    values[row.key] = row.value;
  }

  return values;
}
