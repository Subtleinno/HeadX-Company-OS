import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@company-os/i18n';
import { Selector } from '@company-os/ui-kit';
import {
  checkAgentAccess,
  createAgent,
  createAgentGrant,
  createStaff,
  disableAgent,
  disableStaff,
  fetchAgentGrants,
  fetchAgents,
  fetchModules,
  fetchOrgUnits,
  fetchStaff,
  resetStaffPassword,
  revokeAgentGrant,
  type AccessDecision,
  type AgentIdentity,
  type ApiFailure,
  type GrantView,
  type OrgUnit,
  type PublicModule,
  type StaffMember,
  type UnitScope,
} from '../api';

/**
 * 員工與 agent（issue 121，Boss portal 管理區）。
 *
 * 三條界線，寫在程式裡：
 *
 * 1. **公司名冊，不是品牌帳戶庫**。員工與 agent 不隨品牌複製；這一頁不做
 *    「這個人屬於哪個品牌」的推斷（品牌身份契約未定，見 issue 120）。
 * 2. **只接已核實的動作**。沒有改 email／改角色／搬部門／刪除／重新啟用，
 *    也沒有邀請信、密碼重設信、自動 onboarding。後端沒有，這裡就不畫。
 *    唯一例外是「重設密碼」：它會撤銷 session、不寄信、也不會恢復停用帳戶，
 *    畫面必須把這三件事講清楚。
 * 3. **秘密只活在表單那一次請求裡**。老闆自己的密碼與臨時密碼只存在該對話框的
 *    局部 state，不進任何全域狀態、不寫 log、成功或失敗後即清空。
 *
 * agent 的授權範圍（scope）是**既有授權範圍**，不是目前 Workspace，也不是
 * 公司型／品牌型。前端不另算一套，也不因選了品牌自動填範圍。
 */

const PAGE_SIZE = 20;

type LoadState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; reasons: string[] }
  | { kind: 'denied'; status: number };

type ActionState =
  | { kind: 'idle' }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; reasons: string[] };

/** 後端有些錯誤只回一個代碼（不是逐條理由）。這些代碼有對應的人話。 */
const ERROR_MESSAGES: Record<string, () => string> = {
  duplicate_email: () => t('staff.create.duplicateEmail'),
  already_disabled: () => t('staff.disable.already'),
  owner_protected: () => t('staff.reset.ownerProtected'),
  invalid_owner_password: () => t('staff.reset.wrongOwnerPassword'),
  stale_credentials: () => t('staff.reset.staleCredentials'),
  duplicate_name: () => t('agent.create.duplicate'),
  agent_disabled: () => t('agent.grants.agentDisabled'),
  duplicate_grant: () => t('agent.grants.duplicate'),
  conflict: () => t('agent.grants.conflict'),
  not_found: () => t('staff.loadFailed'),
};

/**
 * 把失敗講成人話。次序：逐條理由（後端原文）→ 已知代碼 → 通用句子。
 * 任何情況都不會回一個空字串，也不會假裝成功。
 */
function reasonsOf(failure: ApiFailure, fallback: string): string[] {
  if (failure.kind === 'network') {
    return [t('error.network')];
  }

  if (failure.status === 429 && failure.retryAfterSeconds !== null) {
    return [t('login.tooManyAttempts', { minutes: Math.max(1, Math.ceil(failure.retryAfterSeconds / 60)) })];
  }

  if (failure.reasons.length > 0) {
    return failure.reasons;
  }

  const known = failure.error === null ? undefined : ERROR_MESSAGES[failure.error];

  if (known !== undefined) {
    return [known()];
  }

  return [failure.error === null ? fallback : `${fallback}（${failure.error}）`];
}

function formatAt(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('zh-HK', { dateStyle: 'short', timeStyle: 'short' });
}

/** 範圍講成人話。`all` 與「指定單位」是兩種不同的事實，不可以互相代替。 */
function scopeText(scope: UnitScope): string {
  return scope.kind === 'all'
    ? t('agent.grants.scopeAllNote')
    : t('agent.grants.scopeNote', {
        kind: t(scope.kind === 'units' ? 'agent.grants.scopeUnits' : 'agent.grants.scopeSubtree'),
        count: scope.unitIds.length,
      });
}

export type StaffAgentsScreenProps = {
  onDirtyCountChange: (count: number) => void;
};

type Tab = 'staff' | 'agents';

