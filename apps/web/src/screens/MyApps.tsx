import { t, type MessageKey } from '@company-os/i18n';
import { useSharedAppList } from '../frame/FrameApps';

/**
 * 我的 Apps（issue 123；F-03／issue 160 改為共用讀取）。
 *
 * 三條界線，寫在程式裡：
 *
 * 1. **app 清單只有一個來源**：`GET /modules`。讀取已經搬去
 *    `frame/useAppList.ts`，由 `FrameApps` 一次過做，selector 同呢一頁
 *    共用同一份結果；呢一頁唔可以自己再讀、唔可以存副本。
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

function kindLabel(kind: string): string {
  return kind === 'console' ? t('myapps.kind.console') : t('myapps.kind.department');
}

export function MyApps() {
  const { list, access, reload } = useSharedAppList();

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
            onClick={reload}
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
