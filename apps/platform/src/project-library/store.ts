import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

/**
 * Project Library：資料夾 → 專案集 → 專案，三層收納；格式可動態新增。
 *
 * 老闆 2026-11-18 定：
 *   左欄是一棵「資料夾（folder）→ 專案集（set）」的樹；點一個專案集，
 *   右邊主區顯示它裡面的專案（project）卡片。
 *   頂部「ALL / PPT / 排版 / Video」是格式**過濾器**，跨所有資料夾篩選。
 *
 * 三條規則寫死：
 *   1. 資料夾只是分類，裡面不放專案；刪資料夾不會刪專案集（回到未分類）。
 *   2. 刪專案集是軟刪（`deleted_at`），可以還原；裡面的專案一起「不見」但資料留低。
 *   3. 複製專案＝把「現況」抄一份（標題、格式、封面），不抄歷史；歷史是那一件
 *      自己的紀錄，抄過去只會令兩邊都講不清。
 */

export const MAX_NAME = 80;
export const MAX_FORMAT_NAME = 40;
export const MAX_TITLE = 120;

export type ProjectFormat = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ProjectFolder = {
  id: string;
  name: string;
  /** 這個資料夾內有幾個（未刪除的）專案集。 */
  count: number;
};

export type ProjectSet = {
  id: string;
  name: string;
  folderId: string | null;
  /** 裡面的專案數（未刪除）。 */
  count: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ProjectSummary = {
  id: string;
  title: string;
  formatId: string | null;
  formatName: string | null;
  setId: string | null;
  coverFileId: string | null;
  createdAt: string;
};

export type ProjectLibrary = {
  formats: ProjectFormat[];
  folders: ProjectFolder[];
  sets: ProjectSet[];
  deletedSets: ProjectSet[];
};

export type ProjectSetRef = {
  id: string;
  brandId: string;
  name: string;
  folderId: string | null;
  deletedAt: string | null;
};

export type ProjectRef = {
  id: string;
  brandId: string;
  title: string;
  setId: string | null;
};

type FolderRow = { id: string; name: string; count: string };
type SetRow = {
  id: string;
  name: string;
  folder_id: string | null;
  count: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};
type FormatRow = { id: string; name: string; sort_order: number };

function toSet(row: SetRow): ProjectSet {
  return {
    id: row.id,
    name: row.name,
    folderId: row.folder_id,
    count: Number(row.count),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at === null ? null : row.deleted_at.toISOString(),
  };
}

/** 名稱一律 trim；空白等於沒填，不接受。 */
export function normalizeName(value: unknown, max = MAX_NAME): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim();

  return name === '' || name.length > max ? null : name;
}

const SET_COLUMNS = `s.id, s.name, s.folder_id, s.created_at, s.updated_at, s.deleted_at,
  (select count(*) from design.project p where p.set_id = s.id) as count`;

/** INSERT...RETURNING 用：冇 alias，直接列欄位。 */
const SET_RETURN = `id, name, folder_id, created_at, updated_at, deleted_at,
  (select count(*) from design.project p where p.set_id = project_set.id) as count`;

/** 一個品牌的全部格式、資料夾與專案集（含已刪除，讓畫面可以還原）。 */
export async function listLibrary(pool: Pool, brandId: string): Promise<ProjectLibrary> {
  const [formats, folders, sets] = await Promise.all([
    pool.query<FormatRow>(
      `select id, name, sort_order from design.project_format
        order by sort_order, created_at, name`,
    ),
    pool.query<FolderRow>(
      `select f.id, f.name,
              (select count(*) from design.project_set s
                where s.folder_id = f.id and s.deleted_at is null) as count
         from design.project_folder f
        where f.brand_id = $1
        order by lower(f.name), f.created_at`,
      [brandId],
    ),
    pool.query<SetRow>(
      `select ${SET_COLUMNS}
         from design.project_set s
        where s.brand_id = $1
        order by s.deleted_at nulls first, s.created_at`,
      [brandId],
    ),
  ]);

  const allSets = sets.rows.map(toSet);

  return {
    formats: formats.rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order })),
    folders: folders.rows.map((row) => ({ id: row.id, name: row.name, count: Number(row.count) })),
    sets: allSets.filter((item) => item.deletedAt === null),
    deletedSets: allSets.filter((item) => item.deletedAt !== null),
  };
}

export type ListProjectsFilter = {
  setId?: string | 'none';
  formatId?: string;
  q?: string;
};

