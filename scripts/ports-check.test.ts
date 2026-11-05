import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  describeOwner,
  findExcludedRange,
  judgePort,
  parseEnv,
  parseExcludedPortRanges,
  parseNetstatPids,
  parseTasklistName,
  PORT_VARS,
  portVarsOf,
  resolveEdition,
  resolvePorts,
} from './ports-check.mjs';

describe('parseEnv', () => {
  it('讀取 .env 的鍵值，忽略註解與空行', () => {
    const env = parseEnv(
      ['# 註解', '', 'WEB_PORT=4210', 'API_PORT="4420"', 'DB_PORT=25432'].join('\n'),
    );

    expect(env).toEqual({
      WEB_PORT: '4210',
      API_PORT: '4420',
      DB_PORT: '25432',
    });
  });
});

describe('resolvePorts', () => {
  it('未設定的端口使用 compose 的預設值（含 storage 兩個端口）', () => {
    const { ports, errors } = resolvePorts({});

    expect(errors).toEqual([]);
    expect(ports.map((item) => item.port)).toEqual([4210, 4420, 25432, 29000, 29001]);
  });

  it('非數字或超範圍的端口會回報原因', () => {
    const { errors } = resolvePorts({ GATEWAY_INTERNAL_PORT: 'abc', API_PORT: '70000' });

    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('GATEWAY_INTERNAL_PORT');
    expect(errors[1]).toContain('API_PORT');
  });
});

/**
 * S1-02／#78：入口容器由 `web` 改名為 `gateway-internal`，端口變數由 `WEB_PORT`
 * 改名為 `GATEWAY_INTERNAL_PORT`。舊的 `.env` 不可以一夜之間壞掉：
 * 舊名稱仍然生效，但要提醒使用者改名（警告不令檢查失敗）。
 */
describe('WEB_PORT 改名為 GATEWAY_INTERNAL_PORT', () => {
  it('用新名稱：值生效、沒有警告', () => {
    const { ports, warnings } = resolvePorts({ GATEWAY_INTERNAL_PORT: '4400' });

    expect(ports[0]).toEqual({
      key: 'GATEWAY_INTERNAL_PORT',
      service: 'gateway-internal',
      port: 4400,
    });
    expect(warnings).toEqual([]);
  });

  it('只有舊名稱：仍然生效，並印出改名警告', () => {
    const { ports, warnings } = resolvePorts({ WEB_PORT: '4300' });

    expect(ports[0]).toEqual({
      key: 'GATEWAY_INTERNAL_PORT',
      service: 'gateway-internal',
      port: 4300,
    });
    expect(warnings.join('\n')).toContain('WEB_PORT 已改名為 GATEWAY_INTERNAL_PORT');
  });

  it('兩個都寫：新名稱優先，但仍然提醒舊名稱已改名', () => {
    const { ports, warnings } = resolvePorts({ GATEWAY_INTERNAL_PORT: '4400', WEB_PORT: '4300' });

    expect(ports[0]?.port).toBe(4400);
    expect(warnings.join('\n')).toContain('WEB_PORT 已改名為 GATEWAY_INTERNAL_PORT');
  });

  it('舊名稱的值不合法時，訊息用新名稱講（否則用戶會去改一個已改名的鍵）', () => {
    const { errors } = resolvePorts({ WEB_PORT: 'abc' });

    expect(errors.join('\n')).toContain('GATEWAY_INTERNAL_PORT');
  });
});

describe('parseExcludedPortRanges', () => {
  it('讀取 netsh 輸出的保留範圍，忽略標題與分隔線', () => {
    const output = [
      'Protocol tcp Port Exclusion Ranges',
      '',
      'Start Port    End Port',
      '----------    --------',
      '     55416       55515',
      '',
    ].join('\r\n');

    expect(parseExcludedPortRanges(output)).toEqual([{ start: 55416, end: 55515 }]);
  });

  it('能判斷端口是否落在保留範圍內', () => {
    const ranges = [{ start: 55416, end: 55515 }];

    expect(findExcludedRange(55416, ranges)).toEqual(ranges[0]);
    expect(findExcludedRange(55515, ranges)).toEqual(ranges[0]);
    expect(findExcludedRange(4210, ranges)).toBeUndefined();
  });
});

// Docker Desktop 在 Windows 上以 SO_REUSEADDR 發佈端口，第二個 process 仍然綁得上，
// 所以「bind 成功」不等於「端口空閒」。以下測試用注入的假 bind／probe 固定這個行為，
// 不需要真的開 Docker。修正前 judgePort 不存在，整個檔案會因為 import 失敗而紅。
const answering = { answering: true, reason: 'connect' };
const refused = { answering: false, reason: 'ECONNREFUSED' };
const timedOut = { answering: false, reason: 'TIMEOUT' };

