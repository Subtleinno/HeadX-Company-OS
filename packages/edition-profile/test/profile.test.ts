import { describe, expect, it } from 'vitest';
import {
  CONTAINERS,
  DEFAULT_EDITION,
  EDITION_PROFILES,
  editionProfile,
  existingPorts,
  isEditionCode,
  validateEdition,
  validateProfile,
  type ContainerSpec,
  type EditionProfile,
} from '../src/index';

/**
 * edition-profile 的單元測試：只驗資料與驗證函數，不讀任何檔案。
 * 與 docker-compose.yml／.env.example／REPO-MAP 的一致性在 consistency.test.ts。
 */

function clone(profile: EditionProfile): EditionProfile {
  return JSON.parse(JSON.stringify(profile)) as EditionProfile;
}

function container(profile: EditionProfile, name: string): ContainerSpec {
  const found = profile.containers.find((item) => item.name === name);
  if (found === undefined) {
    throw new Error(`測試資料內沒有容器：${name}`);
  }
  return found;
}

describe('兩個版本', () => {
  it('有 intl 與 cn，預設是 intl', () => {
    expect(Object.keys(EDITION_PROFILES).sort()).toEqual(['cn', 'intl']);
    expect(DEFAULT_EDITION).toBe('intl');
  });

  it('預設語言：intl 是 zh-HK，cn 是 zh-CN', () => {
    expect(EDITION_PROFILES.intl.defaultLocale).toBe('zh-HK');
    expect(EDITION_PROFILES.cn.defaultLocale).toBe('zh-CN');
  });

  it('入口：intl 有三個，cn 只有 internal', () => {
    expect(EDITION_PROFILES.intl.entries).toEqual(['internal', 'partner', 'customer']);
    expect(EDITION_PROFILES.cn.entries).toEqual(['internal']);
  });

  it('通知渠道：intl 有十二個（含 whatsapp、telegram），cn 只有 inapp、wecom、feishu', () => {
    expect(EDITION_PROFILES.intl.channels).toHaveLength(12);
    expect(EDITION_PROFILES.intl.channels).toContain('whatsapp');
    expect(EDITION_PROFILES.intl.channels).toContain('telegram');

    expect(EDITION_PROFILES.cn.channels).toEqual(['inapp', 'wecom', 'feishu']);
  });

  it('isEditionCode 只認 intl 與 cn', () => {
    expect(isEditionCode('intl')).toBe(true);
    expect(isEditionCode('cn')).toBe(true);
    expect(isEditionCode('xyz')).toBe(false);
    expect(isEditionCode('')).toBe(false);
    expect(isEditionCode('INTL')).toBe(false);
  });

  it('editionProfile 對未知版本擲錯', () => {
    expect(() => editionProfile('xyz' as 'intl')).toThrow(/xyz/);
  });
});

describe('容器清單', () => {
  it('現在真的有五個容器：gateway-internal、platform、apps（只屬大陸版）、db、storage', () => {
    const exists = CONTAINERS.filter((item) => item.status === 'exists');

    expect(exists.map((item) => item.name)).toEqual([
      'gateway-internal',
      'platform',
      'apps',
      'db',
      'storage',
    ]);

    for (const item of exists) {
      expect(item.composeService, item.name).not.toBeNull();
    }

    // apps 只屬大陸版（#77）；其餘四個兩版都有。
    expect(exists.map((item) => `${item.name}:${item.editions.join('+')}`)).toEqual([
      'gateway-internal:intl+cn',
      'platform:intl+cn',
      'apps:cn',
      'db:intl+cn',
      'storage:intl+cn',
    ]);
  });

  it('對應的 compose 服務名稱：gateway-internal、api、apps、db、storage', () => {
    expect(CONTAINERS.filter((item) => item.status === 'exists').map((item) => item.composeService)).toEqual([
      'gateway-internal',
      'api',
      'apps',
      'db',
      'storage',
    ]);
  });

  it('其餘容器都是 planned，且只有 apps 屬大陸版', () => {
    const planned = CONTAINERS.filter((item) => item.status === 'planned');
    expect(planned.map((item) => item.name)).toEqual([
      'gateway-partner',
      'gateway-customer',
      'cloudflared',
      'apps-internal',
      'apps-partner',
      'supplier-portal',
      'customer-portal',
    ]);

    expect(container(EDITION_PROFILES.cn, 'apps').name).toBe('apps');
    expect(EDITION_PROFILES.intl.containers.some((item) => item.name === 'apps')).toBe(false);
    expect(EDITION_PROFILES.cn.containers.some((item) => item.name === 'apps-internal')).toBe(false);
  });

  it('cloudflared 沒有端口', () => {
    const cloudflared = CONTAINERS.find((item) => item.name === 'cloudflared');
    expect(cloudflared?.ports).toEqual([]);
  });
});

