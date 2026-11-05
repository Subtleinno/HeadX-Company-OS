import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  envNamesFor,
  parseAppList,
  resolveTargets,
  roleNameFor,
  schemaNameFor,
} from '../../src/db-access/naming';
import { parseArgs, readSecrets, UsageError } from '../../src/db-access/cli';

/**
 * `db:app-access` 的輸入驗證（issue #88）。
 *
 * 這一支的全部價值在於「拒絕」：一個錯的 app id、一組碰撞的變數名、一個
 * 冇 --confirm 的 apply，都會變成兩個 app 共用一個帳號或者改錯資料庫。
 * 所以測試的重心是錯誤路徑，不是成功路徑。
 */

describe('app 與角色的命名', () => {
  it('schema 就是 app id，role 是固定前綴加 id', () => {
    expect(schemaNameFor('ops_finance')).toBe('ops_finance');
    expect(roleNameFor('ops_finance')).toBe('co_app_ops_finance');
    expect(envNamesFor('ops_finance')).toEqual({
      user: 'APP_DB_OPS_FINANCE_USER',
      password: 'APP_DB_OPS_FINANCE_PASSWORD',
    });
  });

  it('唔合法的 id 一律拒絕，唔會嘗試修正', () => {
    for (const bad of ['Sales', '9lives', 'has-dash', 'has space', '']) {
      expect(() => schemaNameFor(bad)).toThrow(/app id 不合法/);
    }
  });

  it('太長的 id 唔可以靠截斷過關', () => {
    const long = `a${'b'.repeat(60)}`;

    expect(() => roleNameFor(long)).toThrow(/太長/);
  });

  it('重複與碰撞都拒絕', () => {
    expect(() => resolveTargets(['app_a', 'app_a'])).toThrow(/重複/);
    expect(() => resolveTargets([])).toThrow(/至少要指定一個 app/);
  });

  it('parseAppList 接受空白與空項', () => {
    expect(parseAppList(' a , b ')).toEqual(['a', 'b']);
    expect(parseAppList(undefined)).toEqual([]);
    expect(parseAppList(',,')).toEqual([]);
  });
});

describe('命令列參數', () => {
  it('plan／verify 不需要 --confirm，apply 兩個都要', () => {
    expect(() => parseArgs(['plan', '--apps', 'app_a'])).not.toThrow();
    expect(() => parseArgs(['verify', '--apps', 'app_a'])).not.toThrow();

    expect(() => parseArgs(['apply', '--apps', 'app_a', '--confirm'])).toThrow(/--database/);
    expect(() => parseArgs(['apply', '--apps', 'app_a', '--database', 'x'])).toThrow(/--confirm/);
    expect(() =>
      parseArgs(['apply', '--apps', 'app_a', '--database', 'x', '--confirm']),
    ).not.toThrow();
  });

  it('缺 --apps、未知子命令、未知參數都拒絕', () => {
    expect(() => parseArgs(['plan'])).toThrow(/--apps/);
    expect(() => parseArgs(['drop', '--apps', 'a'])).toThrow(UsageError);
    expect(() => parseArgs(['plan', '--apps', 'a', '--force'])).toThrow(/未知參數/);
    expect(() => parseArgs([])).toThrow(UsageError);
  });

  it('--apps 後面冇值就報錯，唔會靜靜當成空', () => {
    expect(() => parseArgs(['plan', '--apps'])).toThrow(/需要一個值/);
    expect(() => parseArgs(['plan', '--apps', '--json'])).toThrow(/需要一個值/);
  });
});

describe('密碼只由 env 或檔案來', () => {
  const targets = resolveTargets(['app_a', 'app_b']);

  it('env 有就用，冇就列出缺哪一個（唔會回顯任何值）', () => {
    expect(() => readSecrets(targets, {}, undefined)).toThrow(
      /APP_DB_APP_A_PASSWORD、APP_DB_APP_B_PASSWORD/,
    );

    const secrets = readSecrets(
      targets,
      {
        APP_DB_APP_A_PASSWORD: 'a'.repeat(20),
        APP_DB_APP_B_PASSWORD: 'b'.repeat(20),
      },
      undefined,
    );

    expect(secrets.get('co_app_app_a')).toBe('a'.repeat(20));
  });

  it('太短的密碼拒絕', () => {
    expect(() =>
      readSecrets(targets, { APP_DB_APP_A_PASSWORD: 'short', APP_DB_APP_B_PASSWORD: 'b'.repeat(20) }, undefined),
    ).toThrow(/太短/);
  });

  it('可以由 KEY=VALUE 檔案讀，註解與空行忽略', () => {
    const dir = mkdtempSync(join(tmpdir(), 'db-access-'));
    const file = join(dir, 'secrets.env');

    writeFileSync(
      file,
      ['# 註解', '', `APP_DB_APP_A_PASSWORD=${'a'.repeat(24)}`, `APP_DB_APP_B_PASSWORD=${'b'.repeat(24)}`].join(
        '\n',
      ),
    );

    const secrets = readSecrets(targets, {}, file);

    expect(secrets.size).toBe(2);
  });
});
