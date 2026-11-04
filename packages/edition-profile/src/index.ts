/**
 * 版本設定檔：國際版（intl）與大陸版（cn）的差異只寫在這裡。
 *
 * 這是端口、入口、通知渠道與容器組合的**唯一來源**：`.env.example`、
 * `docker-compose.yml` 與 `docs/architecture/REPO-MAP.md` 的端口表都要跟它一致，
 * 由 `consistency.test.ts` 在 `npm test` 內驗證。
 *
 * 這個 package 沒有執行期依賴，只有資料與純驗證函數；只經 `index.ts` 對外。
 *
 * 刻意不寫「哪個 app 放進哪個容器」：app 設計未定，寫了就是第二個真相。
 */

export type EditionCode = 'intl' | 'cn';

export type ContainerStatus = 'exists' | 'planned';

/** 容器的角色。`apps` 是 app／portal 容器，用 REPO-MAP 的 4431–4499 保留區。 */
export type ContainerKind = 'gateway' | 'platform' | 'apps' | 'db' | 'storage' | 'edge';

export type EditionEntry = 'internal' | 'partner' | 'customer';

export type NotificationChannel =
  | 'inapp'
  | 'email'
  | 'lark'
  | 'feishu'
  | 'whatsapp'
  | 'wecom'
  | 'dingtalk'
  | 'sms'
  | 'slack'
  | 'teams'
  | 'telegram'
  | 'webhook';

export type PortSpec = {
  /** `.env` 內的變數名稱；`.env.example` 必須有同名項目，值等於 `defaultPort`。 */
  envVar: string;
  defaultPort: number;
};

export type ContainerSpec = {
  name: string;
  status: ContainerStatus;
  kind: ContainerKind;
  /** `exists` 時對應 `docker-compose.yml` 的服務名稱；`planned` 時為 null。 */
  composeService: string | null;
  editions: EditionCode[];
  /** 空陣列代表這個容器不對主機發佈端口（例如 cloudflared）。 */
  ports: PortSpec[];
};

export type EditionProfile = {
  code: EditionCode;
  defaultLocale: string;
  entries: EditionEntry[];
  channels: NotificationChannel[];
  containers: ContainerSpec[];
};

export const DEFAULT_EDITION: EditionCode = 'intl';

/** 主機端口的合法範圍。 */
export const PORT_MIN = 1024;
export const PORT_MAX = 65535;

/** REPO-MAP 寫明「4431 至 4499 保留給 app 容器」，所以只有 app／portal 容器可以用。 */
export const APP_PORT_MIN = 4431;
export const APP_PORT_MAX = 4499;

const EDITION_CODES: EditionCode[] = ['intl', 'cn'];

/**
 * 容器清單，次序就是 REPO-MAP 表的次序，也決定了 `ports:check` 檢查端口的次序。
 * `exists` 的四個是現在真的存在於 `docker-compose.yml` 的；其餘是目標，未有容器。
 */
export const CONTAINERS: ContainerSpec[] = [
  {
    name: 'gateway-internal',
    status: 'exists',
    kind: 'gateway',
    // 目標名稱（S1-02）是 GATEWAY_INTERNAL_PORT，現在仍叫 WEB_PORT。
    composeService: 'web',
    editions: ['intl', 'cn'],
    ports: [{ envVar: 'WEB_PORT', defaultPort: 4210 }],
  },
  {
    name: 'gateway-partner',
    status: 'planned',
    kind: 'gateway',
    composeService: null,
    editions: ['intl'],
    ports: [{ envVar: 'GATEWAY_PARTNER_PORT', defaultPort: 4211 }],
  },
  {
    name: 'gateway-customer',
    status: 'planned',
    kind: 'gateway',
    composeService: null,
    editions: ['intl'],
    ports: [{ envVar: 'GATEWAY_CUSTOMER_PORT', defaultPort: 4212 }],
  },
  {
    name: 'cloudflared',
    status: 'planned',
    kind: 'edge',
    composeService: null,
    editions: ['intl'],
    ports: [],
  },
  {
    name: 'platform',
    status: 'exists',
    kind: 'platform',
    // 目標名稱（S1-02）是 PLATFORM_PORT，現在仍叫 API_PORT。
    composeService: 'api',
    editions: ['intl', 'cn'],
    ports: [{ envVar: 'API_PORT', defaultPort: 4420 }],
  },
  {
    name: 'apps',
    status: 'exists',
    kind: 'apps',
    composeService: 'apps',
    editions: ['cn'],
    ports: [{ envVar: 'APPS_PORT', defaultPort: 4431 }],
  },
  {
    name: 'apps-internal',
    status: 'planned',
    kind: 'apps',
    composeService: null,
    editions: ['intl'],
    ports: [{ envVar: 'APPS_INTERNAL_PORT', defaultPort: 4431 }],
  },
  {
    name: 'apps-partner',
    status: 'planned',
    kind: 'apps',
    composeService: null,
    editions: ['intl'],
    ports: [{ envVar: 'APPS_PARTNER_PORT', defaultPort: 4432 }],
  },
  {
    name: 'supplier-portal',
    status: 'planned',
    kind: 'apps',
    composeService: null,
    editions: ['intl'],
    ports: [{ envVar: 'SUPPLIER_PORTAL_PORT', defaultPort: 4433 }],
  },
  {
    name: 'customer-portal',
    status: 'planned',
    kind: 'apps',
    composeService: null,
    editions: ['intl'],
    ports: [{ envVar: 'CUSTOMER_PORTAL_PORT', defaultPort: 4434 }],
  },
  {
    name: 'db',
    status: 'exists',
    kind: 'db',
    composeService: 'db',
    editions: ['intl', 'cn'],
    ports: [{ envVar: 'DB_PORT', defaultPort: 25432 }],
  },
  {
    name: 'storage',
    status: 'exists',
    kind: 'storage',
    composeService: 'storage',
    editions: ['intl', 'cn'],
    ports: [
      { envVar: 'PORT_MINIO_API', defaultPort: 29000 },
      { envVar: 'PORT_MINIO_CONSOLE', defaultPort: 29001 },
    ],
  },
];

