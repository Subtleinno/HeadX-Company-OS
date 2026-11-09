import { useEffect, useRef, useState } from 'react';
import { t } from '@company-os/i18n';
import { Selector } from '@company-os/ui-kit';
import {
  activateAppGrant,
  approveAppGrant,
  fetchAgentGrants,
  fetchAgents,
  fetchAppGrants,
  fetchModules,
  fetchOrgUnits,
  fetchStaff,
  modifyAppGrant,
  rejectAppGrant,
  requestAppGrant,
  revokeAppGrant,
  type AgentIdentity,
  type ApiFailure,
  type GrantRole,
  type GrantState,
  type GrantView,
  type OrgGraph,
  type OrgUnit,
  type PublicModule,
  type StaffMember,
  type UnitScope,
} from '../api';
import { GrantDetail } from './GrantDetail';

/**
 * App 授權（issue 122，Boss portal 管理區）。
 *
 * 這一頁只做一件事：把後端真實的授權顯示出來，並且只提供後端真的支援的動作。
 *
 * 五條界線寫在程式裡，不是寫在註解裡：
 *
 * 1. **批准不等於生效**。後端在 app 未啟用時回 409 `app_not_enabled`，但那個交易
 *    已經把狀態推到 `approved`。所以畫面的處理是「重新讀一次」，不是「假裝失敗」，
 *    也不是「假裝生效」。
 * 2. **版本衝突不自動重送**。409 `stale_version` 只提示重新載入；拿新版本自動再打
 *    一次，等同替用戶決定了他沒看過的內容。
 * 3. **沒有 `sensitive` 欄位就不標敏感**。`GET /modules` 只回六個欄位；敏感與否
 *    只有後端 403 的 message 才算數，照原文顯示。
 * 4. **兩個視角是同一份資料的兩個入口**。`/app-grants` 沒有 `agentId` 篩選，所以
 *    agent 視角走 `GET /agents/:id/grants`（owner-only、回 `{ grants, total }`），
 *    而該路由沒有 state／role 篩選 —— 那就如實不顯示那兩個篩選。
 * 5. **範圍不靜默填入**。建立與修改都要人手選；不勾選不等於全公司。
 *
 * 非老闆可以看自己的授權、可以批准／拒絕／撤銷（後端會再判一次），但建立與修改
 * 需要讀組織架構（`GET /org-units` 是 `requireOwner`），所以這裡不提供，並講明原因。
 */

const PAGE_SIZE = 20;

type View = 'subject' | 'app';
type Kind = 'human' | 'agent';

type ListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; grants: GrantView[]; total: number }
  | { kind: 'denied'; status: number }
  | { kind: 'failed'; reasons: string[] };

type Notice = { kind: 'done'; message: string } | { kind: 'failed'; reasons: string[] } | null;

type ScopeKind = 'all' | 'units' | 'subtree';

type Dialog = { kind: 'reject' | 'revoke' | 'modify'; grant: GrantView };

/**
 * 只有兩條真的通用的人話。其餘（`self_approval`、`sensitive_requires_owner`、
 * `scope_exceeds_own`…）一律用後端那句 `message` —— 前端寫死的句子會蓋過
 * 伺服器當刻更準確的理由。
 */
const ERROR_MESSAGES: Record<string, () => string> = {
  not_signed_in: () => t('grant.sessionExpired'),
  not_app_admin: () => t('grant.denied'),
};

/**
 * 把失敗講成人話。次序：逐條理由 → 後端那句 `message` → 已知代碼 → 通用句。
 * `message` 排在代碼之前，因為它是伺服器當刻的具體理由（例如「boss 是敏感 app」），
 * 比前端寫死的句子準確。
 */
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

function roleLabel(role: string): string {
  return role === 'app_admin' ? t('grant.role.app_admin') : t('grant.role.member');
}

function stateLabel(state: string): string {
  const keys: Record<string, 'grant.state.requested' | 'grant.state.approved' | 'grant.state.active' | 'grant.state.rejected' | 'grant.state.revoked'> = {
    requested: 'grant.state.requested',
    approved: 'grant.state.approved',
    active: 'grant.state.active',
    rejected: 'grant.state.rejected',
    revoked: 'grant.state.revoked',
  };

  const key = keys[state];

  return key === undefined ? state : t(key);
}

/** 只有這三個狀態還有事可以做。 */
function isTerminal(state: string): boolean {
  return state === 'rejected' || state === 'revoked';
}

function scopeKindLabel(kind: ScopeKind): string {
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

/**
 * 一個範圍實際覆蓋哪些單位。`subtree` 要包含下級 —— 這與後端 `coverScope`
 * 是同一條規則，但這裡只用來**預告影響**（縮小還是擴大），不是用來准駁。
 * 准駁永遠由後端算。
 */
function coverOf(scope: UnitScope, graph: OrgGraph): Set<string> {
  if (scope.kind === 'all') {
    return new Set(graph.units.map((unit) => unit.id));
  }

  const children = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const list = children.get(edge.parentId) ?? [];

    list.push(edge.childId);
    children.set(edge.parentId, list);
  }

  const out = new Set<string>();
  const queue = [...scope.unitIds];

  while (queue.length > 0) {
    const id = queue.pop() as string;

    if (out.has(id)) {
      continue;
    }

    out.add(id);

    if (scope.kind === 'subtree') {
      for (const childId of children.get(id) ?? []) {
        queue.push(childId);
      }
    }
  }

  return out;
}

