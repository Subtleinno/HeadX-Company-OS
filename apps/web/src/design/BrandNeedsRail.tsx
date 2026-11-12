import { useState } from 'react';
import { t } from '@company-os/i18n';
import { createGapNeed, type BrandGapCounts, type BrandGapItem } from '../api';
import { failureMessage } from './apiFailure';

/**
 * 右側「此頁 Needs」欄（issue #58）。
 *
 * 一張卡＝一個缺口。卡上講三件事：缺什麼、屬於哪一頁與哪一型、Need 去到哪。
 * 缺口可以由三種人補：檔案型外判交貨、判斷型只有老闆可關。所以卡上的動作
 * 不是一律「建立 Need」—— 判斷型而我又不是老闆，就講明要交回老闆，而不是
 * 畫一個按落去會 403 的按鈕。
 *
 * 欄底「查看全部缺口」開品牌缺口對話框：一頁的缺口與全品牌的缺口是同一個
 * 資料來源，只是篩選不同。
 */

export type GapRailProps = {
  brandId: string;
  items: BrandGapItem[];
  counts: BrandGapCounts;
  canEdit: boolean;
  isOwner: boolean;
  state: 'loading' | 'ready' | 'failed' | 'idle';
  onChanged: () => void;
  onOpenAll: () => void;
};

function stateLabel(state: BrandGapItem['needState']): string {
  if (state === null) {
    return t('brand.gap.state.none');
  }

  if (state === 'closed') {
    return t('brand.gap.state.accepted');
  }

  if (state === 'uploaded' || state === 'absorbed') {
    return t('brand.gap.state.delivered');
  }

  return t('brand.gap.state.open');
}

function stateClass(state: BrandGapItem['needState']): string {
  if (state === null) {
    return 'gap-pill gap-pill--none';
  }

  if (state === 'closed') {
    return 'gap-pill gap-pill--closed';
  }

  if (state === 'uploaded' || state === 'absorbed') {
    return 'gap-pill gap-pill--delivered';
  }

  return 'gap-pill gap-pill--open';
}

export function BrandNeedsRail(props: GapRailProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  async function handleCreate(gap: BrandGapItem): Promise<void> {
    if (busy !== null) {
      return;
    }

    setBusy(gap.item);
    setError(null);
    setNotice(null);

    const result = await createGapNeed(props.brandId, { pageKey: gap.pageKey, item: gap.item });

    setBusy(null);

    if (!result.ok) {
      if (result.failure.kind === 'http' && result.failure.error === 'owner_only') {
        setError(t('brand.gap.ownerOnly'));
        return;
      }

      setError(failureMessage(result.failure, t('brand.gap.failed')));
      return;
    }

    setNotice(
      result.data.created
        ? t('brand.gap.created', { code: result.data.need.code })
        : t('brand.gap.existing', { code: result.data.need.code }),
    );
    props.onChanged();
  }

  if (collapsed) {
    return (
      <aside className="gap-rail gap-rail--collapsed" data-gap-rail="collapsed">
        <button
          type="button"
          className="gap-rail__toggle"
          data-gap-rail-expand
          onClick={() => {
            setCollapsed(false);
          }}
        >
          {t('brand.gap.railTitle')} {props.counts.open}
        </button>
      </aside>
    );
  }

  return (
    <aside className="gap-rail" data-gap-rail="open">
      <div className="gap-rail__head">
        <h3 className="gap-rail__title">{t('brand.gap.railTitle')}</h3>
        <span className="gap-rail__count" data-gap-rail-count>
          {props.counts.open}
        </span>
        <button
          type="button"
          className="gap-rail__collapse"
          aria-label={t('brand.gap.close')}
          onClick={() => {
            setCollapsed(true);
          }}
        >
          ›
        </button>
      </div>

      {props.state === 'loading' && <p className="gap-rail__empty">…</p>}
      {props.state === 'failed' && <p className="gap-rail__empty">{t('brand.gap.failed')}</p>}

      {props.state === 'ready' && props.items.length === 0 && (
        <p className="gap-rail__empty" data-gap-rail-empty>
          {t('brand.gap.railEmpty')}
        </p>
      )}

      <ul className="gap-rail__list">
        {props.items.map((gap) => {
          const ownerOnly = gap.type === 'judgement' && !props.isOwner;

          return (
            <li className="gap-card" key={`${gap.pageKey}-${gap.item}`} data-gap-card={gap.item}>
              <p className="gap-card__title">{gap.what}</p>
              <p className="gap-card__meta">
                {t('brand.gap.meta', {
                  page: gap.pageName,
                  type: gap.type === 'file' ? t('brand.gap.type.file') : t('brand.gap.type.judgement'),
                  who: gap.type === 'file' ? t('brand.gap.who.file') : t('brand.gap.who.judgement'),
                })}
              </p>
              <div className="gap-card__foot">
                <span className={stateClass(gap.needState)} data-gap-state={gap.needState ?? 'none'}>
                  {stateLabel(gap.needState)}
                </span>

                {gap.needId === null && props.canEdit && !ownerOnly && (
                  <button
                    type="button"
                    className="gap-card__action"
                    disabled={busy === gap.item}
                    data-gap-create={gap.item}
                    onClick={() => {
                      void handleCreate(gap);
                    }}
                  >
                    {t('brand.gap.create')}
                  </button>
                )}

                {gap.needId === null && ownerOnly && (
                  <span className="gap-card__note">{t('brand.gap.who.judgement')}</span>
                )}

                {gap.needId !== null && <span className="gap-card__code">{gap.needCode}</span>}
              </div>
            </li>
          );
        })}
      </ul>

      {notice !== null && (
        <p className="gap-rail__note" role="status" data-gap-rail-notice>
          {notice}
        </p>
      )}

      {error !== null && (
        <p className="gap-rail__note gap-rail__note--error" role="alert" data-gap-rail-error>
          {error}
        </p>
      )}

      <button type="button" className="gap-rail__all" data-gap-open-all onClick={props.onOpenAll}>
        {t('brand.gap.railAll')}
      </button>
    </aside>
  );
}