const bindOk = async () => ({ ok: true as const });

function probeByHost(map: Record<string, { answering: boolean; reason: string }>) {
  return async (host: string) => map[host] ?? refused;
}

const target = { key: 'GATEWAY_INTERNAL_PORT', service: 'gateway-internal', port: 4210 };

describe('judgePort', () => {
  it('bind 成功但有程式在回應，要當成被佔用（Docker 發佈端口的情況）', async () => {
    const problem = await judgePort(target, {
      tryBind: bindOk,
      probe: probeByHost({ '127.0.0.1': answering }),
      hosts: ['127.0.0.1', '::1'],
    });

    expect(problem).not.toBeNull();
    expect(problem).toContain('4210');
    expect(problem).toContain('有程式正在回應');
    expect(problem).toContain('127.0.0.1');
  });

  it('只有 IPv6 在回應時也要捉到', async () => {
    const problem = await judgePort(target, {
      tryBind: bindOk,
      probe: probeByHost({ '::1': answering }),
      hosts: ['127.0.0.1', '::1'],
    });

    expect(problem).toContain('有程式正在回應');
    expect(problem).toContain('::1');
  });

  it('bind 成功而且兩個地址都拒絕連線，才算空閒', async () => {
    const problem = await judgePort(target, {
      tryBind: bindOk,
      probe: probeByHost({}),
      hosts: ['127.0.0.1', '::1'],
    });

    expect(problem).toBeNull();
  });

  it('探測逾時屬於「無法確認」，不可以當成空閒', async () => {
    const problem = await judgePort(target, {
      tryBind: bindOk,
      probe: probeByHost({ '127.0.0.1': timedOut }),
      hosts: ['127.0.0.1', '::1'],
    });

    expect(problem).not.toBeNull();
    expect(problem).toContain('無法確認');
  });

  it('bind 失敗時保留原本的原因', async () => {
    const problem = await judgePort(target, {
      tryBind: async () => ({ ok: false as const, reason: '已被其他程式佔用', code: 'EADDRINUSE' }),
      probe: probeByHost({}),
      hosts: ['127.0.0.1', '::1'],
    });

    expect(problem).toContain('已被其他程式佔用');
  });
});

describe('端口清單來自 edition-profile', () => {
  it('PORT_VARS 就是版本設定內 exists 容器的端口，次序與標籤不變', () => {
    expect(PORT_VARS).toEqual([
      { key: 'GATEWAY_INTERNAL_PORT', service: 'gateway-internal', fallback: 4210 },
      { key: 'API_PORT', service: 'api', fallback: 4420 },
      { key: 'DB_PORT', service: 'db', fallback: 25432 },
      { key: 'PORT_MINIO_API', service: 'storage', fallback: 29000 },
      { key: 'PORT_MINIO_CONSOLE', service: 'storage console', fallback: 29001 },
    ]);
  });

  it('大陸版多一個 APPS_PORT=4431，其餘與國際版相同（#77）', () => {
    expect(portVarsOf('intl').map((item) => item.key)).not.toContain('APPS_PORT');

    expect(portVarsOf('cn')).toEqual([
      { key: 'GATEWAY_INTERNAL_PORT', service: 'gateway-internal', fallback: 4210 },
      { key: 'API_PORT', service: 'api', fallback: 4420 },
      { key: 'APPS_PORT', service: 'apps', fallback: 4431 },
      { key: 'DB_PORT', service: 'db', fallback: 25432 },
      { key: 'PORT_MINIO_API', service: 'storage', fallback: 29000 },
      { key: 'PORT_MINIO_CONSOLE', service: 'storage console', fallback: 29001 },
    ]);
  });

  it('resolvePorts 可以指定版本：cn 多了 4431，值來自預設', () => {
    expect(resolvePorts({}, 'intl')).toEqual(resolvePorts({}));

    const cn = resolvePorts({}, 'cn');
    expect(cn.ports.map((item) => `${item.key}=${item.port}`)).toEqual([
      'GATEWAY_INTERNAL_PORT=4210',
      'API_PORT=4420',
      'APPS_PORT=4431',
      'DB_PORT=25432',
      'PORT_MINIO_API=29000',
      'PORT_MINIO_CONSOLE=29001',
    ]);
  });
});

describe('resolveEdition', () => {
  it('沒有設定或空字串時用預設版本', () => {
    expect(resolveEdition(undefined)).toEqual({ code: 'intl' });
    expect(resolveEdition('')).toEqual({ code: 'intl' });
    expect(resolveEdition('   ')).toEqual({ code: 'intl' });
  });

  it('認得 intl 與 cn', () => {
    expect(resolveEdition('intl')).toEqual({ code: 'intl' });
    expect(resolveEdition('cn')).toEqual({ code: 'cn' });
    expect(resolveEdition(' cn ')).toEqual({ code: 'cn' });
  });

  it('未知版本回報錯誤，訊息帶出那個值', () => {
    const result = resolveEdition('xyz');

    expect(result.error).toContain('xyz');
    expect(result.error).toContain('intl');
    expect(result.error).toContain('cn');
    expect(result.code).toBeUndefined();
  });
});

