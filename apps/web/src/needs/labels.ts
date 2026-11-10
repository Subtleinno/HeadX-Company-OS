import { t } from '@company-os/i18n';
import type { NeedItem } from '../api';

/**
 * Needs 的文字（issue 184）。
 *
 * 一個地方決定「這件工作怎樣講」，清單與右側欄都用同一組函數 ——
 * 同一件工作喺兩個位置講兩種狀態，用戶就會以為係兩件事。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function needKindLabel(item: NeedItem): string {
  return item.kind === 'decision' ? t('need.kind.decision') : t('need.kind.deliverable');
}

export function needStateLabel(item: NeedItem): string {
  switch (item.state) {
    case 'open':
      return t('need.state.open');
    case 'claimed':
      return t('need.state.claimed');
    case 'uploaded':
      return t('need.state.uploaded');
    case 'absorbed':
      return t('need.state.absorbed');
    default:
      return t('need.state.closed');
  }
}

/** 到期日講人話：逾期幾日、今日到期、剩幾日、未定。 */
export function needDueLabel(item: NeedItem, now: number): string {
  if (item.dueAt === null) {
    return t('need.due.none');
  }

  const days = Math.ceil((new Date(item.dueAt).getTime() - now) / DAY_MS);

  if (days < 0) {
    return t('need.due.overdue', { days: Math.abs(days) });
  }

  if (days === 0) {
    return t('need.due.today');
  }

  return t('need.due.daysLeft', { days });
}

/** 右側欄用：呢件工作等咗幾久。未夠一日講「今日」。 */
export function needWaitingLabel(item: NeedItem, now: number): string {
  const days = Math.floor((now - new Date(item.createdAt).getTime()) / DAY_MS);

  return days <= 0 ? t('need.waitToday') : t('need.waitDays', { days });
}
