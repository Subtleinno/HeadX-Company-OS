import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { UserRow } from '../auth/store.js';
import { StorageObjectNotFoundError, type Storage } from '../storage/index.js';
import { decideRange } from '../storage/range.js';
import { buildContentDisposition } from './content-disposition.js';
import { normalizeContentType } from './content-type.js';
import {
  createFile,
  findFile,
  listFiles,
  softDeleteFile,
  toPublicFile,
  type FileRow,
  type Viewer,
} from './store.js';

/**
 * 檔案層的路由。
 *
 * 一個檔案就是一個檔案：這裡不知道成品、不知道 Need，之後的成品會引用檔案 id。
 * 每個動作都用 requireUser（任何已登入的人）；看得到什麼由 store 的 SQL 決定。
 */

export const DEFAULT_MAX_UPLOAD_BYTES = 209_715_200;
export const DEFAULT_KEY_PREFIX = 'files/';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const MAX_FILE_NAME_LENGTH = 255;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FilesHooks = {
  /** 測試專用：物件已寫入、資料庫未寫入之間。正式路徑不傳。 */
  beforeInsert?: (key: string) => Promise<void>;
};

export type FilesDeps = {
  pool: Pool;
  storage: Storage;
  /** 上傳上限，預設 200 MiB。同時是路由的 bodyLimit。 */
  maxUploadBytes?: number;
  /** 物件 key 的前綴，預設 `files/`；整合測試注入自己的前綴，測完 removePrefix。 */
  keyPrefix?: string;
  now?: () => Date;
  hooks?: FilesHooks;
};

function headerString(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** 檔名是 URL 編碼的 UTF-8；解不開或長度不對就當作沒有提供。 */
function parseFileName(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') {
    return null;
  }

  let decoded: string;

  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  // NUL 存不進 Postgres 的 text，其他字元都可以（輸出時再編碼）。
  if (decoded.includes('\u0000')) {
    return null;
  }

  const length = [...decoded].length;

  if (length < 1 || length > MAX_FILE_NAME_LENGTH) {
    return null;
  }

  return decoded;
}

function parseLimit(raw: unknown): number | null {
  if (raw === undefined || raw === '') {
    return DEFAULT_LIST_LIMIT;
  }

  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    return null;
  }

  const value = Number(raw);

  if (value < 1) {
    return null;
  }

  return Math.min(value, MAX_LIST_LIMIT);
}

