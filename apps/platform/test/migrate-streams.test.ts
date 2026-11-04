import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ledgerName,
  parseLedgerName,
  readStreams,
  validateStreamSchema,
  type MigrationStream,
} from '../src/migrate';

/**
 * 多串支援的規則（#75）。這一組全部不需要資料庫：只管「怎樣發現串、怎樣驗證」。
 * 需要真 Postgres 的部分（ledger 一致性、交易、search_path）在 integration 那一邊。
 */

const FIXTURES = resolve(process.cwd(), 'apps/platform/test/fixtures/migrations');

const created: string[] = [];

/** 在臨時目錄砌一棵樹，用於「剛好觸發一條規則」的個案。 */
async function makeTree(spec: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), 'company-os-streams-'));
  created.push(dir);

  for (const [relative, content] of Object.entries(spec)) {
    const target = resolve(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }

  return dir;
}

afterEach(async () => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

function schemaOf(streams: MigrationStream[]): (string | null)[] {
  return streams.map((stream) => stream.schema);
}

describe('發現串與排序', () => {
  it('平目錄是 platform 的串，永遠排最先；其餘按 schema 名稱字母序', async () => {
    const streams = await readStreams(FIXTURES);

    expect(schemaOf(streams)).toEqual([null, 'app_alpha', 'app_beta']);

    expect(streams[0]?.files.map((file) => file.name)).toEqual([
      '0001_base.sql',
      '0002_extra.sql',
    ]);
    expect(streams[1]?.files.map((file) => file.name)).toEqual([
      '0001_alpha_one.sql',
      '0002_alpha_two.sql',
    ]);
    expect(streams[2]?.files.map((file) => file.name)).toEqual(['0001_beta_one.sql']);
  });

  it('串是 a 字頭也排在平目錄之後（平目錄先，是固定的）', async () => {
    const dir = await makeTree({
      '0001_base.sql': 'select 1;',
      'aaa/0001_one.sql': 'select 1;',
    });

    expect(schemaOf(await readStreams(dir))).toEqual([null, 'aaa']);
  });

  it('只有平目錄時，結果就是一條串（舊行為完全不變）', async () => {
    const dir = await makeTree({ '0001_base.sql': 'select 1;', '0002_two.sql': 'select 1;' });
    const streams = await readStreams(dir);

    expect(streams).toHaveLength(1);
    expect(streams[0]?.schema).toBeNull();
    expect(streams[0]?.prefix).toBe('');
  });

  it('兩個串各自由 0001 起算，編號相同不算重複', async () => {
    const dir = await makeTree({
      'app_one/0001_one.sql': 'select 1;',
      'app_two/0001_two.sql': 'select 1;',
    });

    const streams = await readStreams(dir);
    expect(schemaOf(streams)).toEqual([null, 'app_one', 'app_two']);
    // 兩邊都是 0001，沒有擲錯就代表各自獨立編號。
    expect(streams[1]?.files[0]?.name).toBe('0001_one.sql');
    expect(streams[2]?.files[0]?.name).toBe('0001_two.sql');
  });

  it('找不到資料夾時報錯，訊息帶出路徑', async () => {
    await expect(readStreams(resolve(FIXTURES, 'not-here'))).rejects.toThrow(/not-here/);
  });
});

describe('schema 名稱驗證', () => {
  it('合格的名稱不擲錯', () => {
    for (const name of ['app_alpha', 'a', 'app1', 'hr', 'ops_finance', 'a'.repeat(41)]) {
      expect(() => validateStreamSchema(name), name).not.toThrow();
    }
  });

  it('不合格的名稱擲錯，訊息帶出那個名字', () => {
    const bad = [
      'App',
      'app-x',
      '1app',
      '_app',
      'app.hr',
      '',
      'a'.repeat(42),
    ];

    for (const name of bad) {
      expect(() => validateStreamSchema(name), name).toThrow(new RegExp(`schema 名稱`));
    }
  });

  it('public 不可以當串（那是 ledger 與 platform 表的位置）', () => {
    expect(() => validateStreamSchema('public')).toThrow(/public/);
  });

  it('pg_ 開頭與 information_schema 不可以當串', () => {
    expect(() => validateStreamSchema('pg_shadow')).toThrow(/pg_/);
    expect(() => validateStreamSchema('information_schema')).toThrow(/information_schema/);
  });

  it('資料夾名字不合格時，讀取就失敗並指出那個資料夾', async () => {
    const dir = await makeTree({ 'BadName/0001_one.sql': 'select 1;' });
    await expect(readStreams(dir)).rejects.toThrow(/BadName/);
  });

  it('pg_ 開頭的資料夾也一樣拒絕', async () => {
    const dir = await makeTree({ 'pg_tmp/0001_one.sql': 'select 1;' });
    await expect(readStreams(dir)).rejects.toThrow(/pg_tmp/);
  });
});

describe('串內編號規則', () => {
  it('串內編號重複：報錯，訊息寫明是哪一串與兩個檔名', async () => {
    const dir = await makeTree({
      'app_alpha/0001_one.sql': 'select 1;',
      'app_alpha/0001_other.sql': 'select 1;',
    });

    const failure = () => readStreams(dir);
    await expect(failure()).rejects.toThrow(/app_alpha/);
    await expect(failure()).rejects.toThrow(/0001_other\.sql/);
  });

  it('串內編號不連續：報錯，訊息寫明是哪一串與缺少的編號', async () => {
    const dir = await makeTree({
      'app_alpha/0001_one.sql': 'select 1;',
      'app_alpha/0003_three.sql': 'select 1;',
    });

    const failure = () => readStreams(dir);
    await expect(failure()).rejects.toThrow(/app_alpha/);
    await expect(failure()).rejects.toThrow(/0002/);
  });

  it('串內由 0002 起算也算不連續', async () => {
    const dir = await makeTree({ 'app_alpha/0002_two.sql': 'select 1;' });
    await expect(readStreams(dir)).rejects.toThrow(/0001/);
  });

  it('串內檔名格式錯：報錯，訊息寫明是哪一串與那個檔名', async () => {
    const dir = await makeTree({
      'app_alpha/0001_one.sql': 'select 1;',
      'app_alpha/0002_Two.sql': 'select 1;',
    });

    const failure = () => readStreams(dir);
    await expect(failure()).rejects.toThrow(/app_alpha/);
    await expect(failure()).rejects.toThrow(/0002_Two\.sql/);
  });

  it('串內有隔壁的檔案（notes.txt）：當作孤立檔案，報錯並指出檔名', async () => {
    const dir = await makeTree({
      'app_alpha/0001_one.sql': 'select 1;',
      'app_alpha/notes.txt': '唔應該擺喺呢度',
    });

    const failure = () => readStreams(dir);
    await expect(failure()).rejects.toThrow(/app_alpha/);
    await expect(failure()).rejects.toThrow(/notes\.txt/);
  });
});

describe('ledger 名稱', () => {
  it('平目錄的檔名原樣入帳，不加前綴', () => {
    const flat: MigrationStream = {
      schema: null,
      prefix: '',
      label: '平目錄',
      dir: '/x',
      files: [],
    };

    expect(ledgerName(flat, '0001_audit_log.sql')).toBe('0001_audit_log.sql');
  });

  it('串的檔名入帳時加 <schema>/ 前綴，避免與平目錄撞名', () => {
    const stream: MigrationStream = {
      schema: 'app_alpha',
      prefix: 'app_alpha/',
      label: '串 "app_alpha"',
      dir: '/x',
      files: [],
    };

    expect(ledgerName(stream, '0001_one.sql')).toBe('app_alpha/0001_one.sql');
  });

  it('parseLedgerName 是 ledgerName 的反向', () => {
    expect(parseLedgerName('0001_audit_log.sql')).toEqual({
      schema: null,
      file: '0001_audit_log.sql',
    });
    expect(parseLedgerName('app_alpha/0001_one.sql')).toEqual({
      schema: 'app_alpha',
      file: '0001_one.sql',
    });
  });

  it('舊 ledger 的紀錄 parse 之後仍然是平目錄（既有三筆不受影響）', () => {
    for (const name of ['0001_audit_log.sql', '0002_users_sessions.sql', '0003_stored_file.sql']) {
      expect(parseLedgerName(name)).toEqual({ schema: null, file: name });
    }
  });
});
