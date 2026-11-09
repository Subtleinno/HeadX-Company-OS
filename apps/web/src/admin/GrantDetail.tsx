import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchAppGrant, type ApiFailure, type GrantView, type UnitScope } from '../api';

/**
 * 授權單筆詳情（issue 166）。頁內唯讀區，唔新增路由、唔新增 modal。
 *
 * 資料一律以 `GET /api/app-grants/:id` 嘅回應為唯一來源，唔用列表快照。
 * 後端對非法 UUID、不存在或 canSee 唔允許一律回 404，畫面唔區分原因，
 * 只顯示一般搵唔到，唔推斷記錄存在、唔透露越權或已刪除。
 *
 * 競態保護：每次換目標或重載都先清空上一筆，並用 `cancelled` 丟棄
 * 舊目標同已關閉詳情嘅慢回應，所以舊回應唔會覆蓋新目標，關閉之後
 * 亦唔會重新打開詳情；失敗唔會保留上一筆資料冒充本筆。
 */

type DetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; grant: GrantView }
  | { kind: 'unauthorized' }
  | { kind: 'passwordRequired' }
  | { kind: 'denied'; reasons: string[] }
  | { kind: 'notFound' }
  | { kind: 'failed'; reasons: string[] };

function serverReasons(failure: Extract<ApiFailure, { kind: 'http' }>): string[] {
  if (failure.reasons.length > 0) {
    return failure.reasons;
  }

  return failure.message === null ? [] : [failure.message];
}

function formatAt(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('zh-HK', { dateStyle: 'short', timeStyle: 'short' });
}

function roleLabel(role: string): string {
  return role === 'app_admin' ? t('grant.role.app_admin') : t('grant.role.member');
}

function stateLabel(state: string): string {
  const keys: Record<
    string,
    | 'grant.state.requested'
    | 'grant.state.approved'
    | 'grant.state.active'
    | 'grant.state.rejected'
    | 'grant.state.revoked'
  > = {
    requested: 'grant.state.requested',
    approved: 'grant.state.approved',
    active: 'grant.state.active',
    rejected: 'grant.state.rejected',
    revoked: 'grant.state.revoked',
  };

  const key = keys[state];

  return key === undefined ? state : t(key);
}

function scopeKindLabel(kind: string): string {
  if (kind === 'all') {
    return t('grant.scope.all');
  }

  return t(kind === 'units' ? 'grant.scope.units' : 'grant.scope.subtree');
}

function scopeText(scope: UnitScope): string {
  if (scope.kind === 'all') {
    return t('grant.scope.all');
  }

  return t('grant.scope.note', {
    kind: scopeKindLabel(scope.kind),
    count: scope.unitIds.length,
  });
}

export type GrantDetailProps = {
  grantId: string;
  onBack: () => void;
};

