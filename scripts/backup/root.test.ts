import { describe, expect, it } from 'vitest';
import { evaluateBackupRoot } from './root.mjs';

/**
 * 備份根目錄的閘門。這是整個備份機制最重要的一條規則：
 * 備份寫在同一粒碟上等於沒有備份，所以 C: 一律拒絕。
 *
 * 檔案系統以 probe 注入，測試不需要真的碟；但每個錯誤碼都有對應案例。
 */

const okProbe = {
  exists: () => true,
  isDirectory: () => true,
  isWritable: () => true,
};

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateBackupRoot({
    platform: 'win32',
    systemDrive: 'C:',
    // 正式的來源：整個 C:\company-os-data（Postgres dump、MinIO 都在裡面）與 MinIO 資料夾本身。
    sourcePaths: ['C:\\company-os-data', 'C:\\company-os-data\\minio'],
    probe: okProbe,
    ...overrides,
  });
}

describe('evaluateBackupRoot：拒絕的情況', () => {
  it('沒有設定：backup_root_unset', () => {
    for (const root of [undefined, null, '', '   ']) {
      const result = evaluate({ root });

      expect(result.ok).toBe(false);
      expect(result.code).toBe('backup_root_unset');
      expect(result.guidance).toContain('COMPANY_OS_BACKUP_ROOT');
    }
  });

  it('相對路徑：backup_root_relative', () => {
    const result = evaluate({ root: 'company-os-backups' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_relative');
  });

  it('指向 C:（系統碟）：backup_root_on_system_drive', () => {
    const result = evaluate({ root: 'C:\\company-os-backups' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_on_system_drive');
    expect(result.message).toContain('C:');
  });

  it('指到 C:\\company-os-data 之內：backup_root_inside_source（比系統碟更精確）', () => {
    const result = evaluate({ root: 'c:\\company-os-data\\backup' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_inside_source');
  });

  it('即使不是系統碟，也不可以放在來源（MinIO 資料夾）之內', () => {
    const result = evaluate({
      root: 'D:\\company-os-data\\minio\\backup',
      sourcePaths: ['D:\\company-os-data\\minio'],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_inside_source');
  });

  it('等於來源資料夾本身也算：backup_root_inside_source', () => {
    const result = evaluate({
      root: 'D:\\company-os-data\\minio',
      sourcePaths: ['D:\\company-os-data', 'D:\\company-os-data\\minio'],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_inside_source');
  });

  it('不存在：backup_root_missing（不自動建立）', () => {
    const result = evaluate({
      root: 'D:\\company-os-backups',
      probe: { ...okProbe, exists: () => false },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_missing');
  });

  it('存在但不是資料夾：backup_root_not_directory', () => {
    const result = evaluate({
      root: 'D:\\company-os-backups',
      probe: { ...okProbe, isDirectory: () => false },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_not_directory');
  });

  it('不可寫入：backup_root_not_writable', () => {
    const result = evaluate({
      root: 'D:\\company-os-backups',
      probe: { ...okProbe, isWritable: () => false },
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_not_writable');
  });
});

describe('evaluateBackupRoot：接受的情況', () => {
  it('另一粒碟上可寫入的資料夾：通過，testOnly 為 false', () => {
    const result = evaluate({ root: 'D:\\company-os-backups' });

    expect(result.ok).toBe(true);
    expect(result.root).toBe('D:\\company-os-backups');
    expect(result.testOnly).toBe(false);
  });

  it('路徑大小寫與結尾斜線不影響判斷', () => {
    const result = evaluate({ root: 'd:\\Company-OS-Backups\\' });

    expect(result.ok).toBe(true);
    expect(result.testOnly).toBe(false);
  });

  it('沒有第二粒碟的機器：明確標記 TEST-ONLY 的資料夾可以用，但要標成測試用', () => {
    const result = evaluate({
      root: 'C:\\company-os-test\\TEST-ONLY\\backups',
      allowTestOnly: true,
    });

    expect(result.ok).toBe(true);
    expect(result.testOnly).toBe(true);
    expect(result.warning).toContain('TEST-ONLY');
  });

  it('開了測試用開關但路徑沒有標記：backup_root_test_only_unmarked', () => {
    const result = evaluate({
      root: 'C:\\company-os-test\\backups',
      allowTestOnly: true,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_test_only_unmarked');
  });

  it('沒有開測試用開關時，TEST-ONLY 路徑仍然被系統碟規則擋住', () => {
    const result = evaluate({ root: 'C:\\company-os-test\\TEST-ONLY\\backups' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('backup_root_on_system_drive');
  });

  it('另一粒碟不需要測試用開關，也不會被標成測試用', () => {
    const result = evaluate({ root: 'D:\\company-os-backups', allowTestOnly: true });

    expect(result.ok).toBe(true);
    expect(result.testOnly).toBe(false);
  });
});
