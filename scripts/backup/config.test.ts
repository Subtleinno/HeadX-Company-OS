import { describe, expect, it } from 'vitest';
import { DEFAULT_QUIESCE_CONTAINERS, readBackupConfig } from './config.mjs';

/**
 * 備份設定：合法值直接採用，寫錯的值要大聲報出來，不要靜靜用預設。
 * 所有值都來自 .env，測試不需要真的讀檔。
 */

describe('readBackupConfig', () => {
  it('讀到備份根目錄、保留份數、排程間隔與要暫停的容器', () => {
    const config = readBackupConfig({
      COMPANY_OS_BACKUP_ROOT: 'D:/company-os-backups',
      BACKUP_RETENTION: '5',
      BACKUP_INTERVAL_HOURS: '12',
      BACKUP_QUIESCE_CONTAINERS: 'headx-company-os-api-1, co-accept-api',
    });

    expect(config.errors).toEqual([]);
    expect(config.root).toBe('D:/company-os-backups');
    expect(config.retention).toBe(5);
    expect(config.intervalHours).toBe(12);
    expect(config.quiesceContainers).toEqual(['headx-company-os-api-1', 'co-accept-api']);
  });

  it('沒有設定根目錄時 root 是 null（由根目錄驗證給出明確錯誤碼）', () => {
    const config = readBackupConfig({});

    expect(config.root).toBeNull();
    // 未設定根目錄不是「設定格式錯誤」，所以不由這裡報。
    expect(config.errors).toEqual([]);
  });

  it('預設值是每日一次、保留 7 份、暫停 api 容器', () => {
    const config = readBackupConfig({});

    expect(config.intervalHours).toBe(24);
    expect(config.retention).toBe(7);
    expect(config.quiesceContainers).toEqual(DEFAULT_QUIESCE_CONTAINERS);
  });

  it('保留份數或間隔不是整數時指出是哪一個變數', () => {
    const config = readBackupConfig({ BACKUP_RETENTION: '3.5', BACKUP_INTERVAL_HOURS: 'abc' });

    expect(config.errors).toHaveLength(2);
    expect(config.errors[0]).toContain('BACKUP_RETENTION');
    expect(config.errors[1]).toContain('BACKUP_INTERVAL_HOURS');
  });

  it('保留份數是 0 或負數時報錯（唯一有效備份不可以被刪）', () => {
    expect(readBackupConfig({ BACKUP_RETENTION: '0' }).errors).toEqual([
      expect.stringContaining('BACKUP_RETENTION'),
    ]);
    expect(readBackupConfig({ BACKUP_RETENTION: '-1' }).errors).toHaveLength(1);
  });

  it('間隔 0 是合法值：表示只跑一次，不進入迴圈', () => {
    const config = readBackupConfig({ BACKUP_INTERVAL_HOURS: '0' });

    expect(config.errors).toEqual([]);
    expect(config.intervalHours).toBe(0);
  });

  it('空白或只有逗號的容器清單退回預設值', () => {
    const config = readBackupConfig({ BACKUP_QUIESCE_CONTAINERS: ' , ' });

    expect(config.quiesceContainers).toEqual(DEFAULT_QUIESCE_CONTAINERS);
  });
});
