import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FrameShell } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { Field } from '@company-os/ui-kit';
import {
  fetchMe,
  submitChangePassword,
  submitLogout,
  type ApiFailure,
  type PublicUser,
} from '../api';
import { FORMAL_APPS, MAIN_NAV_ROUTE, mainNavItems, type MainNavKey } from '../frame/nav';
import { useFrameChrome } from '../frame/useFrameChrome';
import { navigate } from '../router';

/**
 * 個人帳戶與安全（issue 124）。
 *
 * 三條界線寫在程式裡：
 *
 * 1. **資料只有一個來源**：`GET /me`。不是 `/auth/state`（那是外殼的開機判斷，
 *    未登入時也回 200，分不出「未登入」與「讀取失敗」），也不是網址的品牌段
 *    —— 個人帳戶是公司共用身份，換品牌不會換人。
 * 2. **失敗照實講**：舊密碼錯是 403、session 失效是 401、名額用完是 429、
 *    系統忙是 503。四種壓成同一句「發生錯誤」就等於叫用戶亂試。
 * 3. **密碼只在表單裡存活**：不進 storage、不進網址、不進 console、不進錯誤訊息；
 *    任何一次提交失敗都清空兩個密碼欄（issue 2026-11-07 增補的清理規則）。
 *
 * 刻意不做的事：改姓名／電郵（後端沒有這條 API）、登出所有裝置（同上）、
 * MFA／忘記密碼（issue 明文不做）。頁面上如實講，不做假按鈕。
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; user: PublicUser }
  | { kind: 'notSignedIn' }
  | { kind: 'untrusted' }
  | { kind: 'failed'; reasons: string[] };

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string };

type AccountScreenProps = {
  /** 外殼帶進來的身份。頁內顯示的資料仍然以 `/me` 為準。 */
  user: PublicUser;
  onSignedOut: () => void;
  /** 改密碼成功之後，把後端回的新狀態交回外殼（`mustChangePassword` 已變 false）。 */
  onUserChanged: (user: PublicUser) => void;
  onBack: () => void;
};

function reasonsOf(failure: ApiFailure): string[] {
  if (failure.kind === 'network') {
    return [t('error.network')];
  }

  if (failure.reasons.length > 0) {
    return failure.reasons;
  }

  if (failure.message !== null) {
    return [failure.message];
  }

  return [
    failure.error === null ? t('error.unexpected') : `${t('error.unexpected')}（${failure.error}）`,
  ];
}

/**
 * 改密碼失敗的人話。
 *
 * 422 的 `field` 與 `reason` 直接對應後端的規則（`password.ts` 的 12 位與
 * 「不可以與現在相同」），所以這裡只是翻譯，不另立門檻。
 */
function changeFailureMessage(failure: ApiFailure): string {
  if (failure.kind === 'network') {
    return t('error.network');
  }

  if (failure.status === 401) {
    return t('account.notSignedIn');
  }

  if (failure.status === 429) {
    const seconds = failure.retryAfterSeconds ?? 60;

    return t('account.throttle', { minutes: Math.max(1, Math.ceil(seconds / 60)) });
  }

  if (failure.status === 403) {
    return failure.error === 'invalid_current_password'
      ? t('account.error.wrongCurrent')
      : t('account.untrusted');
  }

  if (failure.status === 409) {
    return t('account.error.changedElsewhere');
  }

  if (failure.status === 503) {
    return t('account.error.busy');
  }

  if (failure.status === 422) {
    const reason = failure.reasons[0];

    if (failure.field === 'currentPassword') {
      return t('account.error.missingCurrent');
    }

    if (reason === 'too_short') {
      return t('account.error.tooShort');
    }

    if (reason === 'same_as_current') {
      return t('account.error.sameAsCurrent');
    }

    // 未知欄位那類：後端自己寫的中文理由，原樣顯示，不改寫。
    if (failure.reasons.length > 0) {
      return failure.reasons.join('；');
    }
  }

  return t('error.unexpected');
}

