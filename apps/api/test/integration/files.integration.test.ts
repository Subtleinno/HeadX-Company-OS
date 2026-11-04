import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/app';
import { hashPassword } from '../../src/auth/password';
import { registerAuth } from '../../src/auth/routes';
import { createSessionToken, hashSessionToken } from '../../src/auth/token';
import { registerFiles, type FilesHooks } from '../../src/files/routes';
import { migrate } from '../../src/migrate';
import type { Storage } from '../../src/storage/index';
import { createMinioStorage } from '../../src/storage/minio';
import { createTempDatabase, type TempDatabase } from './temp-db';

/**
 * 檔案層整合測試：真的 Postgres（臨時資料庫 co_test_<隨機>）加真的 MinIO。
 *
 * 兩條界線：
 * - 資料庫每次測試都是新的，正式庫不會被寫入任何列（audit_log 刪不掉，寫進去就永遠留著）。
 * - 物件全部放在 _integration-test/<隨機>/files/ 之下，測完 removePrefix 清掉。
 *
 * 儲存 key 前綴由 deps 注入，所以測試不需要知道正式的 files/ 佈局。
 */
const migrationsDir = resolve(process.cwd(), 'db/migrations');
const silent = (): void => undefined;
const ok = async (): Promise<void> => undefined;

const RUN_ROOT = `_integration-test/${randomUUID()}/`;
const KEY_PREFIX = `${RUN_ROOT}files/`;
const MAX_UPLOAD_BYTES = 1024 * 1024;
const START_TIME = new Date('2026-05-01T00:00:00.000Z');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Session = { cookie: string; id: string };

type Recorder = {
  storage: Storage;
  puts: string[];
  removes: string[];
};

let baseStorage: Storage;

beforeAll(async () => {
  baseStorage = await createMinioStorage({
    endpoint: `http://127.0.0.1:${process.env.PORT_MINIO_API ?? '29000'}`,
    accessKey: process.env.MINIO_ROOT_USER ?? '',
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? '',
    bucket: process.env.MINIO_BUCKET ?? 'company-os',
  });
});

afterAll(async () => {
  await baseStorage.removePrefix(RUN_ROOT);
});

/** 包一層記錄 put／remove，用來證明「什麼都沒有寫」。 */
function recorder(putImpl?: Storage['put']): Recorder {
  const puts: string[] = [];
  const removes: string[] = [];

  const storage: Storage = {
    ...baseStorage,
    put: async (key, body, options) => {
      puts.push(key);
      if (putImpl !== undefined) {
        await putImpl(key, body, options);
        return;
      }
      await baseStorage.put(key, body, options);
    },
    remove: async (key) => {
      removes.push(key);
      await baseStorage.remove(key);
    },
  };

  return { storage, puts, removes };
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sessionFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string') {
    throw new Error('回應沒有 Set-Cookie');
  }

  return value.split(';')[0] ?? '';
}