/** 範圍是否「寫得夠明白」：`all` 要明選，`units`／`subtree` 至少一個單位。 */
function scopeReady(scopeKind: ScopeKind | null, unitIds: readonly string[]): boolean {
  if (scopeKind === null) {
    return false;
  }

  return scopeKind === 'all' || unitIds.length > 0;
}

function isSubsetOf(target: ReadonlySet<string>, base: ReadonlySet<string>): boolean {
  for (const id of target) {
    if (!base.has(id)) {
      return false;
    }
  }

  return true;
}

/** 把單位排成由根往下的次序，選單才好讀。 */
function orderedUnits(graph: OrgGraph): OrgUnit[] {
  const byId = new Map(graph.units.map((unit) => [unit.id, unit]));
  const children = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const list = children.get(edge.parentId) ?? [];

    list.push(edge.childId);
    children.set(edge.parentId, list);
  }

  const hasParent = new Set(graph.edges.map((edge) => edge.childId));
  const roots = graph.units.filter((unit) => !hasParent.has(unit.id));
  const out: OrgUnit[] = [];
  const seen = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const unit = queue.shift() as OrgUnit;

    if (seen.has(unit.id)) {
      continue;
    }

    seen.add(unit.id);
    out.push(unit);

    for (const childId of children.get(unit.id) ?? []) {
      const child = byId.get(childId);

      if (child !== undefined) {
        queue.push(child);
      }
    }
  }

  for (const unit of graph.units) {
    if (!seen.has(unit.id)) {
      out.push(unit);
    }
  }

  return out;
}

export type AppGrantsScreenProps = {
  user: { id: string; displayName: string; role: 'owner' | 'staff' };
  onDirtyCountChange: (count: number) => void;
};