const INTL_CHANNELS: NotificationChannel[] = [
  'inapp',
  'email',
  'lark',
  'feishu',
  'whatsapp',
  'wecom',
  'dingtalk',
  'sms',
  'slack',
  'teams',
  'telegram',
  'webhook',
];

const CN_CHANNELS: NotificationChannel[] = ['inapp', 'wecom', 'feishu'];

function buildProfile(
  code: EditionCode,
  defaultLocale: string,
  entries: EditionEntry[],
  channels: NotificationChannel[],
): EditionProfile {
  return {
    code,
    defaultLocale,
    entries,
    channels,
    containers: CONTAINERS.filter((item) => item.editions.includes(code)),
  };
}

export const EDITION_PROFILES: Record<EditionCode, EditionProfile> = {
  intl: buildProfile('intl', 'zh-HK', ['internal', 'partner', 'customer'], INTL_CHANNELS),
  cn: buildProfile('cn', 'zh-CN', ['internal'], CN_CHANNELS),
};

export function isEditionCode(value: string): value is EditionCode {
  return (EDITION_CODES as string[]).includes(value);
}

export function editionProfile(code: EditionCode): EditionProfile {
  if (!isEditionCode(code)) {
    throw new Error(`未知版本：${String(code)}（只有 intl 與 cn）`);
  }

  return EDITION_PROFILES[code];
}

export type ExistingPort = {
  container: string;
  envVar: string;
  defaultPort: number;
  /** 給 ports:check 顯示用的服務標籤，例如 `web`、`storage console`。 */
  service: string;
};

/**
 * 該版本內 `status` 為 `exists` 的容器的端口，次序跟 `CONTAINERS` 的次序。
 * `ports:check` 就是檢查這一組。
 *
 * 服務標籤：容器的第一個端口用 compose 服務名，之後的用 `<服務名> console`
 * （storage 的 29000／29001 就是 API 與 console 兩個端口）。
 */
export function existingPorts(code: EditionCode): ExistingPort[] {
  const profile = editionProfile(code);
  const result: ExistingPort[] = [];

  for (const item of profile.containers) {
    if (item.status !== 'exists' || item.composeService === null) {
      continue;
    }

    item.ports.forEach((port, index) => {
      result.push({
        container: item.name,
        envVar: port.envVar,
        defaultPort: port.defaultPort,
        service: index === 0 ? item.composeService ?? item.name : `${item.composeService} console`,
      });
    });
  }

  return result;
}

/**
 * 驗一個版本的資料。回傳問題清單，空陣列代表沒有問題。
 * 不做 I/O，所以測試可以直接餵一份改壞的 profile 進來，逐條規則驗。
 */
export function validateProfile(profile: EditionProfile): string[] {
  const errors: string[] = [];
  const where = `版本 ${profile.code}`;

  if (profile.defaultLocale.trim() === '') {
    errors.push(`${where}：defaultLocale 不可以是空字串`);
  }

  if (profile.entries.length === 0) {
    errors.push(`${where}：至少要有一個入口`);
  }

  if (profile.channels.length === 0) {
    errors.push(`${where}：至少要有一個通知渠道`);
  }

  const names = new Set<string>();
  const portOwners = new Map<number, string>();

  for (const item of profile.containers) {
    if (names.has(item.name)) {
      errors.push(`${where}：容器名稱重複：${item.name}`);
    }
    names.add(item.name);

    if (item.editions.length === 0) {
      errors.push(`${where}：容器 ${item.name} 不屬任何版本`);
    }

    for (const code of item.editions) {
      if (!isEditionCode(code)) {
        errors.push(`${where}：容器 ${item.name} 的版本代碼不合法：${String(code)}`);
      }
    }

    if (item.status === 'exists' && item.composeService === null) {
      errors.push(`${where}：容器 ${item.name} 是 exists，但沒有 composeService`);
    }

    for (const port of item.ports) {
      if (
        !Number.isInteger(port.defaultPort) ||
        port.defaultPort < PORT_MIN ||
        port.defaultPort > PORT_MAX
      ) {
        errors.push(
          `容器 ${item.name}：端口 ${port.defaultPort}（${port.envVar}）不在 ${PORT_MIN}–${PORT_MAX} 之內`,
        );
        continue;
      }

      const inAppBlock = port.defaultPort >= APP_PORT_MIN && port.defaultPort <= APP_PORT_MAX;
      if (item.kind === 'apps' && !inAppBlock) {
        errors.push(
          `容器 ${item.name}：端口 ${port.defaultPort} 不在 ${APP_PORT_MIN}–${APP_PORT_MAX}（app 容器的保留區）`,
        );
      }

      if (item.kind !== 'apps' && inAppBlock) {
        errors.push(
          `容器 ${item.name}：端口 ${port.defaultPort} 落在 ${APP_PORT_MIN}–${APP_PORT_MAX} 保留區，只有 app 容器可以用`,
        );
      }

      const owner = portOwners.get(port.defaultPort);
      if (owner === undefined) {
        portOwners.set(port.defaultPort, item.name);
      } else {
        errors.push(`${where}：端口 ${port.defaultPort} 重複（${owner} 與 ${item.name}）`);
      }
    }
  }

  return errors;
}

export function validateEdition(code: EditionCode): string[] {
  return validateProfile(editionProfile(code));
}
