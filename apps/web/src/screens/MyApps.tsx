import { useCallback, useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '@company-os/i18n';
import {
  checkAppAccess,
  fetchModules,
  type AccessDecision,
  type ApiFailure,
  type PublicModule,
} from '../api';

/**
 * 我的 Apps（issue 123）。
 *
 * 三條界線，寫在程式裡：
 *
 * 1. **app 清單只有一個來源**：`GET /modules`。前端不抄一份 app 清單，
 *    也不因為 manifest 存在就當它可用。
 * 2. **可不可以入去由後端講**：每個 app 問一次 `GET /app-grants/access/:appId`，
 *    前端只轉述 `{allowed, via}` 或 `{allowed:false, reason}`。前端不自己算授權，
 *    也不因為「我有某個 role」就放行。
 * 3. **查不到就講查不到**：存取判斷本身失敗時，不當成「不允許」（會誤導），
 *    也不當成「允許」（會危險），而是明講查不到與原因。
 *
 * 另外三件如實講的事：
 *   - `available: false` 的 app 仍然列出（它是後端給的），但標明「未啟用」，
 *     而且**不可以入**。六個 manifest 現在全部未啟用，所以一個都入不到。
 *   - 真正跳轉未接駁：後端刻意不公開 manifest 的 `route`，app-host 亦未接線，
 *     所以「進入」是停用的，並寫明原因 —— 不做一個假裝會跳的鍵。
 *   - 403 `password_change_required` 不是「沒有權限」，是未改初始密碼（issue 140 第 4 項）。
 *     這種 403 要如實轉述並給出去 `/account` 的路；其他 403 維持原本的拒絕語意。
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; modules: PublicModule[] }
  | { kind: 'denied'; status: number }
  | { kind: 'passwordChange' }
  | { kind: 'failed'; reasons: string[] };

type AccessState =
  | { kind: 'checking' }
  | { kind: 'allowed'; via: 'owner' | 'grant' }
  | { kind: 'denied'; reason: string }
  | { kind: 'unknown'; detail: string };

/** 後端原因代碼的人話。沒有對應的就只顯示代碼本身，不自己編一句。 */
const REASON_KEYS: Record<string, MessageKey> = {
  app_disabled: 'myapps.access.reason.app_disabled',
  grant_missing: 'myapps.access.reason.grant_missing',
  grant_scope_missing: 'myapps.access.reason.grant_scope_missing',
  identity_disabled: 'myapps.access.reason.identity_disabled',
  role_not_permitted: 'myapps.access.reason.role_not_permitted',
  entry_invalid: 'myapps.access.reason.entry_invalid',
  entry_not_allowed: 'myapps.access.reason.entry_not_allowed',
  entry_disabled: 'myapps.access.reason.entry_disabled',
};

function reasonsOf(failure: ApiFailure, fallback: string): string[] {
  if (failure.kind === 'network') {
    return [t('error.network')];
  }

  if (failure.reasons.length > 0) {
    return failure.reasons;
  }

  if (failure.message !== null) {
    return [failure.message];
  }

  return [failure.error === null ? fallback : `${fallback}（${failure.error}）`];
}

function detailOf(failure: ApiFailure): string {
  if (failure.kind === 'network') {
    return t('error.network');
  }

  return failure.error ?? `HTTP ${failure.status}`;
}

/**
 * 只認「403 + error 代碼」這個組合（issue 140 第 4 項）。
 *
 * 後端 `denyIfPasswordChangePending` 的真實 body 只有
 * `{ error: 'password_change_required' }`，所以判斷的唯一依據是 `error`。
 * 不可以只憑 403 就當成要改密碼（`forbidden`、`entry_*` 等 403 各有原因），
 * 亦不可以用 `message`／`reasons` 入面的字眼猜 —— 那會把其他拒絕講成改密碼。
 */
function isPasswordChangeRequired(failure: ApiFailure): boolean {
  return (
    failure.kind === 'http' && failure.status === 403 && failure.error === 'password_change_required'
  );
}

function kindLabel(kind: string): string {
  return kind === 'console' ? t('myapps.kind.console') : t('myapps.kind.department');
}

/** 一次過問每個 app 的存取，但保留「查不到」與「不允許」的分別。 */
async function decide(modules: readonly PublicModule[]): Promise<Record<string, AccessState>> {
  const results = await Promise.all(
    modules.map(async (module): Promise<[string, AccessState]> => {
      const result = await checkAppAccess(module.id);

      if (result.ok) {
        const decision: AccessDecision = result.data;

        return [
          module.id,
          decision.allowed
            ? { kind: 'allowed', via: decision.via }
            : { kind: 'denied', reason: decision.reason },
        ];
      }

      return [module.id, { kind: 'unknown', detail: detailOf(result.failure) }];
    }),
  );

  return Object.fromEntries(results);
}

export function MyApps() {
  const [list, setList] = useState<LoadState>({ kind: 'loading' });
  const [access, setAccess] = useState<Record<string, AccessState>>({});

  /** 舊回應不可以覆蓋新一輪：每重讀一次就換一個號碼。 */
  const seq = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const mine = seq.current + 1;
    seq.current = mine;

    setList({ kind: 'loading' });
    setAccess({});

    const result = await fetchModules();

    if (mine !== seq.current) {
      return;
    }

    if (!result.ok) {
      if (isPasswordChangeRequired(result.failure)) {
        setList({ kind: 'passwordChange' });

        return;
      }

      if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
        setList({ kind: 'denied', status: result.failure.status });

        return;
      }

      setList({ kind: 'failed', reasons: reasonsOf(result.failure, t('myapps.failed')) });

      return;
    }

    const modules = result.data.modules;
    setList({ kind: 'ready', modules });
    setAccess(Object.fromEntries(modules.map((module) => [module.id, { kind: 'checking' as const }])));

    const decided = await decide(modules);

    if (mine !== seq.current) {
      return;
    }

    setAccess(decided);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="myapps" data-myapps aria-label={t('myapps.title')}>
      <h2 className="myapps__title">{t('myapps.title')}</h2>
      <p className="myapps__lead">{t('myapps.lead')}</p>
      <p className="myapps__note" data-scope-note>
        {t('myapps.scopeNote')}
      </p>

      {list.kind === 'loading' && (
        <p className="myapps__status" role="status" data-myapps-state="loading">
          {t('myapps.loading')}
        </p>
      )}

      {list.kind === 'passwordChange' && (
        <div className="myapps__notice" role="alert" data-myapps-state="password-change-required">
          <p>{t('myapps.passwordChange')}</p>
          <a className="myapps__link" href="#/account" data-myapps-account-link>
            {t('myapps.passwordChange.link')}
          </a>
        </div>
      )}

      {list.kind === 'denied' && (
        <div className="myapps__notice" role="alert" data-myapps-state="denied">
          <p>{list.status === 401 ? t('myapps.sessionExpired') : t('myapps.denied')}</p>
        </div>
      )}

      {list.kind === 'failed' && (
        <div className="myapps__notice" role="alert" data-myapps-state="failed">
          <p>{t('myapps.failed')}</p>
          {list.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          <button
            type="button"
            className="button button--text"
            data-myapps-retry
            onClick={() => {
              void load();
            }}
          >
            {t('admin.retry')}
          </button>
        </div>
      )}

      {list.kind === 'ready' && list.modules.length === 0 && (
        <p className="myapps__status" data-myapps-state="empty">
          {t('myapps.empty')}
        </p>
      )}

      {list.kind === 'ready' && list.modules.length > 0 && (
        <ul className="myapps__list">
          {list.modules.map((module) => {
            const state = access[module.id] ?? { kind: 'checking' as const };
            /**
             * 前端入口未接駁：後端刻意不公開 manifest 的 `route`，app-host 亦未接線。
             * 所以「進入」永遠是停用的 —— 一個按下去不知道去哪裡、或者跳去登入頁的鍵，
             * 比一個停用而寫明原因的鍵更差。
             */
            const canEnter = false;
            /** 只有在「後端話得、但前端未有入口」時才需要多講一句；其餘的阻塞原因已經寫在卡上。 */
            const explainNoEntry = module.available && state.kind === 'allowed';
            const reasonKey = state.kind === 'denied' ? REASON_KEYS[state.reason] : undefined;

            return (
              <li key={module.id} className="myapps__card" data-app-id={module.id}>
                <div className="myapps__text">
                  <p className="myapps__name">{module.title}</p>
                  <p className="myapps__meta">
                    {`id：${module.id} · ${kindLabel(module.kind)}`}
                    {module.department === null ? '' : ` · ${t('myapps.department', { name: module.department })}`}
                  </p>
                  <p className="myapps__meta" data-app-available={module.id}>
                    {module.available ? t('myapps.available.yes') : t('myapps.available.no')}
                  </p>
                  <p className="myapps__access" data-app-access={module.id}>
                    {state.kind === 'checking' && t('myapps.access.checking')}
                    {state.kind === 'allowed' &&
                      (state.via === 'owner'
                        ? t('myapps.access.allowedOwner')
                        : t('myapps.access.allowedGrant'))}
                    {state.kind === 'denied' && t('myapps.access.denied', { reason: state.reason })}
                    {state.kind === 'unknown' && t('myapps.access.unknown', { detail: state.detail })}
                  </p>
                  {reasonKey !== undefined && <p className="myapps__meta">{t(reasonKey)}</p>}
                </div>

                <div className="myapps__action">
                  <button
                    type="button"
                    className="button button--text"
                    data-app-enter={module.id}
                    disabled={!canEnter}
                    onClick={() => {
                      // 未有前端入口（見 myapps.entry.unavailable）。停了這個鍵，
                      // 就不會在按下之後才發現「不知道去哪裡」。
                    }}
                  >
                    {t('myapps.enter')}
                  </button>
                  {canEnter || !explainNoEntry ? null : (
                    <p className="myapps__meta">{t('myapps.entry.unavailable')}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
