/**
 * 版本差異的說法（issue #62）。
 *
 * 後端交來一串路徑（`roles.ink.hex`），這一支負責把它講成人話。**不重新
 * 描述內容**：講「改了哪一欄」，不是再印一次新舊值 —— 要看值的去點那一版。
 *
 * 欄位名不寫死一份：由 `schemaForPage` 的段落與欄位標籤派生。寫死一份的
 * 結果是「後端加了一欄，畫面講原始 path」，而沒有人會發現。
 */

import { schemaForPage, type Section } from '@company-os/contracts';
import { t } from '@company-os/i18n';

export type PageKind = 'fixed' | 'custom';

function fieldLabel(key: string): string {
  const known = `brand.page.diff.field.${key}`;

  try {
    return t(known as never);
  } catch {
    return key;
  }
}

function labelsOf(section: Section): Map<string, string> {
  const labels = new Map<string, string>();

  for (const column of section.columns ?? []) {
    labels.set(column.path, column.label);
  }

  for (const field of section.fields ?? []) {
    labels.set(field.path, field.label);
  }

  return labels;
}

function subListLabel(segment: string): string {
  if (segment === 'allowed') {
    return t('brand.page.diff.sub.allowed');
  }

  if (segment === 'forbidden') {
    return t('brand.page.diff.sub.forbidden');
  }

  // 陣列位置：印一個赤裸的 "1"，讀的人唔知係第幾條。
  if (/^\d+$/.test(segment)) {
    return t('brand.page.diff.sub.item', { index: Number(segment) + 1 });
  }

  return segment;
}

/**
 * 一條路徑變一句。認不出段落就退回最後一段的欄位名，再認不出就照原樣貼 ——
 * 貼出一個原始 path 醜，但比假裝「改了別的東西」誠實。
 */
export function describeChange(pageKey: string, path: string, kind: PageKind = 'fixed'): string {
  const schema = schemaForPage(pageKey, kind);
  const segments = path.split('.');
  const head = segments[0] ?? '';
  const section = schema.sections.find((item) => item.path === head);

  if (section === undefined) {
    return fieldLabel(head);
  }

  const last = segments[segments.length - 1] ?? '';
  const middles = segments.slice(1, -1);
  const label = labelsOf(section).get(last) ?? fieldLabel(last);

  // 只有一段（`stance`）：段落本身就是那一欄，不用講兩次。
  if (segments.length === 1) {
    return label;
  }

  return [section.label, ...middles.map(subListLabel), label].join(' · ');
}

/** 一句清單：最多三句，其餘講「另外幾項」。 */
export function describeChanges(
  pageKey: string,
  paths: readonly string[],
  limit = 3,
  kind: PageKind = 'fixed',
): string[] {
  const labels = paths.map((path) => describeChange(pageKey, path, kind));
  const head = labels.slice(0, limit);

  return labels.length > limit ? [...head, t('brand.page.diff.more', { count: labels.length - limit })] : head;
}
