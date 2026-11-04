import type { Pool, PoolClient } from 'pg';
import { writeAudit } from '../audit.js';
import type { Role } from '../auth/store.js';

/**
 * stored_file 的資料存取。全部參數化查詢。
 *
 * 權限在 SQL 的 where 條件內，而不是「先查出來再在程式判斷」：
 * 員工只看得到自己上傳的，老闆看全部未刪除的。
 * 看不到就是查不到，呼叫端拿到的只有 null，於是所有「不存在／已刪除／不是你的」
 * 都自然變成同一個 404，不會洩漏檔案是否存在。
 */

export type FileRow = {
  id: string;
  storage_key: string;
  original_name: string;
  content_type: string;
  size_bytes: string;
  sha256: string;
  created_by: string;
  created_at: Date;
  deleted_at: Date | null;
};

/** 出 API 的形狀：沒有 storage_key（那是實作細節）。 */
export type PublicFile = {
  id: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export type Viewer = {
  id: string;
  role: Role;
};

const COLUMNS = 'id, storage_key, original_name, content_type, size_bytes, sha256, created_by, created_at, deleted_at';

export function toPublicFile(row: FileRow): PublicFile {
  return {
    id: row.id,
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    createdAt: row.created_at.toISOString(),
  };
}

export type CreateFileInput = {
  id: string;
  storageKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdBy: string;
  createdAt: Date;
};

/**
 * 寫入一列並留審計，在同一個交易裡。
 * 兩者要一起成功：有檔案沒有紀錄是孤兒物件，有紀錄沒有審計是無痕操作。
 */
export async function createFile(pool: Pool, input: CreateFileInput): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    await client.query(
      `insert into stored_file
         (id, storage_key, original_name, content_type, size_bytes, sha256, created_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.id,
        input.storageKey,
        input.originalName,
        input.contentType,
        input.sizeBytes,
        input.sha256,
        input.createdBy,
        input.createdAt,
      ],
    );

    await audit(client, {
      actorType: 'human',
      actorId: input.createdBy,
      action: 'file.upload',
      target: input.id,
      // 不含檔名：檔名是使用者的內容，審計只需要能對得上檔案。
      detail: {
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        contentType: input.contentType,
      },
    });

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** 找不到、已刪除、不是自己的，一律回 null。 */
export async function findFile(pool: Pool, id: string, viewer: Viewer): Promise<FileRow | null> {
  const params: unknown[] = [id];
  let where = 'id = $1 and deleted_at is null';

  if (viewer.role !== 'owner') {
    params.push(viewer.id);
    where += ' and created_by = $2';
  }

  const rows = await pool.query<FileRow>(
    `select ${COLUMNS} from stored_file where ${where} limit 1`,
    params,
  );

  return rows.rows[0] ?? null;
}

export type ListFilesInput = {
  viewer: Viewer;
  limit: number;
  cursor?: { createdAt: Date; id: string };
};

/** 依 (created_at, id) 倒序；多取一列讓呼叫端知道還有沒有下一頁。 */
export async function listFiles(pool: Pool, input: ListFilesInput): Promise<FileRow[]> {
  const params: unknown[] = [];
  const conditions = ['deleted_at is null'];

  if (input.viewer.role !== 'owner') {
    params.push(input.viewer.id);
    conditions.push(`created_by = $${params.length}`);
  }

  if (input.cursor !== undefined) {
    params.push(input.cursor.createdAt, input.cursor.id);
    conditions.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
  }

  params.push(input.limit + 1);

  const rows = await pool.query<FileRow>(
    `select ${COLUMNS}
     from stored_file
     where ${conditions.join(' and ')}
     order by created_at desc, id desc
     limit $${params.length}`,
    params,
  );

  return rows.rows;
}

/**
 * 軟刪除：只寫 deleted_at，物件留在 MinIO。
 * 已經刪除、不存在、沒有權限，全部回 false —— 呼叫端一律回 404。
 */
export async function softDeleteFile(
  pool: Pool,
  input: { id: string; viewer: Viewer; at: Date },
): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    const updated = await client.query<{ id: string }>(
      `update stored_file
       set deleted_at = $2
       where id = $1
         and deleted_at is null
         and ($3 = true or created_by = $4)
       returning id`,
      [input.id, input.at, input.viewer.role === 'owner', input.viewer.id],
    );

    if (updated.rows[0] === undefined) {
      await client.query('rollback');
      return false;
    }

    await audit(client, {
      actorType: 'human',
      actorId: input.viewer.id,
      action: 'file.delete',
      target: input.id,
    });

    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** writeAudit 只需要 query；明確收窄，避免把 PoolClient 的整個介面傳出去。 */
function audit(client: PoolClient, entry: Parameters<typeof writeAudit>[1]): Promise<void> {
  return writeAudit({ query: (text, values) => client.query(text, values) }, entry);
}
