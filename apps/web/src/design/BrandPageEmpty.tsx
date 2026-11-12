import { t, type MessageKey } from '@company-os/i18n';

/**
 * 全空狀態（v2.1，九頁共用）。
 *
 * 為甚麼不是「八個空表」：一個未有內容的頁，畫八個空格等於叫人在一張白紙上
 * 自己找起點。這一頁只做**一件事** —— 講清楚第一件事是甚麼（一個主要動作），
 * 其餘七項用一張清單列出「還有甚麼要寫」，每項標明「還沒有／已有」。
 *
 * 為甚麼清單不畫成表：它與下面的編輯器是同一件事的兩個講法。清單在閱讀態
 * 用，編輯器在寫的時候用；同一個欄位畫兩次，就會有人以為是兩個欄位。
 *
 * 缺口數字不在這裡算。清單只講「這一頁要寫的」，缺口（`platformGapCount`）
 * 是另一件事 —— 有規則 id 的才算缺口，進右側 Needs 欄。
 */

export type BrandEmptyItem = {
  /** 穩定鍵，測試與截圖用。 */
  key: string;
  /** i18n 鍵，不是字面文字：介面文字一律住 i18n。 */
  labelKey: MessageKey;
  /** 這一項現在有沒有內容。 */
  filled: boolean;
};

export type BrandEmptyAction = {
  labelKey: MessageKey;
  /** `data-brand-empty-action` 的值，測試用。 */
  dataName: string;
  onSelect: () => void;
};

type BrandPageEmptyProps = {
  pageKey: string;
  titleKey: MessageKey;
  leadKey: MessageKey;
  /** 一件現在就可以做的事。沒有編輯權限就不傳。 */
  primary?: BrandEmptyAction | null;
  items: readonly BrandEmptyItem[];
};

export function BrandPageEmpty({
  pageKey,
  titleKey,
  leadKey,
  primary = null,
  items,
}: BrandPageEmptyProps) {
  return (
    <div className="brand-empty" data-brand-empty={pageKey}>
      <div className="brand-empty__lead">
        <h3 className="brand-empty__title">{t(titleKey)}</h3>
        <p className="brand-empty__text">{t(leadKey)}</p>

        {primary !== null && (
          <div className="brand-empty__actions">
            <button
              type="button"
              className="design-btn design-btn--primary"
              data-brand-empty-action={primary.dataName}
              onClick={primary.onSelect}
            >
              {t(primary.labelKey)}
            </button>
          </div>
        )}
      </div>

      <section className="brand-empty__todo" data-brand-empty-checklist>
        <h4 className="brand-empty__todoTitle">{t('brand.empty.whatToWrite')}</h4>
        <p className="design-field__hint">{t('brand.empty.writeLater')}</p>

        <ul className="brand-empty__list">
          {items.map((item) => (
            <li
              className="brand-empty__item"
              key={item.key}
              data-brand-empty-item={item.key}
              data-filled={item.filled ? 'yes' : 'no'}
            >
              <span className="brand-empty__itemLabel">{t(item.labelKey)}</span>
              <span
                className={`brand-empty__pill${
                  item.filled ? ' brand-empty__pill--done' : ' brand-empty__pill--todo'
                }`}
              >
                {item.filled ? t('brand.empty.hasIt') : t('brand.empty.notYet')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