describe('exists 容器的端口（ports:check 讀的就是這一組）', () => {
  it('次序與數值：4210、4420、25432、29000、29001', () => {
    const ports = existingPorts('intl');

    expect(ports.map((item) => item.defaultPort)).toEqual([4210, 4420, 25432, 29000, 29001]);
    expect(ports.map((item) => item.envVar)).toEqual([
      'GATEWAY_INTERNAL_PORT',
      'API_PORT',
      'DB_PORT',
      'PORT_MINIO_API',
      'PORT_MINIO_CONSOLE',
    ]);
  });

  it('服務標籤：gateway-internal、api、db、storage、storage console', () => {
    expect(existingPorts('intl').map((item) => item.service)).toEqual([
      'gateway-internal',
      'api',
      'db',
      'storage',
      'storage console',
    ]);
  });

  it('國際版沒有 apps 容器，端口清單與開工前逐項相同', () => {
    expect(existingPorts('intl').map((item) => `${item.envVar}=${item.defaultPort}`)).toEqual([
      'GATEWAY_INTERNAL_PORT=4210',
      'API_PORT=4420',
      'DB_PORT=25432',
      'PORT_MINIO_API=29000',
      'PORT_MINIO_CONSOLE=29001',
    ]);
  });

  it('大陸版多了 app-host：4431 排在自己的位置（#77）', () => {
    expect(existingPorts('cn').map((item) => `${item.envVar}=${item.defaultPort}`)).toEqual([
      'GATEWAY_INTERNAL_PORT=4210',
      'API_PORT=4420',
      'APPS_PORT=4431',
      'DB_PORT=25432',
      'PORT_MINIO_API=29000',
      'PORT_MINIO_CONSOLE=29001',
    ]);
    expect(existingPorts('cn').map((item) => item.service)).toEqual([
      'gateway-internal',
      'api',
      'apps',
      'db',
      'storage',
      'storage console',
    ]);
  });
});

describe('validateProfile：每條規則都咬得住', () => {
  it('現有兩版的資料本身沒有問題', () => {
    expect(validateEdition('intl')).toEqual([]);
    expect(validateEdition('cn')).toEqual([]);
  });

  it('端口不在 1024–65535 之內', () => {
    const profile = clone(EDITION_PROFILES.intl);
    container(profile, 'gateway-internal').ports[0]!.defaultPort = 80;

    expect(validateProfile(profile).join('\n')).toMatch(/gateway-internal.*1024/);
  });

  it('非 app 容器用了 4431–4499 保留區', () => {
    const profile = clone(EDITION_PROFILES.intl);
    container(profile, 'platform').ports[0]!.defaultPort = 4440;

    expect(validateProfile(profile).join('\n')).toMatch(/4431–4499/);
  });

  it('app 容器用了保留區以外的端口', () => {
    const profile = clone(EDITION_PROFILES.intl);
    container(profile, 'apps-internal').ports[0]!.defaultPort = 4400;

    expect(validateProfile(profile).join('\n')).toMatch(/4431–4499/);
  });

  it('同一版本內端口重複：訊息帶出兩個容器與那個端口', () => {
    const profile = clone(EDITION_PROFILES.intl);
    container(profile, 'apps-partner').ports[0]!.defaultPort = 4431;

    const errors = validateProfile(profile).join('\n');
    expect(errors).toMatch(/4431/);
    expect(errors).toMatch(/apps-partner/);
    expect(errors).toMatch(/apps-internal/);
  });

  it('兩個不同版本可以有同一個端口（apps 與 apps-internal 都是 4431）', () => {
    expect(validateEdition('cn')).toEqual([]);
    expect(validateEdition('intl')).toEqual([]);
  });

  it('exists 容器沒有 composeService', () => {
    const profile = clone(EDITION_PROFILES.intl);
    container(profile, 'db').composeService = null;

    expect(validateProfile(profile).join('\n')).toMatch(/db.*composeService/);
  });

  it('容器不屬任何版本', () => {
    const profile = clone(EDITION_PROFILES.intl);
    container(profile, 'platform').editions = [];

    expect(validateProfile(profile).join('\n')).toMatch(/platform.*版本/);
  });

  it('容器名稱在版本內重複', () => {
    const profile = clone(EDITION_PROFILES.intl);
    profile.containers.push(clone(EDITION_PROFILES.intl).containers[0]!);

    expect(validateProfile(profile).join('\n')).toMatch(/重複/);
  });
});
