import { describe, expect, it } from 'vitest';
import { errorCodeFrom, redactErrorSummary, FAILURE_SUMMARY_MAX_LENGTH } from '../../src/jobs/redact';
import { JobFailure } from '../../src/jobs/types';

/**
 * 失敗留痕（issue #85「安全與失敗可見性」）。
 *
 * 規則很硬：只留有限的錯誤代碼與已遮罩的摘要。不留原始 exception、stack、
 * payload 或憑證 —— 因為 audit_log 只准追加，寫進去的東西永遠拿不走。
 * 所以這裡要證明：連線字串、密碼、token 都真的會被抹掉，而不是「應該會」。
 */

describe('摘要遮罩', () => {
  it('連線字串內的使用者名稱與密碼會被抹掉', () => {
    const summary = redactErrorSummary(
      'connect ECONNREFUSED postgres://company_os:s3cretpw@db:5432/company_os',
    );

    expect(summary).not.toContain('s3cretpw');
    expect(summary).not.toContain('company_os:');
    expect(summary).toContain('postgres://***@db:5432/company_os');
  });

  it('key=value 形式的密碼、token、金鑰會被抹掉', () => {
    const cases = [
      'password=hunter2',
      'passwd=hunter2',
      'pwd=hunter2',
      'secret=abc123',
      'token=abc123',
      'access_token=abc123',
      'api_key=abc123',
      'apikey=abc123',
      'authorization=Bearer abc123',
    ];

    for (const input of cases) {
      const summary = redactErrorSummary(`連線失敗 ${input} 再試`);

      expect(summary).not.toContain('hunter2');
      expect(summary).not.toContain('abc123');
      expect(summary).toContain('***');
    }
  });

  it('冒號形式一樣遮', () => {
    expect(redactErrorSummary('password: hunter2')).not.toContain('hunter2');
    expect(redactErrorSummary('"password": "hunter2"')).not.toContain('hunter2');
  });

  it('長串十六進位與 base64 會遮掉（看起來是金鑰的東西）', () => {
    const hex = 'a3f5'.repeat(16);
    const base64 = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo=';

    expect(redactErrorSummary(`簽名不符 ${hex}`)).not.toContain(hex);
    expect(redactErrorSummary(`簽名不符 ${base64}`)).not.toContain(base64);
  });

  it('換行與連續空白會壓成一行（不留 stack 的形狀）', () => {
    expect(redactErrorSummary('line1\n  at foo (bar.js:1)\nline2')).toBe('line1 at foo (bar.js:1) line2');
    expect(redactErrorSummary('  太多   空白  ')).toBe('太多 空白');
  });

  it(`長度上限是 ${FAILURE_SUMMARY_MAX_LENGTH}，寧願截斷也不要寫爆`, () => {
    const summary = redactErrorSummary('x'.repeat(1000));

    expect(summary).toHaveLength(FAILURE_SUMMARY_MAX_LENGTH);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('空字串或全空白都回一個可以放進資料庫的值', () => {
    expect(redactErrorSummary('')).toBe('handler 失敗，沒有訊息');
    expect(redactErrorSummary('   ')).toBe('handler 失敗，沒有訊息');
  });
});

describe('錯誤代碼', () => {
  it('JobFailure 用自己的代碼', () => {
    expect(errorCodeFrom(new JobFailure('payload_rejected', '壞了'))).toBe('payload_rejected');
  });

  it('普通 Error 一律是 handler_error，不會把訊息當代碼', () => {
    expect(errorCodeFrom(new Error('boom'))).toBe('handler_error');
    expect(errorCodeFrom('boom')).toBe('handler_error');
    expect(errorCodeFrom(undefined)).toBe('handler_error');
  });

  it('Postgres 的 SQLSTATE 變成可查的代碼（db_23505），原文不留', () => {
    expect(errorCodeFrom({ code: '23505', message: 'duplicate key' })).toBe('db_23505');
    expect(errorCodeFrom({ code: '57P01' })).toBe('db_57p01');
  });

  it('Node 的系統錯誤碼統一小寫（資料庫只收小寫，兩種寫法等於兩個事實）', () => {
    expect(errorCodeFrom({ code: 'ECONNREFUSED' })).toBe('econnrefused');
    expect(errorCodeFrom({ code: 'ETIMEDOUT' })).toBe('etimedout');
    // 長度不符或含奇怪字元的一律當 handler_error，不要讓它變成一個假的代碼。
    expect(errorCodeFrom({ code: 'not a code' })).toBe('handler_error');
  });

  it('代碼格式不合法就即刻擲錯：這是程式錯，不是資料錯', () => {
    expect(() => new JobFailure('Bad Code', 'x')).toThrow(/code/);
    expect(() => new JobFailure('', 'x')).toThrow(/code/);
    expect(() => new JobFailure('a'.repeat(65), 'x')).toThrow(/code/);
  });

  it('JobFailure 預設可以重試，指明 permanent 之後不可以', () => {
    expect(new JobFailure('x', 'y').permanent).toBe(false);
    expect(new JobFailure('x', 'y', { permanent: true }).permanent).toBe(true);
  });
});
