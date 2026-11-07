import { useCallback, useEffect, useRef, useState } from 'react';
import { editionProfile, isEditionCode } from '@company-os/edition-profile';
import { t } from '@company-os/i18n';
import { Selector } from '@company-os/ui-kit';
import {
  addOrgUnitParent,
  createOrgUnit,
  deleteOrgUnit,
  fetchOrgUnits,
  fetchSettings,
  fetchUnitSettings,
  patchOrgUnit,
  removeOrgUnitParent,
  removeUnitSetting,
  saveUnitSetting,
  type ApiFailure,
  type OrgEdge,
  type OrgGraph,
  type OrgUnit,
  type SettingSource,
  type UnitSettingsPayload,
} from '../api';
import { SETTING_CHOICES, settingLabel, settingValueLabel } from './setting-labels';

/**
 * 品牌與組織（issue 120，Boss portal 管理區）。
 *
 * 三條界線，寫在程式裡而不是只寫在文件：
 *
 * 1. **不做品牌推斷**。單位只有自由文字的 `type`；這一頁不會因為 type 叫
 *    `brand` 就當它是品牌 Workspace，也不會畫品牌圖示。品牌身份契約未定。
 * 2. **選中單位 ≠ 切換品牌**。左邊選的是「這一頁的編輯目標」，頂欄的工作範圍
 *    仍然是公司。選單位不會改任何全局上下文。
 * 3. **繼承由後端算**。有效值與來源全部照 `GET /org-units/:id/settings` 回應顯示，
 *    前端不自己沿上級鏈推算。「恢復繼承」＝移除本單位覆寫，不是抄一份上級的值。
 *
 * 刪除只做軟刪除；根單位、有下級、最後一個上級、成環、重複邊全部交給後端判斷，
 * 前端把後端原文理由顯示出來，不自己另寫一套規則。
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'failed'; reasons: string[] }
  | { kind: 'denied'; status: number };

type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string }
  | { kind: 'failed'; reasons: string[] };

function reasonsOf(failure: ApiFailure, fallback: string): string[] {
  if (failure.kind === 'network') {
    return [fallback];
  }

  if (failure.reasons.length > 0) {
    return failure.reasons;
  }

  if (failure.error !== null) {
    return [failure.error];
  }

  return failure.status === 409 || failure.status === 422 ? [fallback] : [fallback];
}

/** 由上級關係排出「根 → 下級」的次序，並記住每個單位的第一個上級深度。 */
function orderUnits(graph: OrgGraph): { unit: OrgUnit; depth: number }[] {
  const byId = new Map(graph.units.map((unit) => [unit.id, unit]));
  const childrenOf = new Map<string, OrgEdge[]>();

  for (const edge of graph.edges) {
    const list = childrenOf.get(edge.parentId) ?? [];
    list.push(edge);
    childrenOf.set(edge.parentId, list);
  }

  for (const list of childrenOf.values()) {
    list.sort((left, right) => left.position - right.position || left.childId.localeCompare(right.childId));
  }

  const root = graph.units.find((unit) => unit.isRoot) ?? graph.units[0];
  const seen = new Set<string>();
  const ordered: { unit: OrgUnit; depth: number }[] = [];

  function walk(id: string, depth: number): void {
    if (seen.has(id)) {
      return;
    }

    const unit = byId.get(id);

    if (unit === undefined) {
      return;
    }

    seen.add(id);
    ordered.push({ unit, depth });

    for (const edge of childrenOf.get(id) ?? []) {
      walk(edge.childId, depth + 1);
    }
  }

  if (root !== undefined) {
    walk(root.id, 0);
  }

  // 走不到的（例如成環的殘餘）照樣列出，不可以靜靜消失。
  for (const unit of graph.units) {
    if (!seen.has(unit.id)) {
      ordered.push({ unit, depth: 0 });
    }
  }

  return ordered;
}

function parentsOf(graph: OrgGraph, id: string): string[] {
  return graph.edges.filter((edge) => edge.childId === id).map((edge) => edge.parentId);
}

/**
 * 「來源」怎樣講成人話。
 *
 * 後端給的是物件（`{ kind: 'company' }` 或 `{ kind: 'unit', unitId }`），
 * 不是字串 —— 這個函式是唯一把它變成一句話的地方。對不到單位就照實顯示 id，
 * 不要編一個名字出來；連來源都沒有就說沒有，不要借用「公司預設」。
 */
