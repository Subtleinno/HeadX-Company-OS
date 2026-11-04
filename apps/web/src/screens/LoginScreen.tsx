import { useRef, useState, type FormEvent } from 'react';
import { ScreenFrame } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { Field } from '@company-os/ui-kit';
import { submitLogin, type PublicUser } from '../api';

/**
 * 登入。
 *
 * 401 一律同一句話，不透露是電郵還是密碼錯；429 用 API 給的 Retry-After
 * 換算成分鐘（進位），不自己猜鎖多久。
 *
 * 卡片框架來自 app-shell、欄位來自 ui-kit、文字來自 i18n（#73 R3）；
 * 畫面、順序、文字與改動前完全一樣。
 */

type LoginScreenProps = {
  onSignedIn: (user: PublicUser) => void;
  /** 例如 409 之後帶過來的「已經有老闆帳戶，請登入。」。 */
  notice?: string | null;
};

export function LoginScreen({ onSignedIn, notice = null }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  /**
   * 一改動就收起上一輪的錯誤：留著過時的紅字會令人以為改了都沒用。
   * 401 那一句同樣收起——它是對上一次送出的判定，改了內容就不再成立。
   * 429 的分鐘數只是提示文字，鎖在伺服器那邊，下一次送出仍然會拿到 429。
   */
  function updateEmail(value: string): void {
    setEmail(value);
    setEmailError(undefined);
    setFormError(null);
  }

  function updatePassword(value: string): void {
    setPassword(value);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setFormError(null);
    setEmailError(undefined);
    setSubmitting(true);

    const result = await submitLogin({ email: email.trim(), password });

    if (result.ok) {
      onSignedIn(result.data.user);
      return;
    }

    setSubmitting(false);

    if (result.failure.kind === 'network') {
      setFormError(t('error.network'));
      return;
    }

    if (result.failure.status === 401) {
      setFormError(t('login.invalidCredentials'));
      return;
    }

    if (result.failure.status === 429) {
      const seconds = result.failure.retryAfterSeconds ?? 60;
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      setFormError(t('login.tooManyAttempts', { minutes }));
      return;
    }

    if (result.failure.status === 400 && result.failure.field === 'email') {
      setEmailError(t('login.emailInvalid'));
      emailRef.current?.focus();
      return;
    }

    setFormError(t('error.unexpected'));
  }

  return (
    <ScreenFrame titleId="login-title" title={t('login.title')}>
      {notice !== null && (
        <p className="notice" aria-live="polite">
          {notice}
        </p>
      )}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <Field
          id="login-email"
          label={t('common.email')}
          type="email"
          value={email}
          autoComplete="username"
          error={emailError}
          autoFocus
          disabled={submitting}
          inputRef={emailRef}
          onChange={updateEmail}
        />
        <Field
          id="login-password"
          label={t('common.password')}
          type="password"
          value={password}
          autoComplete="current-password"
          disabled={submitting}
          onChange={updatePassword}
        />

        {formError !== null && (
          <p className="form__error" aria-live="polite">
            {formError}
          </p>
        )}

        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </ScreenFrame>
  );
}