export function AppGrantsScreen({ user, onDirtyCountChange }: AppGrantsScreenProps) {
  const isOwner = user.role === 'owner';

  const [view, setView] = useState<View>('subject');
  const [kind, setKind] = useState<Kind>('human');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<GrantState | null>(null);
  const [roleFilter, setRoleFilter] = useState<GrantRole | null>(null);
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const [list, setList] = useState<ListState>({ kind: 'idle' });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [modules, setModules] = useState<PublicModule[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [agents, setAgents] = useState<AgentIdentity[] | null>(null);
  const [agentsDenied, setAgentsDenied] = useState(false);
  const [staffDenied, setStaffDenied] = useState(false);
  const [graph, setGraph] = useState<OrgGraph | null>(null);
  const [graphDenied, setGraphDenied] = useState(false);
  /**
   * 名單要可以重讀：agent 可能剛在「員工與 agent」頁建好，這頁若只讀一次
   * 就會給一個看不到新 agent 的下拉 —— 那不是「沒有」，是「過期」。
   */
  const [directoryReload, setDirectoryReload] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSubject, setCreateSubject] = useState<string | null>(null);
  const [createApp, setCreateApp] = useState<string | null>(null);
  const [createRole, setCreateRole] = useState<GrantRole | null>(null);
  const [createScopeKind, setCreateScopeKind] = useState<ScopeKind | null>(null);
  const [createUnits, setCreateUnits] = useState<string[]>([]);

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pendingView, setPendingView] = useState<View | null>(null);
  /** 頁內詳情區：null ＝ 顯示列表。詳情同列表並存，切換唔重設篩選同分頁。 */
  const [detailId, setDetailId] = useState<string | null>(null);

  /** 舊回應不可以覆蓋新目標：每換一次查詢就換一個號碼，號碼不對就丟掉。 */
  const listSeq = useRef(0);

  const createDirty =
    createSubject !== null || createApp !== null || createRole !== null || createScopeKind !== null;

  useEffect(() => {
    onDirtyCountChange(createDirty ? 1 : 0);
  }, [createDirty, onDirtyCountChange]);

  // ── 名單與組織（一次） ─────────────────────────────────────
  useEffect(() => {
    let alive = true;

    void (async () => {
      const result = await fetchModules();

      if (alive && result.ok) {
        setModules(result.data.modules);
      }
    })();

    void (async () => {
      if (!isOwner) {
        return;
      }

      const result = await fetchStaff({ limit: 100, offset: 0 });

      if (!alive) {
        return;
      }

      if (result.ok) {
        setStaff(result.data.staff);
      } else if (result.failure.kind === 'http' && result.failure.status === 403) {
        setStaffDenied(true);
      }
    })();

    void (async () => {
      if (!isOwner) {
        setAgentsDenied(true);

        return;
      }

      const result = await fetchAgents({ limit: 100, offset: 0 });

      if (!alive) {
        return;
      }

      if (result.ok) {
        setAgents(result.data.agents);
      } else if (result.failure.kind === 'http' && result.failure.status === 403) {
        setAgentsDenied(true);
      }
    })();

    void (async () => {
      if (!isOwner) {
        // 組織架構是 requireOwner。非老闆讀不到，所以建立／修改不提供（見下方說明）。
        setGraphDenied(true);

        return;
      }

      const result = await fetchOrgUnits();

      if (!alive) {
        return;
      }

      if (result.ok) {
        setGraph(result.data);
      } else if (result.failure.kind === 'http' && result.failure.status === 403) {
        setGraphDenied(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isOwner, directoryReload]);

  // ── 讀授權 ────────────────────────────────────────────────
  useEffect(() => {
    const targeting = view === 'subject' ? subjectId : appId;

    if (targeting === null) {
      listSeq.current += 1;
      setList({ kind: 'idle' });

      return;
    }

    const seq = listSeq.current + 1;
    listSeq.current = seq;
    setList({ kind: 'loading' });

    void (async () => {
      // agent 視角：後端沒有 agentId 篩選，走 agent 專用路由（回 `{ grants, total }`）。
      if (view === 'subject' && kind === 'agent') {
        const result = await fetchAgentGrants(targeting, { limit: PAGE_SIZE, offset });

        if (seq !== listSeq.current) {
          return;
        }

        if (result.ok) {
          setList({ kind: 'ready', grants: result.data.grants, total: result.data.total });

          return;
        }

        if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
          setList({ kind: 'denied', status: result.failure.status });

          return;
        }

        setList({ kind: 'failed', reasons: reasonsOf(result.failure, t('grant.failed')) });

        return;
      }

      const result = await fetchAppGrants({
        ...(view === 'subject' ? { userId: targeting } : { appId: targeting }),
        state: stateFilter,
        role: roleFilter,
        limit: PAGE_SIZE,
        offset,
      });

      if (seq !== listSeq.current) {
        return;
      }

      if (result.ok) {
        setList({ kind: 'ready', grants: result.data.grants, total: result.data.page.total });

        return;
      }

      if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
        setList({ kind: 'denied', status: result.failure.status });

        return;
      }

      setList({ kind: 'failed', reasons: reasonsOf(result.failure, t('grant.failed')) });
    })();
  }, [view, kind, subjectId, appId, stateFilter, roleFilter, offset, reloadKey]);

  function reload(): void {
    setReloadKey((key) => key + 1);
  }

  function switchView(next: View): void {
    if (next === view) {
      return;
    }

    if (createDirty) {
      setPendingView(next);

      return;
    }

    setView(next);
    setOffset(0);
    setNotice(null);
  }

  // ── 顯示用的查表 ──────────────────────────────────────────
  function beneficiaryLabel(grant: GrantView): string {
    if (grant.userId !== null && grant.userId === user.id) {
      return t('grant.beneficiary.you', { name: user.displayName });
    }

    const id = grant.userId ?? grant.agentId ?? '';

    if (grant.agentId !== null) {
      const agent = agents?.find((item) => item.id === grant.agentId);

      return agent === undefined ? t('grant.beneficiary.unknown', { id }) : agent.name;
    }

    const person = staff?.find((item) => item.id === grant.userId);

    return person === undefined ? t('grant.beneficiary.unknown', { id }) : person.displayName;
  }

  function appTitle(id: string): string {
    return modules?.find((item) => item.id === id)?.title ?? id;
  }

  function appEnabled(id: string): boolean | null {
    const found = modules?.find((item) => item.id === id);

    return found === undefined ? null : found.available;
  }

  const units = graph === null ? [] : orderedUnits(graph);
  const unitsMessage =
    graphDenied
      ? t('grant.create.unitsFailed')
      : graph === null
        ? t('grant.create.unitsLoading')
        : '';

  function scopeOf(scopeKind: ScopeKind, unitIds: readonly string[]): UnitScope {
    return scopeKind === 'all' ? { kind: 'all' } : { kind: scopeKind, unitIds: [...unitIds] };
  }

  // ── 建立 ──────────────────────────────────────────────────
  const createReady =
    createSubject !== null &&
    createApp !== null &&
    createRole !== null &&
    scopeReady(createScopeKind, createUnits);

  async function submitCreate(): Promise<void> {
    if (!createReady || busy !== null || createSubject === null || createApp === null || createRole === null || createScopeKind === null) {
      return;
    }

    setBusy('create');
    setNotice(null);

    const result = await requestAppGrant({
      userId: createSubject,
      appId: createApp,
      role: createRole,
      scope: scopeOf(createScopeKind, createUnits),
    });

    setBusy(null);

    if (!result.ok) {
      setNotice({ kind: 'failed', reasons: reasonsOf(result.failure, t('grant.failed')) });

      return;
    }

    if (result.data.created) {
      setNotice({ kind: 'done', message: t('grant.create.done') });
    } else {
      setNotice({ kind: 'done', message: t('grant.create.duplicate') });
    }

    // 成功之後收起表格：表單再開就是「另一筆」，不會令人以為剛才那筆還要再送一次。
    setCreateOpen(false);
    setCreateSubject(null);
    setCreateApp(null);
    setCreateRole(null);
    setCreateScopeKind(null);
    setCreateUnits([]);
    reload();
  }

  // ── 狀態變更 ──────────────────────────────────────────────
  async function runApprove(grant: GrantView): Promise<void> {
    if (busy !== null) {
      return;
    }

    setBusy(grant.id);
    setNotice(null);

    const result = await approveAppGrant(grant.id, grant.version);

    setBusy(null);

    if (result.ok) {
      setNotice({ kind: 'done', message: t('grant.approve.done') });
      reload();

      return;
    }

    // 批准了但 app 未啟用：交易已提交（狀態是 approved），所以畫面要重新讀，
    // 並講清楚「批准了、但沒有生效」。這不是失敗，也不可以寫成成功。
    if (result.failure.kind === 'http' && result.failure.error === 'app_not_enabled') {
      setNotice({ kind: 'done', message: t('grant.approve.approvedOnly') });
      reload();

      return;
    }

    // 版本衝突：只提示重新載入，不拿新版本自動重送。
    if (result.failure.kind === 'http' && result.failure.error === 'stale_version') {
      setNotice({ kind: 'failed', reasons: [t('grant.conflict')] });
      reload();

      return;
    }

    setNotice({ kind: 'failed', reasons: reasonsOf(result.failure, t('grant.failed')) });
  }

  async function runActivate(grant: GrantView): Promise<void> {
    if (busy !== null) {
      return;
    }

    setBusy(grant.id);
    setNotice(null);

    const result = await activateAppGrant(grant.id, grant.version);

    setBusy(null);

    if (result.ok) {
      setNotice({ kind: 'done', message: t('grant.activate.done') });
      reload();

      return;
    }

    if (result.failure.kind === 'http' && result.failure.error === 'stale_version') {
      setNotice({ kind: 'failed', reasons: [t('grant.conflict')] });
      reload();

      return;
    }

    setNotice({ kind: 'failed', reasons: reasonsOf(result.failure, t('grant.failed')) });
  }

  return (
    <div className="page page--wide" data-grants-screen>
      <div className="page__head">
        <h1 className="page__title">{t('grant.title')}</h1>
        <p className="page__sub">{t('grant.lead')}</p>
      </div>

      <ul className="admin-concepts" data-concepts aria-label={t('grant.concepts.title')}>
        <li>{t('grant.concepts.context')}</li>
        <li>{t('grant.concepts.scope')}</li>
        <li>{t('grant.concepts.filter')}</li>
        <li>{t('grant.concepts.mode')}</li>
      </ul>

      <div className="admin-tabs" role="tablist" aria-label={t('grant.title')}>
        <button
          type="button"
          role="tab"
          className="admin-tab"
          data-view="subject"
          aria-selected={view === 'subject'}
          onClick={() => {
            switchView('subject');
          }}
        >
          {t('grant.tab.subject')}
        </button>
        <button
          type="button"
          role="tab"
          className="admin-tab"
          data-view="app"
          aria-selected={view === 'app'}
          onClick={() => {
            switchView('app');
          }}
        >
          {t('grant.tab.app')}
        </button>
      </div>

      {notice !== null && (
        <div
          className={`admin-notice admin-notice--${notice.kind === 'done' ? 'done' : 'failed'}`}
          role={notice.kind === 'done' ? 'status' : 'alert'}
          data-action-notice
        >
          {notice.kind === 'done' ? (
            <p className="admin-notice__text">{notice.message}</p>
          ) : (
            notice.reasons.map((reason) => (
              <p key={reason} className="admin-notice__reason">
                {reason}
              </p>
            ))
          )}
        </div>
      )}

      {view === 'subject' ? (
        <section className="admin-group" aria-label={t('grant.tab.subject')}>
          <div className="admin-segment" role="group" aria-label={t('grant.tab.subject')}>
            <button
              type="button"
              className="admin-segment__button"
              data-kind="human"
              aria-pressed={kind === 'human'}
              onClick={() => {
                setKind('human');
                setSubjectId(null);
                setOffset(0);
              }}
            >
              {t('grant.kind.human')}
            </button>
            <button
              type="button"
              className="admin-segment__button"
              data-kind="agent"
              aria-pressed={kind === 'agent'}
              onClick={() => {
                setKind('agent');
                setSubjectId(null);
                setOffset(0);
                setDirectoryReload((count) => count + 1);
              }}
            >
              {t('grant.kind.agent')}
            </button>
          </div>

          {kind === 'human' ? (
            <>
              <Selector
                label={t('grant.label.beneficiary')}
                value={subjectId}
                placeholder={t('grant.pickSubject')}
                options={[
                  // 自己一定在清單裡：那不需要讀 /staff，也令非老闆仍然看得到自己的授權。
                  { id: user.id, label: t('grant.beneficiary.you', { name: user.displayName }) },
                  ...(staff ?? [])
                    .filter((member) => member.id !== user.id)
                    .map((member) => ({
                      id: member.id,
                      label: member.displayName,
                      description: member.email,
                    })),
                ]}
                onChange={(id) => {
                  setSubjectId(id);
                  setOffset(0);
                }}
              />
              {staffDenied && <p className="admin-hint">{t('grant.subject.denied')}</p>}
              {!isOwner && <p className="admin-hint">{t('grant.beneficiary.idsOnly')}</p>}
            </>
          ) : (
            <>
              <Selector
                label={t('grant.label.agent')}
                value={subjectId}
                placeholder={t('grant.pickAgentPlaceholder')}
                disabled={agentsDenied}
                options={(agents ?? []).map((agent) => ({ id: agent.id, label: agent.name }))}
                onChange={(id) => {
                  setSubjectId(id);
                  setOffset(0);
                }}
              />
              {agentsDenied && <p className="admin-hint">{t('grant.agent.denied')}</p>}
            </>
          )}

          {kind === 'agent' && <p className="admin-hint">{t('grant.filter.agentNote')}</p>}
        </section>
      ) : (
        <section className="admin-group" aria-label={t('grant.tab.app')}>
          <Selector
            label={t('grant.label.app')}
            value={appId}
            placeholder={t('grant.pickApp')}
            options={(modules ?? []).map((item) => ({
              id: item.id,
              label: item.title,
              description: item.available ? t('grant.app.enabledNote') : t('grant.app.disabledNote'),
            }))}
            onChange={(id) => {
              setAppId(id);
              setOffset(0);
            }}
          />
          {appId !== null && appEnabled(appId) === false && (
            <p className="admin-hint" data-app-disabled>
              {t('grant.app.disabledNote')}
            </p>
          )}
        </section>
      )}

      {(view === 'app' || kind === 'human') && (
        <div className="admin-filters">
          <Selector
            label={t('grant.filter.state')}
            value={stateFilter ?? ''}
            placeholder={t('grant.filter.all')}
            options={[
              { id: '', label: t('grant.filter.all') },
              { id: 'requested', label: t('grant.state.requested') },
              { id: 'approved', label: t('grant.state.approved') },
              { id: 'active', label: t('grant.state.active') },
              { id: 'rejected', label: t('grant.state.rejected') },
              { id: 'revoked', label: t('grant.state.revoked') },
            ]}
            onChange={(id) => {
              setStateFilter(id === '' ? null : (id as GrantState));
              setOffset(0);
            }}
          />
          <Selector
            label={t('grant.filter.role')}
            value={roleFilter ?? ''}
            placeholder={t('grant.filter.all')}
            options={[
              { id: '', label: t('grant.filter.all') },
              { id: 'member', label: 'member' },
              { id: 'app_admin', label: 'app_admin' },
            ]}
            onChange={(id) => {
              setRoleFilter(id === '' ? null : (id as GrantRole));
              setOffset(0);
            }}
          />
        </div>
      )}

      {detailId !== null && (
        <GrantDetail
          grantId={detailId}
          onBack={() => {
            setDetailId(null);
          }}
        />
      )}

      <GrantList
        list={list}
        offset={offset}
        beneficiaryLabel={beneficiaryLabel}
        appTitle={appTitle}
        busy={busy}
        onDetail={(grant) => {
          setDetailId(grant.id);
        }}
        onApprove={(grant) => {
          void runApprove(grant);
        }}
        onActivate={(grant) => {
          void runActivate(grant);
        }}
        onReject={(grant) => {
          setDialog({ kind: 'reject', grant });
        }}
        onRevoke={(grant) => {
          setDialog({ kind: 'revoke', grant });
        }}
        onModify={(grant) => {
          setDialog({ kind: 'modify', grant });
        }}
        canModify={isOwner && graph !== null}
        onRetry={reload}
        onPrev={() => {
          setOffset((current) => Math.max(0, current - PAGE_SIZE));
        }}
        onNext={() => {
          setOffset((current) => current + PAGE_SIZE);
        }}
      />

      {isOwner ? (
        <section className="admin-group" aria-label={t('grant.create')}>
          {createOpen ? (
            <div className="admin-form" data-create-panel>
              <div className="admin-form__grid">
                <div className="admin-field">
                  <span className="admin-field__label">{t('grant.create.subject')}</span>
                  <Selector
                    label={t('grant.create.subject')}
                    value={createSubject}
                    placeholder={t('grant.create.subject')}
                    options={[
                      { id: user.id, label: t('grant.beneficiary.you', { name: user.displayName }) },
                      ...(staff ?? [])
                        .filter((member) => member.id !== user.id)
                        .map((member) => ({
                          id: member.id,
                          label: member.displayName,
                          description: member.email,
                        })),
                    ]}
                    onChange={(id) => {
                      setCreateSubject(id);
                    }}
                  />
                </div>

                <div className="admin-field">
                  <span className="admin-field__label">{t('grant.create.app')}</span>
                  <Selector
                    label={t('grant.create.app')}
                    value={createApp}
                    placeholder={t('grant.create.app')}
                    options={(modules ?? []).map((item) => ({
                      id: item.id,
                      label: item.title,
                      description: item.available ? t('grant.app.enabledNote') : t('grant.app.disabledNote'),
                    }))}
                    onChange={(id) => {
                      setCreateApp(id);
                    }}
                  />
                </div>

                <div className="admin-field">
                  <span className="admin-field__label">{t('grant.create.role')}</span>
                  <Selector
                    label={t('grant.create.role')}
                    value={createRole}
                    placeholder={t('grant.create.role')}
                    options={[
                      { id: 'member', label: roleLabel('member') },
                      { id: 'app_admin', label: roleLabel('app_admin') },
                    ]}
                    onChange={(id) => {
                      setCreateRole(id as GrantRole);
                    }}
                  />
                </div>
              </div>

              <fieldset className="admin-field">
                <legend className="admin-field__label">{t('grant.create.scope')}</legend>
                {(['all', 'units', 'subtree'] as const).map((option) => (
                  <label key={option} className="admin-radio">
                    <input
                      type="radio"
                      name="create-scope"
                      data-scope-kind={option}
                      checked={createScopeKind === option}
                      onChange={() => {
                        setCreateScopeKind(option);
                        setCreateUnits([]);
                      }}
                    />
                    {scopeKindLabel(option)}
                  </label>
                ))}
              </fieldset>

              {createScopeKind !== null && createScopeKind !== 'all' && (
                <UnitPicker
                  units={units}
                  selected={createUnits}
                  variant="create"
                  message={unitsMessage}
                  onChange={setCreateUnits}
                />
              )}

              {!createReady && <p className="admin-hint">{t('grant.create.scopeRequired')}</p>}

              <div className="admin-form__actions">
                <button
                  type="button"
                  className="button button--text"
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateSubject(null);
                    setCreateApp(null);
                    setCreateRole(null);
                    setCreateScopeKind(null);
                    setCreateUnits([]);
                  }}
                >
                  {t('admin.cancel')}
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  data-create-submit
                  disabled={!createReady || busy !== null}
                  onClick={() => {
                    void submitCreate();
                  }}
                >
                  {t('grant.create.submit')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="button button--primary"
              data-create-open
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              {t('grant.create')}
            </button>
          )}

          <p className="admin-hint">{t('grant.create.agentNote')}</p>
        </section>
      ) : (
        <p className="admin-hint" data-create-blocked>
          {t('grant.create.ownerOnly')}
        </p>
      )}

      {dialog !== null && dialog.kind === 'reject' && (
        <RejectDialog
          grant={dialog.grant}
          onClose={() => {
            setDialog(null);
          }}
          onDone={(message) => {
            setDialog(null);
            setNotice({ kind: 'done', message });
            reload();
          }}
        />
      )}

      {dialog !== null && dialog.kind === 'revoke' && (
        <RevokeDialog
          grant={dialog.grant}
          onClose={() => {
            setDialog(null);
          }}
          onDone={(message) => {
            setDialog(null);
            setNotice({ kind: 'done', message });
            reload();
          }}
        />
      )}

      {dialog !== null && dialog.kind === 'modify' && (
        <ModifyDialog
          grant={dialog.grant}
          units={units}
          graph={graph}
          unitsMessage={unitsMessage}
          onClose={() => {
            setDialog(null);
          }}
          onDone={(message) => {
            setDialog(null);
            setNotice({ kind: 'done', message });
            reload();
          }}
        />
      )}

      {pendingView !== null && (
        <div className="admin-scrim">
          <div
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grants-unsaved-title"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setPendingView(null);
              }
            }}
          >
            <h2 className="admin-dialog__title" id="grants-unsaved-title">
              {t('admin.unsaved.title')}
            </h2>
            <p className="admin-dialog__body">{t('admin.unsaved.body')}</p>
            <div className="admin-dialog__actions">
              <button
                type="button"
                className="button button--text"
                onClick={() => {
                  setPendingView(null);
                }}
              >
                {t('admin.unsaved.stay')}
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  const next = pendingView;

                  setPendingView(null);
                  setCreateOpen(false);
                  setCreateSubject(null);
                  setCreateApp(null);
                  setCreateRole(null);
                  setCreateScopeKind(null);
                  setCreateUnits([]);
                  setView(next);
                  setOffset(0);
                  setNotice(null);
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

type GrantListProps = {
  list: ListState;
  offset: number;
  beneficiaryLabel: (grant: GrantView) => string;
  appTitle: (id: string) => string;
  busy: string | null;
  canModify: boolean;
  onDetail: (grant: GrantView) => void;
  onApprove: (grant: GrantView) => void;
  onActivate: (grant: GrantView) => void;
  onReject: (grant: GrantView) => void;
  onRevoke: (grant: GrantView) => void;
  onModify: (grant: GrantView) => void;
  onRetry: () => void;
  onPrev: () => void;
  onNext: () => void;
};

function GrantList(props: GrantListProps) {
  const { list, offset } = props;

  if (list.kind === 'idle') {
    return <p className="admin-status">{t('grant.pickSubject')}</p>;
  }

  if (list.kind === 'loading') {
    return (
      <p className="admin-status" role="status">
        {t('grant.loading')}
      </p>
    );
  }

  if (list.kind === 'denied') {
    return (
      <div className="admin-notice admin-notice--failed" role="alert" data-grant-denied>
        <p className="admin-notice__text">
          {list.status === 401 ? t('grant.sessionExpired') : t('grant.denied')}
        </p>
      </div>
    );
  }

  if (list.kind === 'failed') {
    return (
      <div className="admin-notice admin-notice--failed" role="alert" data-grant-failed>
        <p className="admin-notice__text">{t('grant.failed')}</p>
        {list.reasons.map((reason) => (
          <p key={reason} className="admin-notice__reason">
            {reason}
          </p>
        ))}
        <button type="button" className="button button--text" onClick={props.onRetry}>
          {t('admin.retry')}
        </button>
      </div>
    );
  }

  if (list.grants.length === 0) {
    return <p className="page__empty">{t('grant.empty')}</p>;
  }

  const from = list.total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, list.total);

  return (
    <>
      <ul className="admin-list" data-grant-list>
        {list.grants.map((grant) => (
          <li key={grant.id} className="admin-row admin-row--grant" data-grant-id={grant.id}>
            <div className="admin-row__text">
              <p className="admin-row__label">{props.appTitle(grant.appId)}</p>
              <p className="admin-row__purpose">{props.beneficiaryLabel(grant)}</p>
              <p className="admin-row__reason">{`${t('grant.column.role')}：${roleLabel(grant.role)}`}</p>
              <p className="admin-row__reason">{`${t('grant.column.scope')}：${scopeText(grant.scope)}`}</p>
              <p className="admin-row__reason">{`${t('grant.column.state')}：${stateLabel(grant.state)}`}</p>
              <p className="admin-row__reason">{`${t('grant.column.version')}：${grant.version}`}</p>
              <p className="admin-row__reason">
                {`${t('grant.time.requested')}：${formatAt(grant.requestedAt)}`}
              </p>
              {grant.approvedAt !== null && (
                <p className="admin-row__reason">
                  {`${t('grant.time.approved')}：${formatAt(grant.approvedAt)}`}
                </p>
              )}
              {grant.activatedAt !== null && (
                <p className="admin-row__reason">
                  {`${t('grant.time.activated')}：${formatAt(grant.activatedAt)}`}
                </p>
              )}
              {grant.revokedAt !== null && (
                <p className="admin-row__reason">
                  {`${t('grant.time.revoked')}：${formatAt(grant.revokedAt)}`}
                </p>
              )}
              {grant.replacesId !== null && (
                <p className="admin-row__reason">{t('grant.supersede', { id: grant.replacesId })}</p>
              )}
              {grant.rejectionReason !== null && (
                <p className="admin-row__reason">
                  {t('grant.rejectionReason', { reason: grant.rejectionReason })}
                </p>
              )}
            </div>

            <div className="admin-row__control">
              <button
                type="button"
                className="button button--text"
                data-grant-detail-open={grant.id}
                onClick={() => {
                  props.onDetail(grant);
                }}
              >
                {t('grant.detail.title')}
              </button>
              {grant.state === 'requested' && (
                <button
                  type="button"
                  className="button button--text"
                  disabled={props.busy !== null}
                  onClick={() => {
                    props.onApprove(grant);
                  }}
                >
                  {t('grant.action.approve')}
                </button>
              )}
              {grant.state === 'approved' && (
                <button
                  type="button"
                  className="button button--text"
                  disabled={props.busy !== null}
                  onClick={() => {
                    props.onActivate(grant);
                  }}
                >
                  {t('grant.action.activate')}
                </button>
              )}
              {(grant.state === 'requested' || grant.state === 'approved') && (
                <button
                  type="button"
                  className="button button--text"
                  disabled={props.busy !== null}
                  onClick={() => {
                    props.onReject(grant);
                  }}
                >
                  {t('grant.action.reject')}
                </button>
              )}
              {!isTerminal(grant.state) && (
                <button
                  type="button"
                  className="button button--text"
                  disabled={props.busy !== null}
                  onClick={() => {
                    props.onRevoke(grant);
                  }}
                >
                  {t('grant.action.revoke')}
                </button>
              )}
              {!isTerminal(grant.state) && props.canModify && (
                <button
                  type="button"
                  className="button button--text"
                  disabled={props.busy !== null}
                  onClick={() => {
                    props.onModify(grant);
                  }}
                >
                  {t('grant.action.modify')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="admin-pager" data-pager>
        <p className="admin-pager__info">
          {t('grant.pager.info', { from, to, total: list.total })}
        </p>
        <button
          type="button"
          className="button button--text"
          disabled={offset === 0}
          onClick={props.onPrev}
        >
          {t('grant.pager.prev')}
        </button>
        <button
          type="button"
          className="button button--text"
          disabled={to >= list.total}
          onClick={props.onNext}
        >
          {t('grant.pager.next')}
        </button>
      </div>
    </>
  );
}

type UnitPickerProps = {
  units: OrgUnit[];
  selected: string[];
  /** 兩個表單各自要被測到／走查到的屬性名，所以由呼叫者指定，不用動態 key。 */
  variant: 'create' | 'modify';
  message: string;
  onChange: (ids: string[]) => void;
};

function UnitPicker({ units, selected, variant, message, onChange }: UnitPickerProps) {
  if (message !== '') {
    return <p className="admin-hint">{message}</p>;
  }

  return (
    <div className="admin-units">
      {units.map((unit) => (
        <label key={unit.id} className="admin-check">
          <input
            type="checkbox"
            {...(variant === 'create' ? { 'data-create-unit': unit.id } : { 'data-modify-unit': unit.id })}
            checked={selected.includes(unit.id)}
            onChange={(event) => {
              onChange(
                event.target.checked
                  ? [...selected, unit.id]
                  : selected.filter((id) => id !== unit.id),
              );
            }}
          />
          {unit.name}
        </label>
      ))}
    </div>
  );
}

type DialogBaseProps = {
  grant: GrantView;
  onClose: () => void;
  onDone: (message: string) => void;
};

function RejectDialog({ grant, onClose, onDone }: DialogBaseProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);

  async function submit(): Promise<void> {
    if (busy || reason.trim() === '') {
      return;
    }

    setBusy(true);
    setReasons([]);

    const result = await rejectAppGrant(grant.id, { version: grant.version, reason: reason.trim() });

    setBusy(false);

    if (!result.ok) {
      setReasons(reasonsOf(result.failure, t('grant.failed')));

      return;
    }

    onDone(t('grant.reject.done'));
  }

  return (
    <div className="admin-scrim">
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-reject-title"
        data-reject-dialog
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      >
        <h2 className="admin-dialog__title" id="grant-reject-title">
          {t('grant.reject.title')}
        </h2>
        {reasons.length > 0 && (
          <div className="admin-notice admin-notice--failed" role="alert">
            {reasons.map((item) => (
              <p key={item} className="admin-notice__reason">
                {item}
              </p>
            ))}
          </div>
        )}
        <label className="admin-field">
          <span className="admin-field__label">{t('grant.reject.reason')}</span>
          <textarea
            className="admin-input"
            aria-label={t('grant.reject.reason')}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </label>
        <div className="admin-dialog__actions">
          <button type="button" className="button button--text" onClick={onClose}>
            {t('admin.cancel')}
          </button>
          <button
            type="button"
            className="button button--primary"
            data-reject-submit
            disabled={busy || reason.trim() === ''}
            onClick={() => {
              void submit();
            }}
          >
            {t('grant.reject.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RevokeDialog({ grant, onClose, onDone }: DialogBaseProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);

  async function submit(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setReasons([]);

    const trimmed = reason.trim();
    const result = await revokeAppGrant(grant.id, {
      version: grant.version,
      ...(trimmed === '' ? {} : { reason: trimmed }),
    });

    setBusy(false);

    if (!result.ok) {
      setReasons(reasonsOf(result.failure, t('grant.failed')));

      return;
    }

    onDone(t('grant.revoke.done'));
  }

  return (
    <div className="admin-scrim">
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-revoke-title"
        data-revoke-dialog
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      >
        <h2 className="admin-dialog__title" id="grant-revoke-title">
          {t('grant.revoke.title')}
        </h2>
        {reasons.length > 0 && (
          <div className="admin-notice admin-notice--failed" role="alert">
            {reasons.map((item) => (
              <p key={item} className="admin-notice__reason">
                {item}
              </p>
            ))}
          </div>
        )}
        <label className="admin-field">
          <span className="admin-field__label">{t('grant.revoke.reason')}</span>
          <textarea
            className="admin-input"
            aria-label={t('grant.revoke.reason')}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </label>
        <div className="admin-dialog__actions">
          <button type="button" className="button button--text" onClick={onClose}>
            {t('admin.cancel')}
          </button>
          <button
            type="button"
            className="button button--primary"
            data-revoke-submit
            disabled={busy}
            onClick={() => {
              void submit();
            }}
          >
            {t('grant.revoke.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

type ModifyDialogProps = DialogBaseProps & {
  units: OrgUnit[];
  graph: OrgGraph | null;
  unitsMessage: string;
};

function ModifyDialog({ grant, graph, units, unitsMessage, onClose, onDone }: ModifyDialogProps) {
  const [role, setRole] = useState<GrantRole>(grant.role === 'app_admin' ? 'app_admin' : 'member');
  const [scopeKind, setScopeKind] = useState<ScopeKind>(
    grant.scope.kind === 'all' ? 'all' : grant.scope.kind,
  );
  const [unitIds, setUnitIds] = useState<string[]>(
    grant.scope.kind === 'all' ? [] : [...grant.scope.unitIds],
  );
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);

  const target = role === grant.role && scopeKind === grant.scope.kind && sameUnits(unitIds, grant.scope);
  const ready = scopeReady(scopeKind, unitIds) && !target;

  async function submit(): Promise<void> {
    if (!ready || busy) {
      return;
    }

    setBusy(true);
    setReasons([]);

    const result = await modifyAppGrant(grant.id, {
      version: grant.version,
      ...(role === grant.role ? {} : { role }),
      ...(scopeKind === grant.scope.kind && sameUnits(unitIds, grant.scope)
        ? {}
        : { scope: scopeKind === 'all' ? { kind: 'all' } : { kind: scopeKind, unitIds } }),
    });

    setBusy(false);

    if (!result.ok) {
      setReasons(reasonsOf(result.failure, t('grant.failed')));

      return;
    }

    onDone(result.data.requiresApproval ? t('grant.modify.doneExpand') : t('grant.modify.doneShrink'));
  }

  /**
   * 影響預告：範圍變小而且角色不變 → 即時生效；其餘 → 要重新批准。
   * 讀不到組織架構就不猜（`graph === null`）—— 講「未能預算」比講錯一邊好。
   * 真正的判斷仍在後端（`PATCH` 回 `requiresApproval`）。
   */
  const impactNote = ((): string => {
    if (target) {
      return t('grant.modify.noop');
    }

    if (graph === null) {
      return t('grant.modify.unknown');
    }

    const targetCover = coverOf(scopeKind === 'all' ? { kind: 'all' } : { kind: scopeKind, unitIds }, graph);
    const currentCover = coverOf(grant.scope, graph);

    return role === grant.role && isSubsetOf(targetCover, currentCover)
      ? t('grant.modify.shrink')
      : t('grant.modify.expand');
  })();

  return (
    <div className="admin-scrim">
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grant-modify-title"
        data-modify-dialog
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      >
        <h2 className="admin-dialog__title" id="grant-modify-title">
          {t('grant.modify.title')}
        </h2>

        {reasons.length > 0 && (
          <div className="admin-notice admin-notice--failed" role="alert">
            {reasons.map((item) => (
              <p key={item} className="admin-notice__reason">
                {item}
              </p>
            ))}
          </div>
        )}

        <p className="admin-dialog__body">
          {t('grant.modify.current', { role: roleLabel(grant.role), scope: scopeText(grant.scope) })}
        </p>
        <p className="admin-dialog__body">
          {t('grant.modify.target', {
            role: roleLabel(role),
            scope: scopeKind === null ? scopeText(grant.scope) : scopeText(scopeKind === 'all' ? { kind: 'all' } : { kind: scopeKind, unitIds }),
          })}
        </p>

        <div className="admin-field">
          <span className="admin-field__label">{t('grant.create.role')}</span>
          <Selector
            label={t('grant.create.role')}
            value={role}
            placeholder={t('grant.create.role')}
            options={[
              { id: 'member', label: roleLabel('member') },
              { id: 'app_admin', label: roleLabel('app_admin') },
            ]}
            onChange={(id) => {
              setRole(id as GrantRole);
            }}
          />
        </div>

        <fieldset className="admin-field">
          <legend className="admin-field__label">{t('grant.create.scope')}</legend>
          {(['all', 'units', 'subtree'] as const).map((option) => (
            <label key={option} className="admin-radio">
              <input
                type="radio"
                name="modify-scope"
                data-modify-scope-kind={option}
                checked={scopeKind === option}
                onChange={() => {
                  setScopeKind(option);
                  setUnitIds([]);
                }}
              />
              {scopeKindLabel(option)}
            </label>
          ))}
        </fieldset>

        {scopeKind !== 'all' && (
          <UnitPicker
            units={units}
            selected={unitIds}
            variant="modify"
            message={unitsMessage}
            onChange={setUnitIds}
          />
        )}

        <p className="admin-hint">{impactNote}</p>
        {!ready && <p className="admin-hint">{t('grant.modify.noop')}</p>}

        <div className="admin-dialog__actions">
          <button type="button" className="button button--text" onClick={onClose}>
            {t('admin.cancel')}
          </button>
          <button
            type="button"
            className="button button--primary"
            data-modify-submit
            disabled={!ready || busy}
            onClick={() => {
              void submit();
            }}
          >
            {t('grant.modify.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

function sameUnits(a: readonly string[], scope: UnitScope): boolean {
  if (scope.kind === 'all') {
    return a.length === 0;
  }

  if (a.length !== scope.unitIds.length) {
    return false;
  }

  return a.every((id) => scope.unitIds.includes(id));
}