export function GrantDetail({ grantId, onBack }: GrantDetailProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<DetailState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    setState({ kind: 'loading' });

    void (async () => {
      const result = await fetchAppGrant(grantId);

      if (cancelled) {
        return;
      }

      if (result.ok) {
        setState({ kind: 'ready', grant: result.data.grant });

        return;
      }

      const failure = result.failure;

      if (failure.kind === 'network') {
        setState({ kind: 'failed', reasons: [t('error.network')] });

        return;
      }

      if (failure.status === 401) {
        setState({ kind: 'unauthorized' });

        return;
      }

      if (failure.status === 404) {
        setState({ kind: 'notFound' });

        return;
      }

      if (failure.status === 403 && failure.error === 'password_change_required') {
        setState({ kind: 'passwordRequired' });

        return;
      }

      if (failure.status === 403) {
        setState({ kind: 'denied', reasons: serverReasons(failure) });

        return;
      }

      const reasons = serverReasons(failure);
      setState({ kind: 'failed', reasons: reasons.length > 0 ? reasons : [t('error.unexpected')] });
    })();

    return () => {
      cancelled = true;
    };
  }, [grantId, reloadKey]);

  return (
    <section className="grant-detail" data-grant-detail aria-label={t('grant.detail.title')}>
      <div className="grant-detail__head">
        <h2 className="grant-detail__title">{t('grant.detail.title')}</h2>
        <div className="grant-detail__actions">
          <button
            type="button"
            className="button button--text"
            data-grant-detail-back
            onClick={onBack}
          >
            {t('grant.detail.back')}
          </button>
          <button
            type="button"
            className="button button--text"
            data-grant-detail-reload
            onClick={() => {
              setReloadKey((key) => key + 1);
            }}
          >
            {t('grant.reload')}
          </button>
        </div>
      </div>

      {state.kind === 'loading' && (
        <p className="admin-status" role="status" data-detail-state="loading">
          {t('status.loading')}
        </p>
      )}

      {state.kind === 'unauthorized' && (
        <div className="admin-notice admin-notice--failed" role="alert" data-detail-state="unauthorized">
          <p className="admin-notice__text">{t('grant.sessionExpired')}</p>
        </div>
      )}

      {state.kind === 'passwordRequired' && (
        <div className="admin-notice" role="alert" data-detail-state="passwordRequired">
          <p className="admin-notice__text">{t('account.mustChange.gate')}</p>
          <a className="grant-detail__link" href="#/account">
            {t('myapps.passwordChange.link')}
          </a>
        </div>
      )}

      {state.kind === 'denied' && (
        <div className="admin-notice admin-notice--failed" role="alert" data-detail-state="denied">
          <p className="admin-notice__text">{t('grant.denied')}</p>
          {state.reasons.map((reason) => (
            <p key={reason} className="admin-notice__reason">
              {reason}
            </p>
          ))}
        </div>
      )}

      {state.kind === 'notFound' && (
        <div className="admin-notice" role="alert" data-detail-state="notFound">
          <p className="admin-notice__text">{t('grant.detail.notFound')}</p>
        </div>
      )}

      {state.kind === 'failed' && (
        <div className="admin-notice admin-notice--failed" role="alert" data-detail-state="failed">
          <p className="admin-notice__text">{t('grant.detail.loadFailed')}</p>
          {state.reasons.map((reason) => (
            <p key={reason} className="admin-notice__reason">
              {reason}
            </p>
          ))}
          <div className="admin-notice__action">
            <button
              type="button"
              className="button button--text"
              data-grant-detail-retry
              onClick={() => {
                setReloadKey((key) => key + 1);
              }}
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
      )}

      {state.kind === 'ready' && <GrantFields grant={state.grant} />}
    </section>
  );
}

function GrantFields({ grant }: { grant: GrantView }) {
  const noValue = t('grant.detail.noValue');

  return (
    <>
      <dl className="grant-detail__fields" data-grant-detail-fields>
        <div className="grant-detail__field">
          <dt>{t('grant.label.beneficiary')}</dt>
          <dd data-field="beneficiaryId">{grant.userId ?? grant.agentId ?? noValue}</dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.label.app')}</dt>
          <dd data-field="appId">{grant.appId}</dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.column.role')}</dt>
          <dd data-field="role">{roleLabel(grant.role)}</dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.column.scope')}</dt>
          <dd data-field="scope">{scopeText(grant.scope)}</dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.column.state')}</dt>
          <dd data-field="state">{stateLabel(grant.state)}</dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.column.version')}</dt>
          <dd data-field="version">{grant.version}</dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.time.requested')}</dt>
          <dd data-field="requestedAt">{formatAt(grant.requestedAt)}</dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.time.approved')}</dt>
          <dd data-field="approvedAt">
            {grant.approvedAt === null ? noValue : formatAt(grant.approvedAt)}
          </dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.time.activated')}</dt>
          <dd data-field="activatedAt">
            {grant.activatedAt === null ? noValue : formatAt(grant.activatedAt)}
          </dd>
        </div>
        <div className="grant-detail__field">
          <dt>{t('grant.time.revoked')}</dt>
          <dd data-field="revokedAt">
            {grant.revokedAt === null ? noValue : formatAt(grant.revokedAt)}
          </dd>
        </div>
      </dl>

      <p className="grant-detail__line" data-field="rejectionReason">
        {t('grant.rejectionReason', { reason: grant.rejectionReason ?? noValue })}
      </p>
      <p className="grant-detail__line" data-field="replacesId">
        {grant.replacesId === null ? noValue : t('grant.supersede', { id: grant.replacesId })}
      </p>
    </>
  );
}
