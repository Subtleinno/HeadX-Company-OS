import { execFile, spawn } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { finished } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * 真的碰 Docker、Postgres、MinIO 的適配層。
 *
 * 所有指令都經 `docker compose exec` 在容器內執行，不要求主機安裝 psql 或 pg_dump；
 * 主機只需要 Docker Desktop。物件則走 S3 協定（127.0.0.1），不直接搬資料夾 ——
 * 直接搬檔案會把 MinIO 的內部格式（xlsx、part 檔）一起搬走，還原時只要版本不同就讀不回來。
 */

const execFileAsync = promisify(execFile);

/** 資料庫與 bucket 名稱會進 shell 指令，所以先收窄成安全字元。 */
export function assertSafeName(kind, name) {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/.test(name)) {
    throw new Error(`${kind} 名稱不合法：${name}`);
  }

  return name;
}

export function createDocker({ repoRoot, log = () => undefined }) {
  const run = async (args, { input } = {}) => {
    const options = { cwd: repoRoot, windowsHide: true, maxBuffer: 64 * 1024 * 1024 };

    if (input !== undefined) {
      options.input = input;
    }

    const { stdout } = await execFileAsync('docker', args, options);
    return typeof stdout === 'string' ? stdout : stdout.toString('utf8');
  };

  return {
    // 指令一律在 repo 根目錄執行：`docker compose` 要找到同一個 compose 檔。
    binary: 'docker',
    cwd: repoRoot,

    async run(args) {
      log({ event: 'docker.run', args: args.join(' ') });
      return run(args);
    },

    /** 容器是否存在與是否在跑；不存在回 null（與「存在但停了」分開）。 */
    async inspectRunning(name) {
      try {
        const stdout = await run(['inspect', '-f', '{{.State.Running}}', name]);
        return stdout.trim() === 'true';
      } catch {
        return null;
      }
    },

    async stop(name) {
      await run(['stop', '-t', '30', name]);
    },

    async start(name) {
      await run(['start', name]);
    },

    /** 在 compose 服務內執行一道 shell 指令，回傳 stdout。 */
    async execIn(service, script) {
      return run(['compose', 'exec', '-T', service, 'sh', '-c', script]);
    },
  };
}

function spawnToFile({ command, args, target, cwd }) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    let size = 0;
    let stderr = '';
    const out = createWriteStream(target);
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.on('data', (chunk) => {
      hash.update(chunk);
      size += chunk.length;
    });
    child.stdout.pipe(out);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', async (code) => {
      try {
        await finished(out);
      } catch (error) {
        reject(error);
        return;
      }

      if (code !== 0) {
        reject(new Error(stderr.trim() === '' ? `指令退出碼 ${code}` : stderr.trim()));
        return;
      }

      resolve({ sha256: hash.digest('hex'), size });
    });
  });
}

function spawnWithFileInput({ command, args, source, cwd }) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });

    child.stdout.on('data', () => undefined);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() === '' ? `指令退出碼 ${code}` : stderr.trim()));
    });

    const input = createReadStream(source);
    input.on('error', reject);
    input.pipe(child.stdin);
  });
}

/** pg_dump 自訂格式（-Fc）：可用 pg_restore 選擇性還原，也比純 SQL 小。 */
export async function dumpPostgres({ docker, database, target }) {
  assertSafeName('資料庫', database);

  return spawnToFile({
    command: docker.binary,
    cwd: docker.cwd,
    args: [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `pg_dump -U "$POSTGRES_USER" -d '${database}' -Fc --no-owner`,
    ],
    target,
  });
}

export async function listPostgresDump({ docker, dumpPath }) {
  await spawnWithFileInput({
    command: docker.binary,
    cwd: docker.cwd,
    args: ['compose', 'exec', '-T', 'db', 'pg_restore', '-l'],
    source: dumpPath,
  });
}

export async function restorePostgres({ docker, dumpPath, database }) {
  assertSafeName('資料庫', database);

  await spawnWithFileInput({
    command: docker.binary,
    cwd: docker.cwd,
    args: [
      'compose',
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      `pg_restore -U "$POSTGRES_USER" -d '${database}' --clean --if-exists --no-owner --single-transaction`,
    ],
    source: dumpPath,
  });
}

