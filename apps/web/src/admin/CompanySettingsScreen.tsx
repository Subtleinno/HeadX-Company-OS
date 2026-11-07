import { useEffect, useMemo, useState } from 'react';
import { editionProfile, isEditionCode, type NotificationChannel } from '@company-os/edition-profile';
import { t, type MessageKey } from '@company-os/i18n';
import { Selector } from '@company-os/ui-kit';
import { fetchSettings, saveSetting, type ApiFailure, type SettingView } from '../api';

/**
 * 公司設定頁（issue 119，Boss portal 管理區）。
 *
 * 三個原則，全部來自 issue：
 *
 * 1. **一個 key 一次保存**。API 只有 `PUT /settings/:key`，沒有整頁批次入口，
 *    所以畫面也不假裝有：每列各自成功、各自失敗。有兩列失敗時，另一列的成功
 *    仍然是成功，不會被拉回去。
 * 2. **值由伺服器話事**。保存成功後採用回應的那一份，不是自己樂觀改的那一份。
 *    失敗時保留使用者輸入，不清空、不顯示假成功。
 * 3. **不知道就講不知道**。未定義的 key 照實列出來，不當成可編輯項；
 *    讀取失敗與「真的沒有資料」是兩個畫面，不互相冒充。
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'failed'; title: string; reasons: string[] }
  | { kind: 'denied'; status: number };

type RowStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed'; reasons: string[] };

type GroupKey = 'install' | 'company' | 'notify';

type FieldKind = 'readonly' | 'choice' | 'boolean' | 'number' | 'channels';

type FieldSpec = {
  key: string;
  group: GroupKey;
  kind: FieldKind;
  labelKey: MessageKey;
  purposeKey: MessageKey;
  impactKey: MessageKey;
  choices?: readonly { value: string; labelKey: MessageKey }[];
};

/**
 * 頁面次序就是這裡的次序。未知 key 不會被靜靜丟掉 —— 它會以唯讀列出現，
 * 因為「後端有這個設定、畫面沒有」比多一列難看得多。
 */
const FIELDS: readonly FieldSpec[] = [
  {
    key: 'edition',
    group: 'install',
    kind: 'readonly',
    labelKey: 'admin.field.edition',
    purposeKey: 'admin.purpose.edition',
    impactKey: 'admin.impact.edition',
    choices: [
      { value: 'intl', labelKey: 'admin.choice.edition.intl' },
      { value: 'cn', labelKey: 'admin.choice.edition.cn' },
    ],
  },
  {
    key: 'install_code',
    group: 'install',
    kind: 'readonly',
    labelKey: 'admin.field.install_code',
    purposeKey: 'admin.purpose.install_code',
    impactKey: 'admin.impact.company',
  },
  {
    key: 'company_locale',
    group: 'company',
    kind: 'choice',
    labelKey: 'admin.field.company_locale',
    purposeKey: 'admin.purpose.company_locale',
    impactKey: 'admin.impact.overridable',
    choices: [
      { value: 'zh-HK', labelKey: 'admin.choice.locale.zhHK' },
      { value: 'zh-CN', labelKey: 'admin.choice.locale.zhCN' },
    ],
  },
  {
    key: 'acceptance_rule',
    group: 'company',
    kind: 'choice',
    labelKey: 'admin.field.acceptance_rule',
    purposeKey: 'admin.purpose.acceptance_rule',
    impactKey: 'admin.impact.overridable',
    choices: [
      { value: 'owner', labelKey: 'admin.choice.acceptance.owner' },
      { value: 'dept_head', labelKey: 'admin.choice.acceptance.deptHead' },
      { value: 'on_submit', labelKey: 'admin.choice.acceptance.onSubmit' },
    ],
  },
  {
    key: 'department_isolation',
    group: 'company',
    kind: 'boolean',
    labelKey: 'admin.field.department_isolation',
    purposeKey: 'admin.purpose.department_isolation',
    impactKey: 'admin.impact.company',
  },
  {
    key: 'overdue_grace_hours',
    group: 'company',
    kind: 'number',
    labelKey: 'admin.field.overdue_grace_hours',
    purposeKey: 'admin.purpose.overdue_grace_hours',
    impactKey: 'admin.impact.company',
  },
  {
    key: 'notification_channels',
    group: 'notify',
    kind: 'channels',
    labelKey: 'admin.field.notification_channels',
    purposeKey: 'admin.purpose.notification_channels',
    impactKey: 'admin.impact.overridable',
  },
];

