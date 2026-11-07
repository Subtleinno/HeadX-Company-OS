/**
 * Demo Public Stack 的隔離檢查（issue #145／決策 C52）。
 *
 * 為甚麼要有這支：Demo stack 是**公開**的，所以「它沒有接到正式資料」不可以靠
 * 閱讀 YAML 來相信。這裡把 `docker compose config` 解析之後的結果（不是文字檔）
 * 逐項檢查，任何一項退化都變成紅燈：
 *
 *   - 有人加回 `ports:` → Demo 直接暴露主機端口。
 *   - 有人把 project name 改成正式的 → volume 與網絡會撞名。
 *   - 有人把 bucket／資料庫名改成正式的 → Demo 寫入正式資料。
 *   - 有人加了 bind mount → 可能指到正式資料夾。
 *
 * 純函數：輸入是 compose 解析後的物件，所以「檢查真的咬得住」可以用人造的
 * 壞輸入驗，不需要改真檔（測試見 scripts/demo-stack.test.ts）。
 */

/** Demo project 的固定名稱。寫在 docker-compose.demo.yml 內，不靠 -p。 */
export const DEMO_PROJECT = 'company-os-demo';

/** Demo 的 Postgres 資料庫名。與正式的 company_os 不同。 */
export const DEMO_DATABASE = 'company_os_demo';

/** Demo 的 storage bucket。與正式的 company-os 不同。 */
export const DEMO_BUCKET = 'company-os-demo';

/** Demo 應該有的服務，一個不多一個不少。 */
export const DEMO_SERVICES = ['db', 'storage', 'api', 'gateway-internal', 'cloudflared'];

/**
 * 正式 stack 的端口。本機除錯用 Demo 端口時，任何一個重複都算違規。
 * 來源：docker-compose.yml 的 DB_PORT／PORT_MINIO_API／PORT_MINIO_CONSOLE／
 * API_PORT／GATEWAY_INTERNAL_PORT／APPS_PORT 預設值。
 */
export const REAL_PORTS = [4210, 4420, 4431, 25432, 29000, 29001];

/** `docker compose config --format json` 的 ports 陣列轉成統一形狀。 */
export function publishedPorts(config) {
  const result = [];

  for (const [service, definition] of Object.entries(config?.services ?? {})) {
    for (const port of definition?.ports ?? []) {
      result.push({
        service,
        hostIp: typeof port?.host_ip === 'string' ? port.host_ip : '',
        published: String(port?.published ?? ''),
        target: String(port?.target ?? ''),
      });
    }
  }

  return result;
}

/** 服務的環境變數（`docker compose config` 會把 `${VAR}` 換成實際值）。 */
function environmentOf(config, service) {
  return config?.services?.[service]?.environment ?? {};
}

/** 所有 mount，統一成 { service, type, source, target }。 */
export function mounts(config) {
  const result = [];

  for (const [service, definition] of Object.entries(config?.services ?? {})) {
    for (const volume of definition?.volumes ?? []) {
      result.push({
        service,
        type: volume?.type ?? '',
        source: typeof volume?.source === 'string' ? volume.source : '',
        target: typeof volume?.target === 'string' ? volume.target : '',
      });
    }
  }

  return result;
}

/** project name、服務清單、網絡這三項是兩種組合都要守的。 */
function auditCommon(config) {
  const violations = [];

  if (config?.name !== DEMO_PROJECT) {
    violations.push(
      `project name 是 ${JSON.stringify(config?.name)}，必須是 ${DEMO_PROJECT}` +
        '（否則 volume 與網絡會與正式 stack 撞名）',
    );
  }

  const services = Object.keys(config?.services ?? {}).sort();
  const expected = [...DEMO_SERVICES].sort();

  if (services.join(',') !== expected.join(',')) {
    violations.push(
      `服務清單是 [${services.join(', ')}]，必須正好是 [${expected.join(', ')}]` +
        '（多一個就可能多一道沒人看的門）',
    );
  }

  for (const [key, network] of Object.entries(config?.networks ?? {})) {
    const name = typeof network?.name === 'string' ? network.name : '';

    if (!name.startsWith(`${DEMO_PROJECT}_`)) {
      violations.push(`網絡 ${key} 的名字是 ${JSON.stringify(name)}，必須以 ${DEMO_PROJECT}_ 開頭`);
    }
  }

  // 所有 mount 都必須是 Demo 自己的 named volume。bind mount 一律不准：
  // 它可以把任何主機路徑（包括正式資料夾）掛進來。
  //
  // 注意 compose 的 `source` 是 YAML 內的邏輯名（db_data），真正的 volume 名在
  // 頂層 volumes 的 name（company-os-demo_db_data）。要驗的是後者。
  const volumeNames = new Map(
    Object.entries(config?.volumes ?? {}).map(([key, item]) => [
      key,
      typeof item?.name === 'string' && item.name !== '' ? item.name : key,
    ]),
  );

  for (const [key, actual] of volumeNames) {
    if (!actual.startsWith(`${DEMO_PROJECT}_`)) {
      violations.push(`volume ${key} 的實際名稱是 ${JSON.stringify(actual)}，必須以 ${DEMO_PROJECT}_ 開頭`);
    }
  }

  for (const mount of mounts(config)) {
    if (mount.type !== 'volume') {
      violations.push(
        `${mount.service} 有 ${mount.type || '不明'} mount（${mount.source} → ${mount.target}），` +
          'Demo 只准用 named volume',
      );
      continue;
    }

    const actual = volumeNames.get(mount.source);

    if (actual === undefined) {
      violations.push(`${mount.service} 掛了未宣告的 volume ${mount.source}（來源不明）`);
      continue;
    }

    if (!actual.startsWith(`${DEMO_PROJECT}_`)) {
      violations.push(
        `${mount.service} 掛了 ${actual}，必須是 ${DEMO_PROJECT}_ 開頭的 Demo volume`,
      );
    }
  }

  return violations;
}

