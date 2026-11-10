import { t } from '@company-os/i18n';
import type { NeedItem } from '../api';
import { needDueLabel, needKindLabel, needStateLabel } from './labels';

/**
 * Needs 清單（issue 184）。
 *
 * 只負責顯示與兩個手勢：展開（看詳情）與認領。唔改狀態、唔猜可用性 ——
 * 「認領」只喺 open 狀態出現，其餘狀態冇呢個掣，就唔會出現「撳完冇反應」。
 */

export type NeedsTableProps = {
  state: 'loading' | 'ready' | 'failed';
  items: readonly NeedItem[];
  emptyLabel: string;
  expandedId: string | null;
  claiming: string | null;
  onToggle: (id: string) => void;
  onClaim: (item: NeedItem) => void;
};

export function NeedsTable({
  state,
  items,
  emptyLabel,
  expandedId,
  claiming,
  onToggle,
  onClaim,
}: NeedsTableProps) {
  if (state === 'loading') {
    return <p className="needs-state">{t('need.loading')}</p>;
  }

  if (state === 'failed') {
    return (
      <p className="needs-state needs-state--error" role="status">
        {t('need.failed')}
      </p>
    );
  }

  if (items.length === 0) {
    return <p className="needs-state">{emptyLabel}</p>;
  }

  const now = Date.now();

  return (
    <table className="needs-table">
      <thead>
        <tr>
          <th scope="col">{t('need.col.code')}</th>
          <th scope="col">{t('need.col.title')}</th>
          <th scope="col">{t('need.col.kind')}</th>
          <th scope="col">{t('need.col.state')}</th>
          <th scope="col">{t('need.col.due')}</th>
          <th scope="col">{t('need.col.assignee')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const open = expandedId === item.id;

          return [
            <tr key={item.id} data-need-row={item.id}>
              <td className="needs-table__code" data-label={t('need.col.code')}>
                {item.code}
              </td>
              <td data-label={t('need.col.title')}>
                <button
                  type="button"
                  className="needs-table__title"
                  aria-expanded={open}
                  onClick={() => {
                    onToggle(item.id);
                  }}
                >
                  {item.title}
                </button>
              </td>
              <td data-label={t('need.col.kind')}>
                <span className="needs-kind">{needKindLabel(item)}</span>
              </td>
              <td data-label={t('need.col.state')}>{needStateLabel(item)}</td>
              <td
                className={item.overdue ? 'needs-table__overdue' : undefined}
                data-label={t('need.col.due')}
              >
                {needDueLabel(item, now)}
              </td>
              <td data-label={t('need.col.assignee')}>
                {item.assignee === null ? t('need.assignee.none') : item.assignee.name}
              </td>
            </tr>,

            open && (
              <tr key={`${item.id}-detail`} className="needs-table__detail-row">
                <td colSpan={6}>
                  <div className="needs-detail">
                    <p className="needs-detail__body">
                      {item.detail ?? t('need.detail.missing')}
                    </p>
                    {item.state === 'open' && (
                      <button
                        type="button"
                        className="needs-detail__claim"
                        disabled={claiming !== null}
                        onClick={() => {
                          onClaim(item);
                        }}
                      >
                        {claiming === item.id ? t('need.claiming') : t('need.claim')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ),
          ];
        })}
      </tbody>
    </table>
  );
}