const GROUP_ORDER: readonly GroupKey[] = ['install', 'company', 'notify'];

const GROUP_LABEL: Record<GroupKey, MessageKey> = {
  install: 'admin.group.install',
  company: 'admin.group.company',
  notify: 'admin.group.notify',
};

/** 值的比較：只支援 API 會回傳的 JSON 形狀（字串、數字、布林、陣列）。 */
function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
  }

  return left === right;
}

/** 數字欄位：打得通就送數字，打不通就原樣送出去，由伺服器講理由（不自己做第二套規則）。 */
function parseNumberInput(raw: string): unknown {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return raw;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : raw;
}

function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return t('admin.value.off');
  }

  if (typeof value === 'boolean') {
    return value ? t('admin.value.yes') : t('admin.value.no');
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? t('admin.value.off') : value.map(String).join('、');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function reasonsOf(failure: ApiFailure): string[] {
  if (failure.kind === 'network') {
    return [t('admin.settings.loadFailed')];
  }

  if (failure.reasons.length > 0) {
    return failure.reasons;
  }

  return failure.error === null ? [] : [failure.error];
}

export type CompanySettingsScreenProps = {
  /** 未儲存的項目數；管理區用它決定離開前要不要問。 */
  onDirtyCountChange: (count: number) => void;
};

export function CompanySettingsScreen({ onDirtyCountChange }: CompanySettingsScreenProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [saved, setSaved] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoad({ kind: 'loading' });

    void fetchSettings().then((result) => {
      if (cancelled) {
        return;
      }

      if (result.ok) {
        const nextSaved: Record<string, unknown> = {};

        for (const setting of result.data.settings) {
          nextSaved[setting.key] = setting.value;
        }

        setSaved(nextSaved);
        setDraft(nextSaved);
        setStatuses({});
        setLoad({ kind: 'ready' });

        return;
      }

      if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
        setLoad({ kind: 'denied', status: result.failure.status });

        return;
      }

      setLoad({
        kind: 'failed',
        title: t('admin.settings.loadFailed'),
        reasons: reasonsOf(result.failure),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** 有改動但未保存的 key。未改動就不提交（issue 範圍第 4 點）。 */
  const dirtyKeys = useMemo(
    () => Object.keys(draft).filter((key) => !sameValue(draft[key], saved[key])),
    [draft, saved],
  );

  useEffect(() => {
    onDirtyCountChange(dirtyKeys.length);
  }, [dirtyKeys.length, onDirtyCountChange]);

  // 關窗或重新載入也要有機會攔下來；瀏覽器只會問一次，理由是我們自己寫的。
  useEffect(() => {
    if (dirtyKeys.length === 0) {
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
  }, [dirtyKeys.length]);

  async function save(key: string): Promise<void> {
    // 防重送：已經在送的那一列，再按一次不會再發請求。
    if (statuses[key]?.kind === 'saving') {
      return;
    }

    setStatuses((previous) => ({ ...previous, [key]: { kind: 'saving' } }));

    const result = await saveSetting(key, draft[key]);

    if (result.ok) {
      const setting: SettingView = result.data.setting;

      setSaved((previous) => ({ ...previous, [setting.key]: setting.value }));
      setDraft((previous) => ({ ...previous, [setting.key]: setting.value }));
      setStatuses((previous) => ({ ...previous, [key]: { kind: 'saved' } }));

      return;
    }

    if (result.failure.kind === 'http' && (result.failure.status === 401 || result.failure.status === 403)) {
      setLoad({ kind: 'denied', status: result.failure.status });

      return;
    }

    // 失敗保留輸入：draft 不動，理由照伺服器原文顯示。
    setStatuses((previous) => ({
      ...previous,
      [key]: { kind: 'failed', reasons: reasonsOf(result.failure) },
    }));
  }

  if (load.kind === 'loading') {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">{t('admin.settings.title')}</h1>
        </div>
        <p className="admin-status" role="status">
          {t('admin.settings.loading')}
        </p>
      </div>
    );
  }

  if (load.kind === 'denied') {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">{t('admin.settings.title')}</h1>
        </div>
        <p className="admin-notice" role="alert">
          {load.status === 401 ? t('admin.settings.signIn') : t('admin.settings.denied')}
        </p>
      </div>
    );
  }

  if (load.kind === 'failed') {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">{t('admin.settings.title')}</h1>
        </div>
        <div className="admin-notice admin-notice--failed" role="alert">
          <p className="admin-notice__text">{load.title}</p>
          {load.reasons.map((reason) => (
            <p key={reason} className="admin-notice__reason">
              {reason}
            </p>
          ))}
          <button
            type="button"
            className="button button--text admin-notice__action"
            onClick={() => {
              setReloadKey((key) => key + 1);
            }}
          >
            {t('admin.settings.retry')}
          </button>
        </div>
      </div>
    );
  }

  const known = new Set(FIELDS.map((field) => field.key));
  const unknownKeys = Object.keys(saved).filter((key) => !known.has(key));
  const editionValue = draft['edition'];
  const channels: readonly string[] = isEditionCode(String(editionValue))
    ? editionProfile(editionValue as 'intl' | 'cn').channels
    : [];

  function renderControl(field: FieldSpec) {
    const value = draft[field.key];

    if (field.kind === 'readonly') {
      const label = field.choices?.find((choice) => choice.value === value)?.labelKey;

      return (
        <div className="admin-row__readonly">
          <span className="admin-row__value">{label === undefined ? describeValue(value) : t(label)}</span>
          <span className="admin-row__reason">{t('admin.immutable')}</span>
        </div>
      );
    }

    if (field.kind === 'choice') {
      const choices = field.choices ?? [];

      return (
        <Selector
          label={t(field.labelKey)}
          value={typeof value === 'string' ? value : null}
          options={choices.map((choice) => ({ id: choice.value, label: t(choice.labelKey) }))}
          placeholder={t('admin.value.off')}
          onChange={(id) => {
            setDraft((previous) => ({ ...previous, [field.key]: id }));
            setStatuses((previous) => ({ ...previous, [field.key]: { kind: 'idle' } }));
          }}
        />
      );
    }

    if (field.kind === 'boolean') {
      return (
        <label className="admin-check">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => {
              setDraft((previous) => ({ ...previous, [field.key]: event.target.checked }));
              setStatuses((previous) => ({ ...previous, [field.key]: { kind: 'idle' } }));
            }}
          />
          <span>{value === true ? t('admin.value.yes') : t('admin.value.no')}</span>
        </label>
      );
    }

    if (field.kind === 'number') {
      return (
        <input
          className="input admin-number"
          type="number"
          inputMode="numeric"
          aria-label={t(field.labelKey)}
          value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
          onChange={(event) => {
            setDraft((previous) => ({
              ...previous,
              [field.key]: parseNumberInput(event.target.value),
            }));
            setStatuses((previous) => ({ ...previous, [field.key]: { kind: 'idle' } }));
          }}
        />
      );
    }

    // channels：清單來自 edition-profile（與後端同一份），不是畫面自己抄一份。
    const selected = Array.isArray(value) ? value.map(String) : [];

    return (
      <div className="admin-channels">
        {channels.length === 0 ? (
          <p className="admin-row__reason">{t('admin.channels.hint')}</p>
        ) : (
          <div className="admin-channels__list">
            {channels.map((channel: NotificationChannel | string) => {
              const code = String(channel);
              const checked = selected.includes(code);

              return (
                <label key={code} className="admin-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selected, code]
                        : selected.filter((item) => item !== code);

                      setDraft((previous) => ({ ...previous, [field.key]: next }));
                      setStatuses((previous) => ({ ...previous, [field.key]: { kind: 'idle' } }));
                    }}
                  />
                  <span className="admin-channels__code">{code}</span>
                </label>
              );
            })}
          </div>
        )}
        <p className="admin-row__reason">{t('admin.channels.hint')}</p>
      </div>
    );
  }

  function renderRow(field: FieldSpec) {
    const status = statuses[field.key] ?? { kind: 'idle' as const };
    const dirty = dirtyKeys.includes(field.key);
    // 伺服器沒有這一項：仍然要出現，否則「缺少一個設定」會靜靜消失在畫面上。
    const present = field.key in saved;

    return (
      <li key={field.key} className="admin-row" data-setting-key={field.key}>
        <div className="admin-row__text">
          <p className="admin-row__label">{t(field.labelKey)}</p>
          <p className="admin-row__purpose">{t(field.purposeKey)}</p>
          <p className="admin-row__impact">{t(field.impactKey)}</p>
        </div>

        <div className="admin-row__control">
          {present ? (
            renderControl(field)
          ) : (
            <div className="admin-row__readonly">
              <span className="admin-row__value">{t('admin.value.unset')}</span>
              <span className="admin-row__reason">{t('admin.settings.missing')}</span>
            </div>
          )}
        </div>

        <div className="admin-row__actions">
          {!present ? (
            <span className="admin-row__muted">{t('admin.readOnlyNote')}</span>
          ) : field.kind === 'readonly' ? (
            <span className="admin-row__muted">{t('admin.readOnlyNote')}</span>
          ) : (
            <>
              <button
                type="button"
                className="button button--primary admin-save"
                disabled={!dirty || status.kind === 'saving'}
                title={dirty ? undefined : t('admin.unchanged')}
                onClick={() => {
                  void save(field.key);
                }}
              >
                {status.kind === 'saving' ? t('admin.saving') : t('admin.save')}
              </button>

              <span className="admin-row__state" role="status">
                {status.kind === 'saved' && !dirty ? t('admin.saved') : null}
                {status.kind === 'idle' && !dirty ? t('admin.unchanged') : null}
                {status.kind === 'failed' ? t('admin.saveFailed') : null}
              </span>

              {status.kind === 'failed' && (
                <div className="admin-row__failure" role="alert">
                  {status.reasons.map((reason) => (
                    <p key={reason} className="admin-row__reason">
                      {reason}
                    </p>
                  ))}
                  <button
                    type="button"
                    className="button button--text"
                    onClick={() => {
                      void save(field.key);
                    }}
                  >
                    {t('admin.retry')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">{t('admin.settings.title')}</h1>
        <p className="page__sub">{t('admin.settings.lead')}</p>
      </div>

      {dirtyKeys.length > 0 && (
        <p className="admin-dirty" role="status">
          {t('admin.unsaved.dirtyCount', { count: dirtyKeys.length })}
        </p>
      )}

      {Object.keys(saved).length === 0 ? (
        <p className="page__empty">{t('admin.settings.empty')}</p>
      ) : (
        GROUP_ORDER.map((group) => {
          const rows = FIELDS.filter((field) => field.group === group);

          if (rows.length === 0) {
            return null;
          }

          return (
            <section key={group} className="admin-group" aria-label={t(GROUP_LABEL[group])}>
              <h2 className="admin-group__title">{t(GROUP_LABEL[group])}</h2>
              <ul className="admin-list">{rows.map(renderRow)}</ul>
            </section>
          );
        })
      )}

      {unknownKeys.length > 0 && (
        <section className="admin-group" aria-label={t('admin.settings.unknownKey')}>
          <h2 className="admin-group__title">{t('admin.settings.unknownKey')}</h2>
          <ul className="admin-list">
            {unknownKeys.map((key) => (
              <li key={key} className="admin-row" data-setting-key={key}>
                <div className="admin-row__text">
                  <p className="admin-row__label">{key}</p>
                  <p className="admin-row__purpose">{t('admin.settings.unknownKey')}</p>
                </div>
                <div className="admin-row__control">
                  <span className="admin-row__value">
                    {t('admin.settings.currentValue')}：{describeValue(saved[key])}
                  </span>
                </div>
                <div className="admin-row__actions">
                  <span className="admin-row__muted">{t('admin.readOnlyNote')}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
