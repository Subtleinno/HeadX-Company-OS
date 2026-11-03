import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app';

describe('/livez', () => {
  it('process 活著就回 200，而且不檢查 db', async () => {
    let dbChecked = false;
    const app = buildServer({
      checkDb: async () => {
        dbChecked = true;
      },
    });

    const response = await app.inject({ method: 'GET', url: '/livez' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(dbChecked).toBe(false);

    await app.close();
  });
});

describe('/health', () => {
  it('db 可用時回 200 與 ok', async () => {
    const app = buildServer({ checkDb: async () => undefined });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { db: 'ok' },
    });

    await app.close();
  });

  // 這個測試在實作「db 不通也回 200」時會失敗，證明 503 檢查真的有效。
  it('db 不可用時回 503，而且不洩漏錯誤內容', async () => {
    const app = buildServer({
      checkDb: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      },
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      checks: { db: 'error' },
    });
    expect(response.body).not.toContain('ECONNREFUSED');

    await app.close();
  });
});