/** 一個品牌下的專案卡片清單（依過濾器）。 */
export async function listProjects(
  pool: Pool,
  brandId: string,
  filter: ListProjectsFilter = {},
): Promise<ProjectSummary[]> {
  const where: string[] = ['p.brand_id = $1'];
  const values: unknown[] = [brandId];

  if (filter.setId === 'none') {
    where.push('p.set_id is null');
  } else if (filter.setId !== undefined) {
    values.push(filter.setId);
    where.push(`p.set_id = $${values.length}`);
  }

  if (filter.formatId !== undefined) {
    values.push(filter.formatId);
    where.push(`p.format_id = $${values.length}`);
  }

  if (filter.q !== undefined && filter.q.trim() !== '') {
    values.push(`%${filter.q.trim()}%`);
    where.push(`p.title ilike $${values.length}`);
  }

  const result = await pool.query<{
    id: string;
    title: string;
    format_id: string | null;
    format_name: string | null;
    set_id: string | null;
    cover_file_id: string | null;
    created_at: Date;
  }>(
    `select p.id, p.title, p.format_id, f.name as format_name, p.set_id,
            p.cover_file_id, p.created_at
       from design.project p
       left join design.project_format f on f.id = p.format_id
      where ${where.join(' and ')}
      order by p.created_at desc, p.id desc`,
    values,
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    formatId: row.format_id,
    formatName: row.format_name,
    setId: row.set_id,
    coverFileId: row.cover_file_id,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function findSet(pool: Pool, setId: string): Promise<ProjectSetRef | null> {
  const result = await pool.query<{
    id: string;
    brand_id: string;
    name: string;
    folder_id: string | null;
    deleted_at: Date | null;
  }>(`select id, brand_id, name, folder_id, deleted_at from design.project_set where id = $1`, [setId]);

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

export async function findProject(pool: Pool, projectId: string): Promise<ProjectRef | null> {
  const result = await pool.query<{
    id: string;
    brand_id: string;
    title: string;
    set_id: string | null;
  }>(`select id, brand_id, title, set_id from design.project where id = $1`, [projectId]);

  const row = result.rows[0];

  if (row === undefined) {
    return null;
  }

  return { id: row.id, brandId: row.brand_id, title: row.title, setId: row.set_id };
}

async function folderBelongsTo(pool: Pool, brandId: string, folderId: string): Promise<boolean> {
  const result = await pool.query(
    `select 1 from design.project_folder where id = $1 and brand_id = $2`,
    [folderId, brandId],
  );

  return (result.rowCount ?? 0) > 0;
}

async function formatExists(pool: Pool, formatId: string): Promise<boolean> {
  const result = await pool.query(
    `select 1 from design.project_format where id = $1`,
    [formatId],
  );

  return (result.rowCount ?? 0) > 0;
}

async function setNameTaken(
  pool: Pool | PoolClient,
  brandId: string,
  name: string,
  exceptId: string | null,
): Promise<boolean> {
  const result = await pool.query(
    `select 1 from design.project_set
      where brand_id = $1 and deleted_at is null and lower(btrim(name)) = lower(btrim($2))
        and ($3::uuid is null or id <> $3::uuid)
      limit 1`,
    [brandId, name, exceptId],
  );

  return (result.rowCount ?? 0) > 0;
}

async function freeSetName(
  pool: Pool | PoolClient,
  brandId: string,
  name: string,
  exceptId: string | null = null,
): Promise<string> {
  if (!(await setNameTaken(pool, brandId, name, exceptId))) {
    return name;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${name}（${index}）`;

    if (!(await setNameTaken(pool, brandId, candidate, exceptId))) {
      return candidate;
    }
  }

  throw new Error('專案集名稱已經用盡');
}

/* ── 格式 ─────────────────────────────────────────────── */

export async function createFormat(
  pool: Pool,
  input: { name: string },
): Promise<ProjectFormat> {
  const existing = await pool.query<FormatRow>(
    `select id, name, sort_order from design.project_format
      where lower(btrim(name)) = lower(btrim($1))`,
    [input.name],
  );

  const found = existing.rows[0];

  if (found !== undefined) {
    return { id: found.id, name: found.name, sortOrder: found.sort_order };
  }

  const next = await pool.query<{ next: string }>(
    `select coalesce(max(sort_order) + 1, 1) as next from design.project_format`,
  );

  const created = await pool.query<FormatRow>(
    `insert into design.project_format (name, sort_order)
     values ($1, $2)
     returning id, name, sort_order`,
    [input.name, Number(next.rows[0]?.next ?? 1)],
  );

  const row = created.rows[0];

  if (row === undefined) {
    throw new Error('格式寫入失敗');
  }

  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

/* ── 資料夾 ───────────────────────────────────────────── */

export async function createFolder(
  pool: Pool,
  input: { brandId: string; name: string },
): Promise<{ id: string }> {
  const existing = await pool.query<{ id: string }>(
    `select id from design.project_folder
      where brand_id = $1 and lower(btrim(name)) = lower(btrim($2))`,
    [input.brandId, input.name],
  );

  const id = existing.rows[0]?.id;

  if (id !== undefined) {
    return { id };
  }

  const created = await pool.query<{ id: string }>(
    `insert into design.project_folder (brand_id, name) values ($1, $2) returning id`,
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
    `update design.project_folder set name = $2, updated_at = now() where id = $1`,
    [folderId, name],
  );
}

export async function deleteFolder(pool: Pool, folderId: string): Promise<void> {
  // 裡面的專案集不會消失：folder_id on delete set null，回到未分類。
  await pool.query(`delete from design.project_folder where id = $1`, [folderId]);
}

/* ── 專案集 ───────────────────────────────────────────── */

export async function createSet(
  pool: Pool,
  input: { brandId: string; name: string; folderId: string | null; createdBy: string },
): Promise<ProjectSet> {
  if (input.folderId !== null && !(await folderBelongsTo(pool, input.brandId, input.folderId))) {
    throw Object.assign(new Error('folder_not_found'), { code: 'folder_not_found' });
  }

  const name = await freeSetName(pool, input.brandId, input.name);

  const created = await pool.query<SetRow>(
    `insert into design.project_set (brand_id, folder_id, name, created_by)
     values ($1, $2, $3, $4)
     returning ${SET_RETURN}`,
    [input.brandId, input.folderId, name, input.createdBy],
  );

  const row = created.rows[0];

  if (row === undefined) {
    throw new Error('專案集寫入失敗');
  }

  return toSet(row);
}

export type SetPatch = { name?: string; folderId?: string | null };

export async function updateSet(
  pool: Pool,
  set: ProjectSetRef,
  patch: SetPatch,
): Promise<void> {
  if (patch.folderId !== undefined && patch.folderId !== null) {
    if (!(await folderBelongsTo(pool, set.brandId, patch.folderId))) {
      throw Object.assign(new Error('folder_not_found'), { code: 'folder_not_found' });
    }
  }

  if (patch.name !== undefined && (await setNameTaken(pool, set.brandId, patch.name, set.id))) {
    throw Object.assign(new Error('name_taken'), { code: 'name_taken' });
  }

  await pool.query(
    `update design.project_set
        set name = coalesce($2, name),
            folder_id = case when $3::boolean then $4::uuid else folder_id end,
            updated_at = now()
      where id = $1`,
    [set.id, patch.name ?? null, patch.folderId !== undefined, patch.folderId ?? null],
  );
}

export async function deleteSet(pool: Pool, setId: string, actorId: string): Promise<void> {
  await pool.query(
    `update design.project_set
        set deleted_at = now(), deleted_by = $2, updated_at = now()
      where id = $1 and deleted_at is null`,
    [setId, actorId],
  );
}

export async function restoreSet(pool: Pool, setId: string, name: string): Promise<void> {
  await pool.query(
    `update design.project_set
        set deleted_at = null, deleted_by = null, name = $2, updated_at = now()
      where id = $1`,
    [setId, name],
  );
}

export async function duplicateSet(
  pool: Pool,
  source: ProjectSetRef,
  input: { name: string; folderId: string | null; createdBy: string },
): Promise<ProjectSet> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const name = await freeSetName(client, source.brandId, input.name);

    const created = await client.query<SetRow>(
      `insert into design.project_set (brand_id, folder_id, name, created_by)
       values ($1, $2, $3, $4)
       returning ${SET_RETURN}`,
      [source.brandId, input.folderId, name, input.createdBy],
    );

    const row = created.rows[0];

    if (row === undefined) {
      throw new Error('專案集複製失敗');
    }

    // 專案一齊抄：新專案掛新專案集，標題、格式、封面照抄，時間由 now() 重新起算。
    // idempotency_key／hash 重新產生，避免同一個 actor 複製兩次撞唯一鍵。
    // （pgcrypto 的 digest() 不在這套 Postgres，改用 gen_random_uuid 湊 64 位 hex。）
    await client.query(
      `insert into design.project (brand_id, title, created_by, idempotency_key, idempotency_hash,
                            format_id, set_id, cover_file_id)
       select p.brand_id, p.title, $3,
              gen_random_uuid()::text,
              replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
              p.format_id, $2, p.cover_file_id
         from design.project p
        where p.set_id = $1
        order by p.created_at, p.id`,
      [source.id, row.id, input.createdBy],
    );

    await client.query('commit');

    return toSet(row);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/* ── 專案 ─────────────────────────────────────────────── */

export type ProjectPatch = {
  title?: string;
  formatId?: string;
  setId?: string | null;
  coverFileId?: string | null;
};

export async function createProject(
  pool: Pool,
  input: {
    brandId: string;
    title: string;
    formatId: string;
    setId: string | null;
    createdBy: string;
  },
): Promise<ProjectSummary> {
  if (!(await formatExists(pool, input.formatId))) {
    throw Object.assign(new Error('format_not_found'), { code: 'format_not_found' });
  }

  if (input.setId !== null) {
    const set = await findSet(pool, input.setId);

    if (set === null || set.brandId !== input.brandId || set.deletedAt !== null) {
      throw Object.assign(new Error('set_not_found'), { code: 'set_not_found' });
    }
  }

  const key = `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const keyHash = createHash('sha256').update(key, 'utf8').digest('hex');
  const created = await pool.query<{
    id: string;
    title: string;
    format_id: string | null;
    set_id: string | null;
    cover_file_id: string | null;
    created_at: Date;
  }>(
    `insert into design.project (brand_id, title, created_by, idempotency_key, idempotency_hash,
                          format_id, set_id)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, title, format_id, set_id, cover_file_id, created_at`,
    [input.brandId, input.title, input.createdBy, key, keyHash, input.formatId, input.setId],
  );

  const row = created.rows[0];

  if (row === undefined) {
    throw new Error('專案寫入失敗');
  }

  return {
    id: row.id,
    title: row.title,
    formatId: row.format_id,
    formatName: null,
    setId: row.set_id,
    coverFileId: row.cover_file_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function updateProject(
  pool: Pool,
  project: ProjectRef,
  patch: ProjectPatch,
): Promise<void> {
  if (patch.formatId !== undefined && !(await formatExists(pool, patch.formatId))) {
    throw Object.assign(new Error('format_not_found'), { code: 'format_not_found' });
  }

  if (patch.setId !== undefined && patch.setId !== null) {
    const set = await findSet(pool, patch.setId);

    if (set === null || set.brandId !== project.brandId || set.deletedAt !== null) {
      throw Object.assign(new Error('set_not_found'), { code: 'set_not_found' });
    }
  }

  await pool.query(
    `update design.project
        set title = coalesce($2, title),
            format_id = coalesce($3::uuid, format_id),
            set_id = case when $4::boolean then $5::uuid else set_id end,
            cover_file_id = case when $6::boolean then $7::uuid else cover_file_id end
      where id = $1`,
    [
      project.id,
      patch.title ?? null,
      patch.formatId ?? null,
      patch.setId !== undefined,
      patch.setId ?? null,
      patch.coverFileId !== undefined,
      patch.coverFileId ?? null,
    ],
  );
}

export async function duplicateProject(
  pool: Pool,
  source: ProjectRef,
  input: { title: string; createdBy: string },
): Promise<ProjectSummary> {
  const key = `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const keyHash = createHash('sha256').update(key, 'utf8').digest('hex');
  const created = await pool.query<{
    id: string;
    title: string;
    format_id: string | null;
    set_id: string | null;
    cover_file_id: string | null;
    created_at: Date;
  }>(
    `insert into design.project (brand_id, title, created_by, idempotency_key, idempotency_hash,
                          format_id, set_id, cover_file_id)
     select brand_id, $2, $3, $4, $5, format_id, set_id, cover_file_id
       from design.project where id = $1
     returning id, title, format_id, set_id, cover_file_id, created_at`,
    [source.id, input.title, input.createdBy, key, keyHash],
  );

  const row = created.rows[0];

  if (row === undefined) {
    throw new Error('專案複製失敗');
  }

  return {
    id: row.id,
    title: row.title,
    formatId: row.format_id,
    formatName: null,
    setId: row.set_id,
    coverFileId: row.cover_file_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function deleteProject(pool: Pool, projectId: string): Promise<void> {
  await pool.query(`delete from design.project where id = $1`, [projectId]);
}