/**
 * 公開 Demo 的組合（只有 docker-compose.demo.yml）。
 *
 * @param {unknown} config `docker compose config --format json` 的結果
 * @returns {string[]} 違規說明；空陣列代表通過
 */
export function auditDemoConfig(config) {
  const violations = auditCommon(config);

  // 第一條硬規則：主機上一個端口都不開。
  for (const port of publishedPorts(config)) {
    violations.push(
      `${port.service} 發佈了主機端口 ${port.hostIp || '*'}:${port.published} → ${port.target}；` +
        '公開 Demo 不得發佈任何端口（只可經 cloudflared）',
    );
  }

  for (const [service, definition] of Object.entries(config?.services ?? {})) {
    if (definition?.network_mode === 'host') {
      violations.push(`${service} 用了 network_mode: host；Demo 必須留在自己的 compose 網絡內`);
    }
  }

  const db = environmentOf(config, 'db');
  if (db.POSTGRES_DB !== DEMO_DATABASE) {
    violations.push(
      `db 的 POSTGRES_DB 是 ${JSON.stringify(db.POSTGRES_DB)}，必須是 ${DEMO_DATABASE}`,
    );
  }

  const api = environmentOf(config, 'api');

  if (api.PGHOST !== 'db') {
    violations.push(
      `api 的 PGHOST 是 ${JSON.stringify(api.PGHOST)}，必須是 compose 服務名 db（不可指向外部資料庫）`,
    );
  }

  if (api.PGDATABASE !== DEMO_DATABASE) {
    violations.push(
      `api 的 PGDATABASE 是 ${JSON.stringify(api.PGDATABASE)}，必須是 ${DEMO_DATABASE}`,
    );
  }

  if (api.MINIO_ENDPOINT !== 'http://storage:9000') {
    violations.push(
      `api 的 MINIO_ENDPOINT 是 ${JSON.stringify(api.MINIO_ENDPOINT)}，必須是 http://storage:9000`,
    );
  }

  if (api.MINIO_BUCKET !== DEMO_BUCKET) {
    violations.push(
      `api 的 MINIO_BUCKET 是 ${JSON.stringify(api.MINIO_BUCKET)}，必須是 ${DEMO_BUCKET}`,
    );
  }

  const cloudflared = config?.services?.cloudflared;

  if (cloudflared === undefined) {
    violations.push('沒有 cloudflared 服務；公開 Demo 的唯一入口就是它，缺了等於沒有人進得去');
  } else {
    const command = Array.isArray(cloudflared.command)
      ? cloudflared.command.join(' ')
      : String(cloudflared.command ?? '');

    if (!command.includes('tunnel')) {
      violations.push('cloudflared 的 command 不是 tunnel，無法建立隧道');
    }

    if (command.includes('--url')) {
      violations.push(
        'cloudflared 的 command 帶了 --url；路由只可由 Cloudflare 的遠端設定決定，' +
          '寫在 compose 等於第二個真相',
      );
    }

    if (!('TUNNEL_TOKEN' in environmentOf(config, 'cloudflared'))) {
      violations.push('cloudflared 沒有 TUNNEL_TOKEN；沒有 token 就連不上（雖然它會自己失敗，但要在設定層擋）');
    }
  }

  return violations;
}

/**
 * 本機除錯的組合（加 docker-compose.demo.local.yml）。
 *
 * 這裡允許端口，但只准綁 127.0.0.1，而且不准與正式 stack 的端口重複 ——
 * 重複就會與正式 stack 搶端口，一啟動就撞。
 */
export function auditDemoLocalConfig(config) {
  const violations = auditCommon(config);

  const ports = publishedPorts(config);

  if (ports.length === 0) {
    violations.push('本機除錯組合沒有任何端口，除錯時連不上（公開組合才應該零端口）');
  }

  for (const port of ports) {
    if (port.hostIp !== '127.0.0.1') {
      violations.push(
        `${port.service} 的端口 ${port.published} 綁在 ${port.hostIp || '*'}` +
          '，本機除錯亦只准綁 127.0.0.1',
      );
    }

    if (REAL_PORTS.includes(Number(port.published))) {
      violations.push(
        `${port.service} 用了正式 stack 的端口 ${port.published}，會與正式 stack 搶端口`,
      );
    }
  }

  return violations;
}
