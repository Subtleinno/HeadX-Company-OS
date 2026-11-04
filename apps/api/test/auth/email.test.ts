import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail } from '../../src/auth/email';

describe('email', () => {
  it('一律轉小寫並去掉前後空白', () => {
    expect(normalizeEmail('  Boss@Example.COM ')).toBe('boss@example.com');
  });

  it.each(['boss@example.com', 'a.b+tag@sub.example.co.uk'])('接受 %s', (value) => {
    expect(isValidEmail(value)).toBe(true);
  });

  it.each([
    '',
    'boss',
    'boss@',
    '@example.com',
    'boss@example',
    'boss example@example.com',
    'a@b@c.com',
    'boss@example..com',
  ])('拒絕 %s', (value) => {
    expect(isValidEmail(value)).toBe(false);
  });

  it('超過 254 個字元就拒絕', () => {
    const local = 'a'.repeat(250);

    expect(isValidEmail(`${local}@example.com`)).toBe(false);
  });

  it('前後空白不影響判斷', () => {
    expect(isValidEmail('  boss@example.com  ')).toBe(true);
  });
});
