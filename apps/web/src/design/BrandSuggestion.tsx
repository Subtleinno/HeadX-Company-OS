import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  acceptBrandSuggestion,
  dismissBrandSuggestion,
  fetchBrandSuggestions,
  type BrandSuggestion,
} from '../api';
import { failureMessage } from './apiFailure';

/**
 * 專屬系統建議對話框（issue #60，畫面規格 `07-system-suggestion.md`）。
 *
 * 什麼時候開：品牌主頁讀到一個「等決定」的建議時。它不會自己彈出來擋住人 ——
 * 主頁上方出現一張卡，按下去才開。一個會自己彈的對話框，第二次就變成雜訊。
 *
 * 三件事寫死在畫面上：
 *   1. 三項判斷連理由一起列。只寫「是」等於叫人相信，不是叫人判斷。
 *   2. 邊界卡：它不決定顏色、字體、標誌或語氣，只引用角色。
 *   3. 「這頁決定什麼」可以直接改 —— 接受時寫進去的是改過的這一句。
 *
 * 略過是決定，不是取消：文案講明「內容沒有明顯變化不會再提」，而它真的
 * 不會再提（後端按簽名擋）。
 */

export type SuggestionDialogProps = {
  brandId: string;
  suggestion: BrandSuggestion;
  onDecided: (message: string) => void;
  onClose: () => void;
};

export function SuggestionDialog(props: SuggestionDialogProps) {
  const [brief, setBrief] = useState(props.suggestion.brief);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await acceptBrandSuggestion(props.brandId, props.suggestion.id, brief.trim());

    setBusy(false);

    if (!result.ok) {
      if (result.failure.kind === 'http' && result.failure.error === 'page_key_taken') {
        setError(t('brand.suggest.taken', { slug: props.suggestion.slug, name: props.suggestion.name }));
        return;
      }

      setError(failureMessage(result.failure, t('brand.suggest.failed')));
      return;
    }

    props.onDecided(t('brand.suggest.accepted', { name: result.data.page.name }));
  }

  async function handleDismiss(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await dismissBrandSuggestion(props.brandId, props.suggestion.id);

    setBusy(false);

    if (!result.ok) {
      setError(failureMessage(result.failure, t('brand.suggest.failed')));
      return;
    }

    props.onDecided(t('brand.suggest.dismissed'));
  }

  const checks = [
    { key: 'unique', label: t('brand.suggest.check.unique'), reason: props.suggestion.checks.unique },
    { key: 'repeated', label: t('brand.suggest.check.repeated'), reason: props.suggestion.checks.repeated },
    { key: 'noRoom', label: t('brand.suggest.check.noRoom'), reason: props.suggestion.checks.noRoom },
  ];

  return (
    <div className="suggest-backdrop" data-suggestion-dialog>
      <div className="suggest" role="dialog" aria-modal="true" aria-labelledby="suggest-title">
        <header className="suggest__head">
          <h2 className="suggest__title" id="suggest-title">
            {t('brand.suggest.title', { name: props.suggestion.name })}
          </h2>
          <p className="suggest__lead">{t('brand.suggest.lead')}</p>
        </header>

        <ul className="suggest__checks">
          {checks.map((check) => (
            <li className="suggest__check" key={check.key} data-suggest-check={check.key}>
              <span className="suggest__yes">{t('brand.suggest.yes')}</span>
              <span className="suggest__checkLabel">{check.label}</span>
              <span className="suggest__reason">{check.reason}</span>
            </li>
          ))}
        </ul>

        <section className="suggest__boundary" data-suggest-boundary>
          <p className="suggest__boundaryTitle">{t('brand.suggest.boundaryTitle')}</p>
          <p className="suggest__boundaryBody">{t('brand.suggest.boundaryBody')}</p>
          {props.suggestion.refs.length === 0 ? (
            <p className="suggest__refsNone">{t('brand.suggest.refsNone')}</p>
          ) : (
            <p className="suggest__refs">
              {props.suggestion.refs.map((ref) => (
                <span className="suggest__ref" key={ref} data-suggest-ref={ref}>
                  {ref}
                </span>
              ))}
            </p>
          )}
        </section>

        <label className="suggest__field">
          <span className="design-field__label">{t('brand.suggest.briefLabel')}</span>
          <input
            className="design-input"
            value={brief}
            data-suggest-brief
            onChange={(event) => {
              setBrief(event.target.value);
            }}
          />
        </label>

        {error !== null && (
          <p className="design-note design-note--error" role="alert" data-suggest-error>
            {error}
          </p>
        )}

        <div className="suggest__actions">
          <button
            type="button"
            className="design-btn"
            data-suggest-dismiss
            disabled={busy}
            onClick={() => {
              void handleDismiss();
            }}
          >
            {t('brand.suggest.dismiss')}
          </button>

          <button
            type="button"
            className="design-btn design-btn--primary"
            data-suggest-accept
            disabled={busy || brief.trim() === ''}
            onClick={() => {
              void handleAccept();
            }}
          >
            {t('brand.suggest.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 品牌主頁上方的建議卡。
 *
 * 不多不少：一個品牌一次只顯示最新的一個建議。三個建議同時排隊，等於沒有
 * 建議 —— 人只會全部略過。
 */
export function SuggestionCard(props: { suggestion: BrandSuggestion; onOpen: () => void }) {
  return (
    <button type="button" className="suggest-card" data-suggest-card onClick={props.onOpen}>
      <span className="suggest-card__tag">{t('brand.suggest.check.unique')}</span>
      <span className="suggest-card__title">{t('brand.suggest.title', { name: props.suggestion.name })}</span>
      <span className="suggest-card__brief">{props.suggestion.brief}</span>
    </button>
  );
}

/**
 * 「這屬於某一頁」提示（#60 第 3 點）。
 *
 * agent 判斷其實屬於既有頁時，不開對話框；改在那一頁頂部講一句。一句就夠 ——
 * 它不是一個決定，是一個觀察。
 */
export function SuggestionBelongsHint(props: { suggestion: BrandSuggestion; pageName: string }) {
  return (
    <p className="design-note" data-suggest-belongs={props.suggestion.id}>
      {t('brand.suggest.belongs', { page: props.pageName })}
    </p>
  );
}

/** 讀這個品牌等決定的建議。一次讀一次用，不需要快取。 */
export function useSuggestions(brandId: string | null): {
  items: BrandSuggestion[];
  reload: () => void;
} {
  const [items, setItems] = useState<BrandSuggestion[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (brandId === null) {
      setItems([]);
      return;
    }

    let live = true;

    void (async () => {
      const result = await fetchBrandSuggestions(brandId);

      if (!live || !result.ok) {
        return;
      }

      setItems(result.data.items);
    })();

    return () => {
      live = false;
    };
  }, [brandId, nonce]);

  return {
    items,
    reload: () => {
      setNonce((value) => value + 1);
    },
  };
}
