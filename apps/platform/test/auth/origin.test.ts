import { describe, expect, it } from 'vitest';
import { isSameOrigin } from '../../src/auth/origin';

describe('same-origin 判斷', () => {
  it('沒有 Origin 就放行：curl 與伺服器對伺服器不會帶', () => {
    expect(isSameOrigin(undefined, '127.0.0.1:4420')).toBe(true);
  });

  it('host 相同就放行，大小寫不敏感', () => {
    expect(isSameOrigin('https://Example.COM:8443', 'example.com:8443')).toBe(true);
  });

  it('端口不同就拒絕', () => {
    expect(isSameOrigin('http://127.0.0.1:4210', '127.0.0.1:4420')).toBe(false);
  });

  it('主機不同就拒絕', () => {
    expect(isSameOrigin('http://evil.example', '127.0.0.1:4420')).toBe(false);
  });

  it('Origin 是 null（sandboxed iframe）就拒絕', () => {
    expect(isSameOrigin('null', '127.0.0.1:4420')).toBe(false);
  });

  it('Origin 不是合法網址就拒絕', () => {
    expect(isSameOrigin('not a url', '127.0.0.1:4420')).toBe(false);
  });

  it('有 Origin 但沒有 Host 就拒絕', () => {
    expect(isSameOrigin('http://127.0.0.1:4420', undefined)).toBe(false);
  });
});
