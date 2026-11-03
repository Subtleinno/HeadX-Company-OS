import { describe, expect, it } from 'vitest';
import { parseRange, RangeNotSatisfiableError } from '../../src/storage/range';

/**
 * parseRange 是純函式：把 HTTP Range 標頭換成要讀的位元組區間。
 * 這些測試不需要 MinIO，也不需要網路。
 */
describe('parseRange', () => {
  it('bytes=0-99 回傳該區段（HTTP 206）', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
  });

  it('bytes=-500 是最後 500 bytes，不是由 0 開始', () => {
    expect(parseRange('bytes=-500', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('suffix 長過整個物件時回傳整個物件', () => {
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('bytes=900- 由 900 讀到結尾', () => {
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('結尾超出物件長度時夾到最後一個位元組', () => {
    expect(parseRange('bytes=0-99999', 1000)).toEqual({ start: 0, end: 999 });
  });

  // 這個測試在「越界回 0 到 total-1」的實作下會失敗，證明 416 真的做得到。
  it('起始位置等於或超出長度時擲出 RangeNotSatisfiableError（HTTP 416）', () => {
    expect(() => parseRange('bytes=1000-1100', 1000)).toThrow(RangeNotSatisfiableError);

    try {
      parseRange('bytes=1000-1100', 1000);
      expect.unreachable('應該要擲出錯誤');
    } catch (error) {
      expect(error).toBeInstanceOf(RangeNotSatisfiableError);
      expect((error as RangeNotSatisfiableError).total).toBe(1000);
      expect((error as RangeNotSatisfiableError).contentRange).toBe('bytes */1000');
    }
  });

  it('bytes=-0 沒有可讀區段，擲出錯誤', () => {
    expect(() => parseRange('bytes=-0', 1000)).toThrow(RangeNotSatisfiableError);
  });

  it('空物件任何區段都不成立', () => {
    expect(() => parseRange('bytes=0-0', 0)).toThrow(RangeNotSatisfiableError);
  });

  it('多段 range 不支援，擲出錯誤而不是靜靜取第一段', () => {
    expect(() => parseRange('bytes=0-9,20-29', 1000)).toThrow(RangeNotSatisfiableError);
  });

  it('格式錯誤的標頭擲出錯誤', () => {
    expect(() => parseRange('bytes=abc', 1000)).toThrow(RangeNotSatisfiableError);
    expect(() => parseRange('items=0-9', 1000)).toThrow(RangeNotSatisfiableError);
    expect(() => parseRange('bytes=50-10', 1000)).toThrow(RangeNotSatisfiableError);
    expect(() => parseRange('bytes=-', 1000)).toThrow(RangeNotSatisfiableError);
  });

  it('總長度不是非負整數時擲出 TypeError（呼叫端的程式錯誤）', () => {
    expect(() => parseRange('bytes=0-1', -1)).toThrow(TypeError);
    expect(() => parseRange('bytes=0-1', 1.5)).toThrow(TypeError);
  });
});
