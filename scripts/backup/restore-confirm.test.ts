import { describe, expect, it } from 'vitest';
import { RestoreError, assertRestoreConfirmed } from './restore.mjs';

describe('還原要明示確認，未確認不得覆蓋任何資料', () => {
  it('沒有 --yes：拋出 confirmation_required', () => {
    let caught;

    try {
      assertRestoreConfirmed({});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RestoreError);
    expect(caught.code).toBe('confirmation_required');
    expect(caught.message).toContain('--yes');
  });

  it('--yes 是 false 或字串都不算確認（只認 true）', () => {
    expect(() => assertRestoreConfirmed({ yes: false })).toThrow(/--yes/);
    expect(() => assertRestoreConfirmed({ yes: 'true' })).toThrow(/--yes/);
  });

  it('--yes 為 true 才放行', () => {
    expect(() => assertRestoreConfirmed({ yes: true })).not.toThrow();
  });

  it('錯誤訊息要講清楚會覆蓋什麼', () => {
    let caught;

    try {
      assertRestoreConfirmed({});
    } catch (error) {
      caught = error;
    }

    expect(caught.message).toContain('資料庫');
    expect(caught.message).toContain('bucket');
  });
});