/** 游標是不透明字串：內容是上一頁最後一列的 (created_at, id)，客戶端不應該解讀它。 */
function encodeCursor(row: FileRow): string {
  return Buffer.from(JSON.stringify([row.created_at.toISOString(), row.id]), 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(raw: unknown): { createdAt: Date; id: string } | null | 'invalid' {
  if (raw === undefined || raw === '') {
    return null;
  }

  if (typeof raw !== 'string') {
    return 'invalid';
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return 'invalid';
  }

  if (!Array.isArray(parsed) || parsed.length !== 2) {
    return 'invalid';
  }

  const [at, id] = parsed as unknown[];

  if (typeof at !== 'string' || typeof id !== 'string' || !UUID.test(id)) {
    return 'invalid';
  }

  const createdAt = new Date(at);

  if (Number.isNaN(createdAt.getTime())) {
    return 'invalid';
  }

  return { createdAt, id };
}

/** requireUser 一定會先跑；沒有 currentUser 就是路由設定的程式錯誤。 */
function viewerOf(request: FastifyRequest): Viewer {
  const user: UserRow | null = request.currentUser;

  if (user === null) {
    throw new Error('檔案路由缺少 requireUser：request.currentUser 是空的');
  }

  return { id: user.id, role: user.role };
}

function readId(request: FastifyRequest): string {
  const params = request.params as { id?: unknown };
  return typeof params.id === 'string' ? params.id : '';
}

export function registerFiles(app: FastifyInstance, deps: FilesDeps): void {
  const now = deps.now ?? ((): Date => new Date());
  const maxUploadBytes = deps.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const keyPrefix = deps.keyPrefix ?? DEFAULT_KEY_PREFIX;

  if (!Number.isInteger(maxUploadBytes) || maxUploadBytes <= 0) {
    throw new Error(`MAX_UPLOAD_BYTES 必須是正整數，收到 ${String(maxUploadBytes)}`);
  }

  // 獨立 plugin：body parser 與 bodyLimit 只影響這個範圍內的 /files 路由。
  // 外面（例如 /auth/login 的 JSON 解析與 1 MiB 上限）完全不受影響。
  app.register(async (scope) => {
    scope.removeContentTypeParser(['application/json', 'text/plain']);
    scope.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: maxUploadBytes },
      (_request, body, done) => {
        done(null, body);
      },
    );

    scope.post('/files', { bodyLimit: maxUploadBytes, preHandler: scope.requireUser }, async (request, reply) => {
      const viewer = viewerOf(request);
      const contentType = normalizeContentType(headerString(request.headers['content-type']));

      if (contentType === null) {
        return reply.code(400).send({ error: 'invalid_content_type' });
      }

      const originalName = parseFileName(headerString(request.headers['x-file-name']));

      if (originalName === null) {
        return reply.code(400).send({ error: 'invalid_file_name' });
      }

      const body = request.body;

      if (!Buffer.isBuffer(body)) {
        throw new Error('上傳路由的 body 不是 Buffer');
      }

      const sha256 = createHash('sha256').update(body).digest('hex');
      const declared = headerString(request.headers['x-content-sha256'])?.trim().toLowerCase();

      if (declared !== undefined && declared !== '' && declared !== sha256) {
        return reply.code(422).send({ error: 'checksum_mismatch' });
      }

      const at = now();
      const id = randomUUID();
      const storageKey = `${keyPrefix}${at.getUTCFullYear()}/${id}`;

      // 先寫物件，再寫資料庫。物件寫失敗就沒有資料庫列；
      // 資料庫寫失敗則把剛寫的物件刪掉，不留孤兒。
      await deps.storage.put(storageKey, body, { contentType });

      try {
        if (deps.hooks?.beforeInsert !== undefined) {
          await deps.hooks.beforeInsert(storageKey);
        }

        await createFile(deps.pool, {
          id,
          storageKey,
          originalName,
          contentType,
          sizeBytes: body.byteLength,
          sha256,
          createdBy: viewer.id,
          createdAt: at,
        });
      } catch (error) {
        await deps.storage.remove(storageKey).catch(() => undefined);
        throw error;
      }

      return reply.code(201).send({
        id,
        originalName,
        contentType,
        sizeBytes: body.byteLength,
        sha256,
        createdAt: at.toISOString(),
      });
    });

    scope.get('/files', { preHandler: scope.requireUser }, async (request, reply) => {
      const viewer = viewerOf(request);
      const query = request.query as Record<string, unknown>;

      const limit = parseLimit(query.limit);

      if (limit === null) {
        return reply.code(400).send({ error: 'invalid_limit' });
      }

      const cursor = decodeCursor(query.cursor);

      if (cursor === 'invalid') {
        return reply.code(400).send({ error: 'invalid_cursor' });
      }

      const rows = await listFiles(deps.pool, {
        viewer,
        limit,
        ...(cursor === null ? {} : { cursor }),
      });

      const page = rows.slice(0, limit);
      const last = page[page.length - 1];

      return {
        files: page.map(toPublicFile),
        nextCursor: rows.length > limit && last !== undefined ? encodeCursor(last) : null,
      };
    });

    scope.route({
      method: ['GET', 'HEAD'],
      url: '/files/:id',
      preHandler: scope.requireUser,
      handler: async (request, reply) => {
        const viewer = viewerOf(request);
        const id = readId(request);

        // 不是 uuid 就一定不存在；先擋掉，免得 Postgres 擲 22P02 變成 500。
        if (!UUID.test(id)) {
          return reply.code(404).send({ error: 'not_found' });
        }

        const row = await findFile(deps.pool, id, viewer);

        if (row === null) {
          return reply.code(404).send({ error: 'not_found' });
        }

        const size = Number(row.size_bytes);

        reply.header('content-type', row.content_type);
        reply.header('accept-ranges', 'bytes');
        reply.header('etag', `"${row.sha256}"`);
        reply.header('x-content-type-options', 'nosniff');
        reply.header('cache-control', 'private');
        reply.header('content-disposition', buildContentDisposition(row.original_name, row.content_type));

        if (request.method === 'HEAD') {
          // Fastify 對 HEAD 不會覆寫已設定的 content-length，所以這裡就是整個檔案的大小。
          reply.header('content-length', String(size));
          return reply.send();
        }

        const decision = decideRange(headerString(request.headers.range), size);

        if (decision.kind === 'unsatisfiable') {
          // 416 一定要告訴客戶端實際長度，否則它不知道可以要哪一段。
          reply.header('content-range', `bytes */${size}`);

          // 416 帶的是 JSON 錯誤，不是檔案內容；不改 content-type 的話 Fastify 會
          // 用檔案的類型去序列化物件而擲錯（變成 500）。
          return reply
            .type('application/json')
            .code(416)
            .send({ error: 'range_not_satisfiable' });
        }

        try {
          if (decision.kind === 'satisfiable') {
            const sliced = await deps.storage.getRange(row.storage_key, decision.range);

            reply.header(
              'content-range',
              `bytes ${decision.range.start}-${decision.range.end}/${size}`,
            );
            reply.header('content-length', String(sliced.body.byteLength));

            return reply.code(206).send(sliced.body);
          }

          // none：沒有 Range。ignore：語法錯誤／多段／不支援的單位，照 RFC 9110 忽略。
          const object = await deps.storage.get(row.storage_key);

          reply.header('content-length', String(object.body.byteLength));

          return reply.code(200).send(object.body);
        } catch (error) {
          // 資料庫有列但物件不見了：對外面仍然是「找不到」，不透露內部狀態。
          if (error instanceof StorageObjectNotFoundError) {
            return reply.code(404).send({ error: 'not_found' });
          }

          throw error;
        }
      },
    });

    scope.delete('/files/:id', { preHandler: scope.requireUser }, async (request, reply) => {
      const viewer = viewerOf(request);
      const id = readId(request);

      if (!UUID.test(id)) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const deleted = await softDeleteFile(deps.pool, { id, viewer, at: now() });

      if (!deleted) {
        return reply.code(404).send({ error: 'not_found' });
      }

      return reply.code(204).send();
    });
  });
}
