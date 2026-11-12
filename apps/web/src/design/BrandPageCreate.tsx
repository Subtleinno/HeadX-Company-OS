import { useState } from 'react';
import { t, type MessageKey } from '@company-os/i18n';
import { createBrandPage, type BrandPageSummary } from '../api';
import { failureMessage } from './apiFailure';

/**
 * 新增一頁（issue #32）。
 *
 * 三樣一次過要齊：顯示名、slug、一句「這一頁要決定什麼」。缺一樣就當場講
 * 欠什麼 —— 不是建完之後才發現這一頁沒有方向。
 *
 * 最後一格是那個**必答判斷**：這一頁是不是其實屬於標誌／色彩／字體／語氣？
 * 選了任何一個就不開新頁，直接帶去那一頁。這裡不讓人自由輸入再猜：猜錯的
 * 代價是同一件事分散在兩頁，而兩頁之後會各自走樣。
 *
 * 前端只擋「三樣未填齊」，其餘一律以後端為準（撞名、格式、權限）。前端不
 * 自行判斷可不可以建立 —— 那會出現「按鈕可以按但伺服器拒絕」的假希望。
 */

type Belongs = 'none' | 'logo' | 'color' | 'type' | 'tone' | 'image';

const BELONGS: readonly { key: Belongs; labelKey: MessageKey }[] = [
  { key: 'none', labelKey: 'brand.page.manage.belongsNone' },
  { key: 'logo', labelKey: 'design.page.brandLogo' },
  { key: 'color', labelKey: 'design.page.brandColor' },
  { key: 'type', labelKey: 'design.page.brandType' },
  { key: 'tone', labelKey: 'design.page.brandTone' },
  { key: 'image', labelKey: 'design.page.brandImage' },
];

export type BrandPageCreateProps = {
  brandId: string;
  /** 這個品牌現有的頁：用來顯示「其實係邊一頁」那幾個選項的名字。 */
  pages: readonly BrandPageSummary[];
  /** 建立成功：交回名字與 slug，上層帶去新那一頁。 */
  onCreated: (name: string, slug: string) => void;
  onMoved: (pageKey: string, name: string) => void;
  onClose: () => void;
};

export function BrandPageCreate({ brandId, pages, onCreated, onMoved, onClose }: BrandPageCreateProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [brief, setBrief] = useState('');
  const [belongs, setBelongs] = useState<Belongs>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function nameOf(key: string): string {
    const fromPages = pages.find((page) => page.key === key)?.name;

    if (fromPages !== undefined) {
      return fromPages;
    }

    const item = BELONGS.find((entry) => entry.key === key);

    return item === undefined ? key : t(item.labelKey);
  }

  async function handleSubmit(): Promise<void> {
    if (busy) {
      return;
    }

    if (belongs !== 'none') {
      // 不開新頁：這一件事已經有一頁在做，帶去那一頁並講明原因。
      onMoved(belongs, nameOf(belongs));
      return;
    }

    const trimmedName = name.trim();
    const trimmedBrief = brief.trim();

    if (trimmedName === '' || slug.trim() === '' || trimmedBrief === '') {
      setError(t('brand.page.manage.missing'));
      return;
    }

    setError(null);
    setBusy(true);

    const result = await createBrandPage(brandId, {
      name: trimmedName,
      slug: slug.trim(),
      brief: trimmedBrief,
    });

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.page.manage.createFailed')));
      return;
    }

    onCreated(result.data.page.name, result.data.page.key);
  }

  return (
    <section className="brand-manage" data-brand-page-create-panel>
      <h2 className="brand-manage__title">{t('brand.page.manage.createTitle')}</h2>

      <form
        className="design-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="design-field">
          <label className="design-field__label" htmlFor="brand-page-name">
            {t('brand.page.manage.name')}
          </label>
          <input
            id="brand-page-name"
            className="design-input"
            value={name}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>

        <div className="design-field">
          <label className="design-field__label" htmlFor="brand-page-slug">
            {t('brand.page.manage.slug')}
          </label>
          <input
            id="brand-page-slug"
            className="design-input"
            value={slug}
            placeholder="packaging"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setSlug(event.target.value);
            }}
          />
          <span className="design-field__hint">{t('brand.page.manage.slugHint')}</span>
        </div>

        <div className="design-field">
          <label className="design-field__label" htmlFor="brand-page-brief">
            {t('brand.page.manage.brief')}
          </label>
          <textarea
            id="brand-page-brief"
            className="design-input brand-page__textarea"
            rows={4}
            value={brief}
            onChange={(event) => {
              setBrief(event.target.value);
            }}
          />
          <span className="design-field__hint">{t('brand.page.manage.briefHint')}</span>
        </div>

        <div className="design-field">
          <label className="design-field__label" htmlFor="brand-page-belongs">
            {t('brand.page.manage.belongs')}
          </label>
          <select
            id="brand-page-belongs"
            className="design-input"
            value={belongs}
            onChange={(event) => {
              setBelongs(event.target.value as Belongs);
            }}
          >
            {BELONGS.map((item) => (
              <option key={item.key} value={item.key}>
                {t(item.labelKey)}
              </option>
            ))}
          </select>
          <span className="design-field__hint">{t('brand.page.manage.belongsHint')}</span>
        </div>

        {error !== null && (
          <p className="design-note design-note--error" role="alert" data-brand-page-create-error>
            {error}
          </p>
        )}

        <div className="design-form__actions">
          <button type="submit" className="design-btn design-btn--primary" disabled={busy}>
            {busy ? t('brand.page.manage.creating') : t('brand.page.manage.create')}
          </button>
          <button type="button" className="design-btn" onClick={onClose}>
            {t('brand.page.manage.cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}
