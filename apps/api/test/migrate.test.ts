import { describe, expect, it } from 'vitest';
import { checksum, sortMigrations } from '../src/migrate';

describe('migration 檔名驗證', () => {
  it('依編號數字排序，與傳入次序無關', () => {
    expect(
      sortMigrations(['0003_three.sql', '0001_one.sql', '0002_two.sql']).map((item) => item.name),
    ).toEqual(['0001_one.sql', '0002_two.sql', '0003_three.sql']);
  });

  it('格式錯誤時報錯，訊息帶出那個檔名', () => {
    const bad = ['1_one.sql', '0001_One.sql', '0001_two-words.sql', '0001_中文.sql', '0001_one.txt'];

    for (const name of bad) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(() => sortMigrations([name]), name).toThrow(new RegExp(escaped));
    }
  });

  it('編號重複時報錯，訊息帶出兩個檔名', () => {
    expect(() => sortMigrations(['0001_one.sql', '0001_other.sql'])).toThrow(/0001/);
    expect(() => sortMigrations(['0001_one.sql', '0001_other.sql'])).toThrow(/0001_other\.sql/);
  });

  it('編號跳號時報錯，指出缺了哪一個', () => {
    expect(() => sortMigrations(['0001_one.sql', '0003_three.sql'])).toThrow(/0002/);
  });

  it('由 0002 開始也當作不連續', () => {
    expect(() => sortMigrations(['0002_two.sql'])).toThrow(/0001/);
  });
});

describe('checksum', () => {
  it('是 SHA-256，對已知輸入有已知值', () => {
    expect(checksum('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('內容不同，checksum 不同', () => {
    expect(checksum('select 1;')).not.toBe(checksum('select 2;'));
  });

  it('同樣內容得到同樣 checksum', () => {
    expect(checksum('select 1;\n')).toBe(checksum('select 1;\n'));
  });

  it('CRLF 與 LF 得到同一個 checksum（Windows 工作樹的換行差異不算修改）', () => {
    expect(checksum('a\r\nb')).toBe(checksum('a\nb'));
  });
});
