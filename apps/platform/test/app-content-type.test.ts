import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app';

/**
 * JSON body 的解析行為：這是一個全域設定，不是 logout 自己的事。
 * 這裡用一條與 auth 無關的探測路由，證明之後所有 POST 都受惠。
 */
const ok = async (): Promise<void> => undefined;

function probeApp(): ReturnType<typeof buildServer> {
  const app = buildServer({ checkDb: ok, checkStorage: ok });

  app.post('/probe', async (request) => ({ body: request.body ?? null }));

  return app;
}

describe('JSON content-type 解析', () => {
  it('application/json 但沒有 body：當空物件，handler 仍然被叫到', async () => {
    const app = probeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/probe',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: {} });

    await app.close();
  });

  it('application/json 的 body 是空的字串：同樣當空物件', async () => {
    const app = probeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/probe',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: {} });

    await app.close();
  });

  it('正常的 JSON body 照常解析', async () => {
    const app = probeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/probe',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ hello: '世界', n: 1 }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: { hello: '世界', n: 1 } });

    await app.close();
  });

  it('壞掉的 JSON：400，不會進到 handler', async () => {
    const app = probeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/probe',
      headers: { 'content-type': 'application/json' },
      payload: '{"hello":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().body).toBeUndefined();

    await app.close();
  });
});
