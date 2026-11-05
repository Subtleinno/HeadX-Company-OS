import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

/**
 * 一個用完即棄的 Postgres 實例（issue #88）。
 *
 * 為甚麼要另起一個 cluster，而不用專案本身那一個：角色（role）是 **cluster 級**
 * 物件，不是資料庫級。在正式 cluster 上建測試角色，等於把測試帳號留在生產環境，
 * 而且 `drop database` 清不掉它。所以寧願起一個容器，用完連容器一齊消失。
 *
 * 用既有的 `postgres:16-alpine` 映像（與正式庫同一個主版本）。沒有 docker 就直接
 * 失敗，不會靜靜跳過 —— 跳過的隔離測試等於沒有隔離。
 */

const IMAGE = process.env.TEST_POSTGRES_IMAGE ?? 'postgres:16-alpine';

const READY_TIMEOUT_MS = 60_000;

export type DisposableCluster = {
  host: string;
  port: number;
  user: string;
  password: string;
  stop: () => Promise<void>;
};

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

function suffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

/** 由 `docker port` 的輸出取出主機端口（`127.0.0.1:54321`）。 */
function hostPortOf(container: string): number {
  const output = docker(['port', container, '5432/tcp']);
  const line = output.split('\n')[0] ?? '';
  const match = /:(\d+)$/.exec(line.trim());

  if (match === null) {
    throw new Error(`讀不到 ${container} 的端口：${JSON.stringify(output)}`);
  }

  return Number(match[1]);
}

export async function createDisposableCluster(): Promise<DisposableCluster> {
  const container = `co-test-pg-${suffix()}`;
  const password = randomUUID().replace(/-/g, '');

  docker([
    'run',
    '-d',
    '--rm',
    '--name',
    container,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_DB=postgres',
    '-p',
    '127.0.0.1::5432',
    IMAGE,
  ]);

  const port = hostPortOf(container);
  const config = { host: '127.0.0.1', port, user: 'postgres', password };

  const deadline = Date.now() + READY_TIMEOUT_MS;

  for (;;) {
    const probe = new Pool({ ...config, database: 'postgres', max: 1 });

    try {
      await probe.query('select 1');
      await probe.end();
      break;
    } catch (error) {
      await probe.end().catch(() => undefined);

      if (Date.now() > deadline) {
        docker(['rm', '-f', container]);
        throw new Error(`Postgres 容器 ${container} 未能在時限內啟動`, { cause: error });
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return {
    ...config,
    stop: async () => {
      try {
        docker(['rm', '-f', container]);
      } catch {
        // 已經消失就當成功。
      }
    },
  };
}
