import { useRef, useState, type FormEvent } from 'react';
import { ScreenFrame } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { Field } from '@company-os/ui-kit';
import { submitSetup, type PublicUser } from '../api';

/**
 * 建立老闆帳戶。
 *
 * 這個畫面只會出現一次：`setupRequired` 由 API 說，前端不判斷「有沒有老闆」。
 * 前端先驗證四件事（顯示名稱、電郵格式、密碼長度、兩次一致），
 * 後端仍然是最終裁判：400 會帶 `field`，409 代表這部機已經開機。
 *
 * 框架、欄位、文字分別來自 app-shell、ui-kit、i18n（#73 R3）；行為不變。
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
    errors.displayName = t('setup.error.displayNameRequired');
  }

  if (!isEmail(values.email)) {
    errors.email = t('setup.error.emailInvalid');
  }

  if ([...values.password].length < 12) {
    errors.password = t('setup.error.passwordTooShort');
  }

  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = t('setup.error.passwordMismatch');
  }

  return errors;
}

const FIELD_ORDER: FieldKey[] = ['displayName', 'email', 'password', 'confirmPassword'];

/** 後端 400 帶回來的欄位名 → 顯示哪一句、標在哪一個欄位。 */
function apiFieldMessage(field: string): { key: FieldKey; message: string } | undefined {
  const messages: Record<string, { key: FieldKey; message: string }> = {
    displayName: { key: 'displayName', message: t('setup.error.displayNameRequired') },
    email: { key: 'email', message: t('setup.error.emailInvalid') },
    password: { key: 'password', message: t('setup.error.passwordTooShort') },
  };

  return messages[field];
}

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
      setFormError(t('error.network'));
      return;
    }

    if (result.failure.status === 409) {
      onAlreadySetUp();
      return;
    }

    const mapped =
      result.failure.status === 400 && result.failure.field !== null
        ? apiFieldMessage(result.failure.field)
        : undefined;

    if (mapped !== undefined) {
      const next: FieldErrors = { [mapped.key]: mapped.message };
      setErrors(next);
      focusFirstError(next);
      return;
    }

    setFormError(t('error.unexpected'));
  }

  return (
    <ScreenFrame
      titleId="setup-title"
      title={t('setup.title')}
      description={t('setup.description')}
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        <Field
          id="setup-name"
          label={t('setup.displayName')}
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
          label={t('common.email')}
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
          label={t('common.password')}
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
          label={t('setup.confirmPassword')}
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
          {submitting ? t('setup.submitting') : t('setup.submit')}
        </button>
      </form>
    </ScreenFrame>
  );
}
