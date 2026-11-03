import { describe, expect, it } from 'vitest';
import {
  findExcludedRange,
  judgePort,
  parseEnv,
  parseExcludedPortRanges,
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
    const { errors } = resolvePorts({ WEB_PORT: 'abc', API_PORT: '70000' });

    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('WEB_PORT');
    expect(errors[1]).toContain('API_PORT');
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

const target = { key: 'WEB_PORT', service: 'web', port: 4210 };

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
