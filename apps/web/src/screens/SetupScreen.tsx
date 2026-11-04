import { useRef, useState, type FormEvent } from 'react';
import { submitSetup, type PublicUser } from '../api';
import { Field } from '../components/Field';

/**
 * 建立老闆帳戶。
 *
 * 這個畫面只會出現一次：`setupRequired` 由 API 說，前端不判斷「有沒有老闆」。
 * 前端先驗證四件事（顯示名稱、電郵格式、密碼長度、兩次一致），
 * 後端仍然是最終裁判：400 會帶 `field`，409 代表這部機已經開機。
 */

type Values = {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type FieldKey = keyof Values;
type FieldErrors = Partial<Record<FieldKey, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 與 API 的 isValidEmail 同一套規則，前端只是先擋一次，避免無謂的請求。 */
function isEmail(value: string): boolean {
  const email = value.trim().toLowerCase();

  return email.length > 0 && email.length <= 254 && !email.includes('..') && EMAIL.test(email);
}

function validate(values: Values): FieldErrors {
  const errors: FieldErrors = {};

  if (values.displayName.trim() === '') {
    errors.displayName = '顯示名稱不可空白。';
  }

  if (!isEmail(values.email)) {
    errors.email = '請輸入有效的電郵。';
  }

  if ([...values.password].length < 12) {
    errors.password = '密碼至少需要 12 個字元。';
  }

  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = '兩次輸入的密碼不一致。';
  }

  return errors;
}

const FIELD_ORDER: FieldKey[] = ['displayName', 'email', 'password', 'confirmPassword'];

const API_FIELD_TO_MESSAGE: Record<string, { key: FieldKey; message: string }> = {
  displayName: { key: 'displayName', message: '顯示名稱不可空白。' },
  email: { key: 'email', message: '請輸入有效的電郵。' },
  password: { key: 'password', message: '密碼至少需要 12 個字元。' },
};

type SetupScreenProps = {
  onCreated: (user: PublicUser) => void;
  onAlreadySetUp: () => void;
};

export function SetupScreen({ onCreated, onAlreadySetUp }: SetupScreenProps) {
  const [values, setValues] = useState<Values>({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refs = {
    displayName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirmPassword: useRef<HTMLInputElement>(null),
  };

  function update(key: FieldKey, value: string): void {
    setValues((current) => ({ ...current, [key]: value }));

    // 一改動就把那個欄位的錯誤收起來。留著過時的紅框，使用者會以為改了都沒用，
    // 只有重新載入頁面才消失。
    setErrors((current) => {
      const dependent = key === 'password' && current.confirmPassword !== undefined;

      if (current[key] === undefined && !dependent) {
        return current;
      }

      const next = { ...current };
      delete next[key];

      // 「兩次不一致」取決於兩個欄位，改動任何一邊都會令原本的判斷過時。
      if (key === 'password') {
        delete next.confirmPassword;
      }

      return next;
    });
  }

  function focusFirstError(found: FieldErrors): void {
    const first = FIELD_ORDER.find((key) => found[key] !== undefined);

    if (first !== undefined) {
      refs[first].current?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setFormError(null);

    const found = validate(values);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }

    setSubmitting(true);

    const result = await submitSetup({
      displayName: values.displayName.trim(),
      email: values.email.trim(),
      password: values.password,
    });

    if (result.ok) {
      onCreated(result.data.user);
      return;
    }

    setSubmitting(false);

    if (result.failure.kind === 'network') {
      setFormError('錯誤：無法連線到伺服器，請稍後再試。');
      return;
    }

    if (result.failure.status === 409) {
      onAlreadySetUp();
      return;
    }

    const mapped =
      result.failure.status === 400 && result.failure.field !== null
        ? API_FIELD_TO_MESSAGE[result.failure.field]
        : undefined;

    if (mapped !== undefined) {
      const next: FieldErrors = { [mapped.key]: mapped.message };
      setErrors(next);
      focusFirstError(next);
      return;
    }

    setFormError('錯誤：發生未預期的錯誤，請稍後再試。');
  }

  return (
    <main className="screen">
      <section className="card" aria-labelledby="setup-title">
        <h1 className="card__title" id="setup-title">
          建立老闆帳戶
        </h1>
        <p className="card__description">這個帳戶是整個 Company OS 的老闆，只可以建立一次。</p>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <Field
            id="setup-name"
            label="顯示名稱"
            value={values.displayName}
            autoComplete="name"
            error={errors.displayName}
            autoFocus
            disabled={submitting}
            inputRef={refs.displayName}
            onChange={(value) => update('displayName', value)}
          />
          <Field
            id="setup-email"
            label="電郵"
            type="email"
            value={values.email}
            autoComplete="email"
            error={errors.email}
            disabled={submitting}
            inputRef={refs.email}
            onChange={(value) => update('email', value)}
          />
          <Field
            id="setup-password"
            label="密碼"
            type="password"
            value={values.password}
            autoComplete="new-password"
            error={errors.password}
            disabled={submitting}
            inputRef={refs.password}
            onChange={(value) => update('password', value)}
          />
          <Field
            id="setup-confirm"
            label="再輸入一次密碼"
            type="password"
            value={values.confirmPassword}
            autoComplete="new-password"
            error={errors.confirmPassword}
            disabled={submitting}
            inputRef={refs.confirmPassword}
            onChange={(value) => update('confirmPassword', value)}
          />

          {formError !== null && (
            <p className="form__error" aria-live="polite">
              {formError}
            </p>
          )}

          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting ? '建立中…' : '建立老闆帳戶'}
          </button>
        </form>
      </section>
    </main>
  );
}
