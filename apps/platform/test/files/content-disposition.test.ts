import { describe, expect, it } from 'vitest';
import { buildContentDisposition, encodeRfc5987 } from '../../src/files/content-disposition';

/**
 * Content-Disposition 是唯一會把「用戶提供的字串」放進回應標頭的地方。
 * 報廢的寫法（直接把檔名插進 filename="..."）會被引號、換行與控制字元注入，
 * 所以這裡逐個情況驗：輸出永遠是單行，而且 ASCII 後備裡沒有引號與控制字元。
 */
describe('buildContentDisposition：安全類型用 inline', () => {
  it('一般 ASCII 檔名', () => {
    expect(buildContentDisposition('report.txt', 'text/plain')).toBe(
      `inline; filename="report.txt"; filename*=UTF-8''report.txt`,
    );
  });

  it('中文檔名：ASCII 後備用 _ 取代，完整檔名放在 filename*', () => {
    expect(buildContentDisposition('報告.txt', 'application/pdf')).toBe(
      `inline; filename="__.txt"; filename*=UTF-8''%E5%A0%B1%E5%91%8A.txt`,
    );
  });

  it('圖片與影片也是 inline', () => {
    expect(buildContentDisposition('a.png', 'image/png')).toContain('inline;');
    expect(buildContentDisposition('a.mp4', 'video/mp4')).toContain('inline;');
  });
});

describe('buildContentDisposition：不安全的類型強制 attachment', () => {
  it('text/html 不會在瀏覽器內打開', () => {
    expect(buildContentDisposition('x.html', 'text/html')).toContain('attachment;');
  });

  it('未知類型也是 attachment', () => {
    expect(buildContentDisposition('x.bin', 'application/octet-stream')).toContain('attachment;');
    expect(buildContentDisposition('x.json', 'application/json')).toContain('attachment;');
  });
});

describe('buildContentDisposition：不能造成標頭注入', () => {
  it('引號被取代，不會提早結束 filename="..."', () => {
    const header = buildContentDisposition('a"b.txt', 'text/plain');

    expect(header).toContain(`filename="a_b.txt"`);
    // filename* 內是百分號編碼，引號不會原樣出現。
    expect(header).toContain(`filename*=UTF-8''a%22b.txt`);
  });

  it('CRLF 不會出現在標頭內', () => {
    const header = buildContentDisposition('a\r\nb.txt', 'text/plain');

    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
    expect(header).toContain('filename="a__b.txt"');
  });

  it('控制字元被取代', () => {
    const header = buildContentDisposition('a\u0001b\u007f.txt', 'text/plain');

    expect(header).toContain('filename="a_b_.txt"');

    for (const character of header) {
      const code = character.codePointAt(0) ?? 0;
      expect(code >= 0x20 && code !== 0x7f).toBe(true);
    }
  });

  it('反斜線被取代（有些瀏覽器會當成路徑分隔）', () => {
    expect(buildContentDisposition('C:\\temp\\a.txt', 'text/plain')).toContain(
      'filename="C:_temp_a.txt"',
    );
  });

  it('超長檔名不會讓標頭爆掉，而且仍然只有一行', () => {
    const header = buildContentDisposition(`${'a'.repeat(255)}.txt`, 'text/plain');

    expect(header.split('\r\n')).toHaveLength(1);
    expect(header).toContain('filename*=UTF-8\'\'');
    expect(header.length).toBeLessThan(1000);
  });

  it('空檔名仍然產生合法的標頭，不擲錯', () => {
    expect(buildContentDisposition('', 'text/plain')).toBe(
      `inline; filename="_"; filename*=UTF-8''`,
    );
  });
});

describe('encodeRfc5987', () => {
  it('只保留 attr-char，其餘一律百分號編碼', () => {
    expect(encodeRfc5987('a b.txt')).toBe('a%20b.txt');
    expect(encodeRfc5987('(1).txt')).toBe('%281%29.txt');
    expect(encodeRfc5987("it's.txt")).toBe('it%27s.txt');
    expect(encodeRfc5987('a#b$c&d+e-f.g^h_i`j|k~l.txt')).toBe('a#b$c&d+e-f.g^h_i`j|k~l.txt');
  });

  it('中文用 UTF-8 位元組編碼', () => {
    expect(encodeRfc5987('報告.txt')).toBe('%E5%A0%B1%E5%91%8A.txt');
  });
});
