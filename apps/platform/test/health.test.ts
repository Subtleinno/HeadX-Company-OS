import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app';

const ok = async (): Promise<void> => undefined;

describe('/livez', () => {
  it('process 活著就回 200，而且不檢查 db 與 storage', async () => {
    let dbChecked = false;
    let storageChecked = false;
    const app = buildServer({
      checkDb: async () => {
        dbChecked = true;
      },
      checkStorage: async () => {
        storageChecked = true;
      },
    });

    const response = await app.inject({ method: 'GET', url: '/livez' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(dbChecked).toBe(false);
    expect(storageChecked).toBe(false);

    await app.close();
  });
});

describe('/health', () => {
  it('db 與 storage 都可用時回 200 與 ok', async () => {
    const app = buildServer({ checkDb: ok, checkStorage: ok });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { db: 'ok', storage: 'ok' },
    });

    await app.close();
  });

  // 這個測試在實作「db 不通也回 200」時會失敗，證明 503 檢查真的有效。
  it('db 不可用時回 503，而且不洩漏錯誤內容', async () => {
    const app = buildServer({
      checkDb: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      },
      checkStorage: ok,
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      checks: { db: 'error', storage: 'ok' },
    });
    expect(response.body).not.toContain('ECONNREFUSED');

    await app.close();
  });

  // 這個測試在實作「storage 不通都回 200」時會失敗。
  it('storage 不可用時回 503，db 的狀態仍然照實回報', async () => {
    const app = buildServer({
      checkDb: ok,
      checkStorage: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.6:9000');
      },
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      checks: { db: 'ok', storage: 'error' },
    });
    expect(response.body).not.toContain('ECONNREFUSED');

    await app.close();
  });

  it('兩者都不通時只回 503 與兩個 error，不會 500', async () => {
    const app = buildServer({
      checkDb: async () => {
        throw new Error('db down');
      },
      checkStorage: async () => {
        throw new Error('storage down');
      },
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      checks: { db: 'error', storage: 'error' },
    });

    await app.close();
  });
});

describe('/health 的 storage 逾時', () => {
  // storage 停掉時 AWS SDK 會自己重試，令 /health 拖到 11 秒以上。
  // 這個測試注入一個永不完成的檢查：/health 必須在 3 秒內回 503，不是等 SDK。
  it('storage 檢查卡住時 3 秒內回 503，不會等到 SDK 重試完', async () => {
    let release: (() => void) | undefined;
    const hanging = new Promise<void>((resolve) => {
      release = resolve;
    });

    const app = buildServer({
      checkDb: ok,
      checkStorage: () => hanging,
    });

    const startedAt = Date.now();

    const response = await Promise.race([
      app.inject({ method: 'GET', url: '/health' }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('3 秒內沒有回應，/health 被卡住')), 3000);
      }),
    ]);

    const elapsed = Date.now() - startedAt;

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      checks: { db: 'ok', storage: 'error' },
    });
    expect(elapsed).toBeLessThan(3000);

    // 讓卡住的 promise 結束，關閉時不需要等它。
    release?.();
    await app.close();
  });
});
