import type { Pool, PoolClient } from 'pg';

/**
 * 品牌集（brand set）：把 04A–04H 收成可以複製、可以搬的一疊。
 *
 * 為什麼要有這一層：01–03 講「這個品牌是誰」，一輩子只有一份；04A–04H 講
 * 「這批東西點做」，同一副品牌性格會生出很多套（2026 夏季、2026 冬季…），
 * 而且每一套都可以重複套用到任何產品／設計／輸出。把 04 的答案掛在品牌上，
 * 做第二套時就一定要覆蓋第一套 —— 那等於每次開新一季都親手拆掉上一季。
 *
 * 三個規則寫死在這裡：
 *   1. 資料夾只是分類，裡面不放答案；刪資料夾不會刪品牌集（回到未分類）。
 *   2. 刪品牌集是軟刪（`deleted_at`），可以還原。真的按錯一次不應該消失一季。
 *   3. 複製品牌集＝把「現況」抄一份（決策、prompt、選擇、仍在掛的檔案），
 *      不抄歷史。歷史是那一套自己的討論紀錄，抄過去只會令兩邊都講不清。
 */

export type BrandSetFolder = {
  id: string;
  name: string;
  /** 這個資料夾內有幾個（未刪除的）品牌集。 */
  count: number;
};

export type BrandSet = {
  id: string;
  name: string;
  folderId: string | null;
  /** 已寫決策的格數（4A–4H 合計）。側欄用來講「這套寫到邊」。 */
  filled: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type BrandSetTree = {
  folders: BrandSetFolder[];
  sets: BrandSet[];
  deleted: BrandSet[];
};

export type BrandSetRef = {
  id: string;
  brandId: string;
  name: string;
  folderId: string | null;
  deletedAt: string | null;
};

type FolderRow = { id: string; name: string; count: string };
type SetRow = {
  id: string;
  name: string;
  folder_id: string | null;
  filled: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export const MAX_SET_NAME = 80;

/** 名稱一律 trim；空白等於沒填，不接受。 */
export function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim();

  return name === '' || name.length > MAX_SET_NAME ? null : name;
}

function toSet(row: SetRow): BrandSet {
  return {
    id: row.id,
    name: row.name,
    folderId: row.folder_id,
    filled: Number(row.filled),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at === null ? null : row.deleted_at.toISOString(),
  };
}

const SET_COLUMNS = `s.id, s.name, s.folder_id, s.created_at, s.updated_at, s.deleted_at,
  (select count(*) from brand_guide_block b
    where b.brand_set_id = s.id and btrim(b.decision) <> '') as filled`;

/** 一個品牌的全部資料夾與品牌集（含已刪除，讓畫面可以「還原」）。 */
export async function listBrandSets(pool: Pool, brandId: string): Promise<BrandSetTree> {
  const [folders, sets] = await Promise.all([
    pool.query<FolderRow>(
      `select f.id, f.name,
              (select count(*) from brand_set s
                where s.folder_id = f.id and s.deleted_at is null) as count
         from brand_set_folder f
        where f.brand_id = $1
        order by lower(f.name), f.created_at`,
      [brandId],
    ),
    pool.query<SetRow>(
      `select ${SET_COLUMNS}
         from brand_set s
        where s.brand_id = $1
        order by s.deleted_at nulls first, s.created_at`,
      [brandId],
    ),
  ]);

  const all = sets.rows.map(toSet);

  return {
    folders: folders.rows.map((row) => ({ id: row.id, name: row.name, count: Number(row.count) })),
    sets: all.filter((item) => item.deletedAt === null),
    deleted: all.filter((item) => item.deletedAt !== null),
  };
}

/** 單一品牌集（權限與 scoping 用）。找不到就 null。 */
export async function findBrandSet(pool: Pool, setId: string): Promise<BrandSetRef | null> {
  const result = await pool.query<{
    id: string;
    brand_id: string;
    name: string;
    folder_id: string | null;
    deleted_at: Date | null;
  }>(`select id, brand_id, name, folder_id, deleted_at from brand_set where id = $1`, [setId]);

  const row = result.rows[0];

  if (row === undefined) {
    return null;
  }

  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    folderId: row.folder_id,
    deletedAt: row.deleted_at === null ? null : row.deleted_at.toISOString(),
  };
}

