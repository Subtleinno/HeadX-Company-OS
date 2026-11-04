import { describe, expect, it } from 'vitest';
import { parseFlags, assertKnownFlags } from './args.mjs';

describe('參數解析', () => {
  it('--key=value 與 --key value 兩種寫法都支援', () => {
    const flags = parseFlags(['--backup-id=abc', '--keep', '3']);

    expect(flags['backup-id']).toBe('abc');
    expect(flags.keep).toBe('3');
  });

  it('後面沒有值的開關當成 true', () => {
    expect(parseFlags(['--test-only-root'])).toEqual({ 'test-only-root': true });
    expect(parseFlags(['--yes', '--target-db', 'qa'])).toEqual({ yes: true, 'target-db': 'qa' });
  });

  it('不是 -- 開頭的參數要報錯，不要當成值吞掉', () => {
    expect(() => parseFlags(['create'])).toThrow(/無法理解的參數：create/);
  });
});

describe('打錯的旗標要出聲，不能靜靜驗錯備份', () => {
  it('verify 收到 --id（正確是 --backup-id）要報錯，並列出可用旗標', () => {
    let caught;

    try {
      assertKnownFlags('verify', { id: 'abc' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(caught.message).toContain('--id');
    expect(caught.message).toContain('--backup-id');
  });

  it('正確的旗標不會被攔', () => {
    expect(() => assertKnownFlags('verify', { 'backup-id': 'a', 'test-only-root': true })).not.toThrow();
    expect(() => assertKnownFlags('list', { 'test-only-root': true })).not.toThrow();
    expect(() =>
      assertKnownFlags('restore', {
        'backup-id': 'a',
        'target-db': 'qa',
        'target-bucket': 'qa',
        'create-target-db': true,
        'purge-bucket': true,
        yes: true,
        'test-only-root': true,
      }),
    ).not.toThrow();
  });

  it('restore 收到 create 專用的 --database 也要攔（避免以為改了目標）', () => {
    expect(() => assertKnownFlags('restore', { database: 'qa' })).toThrow(/--database/);
  });

  it('未知指令要報錯', () => {
    expect(() => assertKnownFlags('backup', {})).toThrow(/未知指令/);
  });
});