export function StaffAgentsScreen({ onDirtyCountChange }: StaffAgentsScreenProps) {
  const [tab, setTab] = useState<Tab>('staff');
  const [staffDirty, setStaffDirty] = useState(0);
  const [agentDirty, setAgentDirty] = useState(0);
  /** 有未儲存修改時攔下來的切換；用戶放棄才會做。 */
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);

  const dirty = staffDirty + agentDirty;

  useEffect(() => {
    onDirtyCountChange(dirty);
  }, [dirty, onDirtyCountChange]);

  return (
    <div className="page page--wide">
      <div className="page__head">
        <h1 className="page__title">{t('staff.title')}</h1>
        <p className="page__sub">{t('staff.lead')}</p>
      </div>

      <div className="admin-tabs" role="tablist" aria-label={t('staff.title')}>
        {(
          [
            ['staff', 'staff.tab.staff'],
            ['agents', 'staff.tab.agents'],
          ] as const
        ).map(([key, labelKey]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="admin-tab"
            aria-selected={tab === key}
            onClick={() => {
              if (key === tab) {
                return;
              }

              if (dirty > 0) {
                setPendingTab(key);

                return;
              }

              setTab(key);
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {tab === 'staff' ? (
        <StaffPanel onDirty={setStaffDirty} />
      ) : (
        <AgentsPanel onDirty={setAgentDirty} />
      )}

      {pendingTab !== null && (
        <div className="admin-scrim">
          <div
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-unsaved-title"
            tabIndex={-1}
            ref={(node) => {
              node?.focus();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setPendingTab(null);
              }
            }}
          >
            <p className="shell-popover__label">{t('admin.nav')}</p>
            <h2 className="admin-dialog__title" id="staff-unsaved-title">
              {t('admin.unsaved.title')}
            </h2>
            <p className="admin-dialog__body">{t('admin.unsaved.body')}</p>
            <p className="admin-dialog__body">{t('admin.unsaved.dirtyCount', { count: dirty })}</p>
            <div className="admin-dialog__actions">
              <button
                type="button"
                className="button button--text"
                onClick={() => {
                  setPendingTab(null);
                }}
              >
                {t('admin.unsaved.stay')}
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  const next = pendingTab;

                  setPendingTab(null);
                  setStaffDirty(0);
                  setAgentDirty(0);
                  setTab(next);
                }}
              >
                {t('admin.unsaved.leave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 員工 ─────────────────────────────────────────────────────────────── */

function StaffPanel({ onDirty }: { onDirty: (count: number) => void }) {
  const [page, setPage] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [list, setList] = useState<LoadState<{ staff: StaffMember[]; total: number }>>({
    kind: 'loading',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });
  const [dialog, setDialog] = useState<{ kind: 'disable' | 'reset'; staff: StaffMember } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setList({ kind: 'loading' });

    const result = await fetchStaff({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });

    if (result.ok) {
      setList({ kind: 'ready', data: result.data });

      return;
    }

    if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
      setList({ kind: 'denied', status: result.failure.status });

      return;
    }

    setList({ kind: 'failed', reasons: reasonsOf(result.failure, t('staff.loadFailed')) });
  }, [page]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  function afterMutation(message: string): void {
    setAction({ kind: 'done', message });
    setReloadKey((key) => key + 1);
  }

  const total = list.kind === 'ready' ? list.data.total : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="admin-group" aria-label={t('staff.tab.staff')}>
      <div className="admin-group__head">
        <h2 className="admin-group__title">{t('staff.tab.staff')}</h2>
        <div className="admin-group__actions">
          <span className="admin-row__state">{list.kind === 'ready' ? t('staff.total', { count: total }) : null}</span>
          <button
            type="button"
            className="button button--text"
            onClick={() => {
              setCreateOpen((open) => !open);
              setAction({ kind: 'idle' });
            }}
          >
            {t('staff.create')}
          </button>
        </div>
      </div>

      <p className="admin-row__reason">{t('staff.ownerNote')}</p>

      {action.kind === 'done' && (
        <p className="admin-notice" role="status">
          {action.message}
        </p>
      )}

      {action.kind === 'failed' && (
        <div className="admin-notice admin-notice--failed" role="alert">
          {action.reasons.map((reason) => (
            <p key={reason} className="admin-notice__reason">
              {reason}
            </p>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateStaffForm
          onDirty={onDirty}
          onCancel={() => {
            setCreateOpen(false);
            onDirty(0);
          }}
          onCreated={() => {
            setCreateOpen(false);
            onDirty(0);
            afterMutation(t('staff.create.done'));
          }}
          onFailed={(reasons) => {
            setAction({ kind: 'failed', reasons });
          }}
        />
      )}

      {list.kind === 'loading' && (
        <p className="admin-status" role="status">
          {t('staff.loading')}
        </p>
      )}

      {(list.kind === 'denied' || list.kind === 'failed') && (
        <div className="admin-notice admin-notice--failed" role="alert">
          <p className="admin-notice__text">
            {list.kind === 'denied'
              ? list.status === 401
                ? t('admin.sessionExpired')
                : t('staff.denied')
              : t('staff.loadFailed')}
          </p>
          {list.kind === 'failed' &&
            list.reasons.map((reason) => (
              <p key={reason} className="admin-notice__reason">
                {reason}
              </p>
            ))}
          {list.kind === 'failed' && (
            <button
              type="button"
              className="button button--text admin-notice__action"
              onClick={() => {
                setReloadKey((key) => key + 1);
              }}
            >
              {t('admin.retry')}
            </button>
          )}
        </div>
      )}

      {list.kind === 'ready' && list.data.staff.length === 0 && (
        <p className="page__empty">{t('staff.empty')}</p>
      )}

      {list.kind === 'ready' && list.data.staff.length > 0 && (
        <ul className="admin-list">
          {list.data.staff.map((member) => {
            const isDisabled = member.disabledAt !== null;

            return (
              <li key={member.id} className="admin-row admin-row--staff" data-staff-id={member.id}>
                <div className="admin-row__text">
                  <p className="admin-row__label">{member.displayName}</p>
                  <p className="admin-row__purpose">{member.email}</p>
                  <p className="admin-row__reason">
                    {`${t('staff.field.id')}：${member.id}`}
                  </p>
                </div>

                <div className="admin-row__control">
                  <p className="admin-row__reason">{`${t('staff.field.role')}：${member.role}`}</p>
                  <p className="admin-row__reason">
                    {`${t('staff.field.mustChange')}？${
                      member.mustChangePassword ? t('staff.mustChange.yes') : t('staff.mustChange.no')
                    }`}
                  </p>
                  <p className="admin-row__reason">
                    {`${t('staff.field.state')}：${
                      member.disabledAt === null
                        ? t('staff.state.active')
                        : t('staff.state.disabledAt', { at: formatAt(member.disabledAt) })
                    }`}
                  </p>
                  <p className="admin-row__reason">
                    {`${t('staff.field.createdAt')}：${formatAt(member.createdAt)}`}
                  </p>
                </div>

                <div className="admin-row__actions">
                  <button
                    type="button"
                    className="button button--text"
                    disabled={isDisabled}
                    onClick={() => {
                      setDialog({ kind: 'reset', staff: member });
                      setAction({ kind: 'idle' });
                    }}
                  >
                    {t('staff.reset')}
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={isDisabled}
                    onClick={() => {
                      setDialog({ kind: 'disable', staff: member });
                      setAction({ kind: 'idle' });
                    }}
                  >
                    {t('staff.disable')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {list.kind === 'ready' && total > 0 && (
        <div className="admin-pager">
          <button
            type="button"
            className="button button--text"
            disabled={page === 0}
            onClick={() => {
              setPage((current) => Math.max(0, current - 1));
            }}
          >
            {t('staff.pager.prev')}
          </button>
          <span className="admin-row__state">{t('staff.pager.info', { page: page + 1, pages })}</span>
          <button
            type="button"
            className="button button--text"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => {
              setPage((current) => current + 1);
            }}
          >
            {t('staff.pager.next')}
          </button>
        </div>
      )}

      {dialog?.kind === 'disable' && (
        <Dialog
          id="staff-disable-title"
          title={t('staff.disable.title')}
          body={[t('staff.disable.body')]}
          confirmLabel={t('staff.disable.confirm')}
          danger
          onCancel={() => {
            setDialog(null);
          }}
          onConfirm={() => {
            void (async () => {
              const result = await disableStaff(dialog.staff.id);

              setDialog(null);

              if (result.ok) {
                afterMutation(t('staff.disable.done'));

                return;
              }

              setAction({ kind: 'failed', reasons: reasonsOf(result.failure, t('staff.loadFailed')) });
            })();
          }}
        />
      )}

      {dialog?.kind === 'reset' && (
        <ResetPasswordDialog
          staff={dialog.staff}
          onCancel={() => {
            setDialog(null);
          }}
          onDone={() => {
            setDialog(null);
            afterMutation(t('staff.reset.done'));
          }}
        />
      )}
    </section>
  );
}

function CreateStaffForm({
  onCreated,
  onCancel,
  onFailed,
  onDirty,
}: {
  onCreated: () => void;
  onCancel: () => void;
  onFailed: (reasons: string[]) => void;
  onDirty: (count: number) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordCleared, setPasswordCleared] = useState(false);

  const dirty =
    displayName !== '' || email !== '' || initialPassword !== '' ? 1 : 0;

  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  // 離開這一頁就不要再留住半張表單的「未儲存」狀態。
  useEffect(() => () => {
    onDirty(0);
  }, [onDirty]);

  async function submit(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setPasswordCleared(false);

    const result = await createStaff({
      displayName: displayName.trim(),
      email: email.trim(),
      initialPassword,
    });

    setBusy(false);

    if (result.ok) {
      setDisplayName('');
      setEmail('');
      setInitialPassword('');
      onCreated();

      return;
    }

    // 非秘密欄位留住（改一個字就可以再送）；密碼一定要清走。
    setInitialPassword('');
    setPasswordCleared(true);
    onFailed(reasonsOf(result.failure, t('staff.loadFailed')));
  }

  return (
    <div className="admin-form">
      <p className="admin-row__reason">{t('staff.create.hint')}</p>

      <label className="admin-field">
        <span className="admin-field__label">{t('staff.field.displayName')}</span>
        <input
          className="input"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
          }}
        />
      </label>

      <label className="admin-field">
        <span className="admin-field__label">{t('staff.field.email')}</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </label>

      <label className="admin-field">
        <span className="admin-field__label">{t('staff.field.initialPassword')}</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={initialPassword}
          onChange={(event) => {
            setInitialPassword(event.target.value);
          }}
        />
      </label>

      {passwordCleared && <p className="admin-row__reason">{t('staff.create.passwordCleared')}</p>}

      <div className="admin-form__actions">
        <button type="button" className="button button--text" onClick={onCancel}>
          {t('admin.cancel')}
        </button>
        <button type="button" className="button button--primary" disabled={busy} onClick={() => void submit()}>
          {busy ? t('staff.create.busy') : t('staff.create.submit')}
        </button>
      </div>
    </div>
  );
}

/**
 * 重設員工密碼。
 *
 * 兩個欄位都只是這一刻的輸入：不寫入任何全域狀態、不記 log、不留在畫面。
 * 失敗或成功之後都清空，要求重新輸入 —— 一個被留在畫面上的臨時密碼，
 * 比沒有重設過更危險。
 */
function ResetPasswordDialog({
  staff,
  onCancel,
  onDone,
}: {
  staff: StaffMember;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [ownerPassword, setOwnerPassword] = useState('');
  const [temporary, setTemporary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[]>([]);

  async function submit(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setError([]);

    const result = await resetStaffPassword(staff.id, {
      ownerPassword,
      newTemporaryPassword: temporary,
    });

    setBusy(false);
    setOwnerPassword('');
    setTemporary('');

    if (result.ok) {
      onDone();

      return;
    }

    // 失敗只在對話框裡面講一次：同一個理由在頁頂再印一次，會令人以為發生咗兩件事。
    setError(reasonsOf(result.failure, t('agent.access.failed')));
  }

  return (
    <div className="admin-scrim">
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-reset-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
      >
        <p className="shell-popover__label">{staff.displayName}</p>
        <h2 className="admin-dialog__title" id="staff-reset-title">
          {t('staff.reset.title')}
        </h2>

        <p className="admin-dialog__body">{t('staff.reset.noticeChange')}</p>
        <p className="admin-dialog__body">{t('staff.reset.noticeSession')}</p>
        <p className="admin-dialog__body">{t('staff.reset.noticeMail')}</p>

        <label className="admin-field">
          <span className="admin-field__label">{t('staff.reset.ownerPassword')}</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={ownerPassword}
            onChange={(event) => {
              setOwnerPassword(event.target.value);
            }}
          />
        </label>

        <label className="admin-field">
          <span className="admin-field__label">{t('staff.reset.tempPassword')}</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={temporary}
            onChange={(event) => {
              setTemporary(event.target.value);
            }}
          />
        </label>

        {error.length > 0 && (
          <div className="admin-row__failure" role="alert">
            {error.map((reason) => (
              <p key={reason} className="admin-row__reason">
                {reason}
              </p>
            ))}
          </div>
        )}

        <div className="admin-dialog__actions">
          <button type="button" className="button button--text" onClick={onCancel}>
            {t('admin.cancel')}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={busy || ownerPassword === '' || temporary === ''}
            onClick={() => void submit()}
          >
            {t('staff.reset.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Agent ────────────────────────────────────────────────────────────── */

function AgentsPanel({ onDirty }: { onDirty: (count: number) => void }) {
  const [page, setPage] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [list, setList] = useState<LoadState<{ agents: AgentIdentity[]; total: number }>>({
    kind: 'loading',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<AgentIdentity | null>(null);

  /** 授權的 appId 可選值只可以由 `GET /modules` 來：授權路由用同一個 registry 驗證。 */
  const [modules, setModules] = useState<LoadState<PublicModule[]>>({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setList({ kind: 'loading' });

    const result = await fetchAgents({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });

    if (result.ok) {
      setList({ kind: 'ready', data: result.data });

      return;
    }

    if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
      setList({ kind: 'denied', status: result.failure.status });

      return;
    }

    setList({ kind: 'failed', reasons: reasonsOf(result.failure, t('agent.loadFailed')) });
  }, [page]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    void (async () => {
      const result = await fetchModules();

      if (result.ok) {
        setModules({ kind: 'ready', data: result.data.modules });

        return;
      }

      setModules({ kind: 'failed', reasons: reasonsOf(result.failure, t('agent.loadFailed')) });
    })();
  }, []);

  function afterMutation(message: string): void {
    setAction({ kind: 'done', message });
    setReloadKey((key) => key + 1);
  }

  const total = list.kind === 'ready' ? list.data.total : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = list.kind === 'ready' ? list.data.agents.find((item) => item.id === selectedId) : undefined;

  return (
    <section className="admin-group" aria-label={t('staff.tab.agents')}>
      <div className="admin-group__head">
        <h2 className="admin-group__title">{t('staff.tab.agents')}</h2>
        <div className="admin-group__actions">
          <span className="admin-row__state">{list.kind === 'ready' ? t('agent.total', { count: total }) : null}</span>
          <button
            type="button"
            className="button button--text"
            onClick={() => {
              setCreateOpen((open) => !open);
              setAction({ kind: 'idle' });
            }}
          >
            {t('agent.create')}
          </button>
        </div>
      </div>

      <p className="admin-row__reason">{t('agent.note')}</p>

      {action.kind === 'done' && (
        <p className="admin-notice" role="status">
          {action.message}
        </p>
      )}

      {action.kind === 'failed' && (
        <div className="admin-notice admin-notice--failed" role="alert">
          {action.reasons.map((reason) => (
            <p key={reason} className="admin-notice__reason">
              {reason}
            </p>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateAgentForm
          onDirty={onDirty}
          onCancel={() => {
            setCreateOpen(false);
            onDirty(0);
          }}
          onCreated={() => {
            setCreateOpen(false);
            onDirty(0);
            afterMutation(t('agent.create.done'));
          }}
          onFailed={(reasons) => {
            setAction({ kind: 'failed', reasons });
          }}
        />
      )}

      {list.kind === 'loading' && (
        <p className="admin-status" role="status">
          {t('agent.loading')}
        </p>
      )}

      {(list.kind === 'denied' || list.kind === 'failed') && (
        <div className="admin-notice admin-notice--failed" role="alert">
          <p className="admin-notice__text">
            {list.kind === 'denied'
              ? list.status === 401
                ? t('admin.sessionExpired')
                : t('staff.denied')
              : t('agent.loadFailed')}
          </p>
          {list.kind === 'failed' &&
            list.reasons.map((reason) => (
              <p key={reason} className="admin-notice__reason">
                {reason}
              </p>
            ))}
          {list.kind === 'failed' && (
            <button
              type="button"
              className="button button--text admin-notice__action"
              onClick={() => {
                setReloadKey((key) => key + 1);
              }}
            >
              {t('admin.retry')}
            </button>
          )}
        </div>
      )}

      {list.kind === 'ready' && list.data.agents.length === 0 && <p className="page__empty">{t('agent.empty')}</p>}

      {list.kind === 'ready' && list.data.agents.length > 0 && (
        <ul className="admin-list">
          {list.data.agents.map((agent) => {
            const isDisabled = agent.disabledAt !== null;

            return (
              <li key={agent.id} className="admin-row admin-row--staff" data-agent-id={agent.id}>
                <div className="admin-row__text">
                  <p className="admin-row__label">{agent.name}</p>
                  <p className="admin-row__reason">{`${t('staff.field.id')}：${agent.id}`}</p>
                </div>

                <div className="admin-row__control">
                  <p className="admin-row__reason">
                    {`${t('staff.field.state')}：${
                      agent.disabledAt === null
                        ? t('staff.state.active')
                        : t('staff.state.disabledAt', { at: formatAt(agent.disabledAt) })
                    }`}
                  </p>
                  <p className="admin-row__reason">
                    {`${t('staff.field.createdAt')}：${formatAt(agent.createdAt)}`}
                  </p>
                </div>

                <div className="admin-row__actions">
                  <button
                    type="button"
                    className="button button--text"
                    aria-expanded={agent.id === selectedId}
                    onClick={() => {
                      setSelectedId((current) => (current === agent.id ? null : agent.id));
                      setAction({ kind: 'idle' });
                    }}
                  >
                    {t('agent.manage')}
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={isDisabled}
                    onClick={() => {
                      setDisableTarget(agent);
                      setAction({ kind: 'idle' });
                    }}
                  >
                    {t('agent.disable')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {list.kind === 'ready' && total > 0 && (
        <div className="admin-pager">
          <button
            type="button"
            className="button button--text"
            disabled={page === 0}
            onClick={() => {
              setPage((current) => Math.max(0, current - 1));
            }}
          >
            {t('staff.pager.prev')}
          </button>
          <span className="admin-row__state">{t('staff.pager.info', { page: page + 1, pages })}</span>
          <button
            type="button"
            className="button button--text"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => {
              setPage((current) => current + 1);
            }}
          >
            {t('staff.pager.next')}
          </button>
        </div>
      )}

      {selected !== undefined && (
        <AgentGrantsPanel
          key={selected.id}
          agent={selected}
          modules={modules}
          onChanged={(message) => {
            afterMutation(message);
          }}
          onFailed={(reasons) => {
            setAction({ kind: 'failed', reasons });
          }}
        />
      )}

      {disableTarget !== null && (
        <Dialog
          id="agent-disable-title"
          title={t('agent.disable.title')}
          body={[t('agent.disable.body')]}
          confirmLabel={t('agent.disable.confirm')}
          danger
          onCancel={() => {
            setDisableTarget(null);
          }}
          onConfirm={() => {
            void (async () => {
              const result = await disableAgent(disableTarget.id);

              setDisableTarget(null);

              if (result.ok) {
                afterMutation(t('agent.disable.done'));

                return;
              }

              setAction({ kind: 'failed', reasons: reasonsOf(result.failure, t('agent.loadFailed')) });
            })();
          }}
        />
      )}
    </section>
  );
}

function CreateAgentForm({
  onCreated,
  onCancel,
  onFailed,
  onDirty,
}: {
  onCreated: () => void;
  onCancel: () => void;
  onFailed: (reasons: string[]) => void;
  onDirty: (count: number) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const dirty = name === '' ? 0 : 1;

  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  useEffect(() => () => {
    onDirty(0);
  }, [onDirty]);

  async function submit(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);

    const result = await createAgent({ name: name.trim() });

    setBusy(false);

    if (result.ok) {
      setName('');
      onCreated();

      return;
    }

    onFailed(reasonsOf(result.failure, t('agent.loadFailed')));
  }

  return (
    <div className="admin-form">
      <p className="admin-row__reason">{t('agent.create.hint')}</p>

      <label className="admin-field">
        <span className="admin-field__label">{t('staff.field.displayName')}</span>
        <input
          className="input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>

      <div className="admin-form__actions">
        <button type="button" className="button button--text" onClick={onCancel}>
          {t('admin.cancel')}
        </button>
        <button type="button" className="button button--primary" disabled={busy} onClick={() => void submit()}>
          {busy ? t('staff.create.busy') : t('staff.create.submit')}
        </button>
      </div>
    </div>
  );
}

/* ── agent 授權子介面 ─────────────────────────────────────────────────── */

type ScopeKind = 'all' | 'units' | 'subtree';

function AgentGrantsPanel({
  agent,
  modules,
  onChanged,
  onFailed,
}: {
  agent: AgentIdentity;
  modules: LoadState<PublicModule[]>;
  onChanged: (message: string) => void;
  onFailed: (reasons: string[]) => void;
}) {
  const [grants, setGrants] = useState<LoadState<{ grants: GrantView[]; total: number }>>({
    kind: 'loading',
  });
  const [reloadKey, setReloadKey] = useState(0);

  const [appId, setAppId] = useState<string | null>(null);
  const [scopeKind, setScopeKind] = useState<ScopeKind | null>(null);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [units, setUnits] = useState<LoadState<OrgUnit[]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string[]>([]);

  const [accessAppId, setAccessAppId] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessDecision | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState<string[]>([]);

  const [revokeTarget, setRevokeTarget] = useState<GrantView | null>(null);

  /** 舊回應不可以覆蓋新目標：換 agent 就換號碼（元件用 key 重掛，這裡仍然保留一層）。 */
  const seq = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    seq.current += 1;
    const current = seq.current;

    setGrants({ kind: 'loading' });

    const result = await fetchAgentGrants(agent.id, { limit: PAGE_SIZE, offset: 0 });

    if (current !== seq.current) {
      return;
    }

    if (result.ok) {
      setGrants({ kind: 'ready', data: result.data });

      return;
    }

    if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
      setGrants({ kind: 'denied', status: result.failure.status });

      return;
    }

    setGrants({ kind: 'failed', reasons: reasonsOf(result.failure, t('agent.grants.failed')) });
  }, [agent.id]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // 只有要指定單位時才去讀組織單位：範圍的單位 id 一定要來自真組織圖。
  useEffect(() => {
    if (scopeKind === null || scopeKind === 'all' || units !== null) {
      return;
    }

    setUnits({ kind: 'loading' });

    void (async () => {
      const result = await fetchOrgUnits();

      setUnits(
        result.ok
          ? { kind: 'ready', data: result.data.units }
          : { kind: 'failed', reasons: reasonsOf(result.failure, t('agent.grants.unitsFailed')) },
      );
    })();
  }, [scopeKind, units]);

  const appOptions = modules.kind === 'ready' ? modules.data : [];
  const scopeReady = scopeKind !== null && (scopeKind === 'all' || unitIds.length > 0);
  const canSubmit = appId !== null && scopeReady && !busy;

  async function addGrant(): Promise<void> {
    if (appId === null || scopeKind === null || !canSubmit) {
      return;
    }

    setBusy(true);
    setFormError([]);

    const scope: UnitScope = scopeKind === 'all' ? { kind: 'all' } : { kind: scopeKind, unitIds };

    const result = await createAgentGrant(agent.id, { appId, role: 'member', scope });

    setBusy(false);

    if (result.ok) {
      setAppId(null);
      setScopeKind(null);
      setUnitIds([]);
      onChanged(t('agent.grants.added'));

      return;
    }

    // 失敗保留 App 與範圍的選擇（那不是秘密），只講後端原文。
    setFormError(reasonsOf(result.failure, t('agent.grants.failed')));
  }

  return (
    <section className="admin-group" data-grant-panel={agent.id} aria-label={t('agent.grants.title')}>
      <h3 className="admin-group__title">
        {t('agent.grants.title')}
        <span className="org__unit-id">{agent.name}</span>
      </h3>
      <p className="admin-row__reason">{t('agent.grants.lead')}</p>

      {grants.kind === 'loading' && (
        <p className="admin-status" role="status">
          {t('agent.grants.loading')}
        </p>
      )}

      {(grants.kind === 'denied' || grants.kind === 'failed') && (
        <div className="admin-notice admin-notice--failed" role="alert">
          <p className="admin-notice__text">
            {grants.kind === 'denied'
              ? grants.status === 401
                ? t('admin.sessionExpired')
                : t('staff.denied')
              : t('agent.grants.failed')}
          </p>
          {grants.kind === 'failed' &&
            grants.reasons.map((reason) => (
              <p key={reason} className="admin-notice__reason">
                {reason}
              </p>
            ))}
          {grants.kind === 'failed' && (
            <button
              type="button"
              className="button button--text admin-notice__action"
              onClick={() => {
                setReloadKey((key) => key + 1);
              }}
            >
              {t('admin.retry')}
            </button>
          )}
        </div>
      )}

      {grants.kind === 'ready' && grants.data.grants.length === 0 && (
        <p className="page__empty">{t('agent.grants.empty')}</p>
      )}

      {grants.kind === 'ready' && grants.data.grants.length > 0 && (
        <ul className="admin-list">
          {grants.data.grants.map((grant) => (
            <li key={grant.id} className="admin-row" data-grant-id={grant.id}>
              <div className="admin-row__text">
                <p className="admin-row__label">{grant.appId}</p>
                <p className="admin-row__purpose">{t('agent.grants.role') + `：${grant.role}`}</p>
                <p className="admin-row__reason">{scopeText(grant.scope)}</p>
              </div>

              <div className="admin-row__control">
                <p className="admin-row__reason">{`${t('agent.grants.state')}：${grant.state}`}</p>
                <p className="admin-row__reason">{`${t('agent.grants.version')}：${grant.version}`}</p>
              </div>

              <div className="admin-row__actions">
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => {
                    setRevokeTarget(grant);
                    setFormError([]);
                  }}
                >
                  {t('agent.grants.revoke')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="admin-form">
        <p className="admin-row__reason">{t('agent.grants.roleMember')}</p>

        <Selector
          label={t('agent.grants.app')}
          value={appId}
          options={appOptions.map((module) => ({
            id: module.id,
            label: module.available ? module.title : `${module.title}${t('agent.moduleUnavailable')}`,
          }))}
          placeholder={t('agent.grants.app')}
          onChange={(id) => {
            setAppId(id);
            setFormError([]);
          }}
        />

        <Selector
          label={t('agent.grants.scope')}
          value={scopeKind}
          options={[
            { id: 'all', label: t('agent.grants.scopeAll') },
            { id: 'units', label: t('agent.grants.scopeUnits') },
            { id: 'subtree', label: t('agent.grants.scopeSubtree') },
          ]}
          placeholder={t('agent.grants.scope')}
          onChange={(id) => {
            setScopeKind(id as ScopeKind);
            setUnitIds([]);
            setFormError([]);
          }}
        />

        {scopeKind !== null && scopeKind !== 'all' && (
          <fieldset className="admin-field">
            <legend className="admin-field__label">{t('agent.grants.scopeUnits')}</legend>

            {units?.kind === 'loading' && <p className="admin-status">{t('agent.grants.unitsLoading')}</p>}
            {units?.kind === 'failed' && (
              <p className="admin-row__reason" role="alert">
                {t('agent.grants.unitsFailed')}
              </p>
            )}
            {units?.kind === 'ready' && (
              <div className="org__parents-pick">
                {units.data.map((unit) => (
                  <label key={unit.id} className="admin-check">
                    <input
                      type="checkbox"
                      checked={unitIds.includes(unit.id)}
                      onChange={(event) => {
                        setUnitIds((current) =>
                          event.target.checked
                            ? [...current, unit.id]
                            : current.filter((id) => id !== unit.id),
                        );
                      }}
                    />
                    <span>{unit.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {!scopeReady && <p className="admin-row__reason">{t('agent.grants.scopeRequired')}</p>}

        {formError.length > 0 && (
          <div className="admin-row__failure" role="alert">
            {formError.map((reason) => (
              <p key={reason} className="admin-row__reason">
                {reason}
              </p>
            ))}
          </div>
        )}

        <div className="admin-form__actions">
          <button
            type="button"
            className="button button--primary"
            disabled={!canSubmit}
            onClick={() => void addGrant()}
          >
            {t('agent.grants.add')}
          </button>
        </div>
      </div>

      <div className="admin-form">
        <p className="admin-row__reason">{t('agent.access.lead')}</p>

        <Selector
          label={t('agent.access.app')}
          value={accessAppId}
          options={appOptions.map((module) => ({
            id: module.id,
            label: module.available ? module.title : `${module.title}${t('agent.moduleUnavailable')}`,
          }))}
          placeholder={t('agent.access.app')}
          onChange={(id) => {
            setAccessAppId(id);
            setAccess(null);
            setAccessError([]);
          }}
        />

        <div className="admin-form__actions">
          <button
            type="button"
            className="button button--text"
            disabled={accessAppId === null || accessBusy}
            onClick={() => {
              void (async () => {
                if (accessAppId === null) {
                  return;
                }

                setAccessBusy(true);
                setAccessError([]);

                const result = await checkAgentAccess(agent.id, accessAppId);

                setAccessBusy(false);

                if (result.ok) {
                  setAccess(result.data);

                  return;
                }

                setAccess(null);
                setAccessError(reasonsOf(result.failure, t('agent.access.failed')));
              })();
            }}
          >
            {t('agent.access.check')}
          </button>
        </div>

        {access !== null && (
          <p className="admin-row__reason" data-access-result="true">
            {access.allowed
              ? access.via === 'owner'
                ? t('agent.access.allowedOwner')
                : t('agent.access.allowedGrant')
              : t('agent.access.denied', { reason: access.reason })}
          </p>
        )}

        {accessError.length > 0 && (
          <div className="admin-row__failure" role="alert">
            {accessError.map((reason) => (
              <p key={reason} className="admin-row__reason">
                {reason}
              </p>
            ))}
          </div>
        )}
      </div>

      {revokeTarget !== null && (
        <RevokeDialog
          agentId={agent.id}
          grant={revokeTarget}
          onCancel={() => {
            setRevokeTarget(null);
          }}
          onDone={() => {
            setRevokeTarget(null);
            onChanged(t('agent.grants.revokeDone'));
          }}
          onConflict={() => {
            setRevokeTarget(null);
            onFailed([t('agent.grants.conflict')]);
          }}
        />
      )}
    </section>
  );
}

/**
 * 撤銷授權。
 *
 * 一定要帶查詢拿到的那個 `version`：版本不對就是 409，不自動重送 ——
 * 重送等於用一個過期的認知去改現在的狀態。
 */
function RevokeDialog({
  agentId,
  grant,
  onCancel,
  onDone,
  onConflict,
}: {
  agentId: string;
  grant: GrantView;
  onCancel: () => void;
  onDone: () => void;
  onConflict: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[]>([]);

  async function submit(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setError([]);

    const trimmed = reason.trim();
    const result = await revokeAgentGrant(
      grant.agentId ?? agentId,
      grant.id,
      trimmed === '' ? { version: grant.version } : { version: grant.version, reason: trimmed },
    );

    setBusy(false);

    if (result.ok) {
      onDone();

      return;
    }

    if (result.failure.kind === 'http' && result.failure.status === 409) {
      onConflict();

      return;
    }

    setError(reasonsOf(result.failure, t('agent.grants.failed')));
  }

  return (
    <div className="admin-scrim">
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-revoke-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
      >
        <p className="shell-popover__label">{`${grant.appId} · ${t('agent.grants.version')} ${grant.version}`}</p>
        <h2 className="admin-dialog__title" id="agent-revoke-title">
          {t('agent.grants.revokeTitle')}
        </h2>
        <p className="admin-dialog__body">{scopeText(grant.scope)}</p>

        <label className="admin-field">
          <span className="admin-field__label">{t('agent.grants.revokeReason')}</span>
          <input
            className="input"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </label>

        {error.length > 0 && (
          <div className="admin-row__failure" role="alert">
            {error.map((item) => (
              <p key={item} className="admin-row__reason">
                {item}
              </p>
            ))}
          </div>
        )}

        <div className="admin-dialog__actions">
          <button type="button" className="button button--text" onClick={onCancel}>
            {t('admin.cancel')}
          </button>
          <button type="button" className="button button--danger" disabled={busy} onClick={() => void submit()}>
            {t('agent.grants.revokeConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dialog({
  id,
  title,
  body,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  id: string;
  title: string;
  body: readonly string[];
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="admin-scrim">
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        ref={(node) => {
          node?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
      >
        <p className="shell-popover__label">{t('admin.nav')}</p>
        <h2 className="admin-dialog__title" id={id}>
          {title}
        </h2>
        {body.map((line) => (
          <p key={line} className="admin-dialog__body">
            {line}
          </p>
        ))}
        <div className="admin-dialog__actions">
          <button type="button" className="button button--text" onClick={onCancel}>
            {t('admin.cancel')}
          </button>
          <button
            type="button"
            className={danger ? 'button button--danger' : 'button button--primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