export function AccountScreen({ user, onSignedOut, onUserChanged, onBack }: AccountScreenProps) {
  const chrome = useFrameChrome();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const currentRef = useRef<HTMLInputElement>(null);
  /** 舊回應不可以覆蓋新一輪。 */
  const seq = useRef(0);

  const loadMe = useCallback(async (): Promise<void> => {
    const mine = seq.current + 1;
    seq.current = mine;

    setLoad({ kind: 'loading' });

    const result = await fetchMe();

    if (mine !== seq.current) {
      return;
    }

    if (result.ok) {
      setLoad({ kind: 'ready', user: result.data.user });

      return;
    }

    if (result.failure.kind === 'http') {
      if (result.failure.status === 401) {
        setLoad({ kind: 'notSignedIn' });

        return;
      }

      if (result.failure.status === 403 && result.failure.error === 'entry_untrusted') {
        setLoad({ kind: 'untrusted' });

        return;
      }
    }

    setLoad({ kind: 'failed', reasons: reasonsOf(result.failure) });
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  /** 有未提交的密碼輸入。用兩個字串本身判斷，不另存一個會過期的旗標。 */
  const dirty = current !== '' || next !== '';

  /**
   * 真的離開頁面（重新載入、關分頁）時由瀏覽器提示。
   * 站內導航走 `confirmLeave()`，因為 hash 路由不會觸發 `beforeunload`。
   */
  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);

    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  function confirmLeave(): boolean {
    return !dirty || window.confirm(t('account.leave.confirm'));
  }

  function leave(): void {
    if (confirmLeave()) {
      onBack();
    }
  }

  async function handleSignOut(): Promise<void> {
    if (signingOut || !confirmLeave()) {
      return;
    }

    setSignOutError(null);
    setSigningOut(true);

    const result = await submitLogout();

    if (result.ok) {
      onSignedOut();

      return;
    }

    setSigningOut(false);
    setSignOutError(
      result.failure.kind === 'network' ? t('error.network') : t('account.logout.failed'),
    );
  }

  function clearPasswords(): void {
    setCurrent('');
    setNext('');
  }

  /**
   * 失敗之後把焦點移回舊密碼欄。
   *
   * 不可以直接在 `clearPasswords()` 裡面 focus：提交期間兩個輸入是 disabled 的，
   * 而 focus() 對 disabled 的元素無效 —— 會被靜靜吞掉，焦點留在送出鍵上。
   * 所以等這一次 render 落地、輸入重新可用之後才移動焦點。
   */
  useEffect(() => {
    if (submit.kind === 'failed') {
      currentRef.current?.focus();
    }
  }, [submit]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submit.kind === 'submitting') {
      return;
    }

    if (current === '' || next === '') {
      setSubmit({ kind: 'failed', message: t('account.password.empty') });

      return;
    }

    setSubmit({ kind: 'submitting' });

    const result = await submitChangePassword({ currentPassword: current, newPassword: next });

    if (result.ok) {
      setSubmit({ kind: 'done' });
      clearPasswords();
      setLoad({ kind: 'ready', user: result.data.user });
      onUserChanged(result.data.user);

      return;
    }

    // 任何失敗都清空：留在記憶體裡的密碼不會因為多留一秒而變得安全。
    setSubmit({ kind: 'failed', message: changeFailureMessage(result.failure) });
    clearPasswords();
  }

  const shown = load.kind === 'ready' ? load.user : null;
  /** 未改密碼的人在這個狀態下除了改密碼，什麼都做不了（後端一律 403）。 */
  const gate = shown !== null && shown.mustChangePassword === true;

  return (
    <FrameShell
      apps={FORMAL_APPS}
      currentAppId=""
      onSelectApp={() => undefined}
      moduleTabs={mainNavItems(user.role === 'owner')}
      currentModuleTabKey="account"
      onSelectModuleTab={(key) => {
        // 主選單係真導覽，但切走之前照舊經 confirmLeave() 保護未提交的密碼輸入。
        if (key === 'account' || !confirmLeave()) {
          return;
        }

        const route = MAIN_NAV_ROUTE[key as MainNavKey];

        if (route !== undefined) {
          navigate(route);
        }
      }}
      theme={chrome.theme}
      onToggleTheme={chrome.onToggleTheme}
      /**
       * 頂欄的名字：`/me` 答過就以它為準；未答之前先用外殼帶入的身份（那只是
       * 「這次 session 以為你是誰」）；一旦 `/me` 講未登入或入口不可信就留空
       * —— 一邊說「你未登入」一邊在頂欄寫你的名字，是同一個畫面上兩個矛盾的事實。
       * 空白／缺值由外殼如實顯示「名稱未提供」，唔用頭像或首字 fallback。
       */
      account={{
        displayName: shown?.displayName ?? (load.kind === 'loading' ? user.displayName : ''),
        signingOut,
      }}
      onSignOut={() => void handleSignOut()}
      sidebarOpen={chrome.sidebarOpen}
      onToggleSidebar={chrome.onToggleSidebar}
      modulePages={[]}
      currentPageKey={null}
      onSelectPage={() => undefined}
    >
        <header className="account__header">
          <h1 className="account__title">{t('account.title')}</h1>
          <p className="account__lead">{t('account.lead')}</p>
          <button type="button" className="button button--text" data-account-back onClick={leave}>
            {t('account.back')}
          </button>
        </header>

        {gate && (
          <p className="account__gate" role="status" data-account-gate>
            {t('account.mustChange.gate')}
          </p>
        )}

        {load.kind === 'loading' && (
          <p className="account__status" role="status" data-account-state="loading">
            {t('account.loading')}
          </p>
        )}

        {load.kind === 'notSignedIn' && (
          <div className="account__notice" role="alert" data-account-state="not-signed-in">
            <p>{t('account.notSignedIn')}</p>
            <button type="button" className="button button--primary" onClick={onSignedOut}>
              {t('account.signIn')}
            </button>
          </div>
        )}

        {load.kind === 'untrusted' && (
          <div className="account__notice" role="alert" data-account-state="untrusted">
            <p>{t('account.untrusted')}</p>
          </div>
        )}

        {load.kind === 'failed' && (
          <div className="account__notice" role="alert" data-account-state="failed">
            <p>{t('account.failed')}</p>
            {load.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            <button
              type="button"
              className="button button--text"
              data-account-retry
              onClick={() => {
                void loadMe();
              }}
            >
              {t('admin.retry')}
            </button>
          </div>
        )}

        {shown !== null && (
          <>
            <section className="account__group" aria-label={t('account.title')}>
              <dl className="account__fields">
                <dt>{t('account.name')}</dt>
                <dd data-account-name>{shown.displayName}</dd>
                <dt>{t('common.email')}</dt>
                <dd data-account-email>{shown.email}</dd>
                <dt>{t('account.role')}</dt>
                <dd data-account-role>
                  {shown.role === 'owner' ? t('account.role.owner') : t('account.role.staff')}
                </dd>
                <dt>{t('account.id')}</dt>
                <dd data-account-id>{shown.id}</dd>
                <dt>{t('account.mustChange.label')}</dt>
                <dd data-account-must-change>
                  {shown.mustChangePassword === true && t('account.mustChange.pending')}
                  {shown.mustChangePassword === false && t('account.mustChange.done')}
                  {shown.mustChangePassword === undefined && t('account.mustChange.unknown')}
                </dd>
              </dl>
              <p className="account__note">{t('account.readonly')}</p>
            </section>

            <section className="account__group" aria-label={t('account.password.title')}>
              <h2 className="account__group-title">{t('account.password.title')}</h2>
              <p className="account__note">{t('account.password.lead')}</p>

              <form
                className="account__form"
                onSubmit={(event) => void handleSubmit(event)}
                noValidate
              >
                <Field
                  id="account-current-password"
                  label={t('account.password.current')}
                  type="password"
                  value={current}
                  autoComplete="current-password"
                  disabled={submit.kind === 'submitting'}
                  inputRef={currentRef}
                  onChange={(value) => {
                    setCurrent(value);
                    setSubmit({ kind: 'idle' });
                  }}
                />
                <Field
                  id="account-new-password"
                  label={t('account.password.next')}
                  type="password"
                  value={next}
                  autoComplete="new-password"
                  disabled={submit.kind === 'submitting'}
                  onChange={(value) => {
                    setNext(value);
                    setSubmit({ kind: 'idle' });
                  }}
                />

                <button
                  type="submit"
                  className="button button--primary"
                  data-account-submit
                  disabled={submit.kind === 'submitting'}
                >
                  {submit.kind === 'submitting'
                    ? t('account.password.submitting')
                    : t('account.password.submit')}
                </button>
              </form>

              {submit.kind === 'done' && (
                <p className="account__done" role="status" data-account-done>
                  {t('account.password.done')}
                </p>
              )}

              {submit.kind === 'failed' && (
                <p className="account__error" role="alert" data-account-error>
                  {submit.message}
                </p>
              )}

              <p className="account__note">{t('account.password.clearNote')}</p>
            </section>

            <section className="account__group" aria-label={t('account.logout.title')}>
              <h2 className="account__group-title">{t('account.logout.title')}</h2>
              <p className="account__note">{t('account.logout.lead')}</p>
              {signOutError !== null && (
                <p className="account__error" role="alert" data-account-signout-error>
                  {signOutError}
                </p>
              )}
            </section>
          </>
        )}
    </FrameShell>
  );
}
