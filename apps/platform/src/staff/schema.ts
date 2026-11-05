import { isValidEmail, normalizeEmail } from '../auth/email.js';
import { validatePassword } from '../auth/password.js';
import { isRecord, unknownFields, type ParseResult } from '../pagination.js';

/**
 * 員工 API 的輸入驗證（issue #84）。
 *
 * 與 #83 同一個原則：未知欄位一律拒絕。這裡特別重要 —— 建立帳戶的 body 是最容易
 * 被塞 `role: 'owner'` 或 `department` 的地方，而「打錯字的欄位被靜靜忽略」
 * 等於讓人以為自己設定了某些東西。
 */

export { parsePageQuery, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../pagination.js';
export type { PageQuery, ParseResult } from '../pagination.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CREATE_FIELDS = ['displayName', 'email', 'initialPassword'] as const;

export const DISPLAY_NAME_MAX_LENGTH = 100;

export type CreateStaffInput = {
  displayName: string;
  email: string;
  initialPassword: string;
};

export function parseCreateStaffInput(raw: unknown): ParseResult<CreateStaffInput> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, CREATE_FIELDS, 'body');

  const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';

  if (displayName === '') {
    errors.push('displayName 不可以是空白');
  } else if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    errors.push(`displayName 最多 ${DISPLAY_NAME_MAX_LENGTH} 個字`);
  }

  const rawEmail = typeof raw.email === 'string' ? raw.email : '';

  if (!isValidEmail(rawEmail)) {
    errors.push('email 格式不對');
  }

  const initialPassword = typeof raw.initialPassword === 'string' ? raw.initialPassword : '';

  if (validatePassword(initialPassword) !== null) {
    errors.push('initialPassword 太短（最少 12 個字）');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    value: {
      displayName,
      email: normalizeEmail(rawEmail),
      initialPassword,
    },
  };
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
