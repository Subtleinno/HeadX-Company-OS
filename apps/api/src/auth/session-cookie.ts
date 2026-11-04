/**
 * Session cookie 的組裝與解析。不用 @fastify/cookie：只需要一個 cookie，格式很固定。
 *
 * HttpOnly：JavaScript 讀不到，XSS 偷不到 token。
 * SameSite=Lax：跨站 POST 不會帶上，配合 Origin 檢查擋 CSRF。
 * 有效期 14 天固定（Max-Age），每次請求都不延長。
 */

export const SESSION_COOKIE_NAME = 'co_session';

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type CookieOptions = {
  /** 經 HTTPS 入口時設 true；本機 http 預設 false，否則瀏覽器不會存。 */
  secure: boolean;
};

export function buildSessionCookie(token: string, options: CookieOptions): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_MS / 1000}`,
  ];

  if (options.secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

export function buildClearSessionCookie(options: CookieOptions): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (options.secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined || cookieHeader === '') {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = part.slice(separator + 1).trim();
    return value === '' ? null : value;
  }

  return null;
}
