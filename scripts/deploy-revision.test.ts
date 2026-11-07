import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LABEL_KEY,
  REPO_BUILT_SERVICES,
  compareRevision,
  exitCodeFor,
  parseRevision,
  renderReport,
  verdictOf,
} from './deploy-revision.mjs';

/**
 * 映像 revision 的閘門（issue #143）。
 *
 * 這裡有兩層：
 *   1. 純函數：標記怎樣解析、新舊怎樣比對、退出碼怎樣定。這些是「分辨最新與舊映像」的全部判斷。
 *   2. 檔案一致性：Dockerfile 的 LABEL、compose 的 build args、README 的步驟、package.json 的 script。
 *      少了任何一邊，腳本會照跑，但永遠答「未知」—— 一個永遠答未知的檢查比沒有檢查更差，
 *      因為它看上去像已經做好了。
 */

const SHA = '879f140acf8a1343759aaa4527b0abaa073feb9d';
const OTHER = '63e764574f7498b7badc6e936b44ef4881f6dbc9';

describe('parseRevision', () => {
  it('完整 40 位 SHA 視為已知', () => {
    expect(parseRevision(SHA)).toEqual({ kind: 'known', sha: SHA });
  });

  it('短 SHA（7 位）視為已知，不會因為不是 40 位就丟掉', () => {
    expect(parseRevision(SHA.slice(0, 7))).toEqual({ kind: 'known', sha: SHA.slice(0, 7) });
  });

  it('沒有標記、空字串、docker 的 <no value> 都是未知', () => {
    for (const raw of [undefined, null, '', '   ', '<no value>']) {
      expect(parseRevision(raw)).toEqual({ kind: 'unknown', reason: '沒有標記' });
    }
  });

  it('建置時沒有提供 commit（值為 unknown）要講明原因，不是當成沒有標記', () => {
    const parsed = parseRevision('unknown');

    expect(parsed.kind).toBe('unknown');
    expect(parsed).toMatchObject({ reason: '建置時未提供 commit' });
  });

  it('不是 hex 的值不可以當成 SHA —— 那會令比對永遠不符，看起來像「落後」', () => {
    const parsed = parseRevision('v1.2.3');

    expect(parsed.kind).toBe('unknown');
    expect(parsed).toMatchObject({ reason: '標記不是 commit SHA：v1.2.3' });
  });
});

describe('compareRevision', () => {
  it('同一個 commit 是相符', () => {
    expect(compareRevision(SHA, parseRevision(SHA))).toEqual({ kind: 'match' });
  });

  it('短 SHA 與完整 SHA 的前綴相同也是相符', () => {
    expect(compareRevision(SHA, parseRevision(SHA.slice(0, 7)))).toEqual({ kind: 'match' });
    expect(compareRevision(SHA.slice(0, 7), parseRevision(SHA))).toEqual({ kind: 'match' });
  });

  it('不同 commit 是落後', () => {
    expect(compareRevision(SHA, parseRevision(OTHER))).toEqual({ kind: 'stale' });
  });

  it('未知的標記不會被講成落後（兩者要修的東西不同）', () => {
    const verdict = compareRevision(SHA, parseRevision(''));

    expect(verdict.kind).toBe('unknown');
  });

  it('本機讀不到現行 commit 時，一律未知，不會假裝相符', () => {
    const verdict = compareRevision(null, parseRevision(SHA));

    expect(verdict).toEqual({ kind: 'unknown', reason: '本機讀不到現行 commit' });
  });
});

describe('verdictOf', () => {
  it('本 repo 建置的三個 service 會真的比對', () => {
    for (const service of ['api', 'gateway-internal', 'apps']) {
      expect(verdictOf({ currentSha: SHA, service, label: SHA })).toEqual({ kind: 'match' });
      expect(verdictOf({ currentSha: SHA, service, label: OTHER })).toEqual({ kind: 'stale' });
    }
  });

  it('外部映像（db、storage）標明不適用，不會假裝成落後或未知的缺陷', () => {
    const verdict = verdictOf({ currentSha: SHA, service: 'db', label: null });

    expect(verdict.kind).toBe('skipped');
    expect(verdict).toMatchObject({ reason: '不是由本 repo 建置' });
  });

  it('本 repo 建置但沒有標記的 service，是未知而不是相符', () => {
    expect(verdictOf({ currentSha: SHA, service: 'api', label: null }).kind).toBe('unknown');
  });
});

