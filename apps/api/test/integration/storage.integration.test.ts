import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMinioStorage, type MinioStorage } from '../../src/storage/minio';

/**
 * 整合測試：需要 storage 服務真的在跑（npm run test:integration）。
 * 連主機的 127.0.0.1:${PORT_MINIO_API}，帳密讀 .env，不經容器網路。
 * 所有測試物件都放在 _integration-test/ 之下，跑完刪掉，不污染正式資料。
 */
process.loadEnvFile(resolve(process.cwd(), '.env'));

const port = process.env.PORT_MINIO_API ?? '29000';
const bucket = process.env.MINIO_BUCKET ?? 'company-os';

let storage: MinioStorage;
let runPrefix: string;

beforeAll(async () => {
  storage = await createMinioStorage({
    endpoint: `http://127.0.0.1:${port}`,
    accessKey: process.env.MINIO_ROOT_USER ?? '',
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? '',
    bucket,
  });

  runPrefix = `_integration-test/${randomUUID()}/`;
});

afterAll(async () => {
  await storage.removePrefix(runPrefix);
});

describe('Storage：寫入與讀取', () => {
  it('put 之後 get 取回同樣內容，並保留 content type 與長度', async () => {
    const key = `${runPrefix}hello.txt`;
    const body = Buffer.from('你好，company-os。', 'utf8');

    await storage.put(key, body, { contentType: 'text/plain; charset=utf-8' });

    const object = await storage.get(key);

    expect(object.body.equals(body)).toBe(true);
    expect(object.size).toBe(body.byteLength);
    expect(object.contentType).toContain('text/plain');
  });

  it('exists 對存在的物件回 true，對不存在的回 false', async () => {
    const key = `${runPrefix}exists.txt`;
    await storage.put(key, Buffer.from('x'));

    expect(await storage.exists(key)).toBe(true);
    expect(await storage.exists(`${runPrefix}no-such-object.txt`)).toBe(false);
  });

  it('get 不存在的物件時報錯，不回空內容', async () => {
    await expect(storage.get(`${runPrefix}no-such-object.txt`)).rejects.toThrow();
  });

  it('remove 之後 exists 回 false', async () => {
    const key = `${runPrefix}to-remove.txt`;
    await storage.put(key, Buffer.from('x'));

    await storage.remove(key);

    expect(await storage.exists(key)).toBe(false);
  });
});

describe('Storage：區段讀取', () => {
  it('getRange 取回正確區段，並回報物件總長度', async () => {
    const key = `${runPrefix}range.bin`;
    const body = Buffer.from('0123456789');

    await storage.put(key, body);

    const sliced = await storage.getRange(key, { start: 3, end: 6 });

    expect(sliced.body.toString('utf8')).toBe('3456');
    expect(sliced.total).toBe(10);
  });

  it('suffix range 取回最後幾個位元組', async () => {
    const key = `${runPrefix}suffix.bin`;
    await storage.put(key, Buffer.from('abcdefghij'));

    const sliced = await storage.getRange(key, { start: 7, end: 9 });

    expect(sliced.body.toString('utf8')).toBe('hij');
  });
});

describe('Storage：前綴刪除', () => {
  it('removePrefix 只刪該前綴的物件，不影響其他前綴', async () => {
    const alpha = `${runPrefix}alpha/`;
    const beta = `${runPrefix}beta/`;

    await storage.put(`${alpha}a.txt`, Buffer.from('a'));
    await storage.put(`${alpha}b.txt`, Buffer.from('b'));
    await storage.put(`${beta}c.txt`, Buffer.from('c'));

    const removed = await storage.removePrefix(alpha);

    expect(removed).toBe(2);
    expect(await storage.exists(`${alpha}a.txt`)).toBe(false);
    expect(await storage.exists(`${alpha}b.txt`)).toBe(false);
    expect(await storage.exists(`${beta}c.txt`)).toBe(true);
  });
});