export async function createDatabase({ docker, database }) {
  assertSafeName('資料庫', database);
  await docker.execIn(
    'db',
    `psql -U "$POSTGRES_USER" -d postgres -tAc "select 1 from pg_database where datname='${database}'" | grep -q 1 || psql -U "$POSTGRES_USER" -d postgres -c 'create database "${database}"'`,
  );
}

export async function postgresVersion({ docker }) {
  const stdout = await docker.execIn(
    'db',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select version()"',
  );
  const match = /PostgreSQL (\d+\.\d+)/.exec(stdout);
  return match === null ? stdout.trim() : match[1];
}

export async function migrationNames({ docker, database }) {
  const stdout = await docker.execIn(
    'db',
    `psql -U "$POSTGRES_USER" -d '${assertSafeName('資料庫', database)}' -tAc "select name from schema_migrations order by name"`,
  );

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export async function minioVersion({ docker }) {
  const stdout = await docker.execIn('storage', 'minio --version 2>/dev/null | head -1');
  const match = /version\s+(\S+)/.exec(stdout);
  return match === null ? stdout.trim() : match[1];
}

export function createMinio({ endpoint, accessKey, secretKey }) {
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    maxAttempts: 1,
  });

  return {
    client,

    async list(bucket) {
      const objects = [];
      let token;

      do {
        const listing = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
        );

        for (const item of listing.Contents ?? []) {
          objects.push({
            key: item.Key,
            size: item.Size ?? 0,
            etag: (item.ETag ?? '').replace(/"/g, ''),
          });
        }

        token = listing.IsTruncated === true ? listing.NextContinuationToken : undefined;
      } while (token !== undefined);

      return objects.sort((left, right) => (left.key < right.key ? -1 : 1));
    },

    async download(bucket, key, target) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const out = createWriteStream(target);

      await finished(response.Body.pipe(out));

      return { contentType: response.ContentType ?? 'application/octet-stream' };
    },

    async upload(bucket, key, source, contentType) {
      const body = await readFile(source);
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async ensureBucket(bucket) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return;
      } catch {
        // 不存在就建立；其他錯誤（連不上）會在建立時再擲一次，訊息更清楚。
      }

      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    },

    async purgeExcept(bucket, keepKeys) {
      const keep = new Set(keepKeys);
      const extra = (await this.list(bucket)).filter((object) => !keep.has(object.key));

      if (extra.length === 0) {
        return 0;
      }

      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: extra.map((object) => ({ Key: object.key })) },
        }),
      );

      return extra.length;
    },
  };
}

/**
 * 物件的檔名用 key 的 SHA-256：同一份備份內不會撞名，也不會有路徑穿越問題，
 * 原始 key 與 content-type 記在 index.json。
 */
export function objectFileFor(key) {
  const digest = createHash('sha1').update(key).digest('hex');
  return `minio/objects/${digest}.bin`;
}

export function listingSignature(objects) {
  // etag + size：內容或大小一變，簽章就不同。
  const text = objects.map((object) => `${object.key}\u0000${object.etag}\u0000${object.size}`).join('\n');
  return createHmac('sha256', 'company-os-backup').update(text).digest('hex');
}

export async function writeVersionsFile({ target, docker, database, repoRoot }) {
  let gitCommit = 'unknown';

  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    gitCommit = stdout.trim();
  } catch {
    // 沒有 git（例如災難後從壓縮檔還原）不是錯誤，照實寫 unknown。
  }

  const versions = {
    gitCommit,
    node: process.version,
    postgres: await postgresVersion({ docker }),
    minio: await minioVersion({ docker }),
    migrations: await migrationNames({ docker, database }),
  };

  await writeFile(target, `${JSON.stringify(versions, null, 2)}\n`, 'utf8');

  return versions;
}

export async function copyFileWithMode(source, target, mode) {
  const contents = await readFile(source);
  await writeFile(target, contents, { mode });
  const info = await stat(target);
  return { size: info.size };
}

export async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(target) {
  await mkdir(target, { recursive: true });
}

export { basename, join };
