// 檔案儲存的冒煙測試：在主機執行，讀 .env，連 127.0.0.1:${PORT_MINIO_API}。
//
// 用法：
//   npm run storage:smoke -- write    寫入一個測試物件
//   npm run storage:smoke -- verify   確認該物件仍然存在（用來證明 down -v 之後資料還在）
//
// 存在理由：MinIO 的資料是 bind mount 到 Windows 資料夾，不是 Docker volume。
// 只有真的寫一次、拆掉再讀一次，才可以證明這件事。

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const SMOKE_KEY = '_smoke/persist-check.txt';

function readConfig() {
  try {
    process.loadEnvFile();
  } catch {
    console.error('找不到 .env；請先複製 .env.example 為 .env');
    process.exitCode = 1;
    return null;
  }

  const port = process.env.PORT_MINIO_API ?? '29000';
  const accessKey = process.env.MINIO_ROOT_USER ?? '';
  const secretKey = process.env.MINIO_ROOT_PASSWORD ?? '';
  const bucket = process.env.MINIO_BUCKET ?? 'company-os';

  if (accessKey === '' || secretKey === '') {
    console.error('MINIO_ROOT_USER 或 MINIO_ROOT_PASSWORD 未設定（只說哪一個沒設，不顯示值）');
    process.exitCode = 1;
    return null;
  }

  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    client: new S3Client({
      endpoint: `http://127.0.0.1:${port}`,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    }),
  };
}

async function write() {
  const config = readConfig();
  if (config === null) {
    return;
  }

  const body = `company-os storage smoke ${new Date().toISOString()}\n`;

  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: SMOKE_KEY,
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
    }),
  );

  console.log(`已寫入：${config.endpoint} bucket=${config.bucket} key=${SMOKE_KEY}`);
  console.log(`內容：${body.trim()}`);
  console.log('之後執行 storage:smoke verify 應該仍然讀得到。');
}

async function verify() {
  const config = readConfig();
  if (config === null) {
    return;
  }

  try {
    await config.client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: SMOKE_KEY }));
  } catch {
    console.error(`物件不存在：bucket=${config.bucket} key=${SMOKE_KEY}`);
    console.error('資料沒有留下來：bind mount 可能沒有指向正確的資料夾。');
    process.exitCode = 1;
    return;
  }

  const object = await config.client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: SMOKE_KEY }),
  );
  const body = (await object.Body.transformToString()).trim();

  console.log(`物件仍然存在：${config.endpoint} bucket=${config.bucket} key=${SMOKE_KEY}`);
  console.log(`內容：${body}`);
}

const command = process.argv[2];

try {
  if (command === 'write') {
    await write();
  } else if (command === 'verify') {
    await verify();
  } else {
    console.error('用法：npm run storage:smoke -- write|verify');
    process.exitCode = 1;
  }
} catch (error) {
  // 連不上或權限錯誤要看得見，不要靜靜結束。
  console.error(`storage:smoke 失敗：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
