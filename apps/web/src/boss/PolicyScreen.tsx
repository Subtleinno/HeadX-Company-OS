import { useCallback, useEffect, useState } from 'react';
import { t, type MessageKey } from '@company-os/i18n';
import {
  fetchPolicy,
  savePolicyVersion,
  type ApiFailure,
  type PolicySlotView,
} from '../api';

/**
 * 品牌頁策略（issue #34）。
 *
 * 六個槽、一份策略、只有老闆可以改。這一頁只做一件事：讓六份標準看得見、
 * 改得到，而每一次改動都留下一版。
 *
 * 三個誠實位：
 *   1. 沒有版本就講「未記錄＝缺」，不畫一個空的第 1 版。
 *   2. 沒有刪除鍵、沒有回滾鍵 —— 不是變灰，是不存在。策略只加不改：已出街
 *      成品可能引用某一版，那一版要永遠讀得返。
 *   3. 儲存之後重新讀：畫面永遠等於資料庫，不靠前端自己推算版號。
 *
 * 版型沿用品牌頁那一組 class（`.brand-page__*`）：同一個「頁籤＋編輯框＋
 * 版本列表」的形狀，不需要第二套 CSS。名字裡的 brand 是歷史，不是範圍。
 */

type LoadState = 'loading' | 'ready' | 'failed';

const SLOT_LABEL: Record<string, MessageKey> = {
  home: 'boss.policy.slot.home',
  logo: 'boss.policy.slot.logo',
  color: 'boss.policy.slot.color',
  type: 'boss.policy.slot.type',
  tone: 'boss.policy.slot.tone',
  custom: 'boss.policy.slot.custom',
};

function slotLabel(slot: string): string {
  const key = SLOT_LABEL[slot];
  return key === undefined ? slot : t(key);
}

function failureMessage(failure: ApiFailure, fallback: string): string {
  if (failure.kind === 'http') {
    if (failure.message !== null) {
      return failure.message;
    }

    const first = failure.reasons[0];

    if (first !== undefined) {
      return first;
    }
  }

  return fallback;
}

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PolicyScreen() {
  const [slots, setSlots] = useState<PolicySlotView[]>([]);
  const [active, setActive] = useState<string>('home');
  const [state, setState] = useState<LoadState>('loading');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (keepActive: string | null): Promise<void> => {
    setState('loading');

    const result = await fetchPolicy();

    if (!result.ok) {
      setState('failed');
      return;
    }

    setSlots(result.data.slots);

    const target =
      keepActive !== null && result.data.slots.some((item) => item.slot === keepActive)
        ? keepActive
        : (result.data.slots[0]?.slot ?? 'home');

    setActive(target);
    setDraft(result.data.slots.find((item) => item.slot === target)?.current?.content ?? '');
    setState('ready');
  }, []);

  useEffect(() => {
    void reload(null);
  }, [reload]);

  const current = slots.find((item) => item.slot === active) ?? null;

  function select(slot: string): void {
    setActive(slot);
    setDraft(slots.find((item) => item.slot === slot)?.current?.content ?? '');
    setNotice(null);
    setError(null);
  }

  async function handleSave(): Promise<void> {
    if (busy) {
      return;
    }

    if (draft.trim() === '') {
      setError(t('boss.policy.emptyContent'));
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await savePolicyVersion(active, { content: draft });

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('boss.policy.saveFailed')));
      return;
    }

    setNotice(t('boss.policy.saved', { no: result.data.version.versionNo }));
    await reload(active);
  }

  if (state === 'loading' && slots.length === 0) {
    return <p className="design-empty">{t('boss.policy.loading')}</p>;
  }

  if (state === 'failed') {
    return (
      <div className="design-empty" data-policy-failed>
        <p>{t('boss.policy.loadFailed')}</p>
        <button
          type="button"
          className="boss-btn"
          onClick={() => {
            void reload(active);
          }}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="brand-page" data-policy={active}>
      <div className="brand-page__picker" role="tablist" aria-label={t('boss.policy.picker')}>
        {slots.map((item) => (
          <button
            key={item.slot}
            type="button"
            role="tab"
            aria-selected={item.slot === active}
            className={
              item.slot === active
                ? 'brand-page__tab brand-page__tab--active'
                : 'brand-page__tab'
            }
            data-policy-tab={item.slot}
            onClick={() => {
              select(item.slot);
            }}
          >
            {slotLabel(item.slot)}
          </button>
        ))}
      </div>

      <header className="brand-page__head">
        <h2 className="brand-page__title">{slotLabel(active)}</h2>
        {current?.current != null ? (
          <p className="brand-page__meta">
            {t('boss.policy.versionNo', { no: current.current.versionNo })}
          </p>
        ) : (
          <p className="brand-page__meta">{t('boss.policy.missing')}</p>
        )}
      </header>

      <p className="design-footnote" data-policy-immutable>
        {t('boss.policy.immutable')}
      </p>

      {notice !== null && (
        <p className="design-note" role="status" data-policy-notice>
          {notice}
        </p>
      )}

      {error !== null && (
        <p className="design-note design-note--error" role="alert" data-policy-error>
          {error}
        </p>
      )}

      <label className="brand-page__editor">
        <span className="design-field__label">{t('boss.policy.editorLabel')}</span>
        <textarea
          className="brand-page__textarea"
          value={draft}
          rows={14}
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <span className="design-field__hint">{t('boss.policy.hint')}</span>
      </label>

      <div className="design-form__actions">
        <button
          type="button"
          className="design-btn design-btn--primary"
          data-policy-save
          disabled={busy || draft.trim() === ''}
          onClick={() => {
            void handleSave();
          }}
        >
          {busy ? t('boss.policy.saving') : t('boss.policy.save')}
        </button>
      </div>

      <section className="brand-page__versions">
        <h3 className="brand-page__versionsTitle">{t('boss.policy.versions')}</h3>

        {(current?.versions.length ?? 0) === 0 ? (
          <p className="design-empty">{t('boss.policy.noVersion')}</p>
        ) : (
          <ul className="brand-page__list">
            {current?.versions.map((version) => {
              const isCurrent = current.current?.id === version.id;

              return (
                <li
                  key={version.id}
                  className="brand-page__version"
                  data-policy-version={version.versionNo}
                  data-current={isCurrent ? 'true' : 'false'}
                >
                  <div className="brand-page__versionHead">
                    <span className="brand-page__versionNo">
                      {t('boss.policy.versionNo', { no: version.versionNo })}
                    </span>
                    {isCurrent && (
                      <span className="brand-page__tag">{t('boss.policy.currentTag')}</span>
                    )}
                    <span className="brand-page__time">{formatTime(version.createdAt)}</span>
                  </div>

                  {version.note !== null && <p className="brand-page__note">{version.note}</p>}

                  {version.preview !== '' && (
                    <p className="brand-page__preview">{version.preview}</p>
                  )}

                  {/* 沒有「用回」與「刪除」：策略只加不改（#34）。 */}
                  {isCurrent && (
                    <p className="brand-page__currentNote">{t('boss.policy.currentNote')}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
