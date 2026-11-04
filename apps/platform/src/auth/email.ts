/**
 * email 一律正規化（去空白、轉小寫）之後才儲存與比對，
 * 否則 Boss@Example.com 與 boss@example.com 會變成兩個帳戶。
 */

const MAX_LENGTH = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);

  if (email.length === 0 || email.length > MAX_LENGTH) {
    return false;
  }

  // 連續的點在 DNS 不合法，也幾乎一定是打錯。
  if (email.includes('..')) {
    return false;
  }

  return EMAIL.test(email);
}