/**
 * #45：端口被佔用時要講得出「係邊個」。
 *
 * 這部機同時跑幾套 compose 專案，最常見的啟動失敗就是端口被另一套佔住；
 * 「已被其他程式佔用」這句無法判斷要停哪一個，只能人手 netstat。
 *
 * 這幾條全部是純函數：樣本取自真實 Windows 輸出（issue #45 內有原始樣本），
 * 不需要真的開端口，也不需要 Docker。
 */

/** 真實 netstat 樣本（issue #45）：python 佔用 45999、Docker 佔用 4210。 */
const NETSTAT_SAMPLE = [
  'Active Connections',
  '',
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:4210           0.0.0.0:0              LISTENING       3552',
  '  TCP    127.0.0.1:45999        0.0.0.0:0              LISTENING       20204',
  '  TCP    127.0.0.1:45999        127.0.0.1:52000        ESTABLISHED     20204',
  '  TCP    [::]:4210              [::]:0                 LISTENING       3552',
  '  TCP    0.0.0.0:14210          0.0.0.0:0              LISTENING       9999',
].join('\r\n');

describe('parseNetstatPids', () => {
  it('由真實樣本認出該端口的 LISTENING PID', () => {
    expect(parseNetstatPids(NETSTAT_SAMPLE, 45999)).toEqual([20204]);
  });

  it('IPv4 與 IPv6 兩行都算，但 PID 相同的話只回一次', () => {
    expect(parseNetstatPids(NETSTAT_SAMPLE, 4210)).toEqual([3552]);
  });

  it('不同端口（14210、42100）不會被當成 4210', () => {
    expect(parseNetstatPids(NETSTAT_SAMPLE, 42100)).toEqual([]);
    expect(parseNetstatPids(NETSTAT_SAMPLE, 14210)).toEqual([9999]);
  });

  it('ESTABLISHED 不算佔用（只有 LISTENING 才是有人在聽）', () => {
    const onlyEstablished = '  TCP    127.0.0.1:45999        127.0.0.1:52000        ESTABLISHED     20204';

    expect(parseNetstatPids(onlyEstablished, 45999)).toEqual([]);
  });

  it('空輸出與亂碼不會拋錯，只回空陣列', () => {
    expect(parseNetstatPids('', 4210)).toEqual([]);
    expect(parseNetstatPids('沒有這個端口的資料', 4210)).toEqual([]);
  });
});

describe('parseTasklistName', () => {
  it('認得 CSV 第一欄（/FO CSV 比空白對齊穩定，欄位內可能有空格）', () => {
    expect(parseTasklistName('"com.docker.backend.exe","3552","RDP-Tcp#1","3","414,004 K"')).toBe(
      'com.docker.backend.exe',
    );
  });

  it('程式名有空格也完整取出，不會只取第一個字', () => {
    expect(parseTasklistName('"Windows Defender.exe","1234","Console","1","1,000 K"')).toBe(
      'Windows Defender.exe',
    );
  });

  it('查不到（本地化訊息、空輸出）回 null', () => {
    expect(parseTasklistName('')).toBeNull();
    expect(parseTasklistName('資訊: 沒有執行中的工作符合指定的準則。')).toBeNull();
    expect(parseTasklistName('INFO: No tasks are running which match the specified criteria.')).toBeNull();
  });
});

describe('describeOwner', () => {
  it('非 Windows：明確講「不支援」，不回報 PID（不假裝識別到）', async () => {
    const owner = await describeOwner(4210, { platform: 'linux' });

    expect(owner).toEqual({ kind: 'unsupported' });
  });

  it('Windows：由 netstat 找 PID，再由 tasklist 取名稱', async () => {
    const owner = await describeOwner(4210, {
      platform: 'win32',
      netstat: async () => NETSTAT_SAMPLE,
      tasklist: async (pid: number) => `"com.docker.backend.exe","${pid}","RDP-Tcp#1","3","414,004 K"`,
    });

    expect(owner).toEqual({ kind: 'identified', name: 'com.docker.backend.exe', pid: 3552 });
  });

  it('netstat 沒有對應 PID：回報識別不到，並講出原因', async () => {
    // 45998 不在樣本內（樣本有 45999），所以 netstat 找不到 PID。
    const owner = await describeOwner(45998, {
      platform: 'win32',
      netstat: async () => NETSTAT_SAMPLE,
      tasklist: async () => '',
    });

    expect(owner.kind).toBe('unidentified');
    expect(String((owner as { reason?: string }).reason)).toContain('netstat');
  });

  it('netstat 本身失敗（例如權限）：一樣係識別不到，不拋錯', async () => {
    const owner = await describeOwner(4210, {
      platform: 'win32',
      netstat: async () => {
        throw new Error('netstat 拒絕存取');
      },
      tasklist: async () => '',
    });

    expect(owner.kind).toBe('unidentified');
  });

  it('tasklist 查不到名稱：仍然係識別不到，不半真半假', async () => {
    const owner = await describeOwner(4210, {
      platform: 'win32',
      netstat: async () => NETSTAT_SAMPLE,
      tasklist: async () => '資訊: 沒有執行中的工作符合指定的準則。',
    });

    expect(owner.kind).toBe('unidentified');
    expect(String((owner as { reason?: string }).reason)).toContain('tasklist');
  });
});

