import { useCallback, useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  deleteBrandPageVersion,
  fetchBrandPage,
  fetchBrandPages,
  restoreBrandPageVersion,
  saveBrandPageVersion,
  type BrandPageDetail,
  type BrandPageSummary,
  type BrandPageVersionSummary,
  type ApiFailure,
} from '../api';
import { navigatePath } from '../router';

/**
 * 一頁品牌頁的時間軸（issue #33）。
 *
 * 這一頁做的事只有一件：讓「現行」與「舊版」同時看得見，並且讓每一下改動
 * 都留下一版。它不是編輯器 —— 內容怎樣生成是各頁自己的 issue（#35–#39）；
 * 這裡的輸入框是**儲存通道**，先把版本鏈接好，之後每一頁接手同一個通道。
 *
 * 三個誠實位：
 *   1. 未有版本就講「未有版本」，不畫一個空白的「第 1 版」。
 *   2. 現行版本沒有刪除鍵 —— 不是變灰，而是不出現。變灰會令人以為等一等就可以。
 *   3. 被拒絕時原樣講伺服器那句（現行／被成品釘住／找不到），不自創理由。
 */

type LoadState = 'loading' | 'ready' | 'missing' | 'failed';

type BrandPageScreenProps = {
  brandId: string | null;
  pageKey: string;
  /** 只有老闆可以改（品牌級授權見 #32）；員工看得到、改不了。 */
  canEdit: boolean;
};

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