describe('檔案層', () => {
  let db: TempDatabase;
  let app: FastifyInstance;
  let rec: Recorder;
  let clock: Date;

  function now(): Date {
    return clock;
  }

  function buildFilesApp(options: { storage?: Storage; hooks?: FilesHooks } = {}): FastifyInstance {
    const instance = buildServer({ checkDb: ok, checkStorage: ok });

    registerAuth(instance, { pool: db.pool, now });
    registerFiles(instance, {
      pool: db.pool,
      storage: options.storage ?? rec.storage,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      keyPrefix: KEY_PREFIX,
      now,
      ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
    });

    return instance;
  }

  beforeEach(async () => {
    db = await createTempDatabase();
    await migrate({ pool: db.pool, dir: migrationsDir, log: silent });
    clock = new Date(START_TIME);
    rec = recorder();
    app = buildFilesApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await db.drop();
  });

  async function setupOwner(): Promise<Session> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: {
        displayName: '老闆',
        email: 'boss@example.com',
        password: randomBytes(24).toString('base64url'),
      },
    });

    expect(response.statusCode).toBe(201);

    return { cookie: sessionFrom(response), id: response.json().user.id as string };
  }

  async function insertStaff(): Promise<Session> {
    const passwordHash = await hashPassword(randomBytes(24).toString('base64url'));
    const inserted = await db.pool.query<{ id: string }>(
      `insert into app_user (email, display_name, role, department, password_hash)
       values ('staff@example.com', '員工', 'staff', 'design', $1)
       returning id`,
      [passwordHash],
    );

    const id = inserted.rows[0]?.id ?? '';
    const token = createSessionToken();

    await db.pool.query(
      'insert into auth_session (token_hash, user_id, expires_at) values ($1, $2, $3)',
      [hashSessionToken(token), id, new Date(clock.getTime() + 24 * 60 * 60 * 1000)],
    );

    return { cookie: `co_session=${token}`, id };
  }

  type UploadInput = {
    body: Buffer;
    name?: string | null;
    contentType?: string | null;
    sha256?: string;
  };

  async function upload(
    session: Session,
    input: UploadInput,
    instance: FastifyInstance = app,
  ): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    const headers: Record<string, string> = { cookie: session.cookie };

    if (input.contentType !== null && input.contentType !== undefined) {
      headers['content-type'] = input.contentType;
    }

    if (input.name !== null && input.name !== undefined) {
      headers['x-file-name'] = encodeURIComponent(input.name);
    }

    if (input.sha256 !== undefined) {
      headers['x-content-sha256'] = input.sha256;
    }

    return instance.inject({ method: 'POST', url: '/files', headers, payload: input.body });
  }

  async function rowCount(table: 'stored_file' | 'audit_log'): Promise<number> {
    const rows = await db.pool.query<{ n: number }>(`select count(*)::int as n from ${table}`);
    return rows.rows[0]?.n ?? 0;
  }

  describe('上傳與下載', () => {
    it('上傳 201：sha256 正確，資料庫有列，下載逐 byte 相同', async () => {
      const owner = await setupOwner();
      const body = randomBytes(500 * 1024);

      const response = await upload(owner, {
        body,
        name: '報告.pdf',
        contentType: 'application/pdf',
      });

      expect(response.statusCode).toBe(201);

      const created = response.json();
      expect(created).toMatchObject({
        originalName: '報告.pdf',
        contentType: 'application/pdf',
        sizeBytes: body.length,
        sha256: sha256(body),
      });
      expect(created.id).toMatch(UUID);
      expect(created.createdAt).toBe(clock.toISOString());

      const rows = await db.pool.query<{
        storage_key: string;
        created_by: string;
        size_bytes: string;
        deleted_at: Date | null;
      }>('select storage_key, created_by, size_bytes, deleted_at from stored_file where id = $1', [
        created.id,
      ]);

      // key 由伺服器產生：files/<yyyy>/<uuid>，用戶提供的檔名不參與。
      expect(rows.rows[0]?.storage_key).toBe(`${KEY_PREFIX}${clock.getUTCFullYear()}/${created.id}`);
      expect(rows.rows[0]?.created_by).toBe(owner.id);
      expect(rows.rows[0]?.size_bytes).toBe(String(body.length));
      expect(rows.rows[0]?.deleted_at).toBeNull();

      const download = await app.inject({
        method: 'GET',
        url: `/files/${created.id}`,
        headers: { cookie: owner.cookie },
      });

      expect(download.statusCode).toBe(200);
      expect(download.rawPayload.equals(body)).toBe(true);
      expect(download.headers['content-type']).toBe('application/pdf');
      expect(download.headers['content-length']).toBe(String(body.length));
      expect(download.headers['accept-ranges']).toBe('bytes');
      expect(download.headers['etag']).toBe(`"${sha256(body)}"`);
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.headers['cache-control']).toBe('private');
      expect(download.headers['content-disposition']).toContain('inline');
    });

    it('沒有 content-type 時當 application/octet-stream', async () => {
      const owner = await setupOwner();

      const response = await upload(owner, {
        body: Buffer.from('abc'),
        name: 'note.txt',
        contentType: null,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().contentType).toBe('application/octet-stream');
    });

    it('content-type 不是具體類型：400，什麼都不寫', async () => {
      const owner = await setupOwner();

      // 萬用字元可以通過 Fastify 的解析，但「一個檔案」不可能同時是所有類型。
      const response = await upload(owner, {
        body: Buffer.from('abc'),
        name: 'a.txt',
        contentType: '*/*',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_content_type' });
      expect(await rowCount('stored_file')).toBe(0);
      expect(rec.puts).toHaveLength(0);

      // 連 media type 都組成不了的（例如 garbage），Fastify 在解析器之前就回 415。
      const malformed = await upload(owner, {
        body: Buffer.from('abc'),
        name: 'a.txt',
        contentType: 'garbage',
      });

      expect(malformed.statusCode).toBe(415);
      expect(await rowCount('stored_file')).toBe(0);
      expect(rec.puts).toHaveLength(0);
    });

    it('檔名缺失、編碼錯誤、超長：400 invalid_file_name，什麼都不寫', async () => {
      const owner = await setupOwner();

      const missing = await upload(owner, { body: Buffer.from('abc'), name: null });
      expect(missing.statusCode).toBe(400);
      expect(missing.json()).toEqual({ error: 'invalid_file_name' });

      const broken = await app.inject({
        method: 'POST',
        url: '/files',
        headers: { cookie: owner.cookie, 'content-type': 'text/plain', 'x-file-name': '%E0%A4%A' },
        payload: Buffer.from('abc'),
      });
      expect(broken.statusCode).toBe(400);
      expect(broken.json()).toEqual({ error: 'invalid_file_name' });

      const tooLong = await upload(owner, {
        body: Buffer.from('abc'),
        name: `${'a'.repeat(256)}.txt`,
      });
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json()).toEqual({ error: 'invalid_file_name' });

      expect(await rowCount('stored_file')).toBe(0);
      expect(rec.puts).toHaveLength(0);
    });

    it('x-content-sha256 不符：422，沒有資料庫列、沒有物件', async () => {
      const owner = await setupOwner();

      const response = await upload(owner, {
        body: Buffer.from('hello'),
        name: 'a.txt',
        contentType: 'text/plain',
        sha256: sha256(Buffer.from('something else')),
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ error: 'checksum_mismatch' });
      expect(await rowCount('stored_file')).toBe(0);
      expect(rec.puts).toHaveLength(0);
    });

    it('x-content-sha256 相符：201', async () => {
      const owner = await setupOwner();
      const body = Buffer.from('hello');

      const response = await upload(owner, {
        body,
        name: 'a.txt',
        contentType: 'text/plain',
        sha256: sha256(body),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().sha256).toBe(sha256(body));
    });

    it('超過上限：413，沒有資料庫列、沒有物件', async () => {
      const owner = await setupOwner();

      const response = await upload(owner, {
        body: randomBytes(MAX_UPLOAD_BYTES + 1024),
        name: 'big.bin',
        contentType: 'application/octet-stream',
      });

      expect(response.statusCode).toBe(413);
      expect(await rowCount('stored_file')).toBe(0);
      expect(rec.puts).toHaveLength(0);
    });
  });

  describe('Range', () => {
    async function uploadBytes(owner: Session, total: number): Promise<{ id: string; body: Buffer }> {
      const body = Buffer.from(
        Array.from({ length: total }, (_unused, index) => String.fromCharCode(48 + (index % 10))).join(''),
        'utf8',
      );
      const response = await upload(owner, {
        body,
        name: 'seq.bin',
        contentType: 'application/octet-stream',
      });

      expect(response.statusCode).toBe(201);

      return { id: response.json().id as string, body };
    }

    it('bytes=0-9：206，Content-Range 與位元組正確', async () => {
      const owner = await setupOwner();
      const file = await uploadBytes(owner, 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/files/${file.id}`,
        headers: { cookie: owner.cookie, range: 'bytes=0-9' },
      });

      expect(response.statusCode).toBe(206);
      expect(response.headers['content-range']).toBe('bytes 0-9/1000');
      expect(response.headers['content-length']).toBe('10');
      expect(response.rawPayload).toEqual(file.body.subarray(0, 10));
    });

    it('bytes=-50：最後 50 個位元組', async () => {
      const owner = await setupOwner();
      const file = await uploadBytes(owner, 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/files/${file.id}`,
        headers: { cookie: owner.cookie, range: 'bytes=-50' },
      });

      expect(response.statusCode).toBe(206);
      expect(response.headers['content-range']).toBe('bytes 950-999/1000');
      expect(response.rawPayload).toEqual(file.body.subarray(950));
    });

    it('bytes=90-：由 90 讀到最後', async () => {
      const owner = await setupOwner();
      const file = await uploadBytes(owner, 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/files/${file.id}`,
        headers: { cookie: owner.cookie, range: 'bytes=90-' },
      });

      expect(response.statusCode).toBe(206);
      expect(response.headers['content-range']).toBe('bytes 90-999/1000');
      expect(response.rawPayload).toEqual(file.body.subarray(90));
    });

    it('起始位置超出長度：416，帶 bytes */total', async () => {
      const owner = await setupOwner();
      const file = await uploadBytes(owner, 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/files/${file.id}`,
        headers: { cookie: owner.cookie, range: 'bytes=1000-' },
      });

      expect(response.statusCode).toBe(416);
      expect(response.headers['content-range']).toBe('bytes */1000');
      expect(response.headers['accept-ranges']).toBe('bytes');
    });

    it('多段 range 與語法錯誤：忽略 Range，回 200 全檔', async () => {
      const owner = await setupOwner();
      const file = await uploadBytes(owner, 1000);

      for (const range of ['bytes=0-9,20-29', 'bytes=abc', 'items=0-9']) {
        const response = await app.inject({
          method: 'GET',
          url: `/files/${file.id}`,
          headers: { cookie: owner.cookie, range },
        });

        expect(response.statusCode).toBe(200);
        expect(response.rawPayload.equals(file.body)).toBe(true);
        expect(response.headers['content-range']).toBeUndefined();
      }
    });

    it('HEAD：有標頭沒有 body，Content-Length 是整個檔案', async () => {
      const owner = await setupOwner();
      const file = await uploadBytes(owner, 1000);

      const response = await app.inject({
        method: 'HEAD',
        url: `/files/${file.id}`,
        headers: { cookie: owner.cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('');
      expect(response.headers['content-length']).toBe('1000');
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.headers['etag']).toBe(`"${sha256(file.body)}"`);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('權限', () => {
    it('未登入：所有檔案路由都 401', async () => {
      const id = randomUUID();

      const upload401 = await app.inject({
        method: 'POST',
        url: '/files',
        headers: { 'content-type': 'text/plain', 'x-file-name': 'a.txt' },
        payload: Buffer.from('x'),
      });
      expect(upload401.statusCode).toBe(401);

      const responses = await Promise.all([
        app.inject({ method: 'GET', url: '/files' }),
        app.inject({ method: 'GET', url: `/files/${id}` }),
        app.inject({ method: 'HEAD', url: `/files/${id}` }),
        app.inject({ method: 'DELETE', url: `/files/${id}` }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(401);
      }

      expect(upload401.json()).toEqual({ error: 'not_signed_in' });
      expect(responses[0]?.json()).toEqual({ error: 'not_signed_in' });
      expect(responses[1]?.json()).toEqual({ error: 'not_signed_in' });
    });

    it('員工看不到、下載不了、刪不了老闆的檔案（都是同一個 404）', async () => {
      const owner = await setupOwner();
      const staff = await insertStaff();

      const ownerFile = await upload(owner, {
        body: Buffer.from('老闆的檔案'),
        name: 'owner.txt',
        contentType: 'text/plain',
      });
      const ownerFileId = ownerFile.json().id as string;

      const download = await app.inject({
        method: 'GET',
        url: `/files/${ownerFileId}`,
        headers: { cookie: staff.cookie },
      });
      expect(download.statusCode).toBe(404);
      expect(download.json()).toEqual({ error: 'not_found' });

      const head = await app.inject({
        method: 'HEAD',
        url: `/files/${ownerFileId}`,
        headers: { cookie: staff.cookie },
      });
      expect(head.statusCode).toBe(404);

      const remove = await app.inject({
        method: 'DELETE',
        url: `/files/${ownerFileId}`,
        headers: { cookie: staff.cookie },
      });
      expect(remove.statusCode).toBe(404);

      // 員工的清單看不到老闆的檔案。
      const list = await app.inject({
        method: 'GET',
        url: '/files',
        headers: { cookie: staff.cookie },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().files).toHaveLength(0);

      // 不存在的 id 也是同一個 404，不透露檔案是否存在。
      const missing = await app.inject({
        method: 'GET',
        url: `/files/${randomUUID()}`,
        headers: { cookie: staff.cookie },
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.body).toBe(download.body);
    });

    it('老闆看得到員工的檔案，員工只見到自己的', async () => {
      const owner = await setupOwner();
      const staff = await insertStaff();

      const staffFile = await upload(staff, {
        body: Buffer.from('員工的檔案'),
        name: 'staff.txt',
        contentType: 'text/plain',
      });
      const staffFileId = staffFile.json().id as string;

      const asOwner = await app.inject({
        method: 'GET',
        url: `/files/${staffFileId}`,
        headers: { cookie: owner.cookie },
      });
      expect(asOwner.statusCode).toBe(200);
      expect(asOwner.rawPayload.toString('utf8')).toBe('員工的檔案');

      await upload(owner, { body: Buffer.from('老闆'), name: 'owner.txt', contentType: 'text/plain' });

      const ownerList = await app.inject({
        method: 'GET',
        url: '/files',
        headers: { cookie: owner.cookie },
      });
      expect(ownerList.json().files).toHaveLength(2);

      const staffList = await app.inject({
        method: 'GET',
        url: '/files',
        headers: { cookie: staff.cookie },
      });
      expect(staffList.json().files).toHaveLength(1);
      expect(staffList.json().files[0].id).toBe(staffFileId);

      // 回應不含 storage_key。
      expect(JSON.stringify(staffList.json())).not.toContain('storage_key');
    });
  });

  describe('列表分頁', () => {
    it('依 (created_at, id) 倒序，limit 與 cursor 不漏不重', async () => {
      const owner = await setupOwner();
      const ids: string[] = [];

      for (let index = 0; index < 5; index += 1) {
        clock = new Date(START_TIME.getTime() + index * 1000);
        const response = await upload(owner, {
          body: Buffer.from(`檔案 ${index}`),
          name: `f${index}.txt`,
          contentType: 'text/plain',
        });
        expect(response.statusCode).toBe(201);
        ids.push(response.json().id as string);
      }

      const seen: string[] = [];
      let cursor: string | null = null;

      for (let page = 0; page < 4; page += 1) {
        const url: string =
          cursor === null ? '/files?limit=2' : `/files?limit=2&cursor=${encodeURIComponent(cursor)}`;
        const response = await app.inject({
          method: 'GET',
          url,
          headers: { cookie: owner.cookie },
        });

        expect(response.statusCode).toBe(200);

        const body = response.json() as { files: { id: string }[]; nextCursor: string | null };
        seen.push(...body.files.map((file) => file.id));
        cursor = body.nextCursor;

        if (cursor === null) {
          break;
        }
      }

      expect(seen).toEqual([...ids].reverse());
      expect(cursor).toBeNull();
    });

    it('limit 預設 50、上限 100；不合法的 limit 與 cursor 回 400', async () => {
      const owner = await setupOwner();

      const byDefault = await app.inject({
        method: 'GET',
        url: '/files',
        headers: { cookie: owner.cookie },
      });
      expect(byDefault.statusCode).toBe(200);

      const tooBig = await app.inject({
        method: 'GET',
        url: '/files?limit=1000',
        headers: { cookie: owner.cookie },
      });
      expect(tooBig.statusCode).toBe(200);

      for (const query of ['limit=0', 'limit=abc', 'cursor=not-a-cursor']) {
        const response = await app.inject({
          method: 'GET',
          url: `/files?${query}`,
          headers: { cookie: owner.cookie },
        });
        expect(response.statusCode).toBe(400);
      }
    });
  });

  describe('軟刪除', () => {
    it('刪除後下載與列表都找不到，資料庫列還在，物件還在', async () => {
      const owner = await setupOwner();
      const uploaded = await upload(owner, {
        body: Buffer.from('要刪的檔案'),
        name: 'del.txt',
        contentType: 'text/plain',
      });
      const id = uploaded.json().id as string;

      const removed = await app.inject({
        method: 'DELETE',
        url: `/files/${id}`,
        headers: { cookie: owner.cookie },
      });
      expect(removed.statusCode).toBe(204);

      const download = await app.inject({
        method: 'GET',
        url: `/files/${id}`,
        headers: { cookie: owner.cookie },
      });
      expect(download.statusCode).toBe(404);

      const list = await app.inject({
        method: 'GET',
        url: '/files',
        headers: { cookie: owner.cookie },
      });
      expect(list.json().files).toHaveLength(0);

      const rows = await db.pool.query<{ deleted_at: Date | null; storage_key: string }>(
        'select deleted_at, storage_key from stored_file where id = $1',
        [id],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]?.deleted_at).not.toBeNull();

      // 軟刪除不釋放空間：物件仍然在。
      expect(await baseStorage.exists(rows.rows[0]?.storage_key ?? '')).toBe(true);

      const again = await app.inject({
        method: 'DELETE',
        url: `/files/${id}`,
        headers: { cookie: owner.cookie },
      });
      expect(again.statusCode).toBe(404);
    });
  });

  describe('補償', () => {
    it('資料庫寫入失敗：剛寫入的物件被刪掉，沒有資料庫列', async () => {
      const owner = await setupOwner();
      const failing = buildFilesApp({
        hooks: {
          beforeInsert: async () => {
            throw new Error('模擬資料庫寫入失敗');
          },
        },
      });
      await failing.ready();

      try {
        const response = await upload(
          owner,
          { body: Buffer.from('補償測試'), name: 'c.txt', contentType: 'text/plain' },
          failing,
        );

        expect(response.statusCode).toBe(500);
        expect(rec.puts).toHaveLength(1);
        expect(rec.removes).toEqual(rec.puts);
        expect(await baseStorage.exists(rec.puts[0] ?? '')).toBe(false);
        expect(await rowCount('stored_file')).toBe(0);
      } finally {
        await failing.close();
      }
    });

    it('物件寫入失敗：沒有資料庫列', async () => {
      const owner = await setupOwner();
      const failing = recorder(async () => {
        throw new Error('模擬物件寫入失敗');
      });
      const instance = buildFilesApp({ storage: failing.storage });
      await instance.ready();

      try {
        const response = await upload(
          owner,
          { body: Buffer.from('物件失敗'), name: 'o.txt', contentType: 'text/plain' },
          instance,
        );

        expect(response.statusCode).toBe(500);
        expect(failing.puts).toHaveLength(1);
        expect(await rowCount('stored_file')).toBe(0);
      } finally {
        await instance.close();
      }
    });
  });

  describe('審計', () => {
    it('上傳與刪除各一筆，detail 不含檔名', async () => {
      const owner = await setupOwner();

      const uploaded = await upload(owner, {
        body: Buffer.from('審計測試'),
        name: '機密報告.txt',
        contentType: 'text/plain',
      });
      const id = uploaded.json().id as string;

      // 下載與列表都不寫審計：Range 會產生大量請求，逐個記錄只會淹沒真正的操作。
      await app.inject({ method: 'GET', url: `/files/${id}`, headers: { cookie: owner.cookie } });
      await app.inject({
        method: 'GET',
        url: `/files/${id}`,
        headers: { cookie: owner.cookie, range: 'bytes=0-3' },
      });
      await app.inject({ method: 'GET', url: '/files', headers: { cookie: owner.cookie } });

      await app.inject({
        method: 'DELETE',
        url: `/files/${id}`,
        headers: { cookie: owner.cookie },
      });

      const rows = await db.pool.query<{
        action: string;
        actor_type: string;
        actor_id: string;
        target: string | null;
        detail: Record<string, unknown>;
      }>(
        "select action, actor_type, actor_id, target, detail from audit_log where action like 'file.%' order by id",
      );

      expect(rows.rows.map((row) => row.action)).toEqual(['file.upload', 'file.delete']);

      const uploadRow = rows.rows[0];
      expect(uploadRow?.actor_type).toBe('human');
      expect(uploadRow?.actor_id).toBe(owner.id);
      expect(uploadRow?.target).toBe(id);
      expect(uploadRow?.detail).toEqual({
        sizeBytes: Buffer.byteLength('審計測試'),
        sha256: sha256(Buffer.from('審計測試')),
        contentType: 'text/plain',
      });

      const deleteRow = rows.rows[1];
      expect(deleteRow?.actor_id).toBe(owner.id);
      expect(deleteRow?.target).toBe(id);

      for (const row of rows.rows) {
        expect(JSON.stringify(row.detail)).not.toContain('機密報告');
      }
    });
  });

  describe('不安全的類型', () => {
    it('text/html 下載強制 attachment，並帶 nosniff', async () => {
      const owner = await setupOwner();

      const uploaded = await upload(owner, {
        body: Buffer.from('<script>alert(1)</script>'),
        name: 'x.html',
        contentType: 'text/html',
      });
      expect(uploaded.statusCode).toBe(201);

      const download = await app.inject({
        method: 'GET',
        url: `/files/${uploaded.json().id}`,
        headers: { cookie: owner.cookie },
      });

      expect(download.statusCode).toBe(200);
      expect(download.headers['content-disposition']).toContain('attachment;');
      expect(download.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('不影響其他路由', () => {
    it('非上傳路由的 body 上限與 content-type 行為不變', async () => {
      // 上傳插件把 application/json 的解析器換成 buffer；外面不可以受影響。
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: randomBytes(MAX_UPLOAD_BYTES + 1024),
      });

      expect(login.statusCode).toBe(413);

      const emptyJson = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
      });

      expect(emptyJson.statusCode).toBe(400);
      expect(emptyJson.json()).toEqual({ error: 'invalid_input', field: 'email' });
    });

    it('上傳路由接受任何 content-type，包括 application/json', async () => {
      const owner = await setupOwner();

      const response = await upload(owner, {
        body: Buffer.from('{"not":"json"}'),
        name: 'raw.json',
        contentType: 'application/json',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().contentType).toBe('application/json');
      expect(response.json().sizeBytes).toBe(14);
    });
  });
});
