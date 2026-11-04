import { useRef, useState, type FormEvent } from 'react';
import { submitLogin, type PublicUser } from '../api';
import { Field } from '../components/Field';

/**
 * 登入。
 *
 * 401 一律同一句話，不透露是電郵還是密碼錯；429 用 API 給的 Retry-After
 * 換算成分鐘（進位），不自己猜鎖多久。
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
      setFormError('錯誤：無法連線到伺服器，請稍後再試。');
      return;
    }

    if (result.failure.status === 401) {
      setFormError('錯誤：電郵或密碼不正確。');
      return;
    }

    if (result.failure.status === 429) {
      const seconds = result.failure.retryAfterSeconds ?? 60;
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      setFormError(`錯誤：嘗試次數過多，請在 ${minutes} 分鐘後再試。`);
      return;
    }

    if (result.failure.status === 400 && result.failure.field === 'email') {
      setEmailError('請輸入有效的電郵。');
      emailRef.current?.focus();
      return;
    }

    setFormError('錯誤：發生未預期的錯誤，請稍後再試。');
  }

  return (
    <main className="screen">
      <section className="card" aria-labelledby="login-title">
        <h1 className="card__title" id="login-title">
          登入 Company OS
        </h1>

        {notice !== null && (
          <p className="notice" aria-live="polite">
            {notice}
          </p>
        )}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <Field
            id="login-email"
            label="電郵"
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
            label="密碼"
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
            {submitting ? '登入中…' : '登入'}
          </button>
        </form>
      </section>
    </main>
  );
}
