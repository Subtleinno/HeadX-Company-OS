import { describe, expect, it } from 'vitest';
import { isInlineSafe, normalizeContentType } from '../../src/files/content-type';

/**
 * 上傳時 content-type 是檔案類型，下載時決定 inline 還是 attachment。
 * 一律收窄成 type/subtype（丟掉參數），所以用戶提供的標頭不可能帶進回應標頭。
 */
describe('normalizeContentType', () => {
  it('沒有 content-type 時用 application/octet-stream', () => {
    expect(normalizeContentType(undefined)).toBe('application/octet-stream');
    expect(normalizeContentType('')).toBe('application/octet-stream');
    expect(normalizeContentType('   ')).toBe('application/octet-stream');
  });

  it('正常類型原樣保留，大小寫轉小寫', () => {
    expect(normalizeContentType('image/png')).toBe('image/png');
    expect(normalizeContentType('IMAGE/PNG')).toBe('image/png');
  });

  it('丟掉參數：charset 不會帶進資料庫，也不會帶進回應標頭', () => {
    expect(normalizeContentType('text/plain; charset=utf-8')).toBe('text/plain');
    expect(normalizeContentType('application/pdf;q=0.9')).toBe('application/pdf');
  });

  it('前後空白可以接受', () => {
    expect(normalizeContentType('  image/webp  ')).toBe('image/webp');
  });

  it('不是 type/subtype 的一律拒絕（回 null，由呼叫端回 400）', () => {
    expect(normalizeContentType('garbage')).toBeNull();
    expect(normalizeContentType('image/')).toBeNull();
    expect(normalizeContentType('/png')).toBeNull();
    expect(normalizeContentType('image/png/extra')).toBeNull();
    expect(normalizeContentType('image png')).toBeNull();
    expect(normalizeContentType('image/png\r\nx-injected: 1')).toBeNull();
  });

  it('帶 + 與 . 的長類型是合法的', () => {
    expect(
      normalizeContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(normalizeContentType('image/svg+xml')).toBe('image/svg+xml');
  });
});

describe('isInlineSafe', () => {
  it('圖片、影片、音訊、pdf、純文字可以在瀏覽器內顯示', () => {
    for (const contentType of [
      'image/png',
      'image/jpeg',
      'image/svg+xml',
      'video/mp4',
      'audio/mpeg',
      'application/pdf',
      'text/plain',
    ]) {
      expect(isInlineSafe(contentType)).toBe(true);
    }
  });

  it('其餘一律當附件，包括可以做手腳的 text/html', () => {
    for (const contentType of [
      'text/html',
      'application/json',
      'application/octet-stream',
      'application/zip',
      'text/csv',
      'image',
    ]) {
      expect(isInlineSafe(contentType)).toBe(false);
    }
  });
});
