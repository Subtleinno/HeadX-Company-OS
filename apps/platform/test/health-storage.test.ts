import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app';
import { createStorageDiagnosis, type StorageProbe } from '../src/storage/diagnose';

/**
 * /health/storage 是給人看的診斷：同一個「storage 壞了」，可能是
 * MinIO 沒啟動、bucket 不見、物件不見，處理方法完全不同。
 * 這裡把每一種都釘住，並確保 /health 的既有形狀沒有被改動。
 */

const okCheck = async (): Promise<void> => undefined;

function probe(overrides: Partial<StorageProbe> = {}): StorageProbe {
  return {
    probeKey: '_smoke/persist-check.txt',
    headBucket: async () => undefined,
    headObject: async () => true,
    ...overrides,
  };
}

function httpError(status: number, name: string): Error {
  const error = new Error(name) as Error & { name: string; $metadata: { httpStatusCode: number } };
  error.name = name;
  error.$metadata = { httpStatusCode: status };
  return error;
}

describe('createStorageDiagnosis', () => {
  it('bucket 與探測物件都在：ok', async () => {
    const result = await createStorageDiagnosis(probe())();

    expect(result.status).toBe('ok');
    expect(result.code).toBe('ok');
  });

  it('bucket 不存在：bucket_missing，指引寫明要先建立 bucket', async () => {
    const result = await createStorageDiagnosis(
      probe({
        headBucket: async () => {
          throw httpError(404, 'NotFound');
        },
      }),
    )();

    expect(result.status).toBe('error');
    expect(result.code).toBe('bucket_missing');
    expect(result.guidance).toContain('bucket');
  });

  it('連不上：minio_unreachable，而且不把連線細節帶出來', async () => {
    const result = await createStorageDiagnosis(
      probe({
        headBucket: async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:29000');
        },
      }),
    )();

    expect(result.code).toBe('minio_unreachable');
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
  });

  it('權限不足：permission_denied', async () => {
    const error = new Error('Access Denied') as Error & { code: string };
    error.code = 'EACCES';

    const result = await createStorageDiagnosis(
      probe({
        headBucket: async () => {
          throw error;
        },
      }),
    )();

    expect(result.code).toBe('permission_denied');
  });

  it('bucket 在但探測物件不見：object_missing', async () => {
    const result = await createStorageDiagnosis(probe({ headObject: async () => false }))();

    expect(result.code).toBe('object_missing');
  });

  it('bucket 完全是空的（全新安裝）：ok，不要把「還未有檔案」當成遺失', async () => {
    const result = await createStorageDiagnosis(
      probe({ headObject: async () => false, bucketIsEmpty: async () => true }),
    )();

    expect(result.status).toBe('ok');
    expect(result.code).toBe('ok');
  });

  it('bucket 有其他物件但探測物件不見：object_missing（真的有東西掉了）', async () => {
    const result = await createStorageDiagnosis(
      probe({ headObject: async () => false, bucketIsEmpty: async () => false }),
    )();

    expect(result.code).toBe('object_missing');
  });

  it('物件讀取失敗：object_unreadable', async () => {
    const result = await createStorageDiagnosis(
      probe({
        headObject: async () => {
          throw new Error('stream error');
        },
      }),
    )();

    expect(result.code).toBe('object_unreadable');
  });

  it('探測卡住時限時回 timeout，不會拖住 /health/storage', async () => {
    const startedAt = Date.now();

    const result = await createStorageDiagnosis(
      probe({ headBucket: () => new Promise<void>(() => undefined) }),
      50,
    )();

    expect(result.code).toBe('timeout');
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it('每一種失敗都帶指引，指向 storage:check 與還原文件', async () => {
    const result = await createStorageDiagnosis(
      probe({
        headObject: async () => false,
      }),
    )();

    expect(result.guidance).toContain('storage:check');
    expect(result.guidance).toContain('docs/backup-restore.md');
  });
});

describe('GET /health/storage', () => {
  it('正常時 200 與 code ok', async () => {
    const app = buildServer({
      checkDb: okCheck,
      checkStorage: okCheck,
      diagnoseStorage: createStorageDiagnosis(probe()),
    });

    const response = await app.inject({ method: 'GET', url: '/health/storage' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', code: 'ok' });

    await app.close();
  });

  it('有問題時 503 並帶明確的 code 與指引', async () => {
    const app = buildServer({
      checkDb: okCheck,
      checkStorage: okCheck,
      diagnoseStorage: createStorageDiagnosis(probe({ headObject: async () => false })),
    });

    const response = await app.inject({ method: 'GET', url: '/health/storage' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'error', code: 'object_missing' });
    expect(response.json().guidance).toContain('storage:check');

    await app.close();
  });

  it('沒有注入診斷時回 503 storage_error，不會假裝正常', async () => {
    const app = buildServer({ checkDb: okCheck, checkStorage: okCheck });

    const response = await app.inject({ method: 'GET', url: '/health/storage' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'error', code: 'storage_error' });

    await app.close();
  });

  it('/health 的形狀沒有被改動（仍然只有 db 與 storage 兩個欄位）', async () => {
    const app = buildServer({ checkDb: okCheck, checkStorage: okCheck });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toEqual({ status: 'ok', checks: { db: 'ok', storage: 'ok' } });

    await app.close();
  });
});
