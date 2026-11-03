import { describe, expect, it } from 'vitest';
import {
  findExcludedRange,
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
  it('未設定的端口使用 compose 的預設值', () => {
    const { ports, errors } = resolvePorts({});

    expect(errors).toEqual([]);
    expect(ports.map((item) => item.port)).toEqual([4210, 4420, 25432]);
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
