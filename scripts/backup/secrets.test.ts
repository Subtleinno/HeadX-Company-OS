import { describe, expect, it } from 'vitest';
import { secretFileWarning } from './secrets.mjs';

describe('備份內的密碼檔：權限收不緊要講出來', () => {
  it('0600：只有擁有者可讀寫，不用警告', () => {
    expect(secretFileWarning(0o600)).toBeNull();
  });

  it('0640：群組可讀，要警告並指出實際權限', () => {
    const warning = secretFileWarning(0o640);

    expect(warning).not.toBeNull();
    expect(warning.permissions).toBe('640');
    expect(warning.message).toContain('env.backup');
  });

  it('0666（Windows 的實況）：要警告，並說明這個檔案系統不支援 POSIX 權限', () => {
    const warning = secretFileWarning(0o666);

    expect(warning).not.toBeNull();
    expect(warning.permissions).toBe('666');
    expect(warning.message).toContain('Windows');
    expect(warning.message).toContain('磁碟加密');
  });

  it('警告內容不可包含密碼本身（只講權限）', () => {
    const warning = secretFileWarning(0o644);

    expect(warning.message).not.toContain('POSTGRES_PASSWORD');
    expect(warning.message).not.toMatch(/=\S{8,}/);
  });
});
