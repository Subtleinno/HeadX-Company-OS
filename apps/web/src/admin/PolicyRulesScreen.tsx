import { useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '@company-os/i18n';
import {
  createPolicyRule,
  deletePolicyRule,
  fetchOrgUnits,
  fetchPolicyRules,
  patchPolicyRule,
  type ApiFailure,
  type OrgUnit,
  type PolicyAction,
  type PolicyClause,
  type PolicyCondition,
  type PolicyOperator,
  type PolicyRule,
  type PolicyRuleInput,
  type PolicyRulePatch,
} from '../api';

/**
 * 政策規則頁（issue 162，管理區第五頁）。
 *
 * 三條底線全部來自 issue 同 `AGENTS.md` 不變量 4：
 *
 * 1. **規則只有一個來源**：`GET /policy-rules`。前端唔存副本、唔放示例規則、
 *    唔用種子檔、唔用 localStorage。每次寫入成功後重新 GET，畫面以重新讀取
 *    結果為準 —— 後端 PATCH 無版本欄位，所以唔假裝做衝突偵測。
 * 2. **空畫面講真話**：空清單明講「沒有規則＝全部要批准」（決策 C04），
 *    唔暗示空等於全部放行。讀取失敗／401／403／網絡失敗係四個唔同狀態，
 *    唔可以摺成「空清單」。
 * 3. **唔講大話**：422 `reasons` 原樣顯示；404 用 `policy.error.notFound`；
 *    網絡失敗用 `error.network`；單位名讀唔到就顯示 id 並如實講明；
 *    儲存成功只講「已儲存」，唔講「已生效」。
 *
 * 前端只做必填同數字格式檢查，其餘合法性交畀後端 422；POST 只帶後端認得嘅
 * 七個欄位，一個多餘鍵都唔加。
 */

const COLUMNS: readonly MessageKey[] = [
  'policy.column.domain',
  'policy.column.condition',
  'policy.column.action',
  'policy.column.priority',
  'policy.column.state',
  'policy.column.scope',
  'policy.column.note',
  'policy.column.updatedAt',
];

const OPERATOR_LABEL: Record<PolicyOperator, MessageKey> = {
  eq: 'policy.operator.eq',
  lte: 'policy.operator.lte',
  gte: 'policy.operator.gte',
  in: 'policy.operator.in',
};

type ValueType = 'text' | 'number' | 'boolean';

/** 一條子句嘅編輯草稿：型別由用戶揀，前端唔自動猜。 */
type ClauseDraft = {
  field: string;
  op: PolicyOperator;
  valueType: ValueType;
  rawValue: string;
  listRaw: string;
  currency: string;
  booleanValue: boolean;
};

type FormDraft = {
  domain: string;
  clauses: ClauseDraft[];
  action: PolicyAction;
  priority: string;
  enabled: boolean;
  note: string;
  scope: 'company' | 'unit';
  orgUnitId: string;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; rules: PolicyRule[]; units: OrgUnit[] | null }
  | { kind: 'denied'; status: number }
  | { kind: 'failed'; message: string; reasons: string[] };

type Notice = { kind: 'done'; message: string; reasons: string[] } | { kind: 'failed'; message: string; reasons: string[] } | null;

function emptyClause(): ClauseDraft {
  return {
    field: '',
    op: 'eq',
    valueType: 'text',
    rawValue: '',
    listRaw: '',
    currency: '',
    booleanValue: true,
  };
}

function emptyDraft(): FormDraft {
  return {
    domain: '',
    clauses: [emptyClause()],
    action: 'require_approval',
    priority: '',
    enabled: true,
    note: '',
    scope: 'company',
    orgUnitId: '',
  };
}

function scalarType(value: unknown): ValueType {
  return typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text';
}

/** 由後端既有規則還原成表單草稿；顯示既有事實，唔係替用戶猜型別。 */
function clauseToDraft(clause: PolicyClause): ClauseDraft {
  const base = emptyClause();
  base.field = clause.field;
  base.op = clause.op;

  if (clause.op === 'lte' || clause.op === 'gte') {
    return {
      ...base,
      valueType: 'number',
      rawValue: String(clause.value),
      currency: clause.currency ?? '',
    };
  }

  if (clause.op === 'in') {
    const items = Array.isArray(clause.value) ? clause.value : [clause.value];

    return {
      ...base,
      valueType: items.length > 0 ? scalarType(items[0]) : 'text',
      listRaw: items.map(String).join('、'),
    };
  }

  return {
    ...base,
    valueType: scalarType(clause.value),
    // boolean 值由 booleanValue 承載；rawValue 只留純標示值，唔硬寫中文介面字串。
    rawValue: String(clause.value),
    booleanValue: clause.value === true,
  };
}

function draftFromRule(rule: PolicyRule): FormDraft {
  return {
    domain: rule.domain,
    clauses: rule.condition.all.map(clauseToDraft),
    action: rule.action,
    priority: String(rule.priority),
    enabled: rule.enabled,
    note: rule.note ?? '',
    scope: rule.orgUnitId === null ? 'company' : 'unit',
    orgUnitId: rule.orgUnitId ?? '',
  };
}

function parseScalar(raw: string, kind: ValueType): string | number | boolean {
  if (kind === 'number') {
    return Number(raw);
  }

  if (kind === 'boolean') {
    // 「是」嚟自既有字串表，唔喺畫面硬寫中文。
    return raw === 'true' || raw === t('admin.value.yes');
  }

  return raw;
}

/** 子句物件嘅鍵順序照後端 `CLAUSE_FIELDS`：field／op／value／currency。 */
function buildClause(clause: ClauseDraft): PolicyClause {
  const field = clause.field.trim();

  if (clause.op === 'lte' || clause.op === 'gte') {
    return {
      field,
      op: clause.op,
      value: Number(clause.rawValue),
      currency: clause.currency.trim(),
    };
  }

  if (clause.op === 'in') {
    const items = clause.listRaw
      .split(/[、,]/)
      .map((item) => item.trim())
      .filter((item) => item !== '');

    return { field, op: 'in', value: items.map((item) => parseScalar(item, clause.valueType)) };
  }

  const value =
    clause.valueType === 'boolean' ? clause.booleanValue : parseScalar(clause.rawValue, clause.valueType);

  return { field, op: 'eq', value };
}

function buildInput(draft: FormDraft): PolicyRuleInput {
  return {
    domain: draft.domain.trim(),
    condition: { all: draft.clauses.map(buildClause) },
    action: draft.action,
    priority: draft.priority.trim() === '' ? 100 : Number(draft.priority.trim()),
    enabled: draft.enabled,
    note: draft.note.trim() === '' ? null : draft.note,
    orgUnitId: draft.scope === 'company' ? null : draft.orgUnitId,
  };
}

/** 編輯只送改動咗嘅欄位；後端 PATCH 收到空物件會 422，所以空 diff 唔提交。 */
function buildPatch(next: PolicyRuleInput, original: PolicyRule): PolicyRulePatch {
  const patch: PolicyRulePatch = {};

  if (next.domain !== original.domain) {
    patch.domain = next.domain;
  }
  if (JSON.stringify(next.condition) !== JSON.stringify(original.condition)) {
    patch.condition = next.condition;
  }
  if (next.action !== original.action) {
    patch.action = next.action;
  }
  if (next.priority !== original.priority) {
    patch.priority = next.priority;
  }
  if (next.enabled !== original.enabled) {
    patch.enabled = next.enabled;
  }
  if (next.note !== original.note) {
    patch.note = next.note;
  }
  if (next.orgUnitId !== original.orgUnitId) {
    patch.orgUnitId = next.orgUnitId;
  }

  return patch;
}

/** 前端只做必填同數字格式檢查；其餘理由一律由後端 422 原樣講。 */
function formProblems(draft: FormDraft): string[] {
  const out: string[] = [];

  if (draft.domain.trim() === '') {
    out.push(t('policy.form.domainHint'));
  }
  if (draft.clauses.length === 0) {
    out.push(t('policy.form.clauseRequired'));
  }

  for (const clause of draft.clauses) {
    if (clause.field.trim() === '') {
      out.push(t('policy.form.clauseField'));
    }

    if (clause.op === 'lte' || clause.op === 'gte') {
      if (clause.currency.trim() === '') {
        out.push(t('policy.form.clauseCurrencyHint'));
      }
      if (clause.rawValue.trim() === '' || !Number.isFinite(Number(clause.rawValue))) {
        out.push(t('policy.form.clauseValue'));
      }
    } else if (clause.op === 'in') {
      if (clause.listRaw.trim() === '') {
        out.push(t('policy.form.clauseListHint'));
      }
    } else if (clause.valueType !== 'boolean' && clause.rawValue.trim() === '') {
      out.push(t('policy.form.clauseValue'));
    }
  }

  if (draft.priority.trim() !== '' && !/^-?\d+$/.test(draft.priority.trim())) {
    out.push(t('policy.form.priorityHint'));
  }
  if (draft.scope === 'unit' && draft.orgUnitId === '') {
    out.push(t('policy.form.unitSelect'));
  }

  return out;
}

function failureInfo(failure: ApiFailure): { message: string; reasons: string[] } {
  if (failure.kind === 'network') {
    return { message: t('error.network'), reasons: [] };
  }

  if (failure.status === 404 && failure.error === 'policy_rule_not_found') {
    return { message: t('policy.error.notFound'), reasons: [] };
  }

  if (failure.status === 401) {
    return { message: t('admin.sessionExpired'), reasons: [] };
  }

  if (failure.status === 403) {
    return { message: t('policy.denied'), reasons: [] };
  }

  const reasons =
    failure.reasons.length > 0
      ? failure.reasons
      : failure.message !== null
        ? [failure.message]
        : [];

  return { message: t('policy.failed'), reasons };
}

function isNotFound(failure: ApiFailure): boolean {
  return failure.kind === 'http' && failure.status === 404 && failure.error === 'policy_rule_not_found';
}

function formatAt(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('zh-HK', { dateStyle: 'short', timeStyle: 'short' });
}

function conditionText(condition: PolicyCondition): string {
  return condition.all
    .map((clause) => {
      switch (clause.op) {
        case 'eq':
          return t('policy.condition.eq', { field: clause.field, value: String(clause.value) });
        case 'lte':
          return t('policy.condition.lte', {
            field: clause.field,
            currency: String(clause.currency ?? ''),
            amount: String(clause.value),
          });
        case 'gte':
          return t('policy.condition.gte', {
            field: clause.field,
            currency: String(clause.currency ?? ''),
            amount: String(clause.value),
          });
        case 'in': {
          const items = Array.isArray(clause.value) ? clause.value : [clause.value];

          return t('policy.condition.in', {
            field: clause.field,
            values: items.map(String).join('、'),
          });
        }
      }
    })
    .join('；');
}

function scopeText(rule: PolicyRule, units: OrgUnit[] | null): string {
  if (rule.orgUnitId === null) {
    return t('policy.scope.company');
  }

  const unit = units?.find((item) => item.id === rule.orgUnitId);

  return unit === undefined
    ? t('policy.scope.unitNameUnknown', { id: rule.orgUnitId })
    : t('policy.scope.unit', { name: unit.name });
}

export type PolicyRulesScreenProps = {
  /** 未儲存嘅表單數；管理區用佢決定離開前要唔要問。 */
  onDirtyCountChange: (count: number) => void;
};

export function PolicyRulesScreen({ onDirtyCountChange }: PolicyRulesScreenProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<FormDraft | null>(null);
  const [editing, setEditing] = useState<PolicyRule | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<PolicyRule | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoad({ kind: 'loading' });

    void Promise.all([fetchPolicyRules(), fetchOrgUnits()]).then(([rulesResult, unitsResult]) => {
      if (cancelled) {
        return;
      }

      if (!rulesResult.ok) {
        const failure = rulesResult.failure;

        if (failure.kind === 'http' && (failure.status === 401 || failure.status === 403)) {
          setLoad({ kind: 'denied', status: failure.status });

          return;
        }

        if (failure.kind === 'network') {
          setLoad({ kind: 'failed', message: t('error.network'), reasons: [] });

          return;
        }

        const reasons =
          failure.reasons.length > 0
            ? failure.reasons
            : failure.message !== null
              ? [failure.message]
              : failure.error !== null
                ? [failure.error]
                : [];

        setLoad({ kind: 'failed', message: t('policy.loadFailed'), reasons });

        return;
      }

      // 單位名只係顯示用嘅輔助資料；讀唔到就標記 null，唔影響規則清單本身。
      setLoad({
        kind: 'ready',
        rules: rulesResult.data.rules,
        units: unitsResult.ok ? unitsResult.data.units : null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const formOpen = form !== null;

  useEffect(() => {
    onDirtyCountChange(formOpen ? 1 : 0);
  }, [formOpen, onDirtyCountChange]);

  // 刪除對話框：開啟時焦點入對話框，Escape 由文件層級收，唔靠焦點啱啱落喺邊個掣。
  useEffect(() => {
    if (deleteTarget === null) {
      return;
    }

    deleteDialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDeleteTarget(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [deleteTarget]);

  useEffect(() => {
    if (!formOpen) {
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
  }, [formOpen]);

  function patchForm(partial: Partial<FormDraft>): void {
    setForm((previous) => (previous === null ? previous : { ...previous, ...partial }));
  }

  function patchClause(index: number, partial: Partial<ClauseDraft>): void {
    setForm((previous) =>
      previous === null
        ? previous
        : {
            ...previous,
            clauses: previous.clauses.map((clause, i) =>
              i === index ? { ...clause, ...partial } : clause,
            ),
          },
    );
  }

  function applyFailure(failure: ApiFailure): void {
    const info = failureInfo(failure);

    setNotice({ kind: 'failed', message: info.message, reasons: info.reasons });

    // 404 代表規則已經唔存在：如實講，同時重新讀取最新清單。
    if (isNotFound(failure)) {
      setReloadKey((key) => key + 1);
    }
  }

  function openCreate(): void {
    setEditing(null);
    setForm(emptyDraft());
    setProblems([]);
    setNotice(null);
  }

  function openEdit(rule: PolicyRule): void {
    setEditing(rule);
    setForm(draftFromRule(rule));
    setProblems([]);
    setNotice(null);
  }

  function closeForm(): void {
    setForm(null);
    setEditing(null);
    setProblems([]);
  }

  async function submitForm(): Promise<void> {
    if (form === null || busy) {
      return;
    }

    const found = formProblems(form);

    setProblems(found);

    if (found.length > 0) {
      return;
    }

    const input = buildInput(form);

    setBusy(true);
    setNotice(null);

    if (editing === null) {
      const result = await createPolicyRule(input);

      setBusy(false);

      if (!result.ok) {
        applyFailure(result.failure);

        return;
      }

      closeForm();
      setNotice({ kind: 'done', message: t('policy.success.created'), reasons: [] });
      setReloadKey((key) => key + 1);

      return;
    }

    const patch = buildPatch(input, editing);

    if (Object.keys(patch).length === 0) {
      setBusy(false);
      closeForm();

      return;
    }

    const result = await patchPolicyRule(editing.id, patch);

    setBusy(false);

    if (!result.ok) {
      applyFailure(result.failure);

      return;
    }

    closeForm();
    setNotice({ kind: 'done', message: t('policy.success.saved'), reasons: [] });
    setReloadKey((key) => key + 1);
  }

  async function toggleEnabled(rule: PolicyRule): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setNotice(null);

    const result = await patchPolicyRule(rule.id, { enabled: !rule.enabled });

    setBusy(false);

    if (!result.ok) {
      applyFailure(result.failure);

      return;
    }

    setNotice({
      kind: 'done',
      message: t(rule.enabled ? 'policy.success.disabled' : 'policy.success.enabled'),
      reasons: [],
    });
    setReloadKey((key) => key + 1);
  }

  async function confirmDelete(): Promise<void> {
    const target = deleteTarget;

    if (target === null || busy) {
      return;
    }

    setBusy(true);
    setNotice(null);

    const result = await deletePolicyRule(target.id);

    setBusy(false);
    setDeleteTarget(null);

    if (!result.ok) {
      applyFailure(result.failure);

      return;
    }

    setNotice({ kind: 'done', message: t('policy.success.deleted'), reasons: [] });
    setReloadKey((key) => key + 1);
  }

  function renderRow(rule: PolicyRule, units: OrgUnit[] | null) {
    return (
      <tr key={rule.id} data-policy-rule-id={rule.id}>
        <td className="policy-cell">{rule.domain}</td>
        <td className="policy-cell policy-cell--condition">{conditionText(rule.condition)}</td>
        <td className="policy-cell">
          {rule.action === 'allow' ? t('policy.action.allow') : t('policy.action.require_approval')}
        </td>
        <td className="policy-cell">{String(rule.priority)}</td>
        <td className="policy-cell">
          {rule.enabled ? t('policy.state.enabled') : t('policy.state.disabled')}
        </td>
        <td className="policy-cell">{scopeText(rule, units)}</td>
        <td className="policy-cell">{rule.note ?? ''}</td>
        <td className="policy-cell">{formatAt(rule.updatedAt)}</td>
        <td className="policy-cell policy-actions">
          <button
            type="button"
            className="button button--text"
            disabled={busy}
            onClick={() => openEdit(rule)}
          >
            {t('policy.action.edit')}
          </button>
          <button
            type="button"
            className="button button--text"
            disabled={busy}
            onClick={() => void toggleEnabled(rule)}
          >
            {rule.enabled ? t('policy.action.disable') : t('policy.action.enable')}
          </button>
          <button
            type="button"
            className="button button--text button--danger"
            disabled={busy}
            onClick={() => setDeleteTarget(rule)}
          >
            {t('policy.action.delete')}
          </button>
        </td>
      </tr>
    );
  }

  function renderClause(clause: ClauseDraft, index: number) {
    const amountOp = clause.op === 'lte' || clause.op === 'gte';

    return (
      <div className="policy-clause" data-policy-clause key={index}>
        <label className="admin-field">
          <span className="admin-field__label">{t('policy.form.clauseField')}</span>
          <input
            className="input"
            type="text"
            aria-label={t('policy.form.clauseField')}
            value={clause.field}
            onChange={(event) => patchClause(index, { field: event.target.value })}
          />
        </label>

        <label className="admin-field">
          <span className="admin-field__label">{t('policy.form.clauseOperator')}</span>
          <select
            className="input"
            aria-label={t('policy.form.clauseOperator')}
            value={clause.op}
            onChange={(event) => {
              const op = event.target.value as PolicyOperator;

              patchClause(index, {
                op,
                // 金額比較一律數字（後端規定），前端唔提供其他型別。
                valueType: amountOpFor(op) ? 'number' : clause.valueType,
              });
            }}
          >
            {(Object.keys(OPERATOR_LABEL) as PolicyOperator[]).map((op) => (
              <option key={op} value={op}>
                {t(OPERATOR_LABEL[op])}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span className="admin-field__label">{t('policy.form.valueType')}</span>
          <select
            className="input"
            aria-label={t('policy.form.valueType')}
            value={clause.valueType}
            disabled={amountOp}
            onChange={(event) => patchClause(index, { valueType: event.target.value as ValueType })}
          >
            <option value="text">{t('policy.form.valueType.text')}</option>
            <option value="number">{t('policy.form.valueType.number')}</option>
            <option value="boolean">{t('policy.form.valueType.boolean')}</option>
          </select>
        </label>

        {clause.op === 'in' ? (
          <label className="admin-field">
            <span className="admin-field__label">{t('policy.form.clauseValue')}</span>
            <input
              className="input"
              type="text"
              aria-label={t('policy.form.clauseValue')}
              value={clause.listRaw}
              onChange={(event) => patchClause(index, { listRaw: event.target.value })}
            />
            <span className="admin-hint">{t('policy.form.clauseListHint')}</span>
          </label>
        ) : clause.op === 'eq' && clause.valueType === 'boolean' ? (
          <label className="admin-field">
            <span className="admin-field__label">{t('policy.form.clauseValue')}</span>
            <select
              className="input"
              aria-label={t('policy.form.clauseValue')}
              value={clause.booleanValue ? 'yes' : 'no'}
              onChange={(event) => patchClause(index, { booleanValue: event.target.value === 'yes' })}
            >
              <option value="yes">{t('admin.value.yes')}</option>
              <option value="no">{t('admin.value.no')}</option>
            </select>
          </label>
        ) : (
          <label className="admin-field">
            <span className="admin-field__label">{t('policy.form.clauseValue')}</span>
            <input
              className="input"
              type="text"
              aria-label={t('policy.form.clauseValue')}
              value={clause.rawValue}
              onChange={(event) => patchClause(index, { rawValue: event.target.value })}
            />
          </label>
        )}

        {amountOp && (
          <label className="admin-field">
            <span className="admin-field__label">{t('policy.form.clauseCurrency')}</span>
            <input
              className="input"
              type="text"
              aria-label={t('policy.form.clauseCurrency')}
              value={clause.currency}
              onChange={(event) => patchClause(index, { currency: event.target.value })}
            />
            <span className="admin-hint">{t('policy.form.clauseCurrencyHint')}</span>
          </label>
        )}

        <button
          type="button"
          className="button button--text"
          onClick={() =>
            setForm((previous) =>
              previous === null
                ? previous
                : { ...previous, clauses: previous.clauses.filter((_, i) => i !== index) },
            )
          }
        >
          {t('policy.form.clauseRemove')}
        </button>
      </div>
    );
  }

  function renderForm() {
    if (form === null) {
      return null;
    }

    const units = load.kind === 'ready' ? load.units : null;

    return (
      <form
        className="admin-form policy-form"
        data-policy-form
        onSubmit={(event) => {
          event.preventDefault();
          void submitForm();
        }}
      >
        <h2 className="policy-form__title">
          {t(editing === null ? 'policy.form.createTitle' : 'policy.form.editTitle')}
        </h2>

        <label className="admin-field">
          <span className="admin-field__label">{t('policy.form.domain')}</span>
          <input
            className="input"
            type="text"
            aria-label={t('policy.form.domain')}
            value={form.domain}
            onChange={(event) => patchForm({ domain: event.target.value })}
          />
          <span className="admin-hint">{t('policy.form.domainHint')}</span>
        </label>

        <fieldset className="admin-field policy-clauses">
          <legend className="admin-field__label">{t('policy.form.condition')}</legend>
          {form.clauses.map((clause, index) => renderClause(clause, index))}
          <button
            type="button"
            className="button button--text"
            onClick={() =>
              setForm((previous) =>
                previous === null
                  ? previous
                  : { ...previous, clauses: [...previous.clauses, emptyClause()] },
              )
            }
          >
            {t('policy.form.clauseAdd')}
          </button>
          <span className="admin-hint">{t('policy.form.clauseRequired')}</span>
        </fieldset>

        <label className="admin-field">
          <span className="admin-field__label">{t('policy.form.action')}</span>
          <select
            className="input"
            aria-label={t('policy.form.action')}
            value={form.action}
            onChange={(event) => patchForm({ action: event.target.value as PolicyAction })}
          >
            <option value="allow">{t('policy.action.allow')}</option>
            <option value="require_approval">{t('policy.action.require_approval')}</option>
          </select>
        </label>

        <label className="admin-field">
          <span className="admin-field__label">{t('policy.form.priority')}</span>
          <input
            className="input admin-number"
            type="text"
            inputMode="numeric"
            aria-label={t('policy.form.priority')}
            value={form.priority}
            onChange={(event) => patchForm({ priority: event.target.value })}
          />
          <span className="admin-hint">{t('policy.form.priorityHint')}</span>
        </label>

        <label className="admin-check">
          <input
            type="checkbox"
            aria-label={t('policy.form.enabled')}
            checked={form.enabled}
            onChange={(event) => patchForm({ enabled: event.target.checked })}
          />
          <span>{form.enabled ? t('admin.value.yes') : t('admin.value.no')}</span>
        </label>

        <label className="admin-field">
          <span className="admin-field__label">{t('policy.form.note')}</span>
          <textarea
            className="input"
            aria-label={t('policy.form.note')}
            maxLength={500}
            value={form.note}
            onChange={(event) => patchForm({ note: event.target.value })}
          />
          <span className="admin-hint">{t('policy.form.noteHint')}</span>
        </label>

        <fieldset className="admin-field">
          <legend className="admin-field__label">{t('policy.form.scope')}</legend>
          <label className="admin-radio">
            <input
              type="radio"
              name="policy-scope"
              checked={form.scope === 'company'}
              onChange={() => patchForm({ scope: 'company', orgUnitId: '' })}
            />
            <span>{t('policy.scope.company')}</span>
          </label>
          <label className="admin-radio">
            <input
              type="radio"
              name="policy-scope"
              checked={form.scope === 'unit'}
              onChange={() => patchForm({ scope: 'unit' })}
            />
            <span>{t('policy.scope.unitOption')}</span>
          </label>
          {form.scope === 'unit' && (
            <label className="admin-field">
              <span className="admin-field__label">{t('policy.form.unitSelect')}</span>
              <select
                className="input"
                aria-label={t('policy.form.unitSelect')}
                value={form.orgUnitId}
                onChange={(event) => patchForm({ orgUnitId: event.target.value })}
              >
                <option value="">{t('policy.form.unitSelect')}</option>
                {(units ?? []).map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>

        <p className="admin-hint">{t('policy.noVersion')}</p>

        {problems.length > 0 && (
          <div className="admin-notice admin-notice--failed" role="alert">
            {problems.map((problem) => (
              <p key={problem} className="admin-notice__reason">
                {problem}
              </p>
            ))}
          </div>
        )}

        <div className="admin-form__actions">
          <button type="button" className="button button--text" onClick={closeForm}>
            {t('admin.cancel')}
          </button>
          <button type="submit" className="button button--primary" disabled={busy}>
            {busy ? t('admin.saving') : t('admin.save')}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="page page--wide" data-policy-page>
      <div className="page__head">
        <h1 className="page__title">{t('policy.title')}</h1>
        <p className="page__sub">{t('policy.lead')}</p>
      </div>

      <div className="policy-toolbar">
        <button
          type="button"
          className="button button--primary"
          disabled={form !== null || busy || load.kind !== 'ready'}
          onClick={openCreate}
        >
          {t('policy.action.create')}
        </button>
      </div>

      {notice !== null && (
        <div
          className={`admin-notice ${notice.kind === 'failed' ? 'admin-notice--failed' : ''}`}
          role={notice.kind === 'failed' ? 'alert' : 'status'}
          data-policy-notice
        >
          <p className="admin-notice__text">{notice.message}</p>
          {notice.reasons.map((reason) => (
            <p key={reason} className="admin-notice__reason">
              {reason}
            </p>
          ))}
        </div>
      )}

      {load.kind === 'loading' && (
        <p className="admin-status" role="status">
          {t('policy.loading')}
        </p>
      )}

      {load.kind === 'denied' && (
        <p className="admin-notice" role="alert">
          {load.status === 401 ? t('admin.sessionExpired') : t('policy.denied')}
        </p>
      )}

      {load.kind === 'failed' && (
        <div className="admin-notice admin-notice--failed" role="alert">
          <p className="admin-notice__text">{load.message}</p>
          {load.reasons.map((reason) => (
            <p key={reason} className="admin-notice__reason">
              {reason}
            </p>
          ))}
          <button
            type="button"
            className="button button--text admin-notice__action"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t('admin.retry')}
          </button>
        </div>
      )}

      {load.kind === 'ready' &&
        (load.rules.length === 0 ? (
          <p className="page__empty" data-policy-empty>
            {t('policy.empty')}
          </p>
        ) : (
          <div className="policy-table-wrap">
            <table className="policy-table">
              <thead>
                <tr>
                  {COLUMNS.map((key) => (
                    <th key={key} scope="col">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{load.rules.map((rule) => renderRow(rule, load.units))}</tbody>
            </table>
          </div>
        ))}

      {renderForm()}

      {deleteTarget !== null && (
        <div className="admin-scrim">
          <div
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="policy-delete-title"
            data-policy-delete-dialog
            tabIndex={-1}
            ref={deleteDialogRef}
          >
            <h2 className="admin-dialog__title" id="policy-delete-title">
              {t('policy.delete.title')}
            </h2>
            <p className="admin-dialog__body">{t('policy.delete.body')}</p>
            <div className="admin-dialog__actions">
              <button type="button" className="button button--text" onClick={() => setDeleteTarget(null)}>
                {t('admin.cancel')}
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {t('policy.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function amountOpFor(op: PolicyOperator): boolean {
  return op === 'lte' || op === 'gte';
}
