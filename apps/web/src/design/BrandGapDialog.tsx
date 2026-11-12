import { useState } from 'react';
import { t } from '@company-os/i18n';
import { createGapNeed, type BrandGapCounts, type BrandGapItem } from '../api';
import { failureMessage } from './apiFailure';

/**
 * 品牌缺口對話框（issue #58，規格 06）。
 *
 * 寬 1040px：這是一張表，不是一張卡。欄位固定七個（型別、頁、缺什麼、規則 id、
 * 誰可補、Need 狀態、動作），因為人來這裡是為了回答「還有幾多項未有人跟」。
 *
 * 篩選只做三種（全部／檔案型／判斷型）：規格沒有搜尋（C63），而缺口數量本來
 * 就是十幾項，分類已經夠。
 */

export type GapDialogProps = {
  brandId: string;
  items: BrandGapItem[];
  counts: BrandGapCounts;
  canEdit: boolean;
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => void;
};

type Filter = 'all' | 'file' | 'judgement';

export function BrandGapDialog(props: GapDialogProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = props.items.filter((item) => (filter === 'all' ? true : item.type === filter));

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

  return (
    <div className="gap-dialog__backdrop" role="presentation" data-gap-dialog>
      <section className="gap-dialog" role="dialog" aria-modal="true" aria-label={t('brand.gap.dialogTitle')}>
        <header className="gap-dialog__head">
          <div>
            <h2 className="gap-dialog__title">{t('brand.gap.dialogTitle')}</h2>
            <p className="gap-dialog__lead">
              {t('brand.gap.dialogLead', {
                count: props.counts.total,
                file: props.counts.file,
                judgement: props.counts.judgement,
              })}
            </p>
          </div>
          <button type="button" className="gap-dialog__close" data-gap-dialog-close onClick={props.onClose}>
            {t('brand.gap.close')}
          </button>
        </header>

        <div className="gap-dialog__filters" role="tablist">
          {(['all', 'file', 'judgement'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={`gap-dialog__filter${filter === value ? ' gap-dialog__filter--on' : ''}`}
              data-gap-filter={value}
              onClick={() => {
                setFilter(value);
              }}
            >
              {value === 'all'
                ? t('brand.gap.filter.all')
                : value === 'file'
                  ? t('brand.gap.filter.file')
                  : t('brand.gap.filter.judgement')}{' '}
              {value === 'all' ? props.counts.total : value === 'file' ? props.counts.file : props.counts.judgement}
            </button>
          ))}
        </div>

        <table className="gap-dialog__table">
          <thead>
            <tr>
              <th>{t('brand.gap.col.type')}</th>
              <th>{t('brand.gap.col.page')}</th>
              <th>{t('brand.gap.col.what')}</th>
              <th>{t('brand.gap.col.rule')}</th>
              <th>{t('brand.gap.col.who')}</th>
              <th>{t('brand.gap.col.need')}</th>
              <th>{t('brand.gap.col.action')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((gap) => {
              const ownerOnly = gap.type === 'judgement' && !props.isOwner;

              return (
                <tr key={`${gap.pageKey}-${gap.item}`} data-gap-row={gap.item}>
                  <td>{gap.type === 'file' ? t('brand.gap.type.file') : t('brand.gap.type.judgement')}</td>
                  <td>{gap.pageName}</td>
                  <td>{gap.what}</td>
                  <td>{gap.ruleId === null ? t('brand.gap.ruleNone') : <code>{gap.ruleId}</code>}</td>
                  <td>{gap.type === 'file' ? t('brand.gap.who.file') : t('brand.gap.who.judgement')}</td>
                  <td data-gap-state={gap.needState ?? 'none'}>
                    {gap.needId === null
                      ? t('brand.gap.needNone')
                      : `${gap.needCode ?? ''} ${gap.needState ?? ''}`.trim()}
                  </td>
                  <td>
                    {gap.needId === null && props.canEdit && !ownerOnly && (
                      <button
                        type="button"
                        className="gap-dialog__action"
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
                      <span className="gap-dialog__note">{t('brand.gap.who.judgement')}</span>
                    )}

                    {gap.needId !== null && <span className="gap-dialog__note">{t('brand.gap.view')}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {items.length === 0 && <p className="gap-dialog__empty">{t('brand.gap.noneYet')}</p>}

        {notice !== null && (
          <p className="gap-dialog__note" role="status" data-gap-dialog-notice>
            {notice}
          </p>
        )}

        {error !== null && (
          <p className="gap-dialog__note gap-dialog__note--error" role="alert" data-gap-dialog-error>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