async function folderBelongsTo(pool: Pool, brandId: string, folderId: string): Promise<boolean> {
  const result = await pool.query(
    `select 1 from brand_set_folder where id = $1 and brand_id = $2`,
    [folderId, brandId],
  );

  return (result.rowCount ?? 0) > 0;
}

/** 同一個品牌內名稱要唯一（大小寫不計）：兩個一樣的名字冇人分得清。 */
async function nameTaken(
  pool: Pool | PoolClient,
  brandId: string,
  name: string,
  exceptId: string | null,
): Promise<boolean> {
  const result = await pool.query(
    `select 1 from brand_set
      where brand_id = $1 and deleted_at is null and lower(btrim(name)) = lower(btrim($2))
        and ($3::uuid is null or id <> $3::uuid)
      limit 1`,
    [brandId, name, exceptId],
  );

  return (result.rowCount ?? 0) > 0;
}

/** 撞名時自動改名（`夏季（2）`），而不是丟一個錯誤出嚟等人自己想。 */
async function freeSetName(
  pool: Pool | PoolClient,
  brandId: string,
  name: string,
): Promise<string> {
  if (!(await nameTaken(pool, brandId, name, null))) {
    return name;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${name}（${index}）`;

    if (!(await nameTaken(pool, brandId, candidate, null))) {
      return candidate;
    }
  }

  throw new Error('品牌集名稱已經用盡');
}

export async function createFolder(
  pool: Pool,
  input: { brandId: string; name: string },
): Promise<{ id: string }> {
  const existing = await pool.query<{ id: string }>(
    `select id from brand_set_folder
      where brand_id = $1 and lower(btrim(name)) = lower(btrim($2))`,
    [input.brandId, input.name],
  );

  const id = existing.rows[0]?.id;

  if (id !== undefined) {
    // 已有同名資料夾：回它，不當成錯誤。按兩次「新增」不應該是失敗。
    return { id };
  }

  const created = await pool.query<{ id: string }>(
    `insert into brand_set_folder (brand_id, name) values ($1, $2) returning id`,
    [input.brandId, input.name],
  );

  const newId = created.rows[0]?.id;

  if (newId === undefined) {
    throw new Error('資料夾寫入失敗');
  }

  return { id: newId };
}

export async function renameFolder(pool: Pool, folderId: string, name: string): Promise<void> {
  await pool.query(
    `update brand_set_folder set name = $2, updated_at = now() where id = $1`,
    [folderId, name],
  );
}

export async function deleteFolder(pool: Pool, folderId: string): Promise<void> {
  // 裡面的品牌集不會消失：folder_id on delete set null，回到未分類。
  await pool.query(`delete from brand_set_folder where id = $1`, [folderId]);
}

export async function createSet(
  pool: Pool,
  input: { brandId: string; name: string; folderId: string | null; createdBy: string },
): Promise<BrandSet> {
  if (input.folderId !== null && !(await folderBelongsTo(pool, input.brandId, input.folderId))) {
    throw Object.assign(new Error('folder_not_found'), { code: 'folder_not_found' });
  }

  const name = await freeSetName(pool, input.brandId, input.name);

  const created = await pool.query<SetRow>(
    `insert into brand_set (brand_id, folder_id, name, created_by)
     values ($1, $2, $3, $4)
     returning id, name, folder_id, created_at, updated_at, deleted_at, 0::text as filled`,
    [input.brandId, input.folderId, name, input.createdBy],
  );

  const row = created.rows[0];

  if (row === undefined) {
    throw new Error('品牌集寫入失敗');
  }

  return toSet(row);
}

export type SetPatch = { name?: string; folderId?: string | null };

export async function updateSet(
  pool: Pool,
  set: BrandSetRef,
  patch: SetPatch,
): Promise<void> {
  if (patch.folderId !== undefined && patch.folderId !== null) {
    if (!(await folderBelongsTo(pool, set.brandId, patch.folderId))) {
      throw Object.assign(new Error('folder_not_found'), { code: 'folder_not_found' });
    }
  }

  if (patch.name !== undefined && (await nameTaken(pool, set.brandId, patch.name, set.id))) {
    throw Object.assign(new Error('name_taken'), { code: 'name_taken' });
  }

  await pool.query(
    `update brand_set
        set name = coalesce($2, name),
            folder_id = case when $3::boolean then $4::uuid else folder_id end,
            updated_at = now()
      where id = $1`,
    [set.id, patch.name ?? null, patch.folderId !== undefined, patch.folderId ?? null],
  );
}

/** 軟刪：資料全部留低，列表與挑選器只看 deleted_at is null。 */
export async function deleteSet(pool: Pool, setId: string, actorId: string): Promise<void> {
  await pool.query(
    `update brand_set
        set deleted_at = now(), deleted_by = $2, updated_at = now()
      where id = $1 and deleted_at is null`,
    [setId, actorId],
  );
}

export async function restoreSet(pool: Pool, setId: string): Promise<void> {
  await pool.query(
    `update brand_set set deleted_at = null, deleted_by = null, updated_at = now() where id = $1`,
    [setId],
  );
}

/**
 * 複製品牌集：現況抄一份，歷史唔抄。
 *
 * 區塊要逐個抄，因為附件表指向「區塊 id」而不是 (set, stage, blockId)，
 * 新舊 id 一定要對得上。
 */
export async function duplicateSet(
  pool: Pool,
  source: BrandSetRef,
  input: { name: string; folderId: string | null; createdBy: string },
): Promise<BrandSet> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const name = await freeSetName(client, source.brandId, input.name);

    const created = await client.query<SetRow>(
      `insert into brand_set (brand_id, folder_id, name, created_by)
       values ($1, $2, $3, $4)
       returning id, name, folder_id, created_at, updated_at, deleted_at, 0::text as filled`,
      [source.brandId, input.folderId, name, input.createdBy],
    );

    const row = created.rows[0];

    if (row === undefined) {
      throw new Error('品牌集複製失敗');
    }

    // 選擇狀態（04A–04H 的 s 物件與 brief）整份抄。
    await client.query(
      `insert into brand_guide_state (brand_id, brand_set_id, stage, state, brief)
       select brand_id, $2, stage, state, brief
         from brand_guide_state
        where brand_set_id = $1`,
      [source.id, row.id],
    );

    const blocks = await client.query<{ id: string; block_id: string }>(
      `select id, block_id from brand_guide_block where brand_set_id = $1 order by block_code, block_id`,
      [source.id],
    );

    for (const block of blocks.rows) {
      const copied = await client.query<{ id: string }>(
        `insert into brand_guide_block
           (brand_id, brand_set_id, stage, block_id, block_code, block_title,
            decision, decision_by, decision_at, decision_agent_id, prompt_override, updated_at)
         select brand_id, $2, stage, block_id, block_code, block_title,
                decision, decision_by, decision_at, decision_agent_id, prompt_override, updated_at
           from brand_guide_block where id = $1
         returning id`,
        [block.id, row.id],
      );

      const newBlock = copied.rows[0]?.id;

      if (newBlock === undefined) {
        throw new Error('品牌集複製失敗（區塊）');
      }

      // 仍然掛住的檔案一齊抄；已移除的不抄（那一份新集沒有那段歷史）。
      await client.query(
        `insert into brand_guide_block_file (block, file_id, label, attached_by, created_at)
         select $2, file_id, label, attached_by, created_at
           from brand_guide_block_file
          where block = $1 and removed_at is null`,
        [block.id, newBlock],
      );
    }

    await client.query('commit');

    return toSet(row);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