function settingSourceLabel(source: SettingSource | null, units: readonly OrgUnit[]): string {
  if (source === null) {
    return t('org.settings.sourceNone');
  }

  if (source.kind === 'company') {
    return t('org.settings.sourceCompany');
  }

  const unit = units.find((item) => item.id === source.unitId);

  return unit === undefined ? source.unitId : t('org.settings.sourceUnit', { name: unit.name });
}

export type OrganisationScreenProps = {
  onDirtyCountChange: (count: number) => void;
};

export function OrganisationScreen({ onDirtyCountChange }: OrganisationScreenProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [graph, setGraph] = useState<OrgGraph | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [edition, setEdition] = useState<string | null>(null);

  const [settingsLoad, setSettingsLoad] = useState<LoadState>({ kind: 'loading' });
  const [unitSettings, setUnitSettings] = useState<UnitSettingsPayload | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });

  /** 舊回應不可以覆蓋新目標：每次換單位就換一個號碼，號碼不對就丟掉。 */
  const settingsSeq = useRef(0);

  const loadGraph = useCallback(async (): Promise<void> => {
    setLoad({ kind: 'loading' });

    const result = await fetchOrgUnits();

    if (result.ok) {
      setGraph(result.data);
      setLoad({ kind: 'ready' });

      return;
    }

    if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
      setLoad({ kind: 'denied', status: result.failure.status });

      return;
    }

    setLoad({ kind: 'failed', reasons: reasonsOf(result.failure, t('org.loadFailed')) });
  }, []);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph, reloadKey]);

  // 公司版本：只為了知道通知渠道有哪些可選（與後端同一個 edition-profile）。
  useEffect(() => {
    void fetchSettings().then((result) => {
      if (!result.ok) {
        return;
      }

      const row = result.data.settings.find((item) => item.key === 'edition');

      setEdition(typeof row?.value === 'string' ? row.value : null);
    });
  }, []);

  const reloadSettings = useCallback(async (unitId: string): Promise<void> => {
    settingsSeq.current += 1;
    const seq = settingsSeq.current;

    setSettingsLoad({ kind: 'loading' });

    const result = await fetchUnitSettings(unitId);

    // 換了單位之後回來的舊回應：丟掉，不要套在新目標上。
    if (seq !== settingsSeq.current) {
      return;
    }

    if (result.ok) {
      setUnitSettings(result.data);
      setSettingsLoad({ kind: 'ready' });

      return;
    }

    if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
      setSettingsLoad({ kind: 'denied', status: result.failure.status });

      return;
    }

    setUnitSettings(null);
    setSettingsLoad({ kind: 'failed', reasons: reasonsOf(result.failure, t('org.settings.failed')) });
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      return;
    }

    void reloadSettings(selectedId);
  }, [selectedId, reloadSettings]);

  const units = graph?.units ?? [];
  const selected = units.find((unit) => unit.id === selectedId) ?? null;

  // 未儲存的欄位由兩個編輯器各自報上來；相加才是真的未儲存數。
  // 分開兩個 state 而不是共用一個，否則兩邊會互相覆蓋（開著新增表單再改欄位就會漏問）。
  const [unitDirty, setUnitDirty] = useState(0);
  const [createDirty, setCreateDirty] = useState(0);

  useEffect(() => {
    onDirtyCountChange(unitDirty + createDirty);
  }, [unitDirty, createDirty, onDirtyCountChange]);

  /**
   * 突變成功後重新讀伺服器。
   *
   * `reloadSettings: false` 是為刪除而設：刪除之後那個單位已經不存在，
   * 再去讀它的設定只會換來一個 404（而且是一個畫面根本用不到的請求）。
   */
  function afterMutation(message: string, options: { reloadSettings?: boolean } = {}): void {
    setAction({ kind: 'done', message });
    setReloadKey((key) => key + 1);

    if (options.reloadSettings !== false && selectedId !== null) {
      void reloadSettings(selectedId);
    }
  }

  if (load.kind === 'loading') {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">{t('org.title')}</h1>
        </div>
        <p className="admin-status" role="status">
          {t('org.loading')}
        </p>
      </div>
    );
  }

  if (load.kind === 'denied' || load.kind === 'failed') {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">{t('org.title')}</h1>
        </div>
        <div className="admin-notice admin-notice--failed" role="alert">
          <p className="admin-notice__text">
            {load.kind === 'denied'
              ? load.status === 401
                ? t('admin.sessionExpired')
                : t('org.denied')
              : t('org.loadFailed')}
          </p>
          {load.kind === 'failed' &&
            load.reasons.map((reason) => (
              <p key={reason} className="admin-notice__reason">
                {reason}
              </p>
            ))}
          {load.kind === 'failed' && (
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
      </div>
    );
  }

  const ordered = graph === null ? [] : orderUnits(graph);

  return (
    <div className="page page--wide">
      <div className="page__head">
        <h1 className="page__title">{t('org.title')}</h1>
        <p className="page__sub">{t('org.lead')}</p>
      </div>

      <p className="admin-notice admin-notice__reason">{t('org.boundary')}</p>

      {action.kind === 'failed' && (
        <div className="admin-notice admin-notice--failed" role="alert">
          <p className="admin-notice__text">{t('org.saveFailed')}</p>
          {action.reasons.map((reason) => (
            <p key={reason} className="admin-notice__reason">
              {reason}
            </p>
          ))}
        </div>
      )}

      {units.length === 0 ? (
        <p className="page__empty">{t('org.empty')}</p>
      ) : (
        <div className="org">
          <section className="org__tree" aria-label={t('org.tree')}>
            <div className="org__tree-head">
              <h2 className="admin-group__title">{t('org.tree')}</h2>
              <button
                type="button"
                className="button button--text"
                onClick={() => {
                  setCreateOpen((open) => !open);
                }}
              >
                {t('org.create')}
              </button>
            </div>

            <ul className="org__list">
              {ordered.map(({ unit, depth }) => {
                const parentCount = parentsOf(graph as OrgGraph, unit.id).length;

                return (
                  <li key={unit.id}>
                    <button
                      type="button"
                      className="org__item"
                      data-org-unit={unit.id}
                      data-root={unit.isRoot ? 'true' : 'false'}
                      aria-current={unit.id === selectedId ? 'true' : undefined}
                      style={{ paddingLeft: `calc(var(--hx-space-2) + ${depth} * var(--hx-space-3))` }}
                      onClick={() => {
                        setSelectedId(unit.id);
                        setAction({ kind: 'idle' });
                      }}
                    >
                      <span className="org__item-name">{unit.name}</span>
                      <span className="org__item-meta">
                        {unit.isRoot ? t('org.root') : unit.type}
                        {parentCount > 1 ? ` · ${t('org.parentCount', { count: parentCount })}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {createOpen && (
              <CreateUnitForm
                units={units}
                onCancel={() => {
                  setCreateOpen(false);
                }}
                onCreated={(name) => {
                  setCreateOpen(false);
                  setCreateDirty(0);
                  afterMutation(t('org.create.done'));
                  setAction({ kind: 'done', message: `${t('org.create.done')} ${name}` });
                }}
                onFailed={(reasons) => {
                  setAction({ kind: 'failed', reasons });
                }}
                onDirty={(dirty) => {
                  setCreateDirty(dirty ? 1 : 0);
                }}
              />
            )}
          </section>

          <section className="org__detail" aria-label={t('org.detail')}>
            {selected === null ? (
              <p className="page__empty">{t('org.select')}</p>
            ) : (
              <>
                <UnitEditor
                  key={selected.id}
                  unit={selected}
                  onSaved={(unit) => {
                    setUnitDirty(0);
                    setGraph((current) =>
                      current === null
                        ? current
                        : {
                            ...current,
                            units: current.units.map((item) => (item.id === unit.id ? unit : item)),
                          },
                    );
                  }}
                  onDirty={setUnitDirty}
                />
                <ParentsEditor
                  unit={selected}
                  graph={graph as OrgGraph}
                  onChanged={(message) => {
                    afterMutation(message);
                  }}
                  onFailed={(reasons) => {
                    setAction({ kind: 'failed', reasons });
                  }}
                />

                <OverridesEditor
                  unit={selected}
                  units={units}
                  load={settingsLoad}
                  payload={unitSettings}
                  edition={edition}
                  onRetry={() => {
                    void reloadSettings(selected.id);
                  }}
                  onChanged={(message) => {
                    afterMutation(message);
                  }}
                  onFailed={(reasons) => {
                    setAction({ kind: 'failed', reasons });
                  }}
                />

                {!selected.isRoot && (
                  <section className="admin-group">
                    <h2 className="admin-group__title">{t('org.delete')}</h2>
                    <button
                      type="button"
                      className="button button--danger"
                      onClick={() => {
                        setDeleteOpen(true);
                      }}
                    >
                      {t('org.delete')}
                    </button>
                  </section>
                )}

                {deleteOpen && (
                  <div className="admin-scrim">
                    <div
                      className="admin-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="org-delete-title"
                      tabIndex={-1}
                      ref={(node) => {
                        node?.focus();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setDeleteOpen(false);
                        }
                      }}
                    >
                      <p className="shell-popover__label">{t('org.tree')}</p>
                      <h2 className="admin-dialog__title" id="org-delete-title">
                        {t('org.delete.title')}
                      </h2>
                      <p className="admin-dialog__body">{t('org.delete.body')}</p>
                      <p className="admin-dialog__body">{t('org.delete.brandGap')}</p>
                      <div className="admin-dialog__actions">
                        <button
                          type="button"
                          className="button button--text"
                          onClick={() => {
                            setDeleteOpen(false);
                          }}
                        >
                          {t('org.delete.cancel')}
                        </button>
                        <button
                          type="button"
                          className="button button--danger"
                          onClick={() => {
                            void (async () => {
                              const result = await deleteOrgUnit(selected.id);

                              setDeleteOpen(false);

                              if (result.ok) {
                                setSelectedId(null);
                                setUnitSettings(null);
                                afterMutation(t('org.delete.done'), { reloadSettings: false });

                                return;
                              }

                              setAction({
                                kind: 'failed',
                                reasons: reasonsOf(result.failure, t('org.delete.failed')),
                              });
                            })();
                          }}
                        >
                          {t('org.delete.confirm')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* ── 建立單位 ─────────────────────────────────────────────────────────── */

function CreateUnitForm({
  units,
  onCreated,
  onCancel,
  onFailed,
  onDirty,
}: {
  units: readonly OrgUnit[];
  onCreated: (name: string) => void;
  onCancel: () => void;
  onFailed: (reasons: string[]) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [parentIds, setParentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const dirty =
    name !== '' || type !== '' || country !== '' || currency !== '' || timezone !== '' || parentIds.length > 0;

  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);

  async function submit(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);

    const result = await createOrgUnit({
      name: name.trim(),
      type: type.trim(),
      country: country.trim() === '' ? null : country.trim(),
      currency: currency.trim() === '' ? null : currency.trim(),
      timezone: timezone.trim() === '' ? null : timezone.trim(),
      parentIds,
    });

    setBusy(false);

    if (result.ok) {
      onCreated(result.data.unit.name);

      return;
    }

    // 失敗保留輸入：不清空、不關表單。
    onFailed(reasonsOf(result.failure, t('org.saveFailed')));
  }

  return (
    <div className="org__create">
      <p className="org__create-hint">{t('org.create.hint')}</p>

      <label className="org__field">
        <span className="org__field-label">{t('org.field.name')}</span>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <label className="org__field">
        <span className="org__field-label">{t('org.field.type')}</span>
        <input className="input" value={type} onChange={(event) => setType(event.target.value)} />
      </label>

      <label className="org__field">
        <span className="org__field-label">{t('org.field.country')}</span>
        <input className="input" value={country} onChange={(event) => setCountry(event.target.value)} />
      </label>

      <label className="org__field">
        <span className="org__field-label">{t('org.field.currency')}</span>
        <input className="input" value={currency} onChange={(event) => setCurrency(event.target.value)} />
      </label>

      <label className="org__field">
        <span className="org__field-label">{t('org.field.timezone')}</span>
        <input className="input" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
      </label>

      <fieldset className="org__field">
        <legend className="org__field-label">{t('org.parents')}</legend>
        <div className="org__parents-pick">
          {units.map((unit) => (
            <label key={unit.id} className="admin-check">
              <input
                type="checkbox"
                checked={parentIds.includes(unit.id)}
                onChange={(event) => {
                  setParentIds((current) =>
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
      </fieldset>

      <div className="org__create-actions">
        <button type="button" className="button button--text" onClick={onCancel}>
          {t('org.create.cancel')}
        </button>
        <button type="button" className="button button--primary" disabled={busy} onClick={() => void submit()}>
          {busy ? t('org.saving') : t('org.create.submit')}
        </button>
      </div>
    </div>
  );
}

/* ── 編輯單位欄位 ─────────────────────────────────────────────────────── */

function UnitEditor({
  unit,
  onSaved,
  onDirty,
}: {
  unit: OrgUnit;
  onSaved: (unit: OrgUnit) => void;
  onDirty: (count: number) => void;
}) {
  const initial = {
    name: unit.name,
    type: unit.type,
    country: unit.country ?? '',
    currency: unit.currency ?? '',
    timezone: unit.timezone ?? '',
  };
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<ActionState>({ kind: 'idle' });

  const changed = Object.keys(initial).filter(
    (key) => draft[key as keyof typeof initial] !== initial[key as keyof typeof initial],
  );

  useEffect(() => {
    onDirty(changed.length);
  }, [changed.length, onDirty]);

  async function save(): Promise<void> {
    if (status.kind === 'busy') {
      return;
    }

    setStatus({ kind: 'busy' });

    const result = await patchOrgUnit(unit.id, {
      name: draft.name.trim(),
      type: draft.type.trim(),
      country: draft.country.trim() === '' ? null : draft.country.trim(),
      currency: draft.currency.trim() === '' ? null : draft.currency.trim(),
      timezone: draft.timezone.trim() === '' ? null : draft.timezone.trim(),
    });

    if (result.ok) {
      setStatus({ kind: 'done', message: t('org.saved') });
      onSaved(result.data.unit);

      return;
    }

    // 失敗留在原地：只有這一節紅，不另外在頁頂再印一次同一句理由。
    setStatus({ kind: 'failed', reasons: reasonsOf(result.failure, t('org.saveFailed')) });
  }

  return (
    <section className="admin-group org__unit">
      <h2 className="admin-group__title">
        {unit.isRoot ? t('org.root') : t('org.unit')}
        <span className="org__unit-id">{unit.id}</span>
      </h2>

      {unit.isRoot && <p className="admin-row__reason">{t('org.rootNote')}</p>}

      <div className="org__fields">
        {(
          [
            ['name', 'org.field.name'],
            ['type', 'org.field.type'],
            ['country', 'org.field.country'],
            ['currency', 'org.field.currency'],
            ['timezone', 'org.field.timezone'],
          ] as const
        ).map(([key, labelKey]) => (
          <label key={key} className="org__field">
            <span className="org__field-label">{t(labelKey)}</span>
            <input
              className="input"
              value={draft[key]}
              onChange={(event) => {
                setDraft((current) => ({ ...current, [key]: event.target.value }));
                setStatus({ kind: 'idle' });
              }}
            />
          </label>
        ))}
      </div>

      <div className="org__actions">
        <button
          type="button"
          className="button button--primary admin-save"
          disabled={changed.length === 0 || status.kind === 'busy'}
          onClick={() => void save()}
        >
          {status.kind === 'busy' ? t('org.saving') : t('org.save')}
        </button>

        <span className="admin-row__state" role="status">
          {status.kind === 'done' ? status.message : null}
          {status.kind === 'idle' && changed.length === 0 ? t('org.unchanged') : null}
          {status.kind === 'failed' ? t('org.saveFailed') : null}
        </span>
      </div>

      {status.kind === 'failed' && (
        <div className="admin-row__failure" role="alert">
          {status.reasons.map((reason) => (
            <p key={reason} className="admin-row__reason">
              {reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── 上級關係 ─────────────────────────────────────────────────────────── */

function ParentsEditor({
  unit,
  graph,
  onChanged,
  onFailed,
}: {
  unit: OrgUnit;
  graph: OrgGraph;
  onChanged: (message: string) => void;
  onFailed: (reasons: string[]) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parents = parentsOf(graph, unit.id);
  const parentUnits = parents
    .map((id) => graph.units.find((item) => item.id === id))
    .filter((item): item is OrgUnit => item !== undefined);
  const candidates = graph.units.filter(
    (item) => item.id !== unit.id && !parents.includes(item.id),
  );

  async function add(): Promise<void> {
    if (pick === null || busy) {
      return;
    }

    setBusy(true);

    const result = await addOrgUnitParent(unit.id, pick, parents.length);

    setBusy(false);

    if (result.ok) {
      setPick(null);
      onChanged(t('org.parents.added'));

      return;
    }

    onFailed(reasonsOf(result.failure, t('org.parents.failed')));
  }

  async function remove(parentId: string): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);

    const result = await removeOrgUnitParent(unit.id, parentId);

    setBusy(false);

    if (result.ok) {
      onChanged(t('org.parents.removed'));

      return;
    }

    onFailed(reasonsOf(result.failure, t('org.parents.failed')));
  }

  return (
    <section className="admin-group">
      <h2 className="admin-group__title">{t('org.parents')}</h2>

      {parentUnits.length === 0 ? (
        <p className="admin-row__reason">{t('org.parents.none')}</p>
      ) : (
        <ul className="org__parents">
          {parentUnits.map((parent) => (
            <li key={parent.id} className="org__parent">
              <span className="org__parent-name">{parent.name}</span>
              <button
                type="button"
                className="button button--text"
                disabled={busy || parentUnits.length <= 1}
                title={parentUnits.length <= 1 ? t('org.parents.last') : undefined}
                onClick={() => void remove(parent.id)}
              >
                {t('org.parents.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!unit.isRoot && candidates.length > 0 && (
        <div className="org__add-parent">
          <Selector
            label={t('org.parents.select')}
            value={pick}
            options={candidates.map((item) => ({ id: item.id, label: item.name }))}
            placeholder={t('org.parents.select')}
            onChange={(id) => {
              setPick(id);
            }}
          />
          <button
            type="button"
            className="button button--primary"
            disabled={pick === null || busy}
            onClick={() => void add()}
          >
            {t('org.parents.add')}
          </button>
        </div>
      )}

      {/* 根單位「無上級」的理由已經由上面那句講清楚，不再重覆印一次公司根說明。 */}
    </section>
  );
}

/* ── 單位設定覆寫 ─────────────────────────────────────────────────────── */

function OverridesEditor({
  unit,
  units,
  load,
  payload,
  edition,
  onRetry,
  onChanged,
  onFailed,
}: {
  unit: OrgUnit;
  units: readonly OrgUnit[];
  load: LoadState;
  payload: UnitSettingsPayload | null;
  edition: string | null;
  onRetry: () => void;
  onChanged: (message: string) => void;
  onFailed: (reasons: string[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (load.kind === 'loading') {
    return (
      <section className="admin-group">
        <h2 className="admin-group__title">{t('org.settings')}</h2>
        <p className="admin-status">{t('org.settings.loading')}</p>
      </section>
    );
  }

  if (load.kind !== 'ready' || payload === null) {
    const message =
      load.kind === 'denied'
        ? load.status === 401
          ? t('admin.sessionExpired')
          : t('org.denied')
        : t('org.settings.failed');

    return (
      <section className="admin-group">
        <h2 className="admin-group__title">{t('org.settings')}</h2>
        <div className="admin-notice admin-notice--failed" role="alert">
          <p className="admin-notice__text">{message}</p>
          {load.kind === 'failed' &&
            load.reasons.map((reason) => (
              <p key={reason} className="admin-notice__reason">
                {reason}
              </p>
            ))}
          {load.kind === 'failed' && (
            <button type="button" className="button button--text admin-notice__action" onClick={onRetry}>
              {t('admin.retry')}
            </button>
          )}
        </div>
      </section>
    );
  }

  const overridden = new Set(payload.overrides.map((item) => item.key));

  async function save(key: string): Promise<void> {
    if (busy !== null) {
      return;
    }

    setBusy(key);

    const result = await saveUnitSetting(unit.id, key, value);

    setBusy(null);

    if (result.ok) {
      setEditing(null);
      onChanged(t('org.settings.saved'));

      return;
    }

    onFailed(reasonsOf(result.failure, t('org.settings.failedSave')));
  }

  async function revert(key: string): Promise<void> {
    if (busy !== null) {
      return;
    }

    setBusy(key);

    const result = await removeUnitSetting(unit.id, key);

    setBusy(null);

    if (result.ok) {
      onChanged(t('org.settings.reverted'));

      return;
    }

    onFailed(reasonsOf(result.failure, t('org.settings.failedSave')));
  }

  return (
    <section className="admin-group">
      <h2 className="admin-group__title">{t('org.settings')}</h2>
      <p className="admin-row__reason">{t('org.settings.lead')}</p>

      <ul className="admin-list">
        {payload.settings.map((setting) => {
          const isOverridden = overridden.has(setting.key);
          const sourceName = settingSourceLabel(setting.source, units);

          return (
            <li key={setting.key} className="admin-row" data-unit-setting={setting.key}>
              <div className="admin-row__text">
                <p className="admin-row__label">{settingLabel(setting.key)}</p>
                <p className="admin-row__purpose">
                  {isOverridden ? t('org.settings.overridden') : t('org.settings.inherited')}
                </p>
              </div>

              <div className="admin-row__control">
                <span className="admin-row__value">{settingValueLabel(setting.key, setting.value)}</span>
                <span className="admin-row__reason">
                  {`${t('org.settings.source')}：${sourceName}`}
                </span>

                {editing === setting.key && (
                  <div className="org__override-edit">
                    <OverrideInput
                      settingKey={setting.key}
                      value={value}
                      edition={edition}
                      onChange={setValue}
                    />
                  </div>
                )}
              </div>

              <div className="admin-row__actions">
                {editing === setting.key ? (
                  <>
                    <button
                      type="button"
                      className="button button--primary admin-save"
                      disabled={busy === setting.key}
                      onClick={() => void save(setting.key)}
                    >
                      {busy === setting.key ? t('org.saving') : t('org.save')}
                    </button>
                    <button
                      type="button"
                      className="button button--text"
                      onClick={() => {
                        setEditing(null);
                      }}
                    >
                      {t('org.create.cancel')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button button--text"
                      onClick={() => {
                        setEditing(setting.key);
                        setValue(setting.value);
                      }}
                    >
                      {t('org.settings.set')}
                    </button>
                    {isOverridden && (
                      <button
                        type="button"
                        className="button button--text"
                        disabled={busy === setting.key}
                        onClick={() => void revert(setting.key)}
                      >
                        {t('org.settings.revert')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OverrideInput({
  settingKey,
  value,
  edition,
  onChange,
}: {
  settingKey: string;
  value: unknown;
  edition: string | null;
  onChange: (value: unknown) => void;
}) {
  const choices = SETTING_CHOICES[settingKey];

  if (choices !== undefined) {
    return (
      <Selector
        label={settingLabel(settingKey)}
        value={typeof value === 'string' ? value : null}
        options={choices.map((choice) => ({ id: choice.value, label: t(choice.labelKey) }))}
        placeholder={t('admin.value.unset')}
        onChange={onChange}
      />
    );
  }

  if (settingKey === 'department_isolation') {
    return (
      <label className="admin-check">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        <span>{value === true ? t('admin.value.yes') : t('admin.value.no')}</span>
      </label>
    );
  }

  if (settingKey === 'overdue_grace_hours') {
    return (
      <input
        className="input admin-number"
        type="number"
        inputMode="numeric"
        aria-label={settingLabel(settingKey)}
        value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
        onChange={(event) => {
          const raw = event.target.value.trim();
          const parsed = Number(raw);

          onChange(raw === '' ? '' : Number.isFinite(parsed) ? parsed : raw);
        }}
      />
    );
  }

  if (settingKey === 'notification_channels') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    const channels = isEditionCode(String(edition)) ? editionProfile(String(edition) as 'intl' | 'cn').channels : [];

    if (channels.length === 0) {
      return <p className="admin-row__reason">{t('org.noVersion')}</p>;
    }

    return (
      <div className="admin-channels__list">
        {channels.map((channel) => {
          const code = String(channel);

          return (
            <label key={code} className="admin-check">
              <input
                type="checkbox"
                checked={selected.includes(code)}
                onChange={(event) => {
                  onChange(
                    event.target.checked
                      ? [...selected, code]
                      : selected.filter((item) => item !== code),
                  );
                }}
              />
              <span className="admin-channels__code">{code}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return <p className="admin-row__reason">{t('org.noVersion')}</p>;
}
