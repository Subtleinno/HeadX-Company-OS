import { describe, expect, it } from 'vitest';
import { checkStorage } from './storage-check.mjs';

/**
 * 儲存空間遺失偵測。每一種失敗都要有自己的錯誤碼，
 * 因為「MinIO 未啟動」與「資料夾是空的」要用完全不同的方法處理。
 * 所有探測都以參數注入，測試不需要 Docker。
 */

function probes(overrides: Record<string, unknown> = {}) {
  return {
    containerRunning: () => true,
    dataDir: async () => ({ exists: true, isDirectory: true, isEmpty: false, readable: true }),
    headBucket: async () => undefined,
    headObject: async () => true,
    probeKey: '_smoke/persist-check.txt',
    ...overrides,
  };
}

function httpError(status: number, name: string): Error {
  const error = new Error(name) as Error & { name: string; $metadata: { httpStatusCode: number } };
  error.name = name;
  error.$metadata = { httpStatusCode: status };
  return error;
}

describe('checkStorage：正常', () => {
  it('全部通過時 code 是 ok，四個檢查都是 ok', async () => {
    const result = await checkStorage({ probes: probes() });

    expect(result.ok).toBe(true);
    expect(result.code).toBe('ok');
    expect(result.checks.map((check) => check.code)).toEqual([
      'container',
      'data_dir',
      'bucket',
      'object',
    ]);
    expect(result.checks.every((check) => check.status === 'ok')).toBe(true);
  });
});

describe('checkStorage：每一種失敗都有自己的碼', () => {
  it('容器沒有在跑：minio_not_running，並指向啟動指令', async () => {
    const result = await checkStorage({
      probes: probes({ containerRunning: () => false }),
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('minio_not_running');
    const check = result.checks.find((item) => item.code === 'minio_not_running');
    expect(check?.guidance).toContain('docker compose up -d storage');
  });

  it('資料目錄不存在：data_dir_missing', async () => {
    const result = await checkStorage({
      probes: probes({
        dataDir: async () => ({ exists: false, isDirectory: false, isEmpty: true, readable: false }),
      }),
    });

    expect(result.code).toBe('data_dir_missing');
  });

  it('資料目錄存在但沒有權限：permission_denied', async () => {
    const result = await checkStorage({
      probes: probes({
        dataDir: async () => ({ exists: true, isDirectory: true, isEmpty: false, readable: false }),
      }),
    });

    expect(result.code).toBe('permission_denied');
  });

  it('資料目錄是空的：data_dir_empty（與「目錄不見」分開）', async () => {
    const result = await checkStorage({
      probes: probes({
        dataDir: async () => ({ exists: true, isDirectory: true, isEmpty: true, readable: true }),
      }),
    });

    expect(result.code).toBe('data_dir_empty');
  });

  it('bucket 不見了：bucket_missing', async () => {
    const result = await checkStorage({
      probes: probes({
        headBucket: async () => {
          throw httpError(404, 'NotFound');
        },
      }),
    });

    expect(result.code).toBe('bucket_missing');
  });

  it('MinIO 連不上：minio_unreachable', async () => {
    const result = await checkStorage({
      probes: probes({
        headBucket: async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:29000');
        },
      }),
    });

    expect(result.code).toBe('minio_unreachable');
    // 不要把連線細節回給呼叫端，交給 log。
    expect(result.checks.find((item) => item.code === 'minio_unreachable')?.message).not.toContain(
      'ECONNREFUSED',
    );
  });

  it('bucket 在但探測物件不見：object_missing', async () => {
    const result = await checkStorage({ probes: probes({ headObject: async () => false }) });

    expect(result.code).toBe('object_missing');
  });

  it('物件讀取失敗（權限）：object_unreadable', async () => {
    const result = await checkStorage({
      probes: probes({
        headObject: async () => {
          const error = new Error('AccessDenied') as Error & { code: string };
          error.code = 'EACCES';
          throw error;
        },
      }),
    });

    expect(result.code).toBe('object_unreadable');
  });
});

describe('checkStorage：還原指引', () => {
  it('有已驗證備份時，指引寫出最近的 backup ID 與時間', async () => {
    const result = await checkStorage({
      probes: probes({ containerRunning: () => false }),
      latestVerifiedBackup: {
        id: '20261104-144005-0a1b2c',
        createdAt: '2026-11-04T14:40:05.000Z',
      },
    });

    const check = result.checks.find((item) => item.code === 'minio_not_running');
    expect(check?.guidance).toContain('20261104-144005-0a1b2c');
    expect(check?.guidance).toContain('restore');
  });

  it('沒有已驗證備份時，指引要老實說沒有，不要假裝有', async () => {
    const result = await checkStorage({ probes: probes({ containerRunning: () => false }) });

    const check = result.checks.find((item) => item.code === 'minio_not_running');
    expect(check?.guidance).toContain('沒有已驗證的備份');
  });

  it('容器沒在跑時仍然會繼續檢查其他項目，一次列齊所有問題', async () => {
    const result = await checkStorage({
      probes: probes({
        containerRunning: () => false,
        headBucket: async () => {
          throw new Error('connect ECONNREFUSED');
        },
      }),
    });

    const failing = result.checks.filter((check) => check.status === 'fail').map((check) => check.code);

    expect(failing).toContain('minio_not_running');
    expect(failing.length).toBeGreaterThan(1);
  });
});