describe('judgePort 帶上佔用者', () => {
  const bindOk = async () => ({ ok: true as const });
  const bindBusy = async () => ({
    ok: false as const,
    reason: '已被其他程式佔用',
    code: 'EADDRINUSE',
  });
  const probeByHost = (table: Record<string, { answering: boolean; reason: string }>) => {
    return async (host: string) => table[host] ?? { answering: false, reason: 'ECONNREFUSED' };
  };

  it('有程式回應而且認得出佔用者：訊息含程序名與 PID', async () => {
    const problem = await judgePort(
      { key: 'GATEWAY_INTERNAL_PORT', service: 'gateway-internal', port: 4210 },
      {
        tryBind: bindOk,
        probe: probeByHost({ '127.0.0.1': { answering: true, reason: 'connect' } }),
        hosts: ['127.0.0.1', '::1'],
        owner: async () => ({ kind: 'identified' as const, name: 'com.docker.backend.exe', pid: 3552 }),
      },
    );

    expect(problem).toContain('com.docker.backend.exe');
    expect(problem).toContain('PID 3552');
    expect(problem).toContain('可能是其他 compose 專案');
  });

  it('bind 失敗而且認得出佔用者：一樣講出程序名與 PID', async () => {
    const problem = await judgePort(
      { key: 'GATEWAY_INTERNAL_PORT', service: 'gateway-internal', port: 4210 },
      {
        tryBind: bindBusy,
        probe: probeByHost({}),
        hosts: ['127.0.0.1', '::1'],
        owner: async () => ({ kind: 'identified' as const, name: 'python.exe', pid: 20204 }),
      },
    );

    expect(problem).toContain('已被其他程式佔用');
    expect(problem).toContain('python.exe');
    expect(problem).toContain('PID 20204');
  });

  it('識別不到時明說，而且仍然係問題（不是警告、不是 null）', async () => {
    const problem = await judgePort(
      { key: 'GATEWAY_INTERNAL_PORT', service: 'gateway-internal', port: 4210 },
      {
        tryBind: bindOk,
        probe: probeByHost({ '127.0.0.1': { answering: true, reason: 'connect' } }),
        hosts: ['127.0.0.1', '::1'],
        owner: async () => ({ kind: 'unidentified' as const, reason: 'netstat 沒有對應 PID' }),
      },
    );

    expect(problem).not.toBeNull();
    expect(problem).toContain('無法識別佔用者');
  });

  it('非 Windows（owner 回 unsupported）：保留原本訊息，不假裝識別到', async () => {
    const problem = await judgePort(
      { key: 'GATEWAY_INTERNAL_PORT', service: 'gateway-internal', port: 4210 },
      {
        tryBind: bindOk,
        probe: probeByHost({ '127.0.0.1': { answering: true, reason: 'connect' } }),
        hosts: ['127.0.0.1', '::1'],
        owner: async () => ({ kind: 'unsupported' as const }),
      },
    );

    expect(problem).toContain('有程式正在回應');
    expect(problem).toContain('可能由容器或代理髮布');
    expect(problem).not.toContain('PID');
  });

  it('沒有注入 owner：訊息與以前一樣（單元測試不需要真的跑 netstat）', async () => {
    const problem = await judgePort(
      { key: 'GATEWAY_INTERNAL_PORT', service: 'gateway-internal', port: 4210 },
      {
        tryBind: bindOk,
        probe: probeByHost({ '127.0.0.1': { answering: true, reason: 'connect' } }),
        hosts: ['127.0.0.1', '::1'],
      },
    );

    expect(problem).toContain('可能由容器或代理髮布');
    expect(problem).not.toContain('PID');
  });
});

describe('#45 的守門：main 一定要接上佔用者', () => {
  it('main() 真的把 describeOwner 傳給 judgePort（不是只寫了函數沒接線）', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/ports-check.mjs'), 'utf8');

    expect(source).toContain('describeOwner');
    expect(source).toContain('owner:');
  });
});