describe('exitCodeFor', () => {
  it('全部相符回 0', () => {
    expect(exitCodeFor([{ verdict: { kind: 'match' } }, { verdict: { kind: 'skipped' } }])).toBe(0);
  });

  it('有落後回 1', () => {
    expect(exitCodeFor([{ verdict: { kind: 'match' } }, { verdict: { kind: 'stale' } }])).toBe(1);
  });

  it('有未知回 2', () => {
    expect(exitCodeFor([{ verdict: { kind: 'unknown' } }])).toBe(2);
  });

  it('落後與未知同時出現時回 1：落後是具體、可修的，優先講', () => {
    expect(exitCodeFor([{ verdict: { kind: 'unknown' } }, { verdict: { kind: 'stale' } }])).toBe(1);
  });
});

describe('renderReport', () => {
  const rows = [
    { container: 'demo-api-1', service: 'api', label: SHA, verdict: { kind: 'match' } },
    {
      container: 'demo-gateway-internal-1',
      service: 'gateway-internal',
      label: OTHER,
      verdict: { kind: 'stale' },
    },
    { container: 'demo-db-1', service: 'db', label: null, verdict: { kind: 'skipped', reason: '不是由本 repo 建置' } },
  ];

  it('逐個容器寫出標記 commit 與結果', () => {
    const text = renderReport(rows, SHA);

    expect(text).toContain('demo-api-1');
    expect(text).toContain('相符');
    expect(text).toContain('落後');
    expect(text).toContain('不適用');
    expect(text).toContain(SHA);
  });

  it('未知要有原因，不可以只寫一個「未知」令人無從修起', () => {
    const text = renderReport(
      [{ container: 'demo-apps-1', service: 'apps', label: null, verdict: { kind: 'unknown', reason: '沒有標記' } }],
      SHA,
    );

    expect(text).toContain('未知（沒有標記）');
  });

  it('讀不到現行 commit 時，表頭要如實講，不是印一個空白', () => {
    expect(renderReport([], null)).toContain('讀不到現行 commit');
  });
});

describe('repo 一致性：label、compose、README、scripts', () => {
  const root = process.cwd();
  const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

  const dockerfiles = [
    { path: 'apps/platform/Dockerfile', service: 'api' },
    { path: 'apps/web/Dockerfile', service: 'gateway-internal' },
    { path: 'apps/app-host/Dockerfile', service: 'apps' },
  ] as const;

  for (const { path, service } of dockerfiles) {
    it(`${service} 的 Dockerfile 宣告 GIT_REVISION build arg`, () => {
      expect(read(path)).toMatch(/^ARG GIT_REVISION=unknown$/m);
    });

    it(`${service} 的 Dockerfile 把 GIT_REVISION 寫進 ${LABEL_KEY}`, () => {
      expect(read(path)).toMatch(
        new RegExp(`^LABEL ${LABEL_KEY.replace(/\./g, '\\.')}=\\$GIT_REVISION$`, 'm'),
      );
    });
  }

  it('compose 為三個 service 傳 GIT_REVISION，否則 build arg 永遠不存在', () => {
    const compose = read('docker-compose.yml');

    for (const { service } of dockerfiles) {
      const block = serviceBlock(compose, service);
      expect(block, `docker-compose.yml 找不到 service ${service}`).not.toBeNull();
      expect(block).toContain('GIT_REVISION: ${GIT_REVISION:-}');
    }
  });

  it('腳本內「本 repo 建置的 service」與 compose 內真正傳 build arg 的 service 一致', () => {
    const compose = read('docker-compose.yml');
    const withArgs = ['api', 'gateway-internal', 'apps', 'db', 'storage']
      .filter((service) => (serviceBlock(compose, service) ?? '').includes('GIT_REVISION:'))
      .sort();

    expect(withArgs).toEqual([...REPO_BUILT_SERVICES].sort());
  });

  it('package.json 有 deploy:build 與 deploy:revision', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

    expect(pkg.scripts['deploy:build']).toBe('node scripts/deploy-build.mjs');
    expect(pkg.scripts['deploy:revision']).toBe('node scripts/deploy-revision.mjs');
  });

  it('README 有「更新到最新 main」一節，並寫明三條指令', () => {
    const readme = read('README.md');

    expect(readme).toContain('## 更新到最新 main');
    expect(readme).toContain('npm run deploy:build');
    expect(readme).toContain('docker compose --profile apps up -d apps');
    expect(readme).toContain('npm run deploy:revision');
  });
});

/** 由 docker-compose.yml 取出某個 service 的整段（兩個空格縮進的 key 到下一個 key 之前）。 */
function serviceBlock(compose: string, service: string): string | null {
  const lines = compose.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) {
    return null;
  }

  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^ {2}\S/.test(line) || /^\S/.test(line)) {
      break;
    }
    block.push(line);
  }

  return block.join('\n');
}
