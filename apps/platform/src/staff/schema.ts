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

const RESET_FIELDS = ['ownerPassword', 'newTemporaryPassword'] as const;

export type ResetPasswordInput = {
  ownerPassword: string;
  newTemporaryPassword: string;
};

/**
 * 老闆重設員工密碼的輸入（issue #86）。
 *
 * 只收兩個欄位，而且都不可以空白：`ownerPassword` 是「重新驗證老闆本人」的唯一來源，
 * 前端沒有任何旗標可以代替它。多一個欄位就拒絕 —— 特別是 `mustChangePassword`，
 * 那個一定是 true，不應該由呼叫者決定。
 */
export function parseResetPasswordInput(raw: unknown): ParseResult<ResetPasswordInput> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, RESET_FIELDS, 'body');

  const ownerPassword = typeof raw.ownerPassword === 'string' ? raw.ownerPassword : '';

  if (ownerPassword === '') {
    errors.push('ownerPassword 不可以是空白');
  }

  const newTemporaryPassword =
    typeof raw.newTemporaryPassword === 'string' ? raw.newTemporaryPassword : '';

  if (validatePassword(newTemporaryPassword) !== null) {
    errors.push('newTemporaryPassword 太短（最少 12 個字）');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { errors: [], value: { ownerPassword, newTemporaryPassword } };
}

const DEPARTMENT_FIELDS = ['department'] as const;

/** 與 app id／schema 名同一套規則（`apps/platform/src/db-access/naming.ts`）。 */
const DEPARTMENT_KEY = /^[a-z][a-z0-9_]{0,40}$/;

export type SetDepartmentInput = {
  /** null 代表「未指派」；這是一個合法值，不是「沒有填」。 */
  department: string | null;
};

/**
 * 指派員工部門的輸入（issue #12）。
 *
 * 這支只負責**形狀**：body 只有一個鍵、值是字串或 null、字串不是空白而且符合
 * schema 命名規則。值本身存不存在於 registry，是路由的事 —— 部門清單的唯一
 * 來源是 manifest，不是這支檔案裡的一份常數。
 *
 * 空白字串刻意不是「取消指派」：要取消就傳 null。把兩個意思混在同一個值，
 * 將來一定有人以為自己清空了、其實只是打錯。
 */
export function parseDepartmentInput(raw: unknown): ParseResult<SetDepartmentInput> {
  if (!isRecord(raw)) {
    return { errors: ['body 必須是一個物件'] };
  }

  const errors = unknownFields(raw, DEPARTMENT_FIELDS, 'body');

  if (!('department' in raw)) {
    return { errors: [...errors, 'department 必須存在（未指派請傳 null）'] };
  }

  const value = raw.department;

  if (value === null) {
    return errors.length > 0 ? { errors } : { errors: [], value: { department: null } };
  }

  if (typeof value !== 'string') {
    return { errors: [...errors, 'department 必須是字串或 null'] };
  }

  const department = value.trim();

  if (department === '') {
    return { errors: [...errors, 'department 不可以是空白（未指派請傳 null）'] };
  }

  if (!DEPARTMENT_KEY.test(department)) {
    return { errors: [...errors, `department 格式不對：${JSON.stringify(value)}`] };
  }

  return errors.length > 0 ? { errors } : { errors: [], value: { department } };
}