export function BrandPageScreen({ brandId, pageKey, canEdit }: BrandPageScreenProps) {
  const [list, setList] = useState<BrandPageSummary[]>([]);
  const [detail, setDetail] = useState<BrandPageDetail | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (brandId === null) {
      setState('missing');
      return;
    }

    setState('loading');

    const [pages, page] = await Promise.all([
      fetchBrandPages(brandId),
      fetchBrandPage(brandId, pageKey),
    ]);

    if (pages.ok) {
      setList(pages.data.items);
    }

    if (!page.ok) {
      if (page.failure.kind === 'http' && page.failure.status === 404) {
        setState('missing');
        return;
      }

      setState('failed');
      return;
    }

    setDetail(page.data);
    setDraft(page.data.current?.content ?? '');
    setState('ready');
  }, [brandId, pageKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSave(): Promise<void> {
    if (brandId === null || busy) {
      return;
    }

    if (draft.trim() === '') {
      setError(t('brand.page.emptyContent'));
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await saveBrandPageVersion(brandId, pageKey, { content: draft });

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.saveFailed')));
      return;
    }

    setNotice(t('brand.page.saved', { no: result.data.version.versionNo }));
    await reload();
  }

  async function handleRestore(version: BrandPageVersionSummary): Promise<void> {
    if (brandId === null || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await restoreBrandPageVersion(brandId, pageKey, version.id);

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.actionFailed')));
      return;
    }

    setNotice(
      t('brand.page.restored', {
        source: version.versionNo,
        no: result.data.version.versionNo,
      }),
    );
    await reload();
  }

  async function handleDelete(version: BrandPageVersionSummary): Promise<void> {
    if (brandId === null || busy) {
      return;
    }

    if (confirmDeleteId !== version.id) {
      setConfirmDeleteId(version.id);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmDeleteId(null);

    const result = await deleteBrandPageVersion(brandId, pageKey, version.id);

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.actionFailed')));
      return;
    }

    setNotice(t('brand.page.deleted', { no: result.data.versionNo }));
    await reload();
  }

  if (state === 'loading') {
    return <p className="design-empty">{t('brand.page.loading')}</p>;
  }

  if (state === 'missing') {
    return (
      <p className="design-empty" data-brand-page-missing>
        {t('brand.page.missing')}
      </p>
    );
  }

  if (state === 'failed' || detail === null) {
    return (
      <div className="design-empty" data-brand-page-failed>
        <p>{t('brand.page.loadFailed')}</p>
        <button
          type="button"
          className="design-btn"
          onClick={() => {
            void reload();
          }}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const page = detail.page;

  return (
    <div className="brand-page" data-brand-page={page.key}>
      <div className="brand-page__picker" role="tablist" aria-label={t('brand.page.picker')}>
        {list.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.key === page.key}
            className={
              item.key === page.key
                ? 'brand-page__tab brand-page__tab--active'
                : 'brand-page__tab'
            }
            onClick={() => {
              navigatePath('/design', 'brand', 'page', item.key);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>

      <header className="brand-page__head">
        <h2 className="brand-page__title">{page.name}</h2>
        {detail.current !== null && (
          <p className="brand-page__meta">
            {t('brand.page.versionNo', { no: detail.current.versionNo })}
          </p>
        )}
      </header>

      {notice !== null && (
        <p className="design-note" role="status" data-brand-page-notice>
          {notice}
        </p>
      )}

      {error !== null && (
        <p className="design-note design-note--error" role="alert" data-brand-page-error>
          {error}
        </p>
      )}

      <label className="brand-page__editor">
        <span className="design-field__label">{t('brand.page.editorLabel')}</span>
        <textarea
          className="brand-page__textarea"
          value={draft}
          readOnly={!canEdit}
          rows={10}
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <span className="design-field__hint">{t('brand.page.hint')}</span>
      </label>

      {canEdit ? (
        <div className="design-form__actions">
          <button
            type="button"
            className="design-btn design-btn--primary"
            data-brand-page-save
            disabled={busy || draft.trim() === ''}
            onClick={() => {
              void handleSave();
            }}
          >
            {busy ? t('brand.page.saving') : t('brand.page.save')}
          </button>
        </div>
      ) : (
        <p className="design-footnote" data-brand-page-readonly>
          {t('brand.page.readOnly')}
        </p>
      )}

      <section className="brand-page__versions">
        <h3 className="brand-page__versionsTitle">{t('brand.page.versions')}</h3>

        {detail.versions.length === 0 ? (
          <p className="design-empty">{t('brand.page.noVersion')}</p>
        ) : (
          <ul className="brand-page__list">
            {detail.versions.map((version) => {
              const isCurrent = detail.current?.id === version.id;

              return (
                <li
                  key={version.id}
                  className="brand-page__version"
                  data-brand-page-version={version.versionNo}
                  data-current={isCurrent ? 'true' : 'false'}
                >
                  <div className="brand-page__versionHead">
                    <span className="brand-page__versionNo">
                      {t('brand.page.versionNo', { no: version.versionNo })}
                    </span>
                    {isCurrent && (
                      <span className="brand-page__tag">{t('brand.page.currentTag')}</span>
                    )}
                    <span className="brand-page__time">{formatTime(version.createdAt)}</span>
                  </div>

                  {version.note !== null && (
                    <p className="brand-page__note">{version.note}</p>
                  )}

                  {version.preview !== '' && (
                    <p className="brand-page__preview">{version.preview}</p>
                  )}

                  {canEdit && !isCurrent && (
                    <div className="brand-page__actions">
                      <button
                        type="button"
                        className="brand-page__action"
                        disabled={busy}
                        data-brand-page-restore={version.versionNo}
                        onClick={() => {
                          void handleRestore(version);
                        }}
                      >
                        {t('brand.page.restore')}
                      </button>

                      <button
                        type="button"
                        className="brand-page__action brand-page__action--danger"
                        disabled={busy}
                        data-brand-page-delete={version.versionNo}
                        onClick={() => {
                          void handleDelete(version);
                        }}
                      >
                        {confirmDeleteId === version.id
                          ? t('brand.page.deleteConfirm')
                          : t('brand.page.delete')}
                      </button>
                    </div>
                  )}

                  {canEdit && isCurrent && (
                    <p className="brand-page__currentNote">{t('brand.page.currentBlocked')}</p>
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
