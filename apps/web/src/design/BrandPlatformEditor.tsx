import { useState } from 'react';
import { t } from '@company-os/i18n';
import {
  EMPTY_PLATFORM_DOC,
  POSITIONING_FIELDS,
  TESTS,
  hasAnyValue,
  missingTests,
  parsePlatformDoc,
  platformGapCount,
  serializePlatformDoc,
  type PlatformDoc,
} from './brandPlatform';
import { StancePicker } from './BrandStancePicker';

/**
 * 平台頁的編輯介面（issue #61）。
 *
 * 這一頁有三層：**立場句**（一句，之後每頁都用）、**定位六格**（拆解那一句）、
 * **價值與三檢**（證據）。三者不是同一種東西，所以不放在同一個大文字框裡 ——
 * 一個大文字框會令「立場句未寫」與「憑什麼未寫」看起來一樣嚴重。
 *
 * 儲存仍然走 #33 的版本鏈：這裡只把表變成內容字串交給 `onChange`，按上面那個
 * 「儲存（新增一版）」才真的落版。所以這一頁沒有自己的儲存鍵。
 *
 * 兩個誠實位：
 *   1. 讀不到結構（舊自由文字）就講讀不到，不畫一堆假的空欄。
 *   2. 三檢缺證據顯示「缺」，不是變灰 —— 它是一個缺口，可以在立場對話框裡
 *      直接建立 Need（判斷型，只有老闆補）。
 */

export type BrandPlatformEditorProps = {
  brandId: string;
  /** 現行版本的內容（JSON 字串，或者是舊的自由文字）。 */
  content: string;
  canEdit: boolean;
  isOwner: boolean;
  onChange: (next: string) => void;
  onGapCount?: (count: number | null) => void;
};

function write(doc: PlatformDoc): string {
  return hasAnyValue(doc) ? serializePlatformDoc(doc) : '';
}

export function BrandPlatformEditor(props: BrandPlatformEditorProps) {
  const parsed = parsePlatformDoc(props.content);
  const [picking, setPicking] = useState(false);

  // 讀不到結構：講清楚，並提供一個由空白起手的鍵（舊文字會留在舊版裡）。
  if (!parsed.ok) {
    return (
      <div className="brand-platform brand-platform--legacy" data-brand-platform="legacy">
        <p className="design-note" role="status">
          {t('brand.platform.readFailed')}
        </p>
        <button
          type="button"
          className="design-btn"
          data-brand-platform-reset
          onClick={() => {
            props.onChange(write(EMPTY_PLATFORM_DOC));
            props.onGapCount?.(platformGapCount(EMPTY_PLATFORM_DOC));
          }}
        >
          {t('brand.page.manage.new')}
        </button>
      </div>
    );
  }

  const doc = parsed.doc;

  function update(next: PlatformDoc): void {
    props.onChange(write(next));
    props.onGapCount?.(platformGapCount(next));
  }

  function patch(change: Partial<PlatformDoc>): void {
    update({ ...doc, ...change });
  }

  function patchPositioning(key: keyof PlatformDoc['positioning'], value: string): void {
    update({ ...doc, positioning: { ...doc.positioning, [key]: value } });
  }

  const missing = missingTests(doc);

  return (
    <div className="brand-platform" data-brand-platform="ready">
      {/* 第一屏：立場句。一句，不是一段。 */}
      <section className="brand-platform__stance" data-brand-platform-stance>
        <div className="brand-platform__stanceHead">
          <h3 className="brand-page__versionsTitle">{t('brand.platform.stanceTitle')}</h3>
          {props.canEdit && (
            <button
              type="button"
              className="brand-page__action"
              data-brand-platform-pick
              onClick={() => {
                setPicking(true);
              }}
            >
              {t('brand.platform.pick')}
            </button>
          )}
        </div>

        {doc.stance === '' ? (
          <p className="brand-platform__stanceEmpty">{t('brand.platform.stanceEmpty')}</p>
        ) : (
          <p className="brand-platform__stanceText" data-brand-platform-stance-text>
            {doc.stance}
          </p>
        )}

        <p className="design-field__hint">{t('brand.platform.stanceHint')}</p>
      </section>

      {/* 定位六格：立場的拆解。 */}
      <section className="brand-platform__section" data-brand-platform-positioning>
        <h3 className="brand-page__versionsTitle">{t('brand.platform.positioning')}</h3>

        <div className="brand-platform__grid">
          {POSITIONING_FIELDS.map((field) => (
            <label className="brand-platform__field" key={field.key}>
              <span className="design-field__label">{t(field.labelKey)}</span>
              <input
                className="design-input"
                value={doc.positioning[field.key]}
                readOnly={!props.canEdit}
                data-brand-platform-field={field.key}
                onChange={(event) => {
                  patchPositioning(field.key, event.target.value);
                }}
              />
            </label>
          ))}
        </div>
      </section>

      {/* 價值：每一條都要寫「不做什麼」。 */}
      <section className="brand-platform__section" data-brand-platform-values>
        <h3 className="brand-page__versionsTitle">{t('brand.platform.values')}</h3>
        <p className="design-field__hint">{t('brand.platform.valuesHint')}</p>

        <ul className="brand-platform__values">
          {doc.values.map((value, index) => (
            <li className="brand-platform__value" key={`value-${index}`} data-brand-platform-value={index}>
              <label className="brand-platform__field">
                <span className="design-field__label">{t('brand.platform.valueName')}</span>
                <input
                  className="design-input"
                  value={value.name}
                  readOnly={!props.canEdit}
                  onChange={(event) => {
                    const values = doc.values.map((item, at) =>
                      at === index ? { ...item, name: event.target.value } : item,
                    );
                    patch({ values });
                  }}
                />
              </label>

              <label className="brand-platform__field">
                <span className="design-field__label">{t('brand.platform.valueDo')}</span>
                <input
                  className="design-input"
                  value={value.do}
                  readOnly={!props.canEdit}
                  onChange={(event) => {
                    const values = doc.values.map((item, at) =>
                      at === index ? { ...item, do: event.target.value } : item,
                    );
                    patch({ values });
                  }}
                />
              </label>

              <label className="brand-platform__field">
                <span className="design-field__label">{t('brand.platform.valueDont')}</span>
                <input
                  className="design-input"
                  value={value.dont}
                  readOnly={!props.canEdit}
                  onChange={(event) => {
                    const values = doc.values.map((item, at) =>
                      at === index ? { ...item, dont: event.target.value } : item,
                    );
                    patch({ values });
                  }}
                />
              </label>

              {props.canEdit && (
                <button
                  type="button"
                  className="brand-page__action"
                  onClick={() => {
                    patch({ values: doc.values.filter((_item, at) => at !== index) });
                  }}
                >
                  {t('brand.platform.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>

        {props.canEdit && (
          <button
            type="button"
            className="brand-page__action"
            data-brand-platform-add-value
            onClick={() => {
              patch({ values: [...doc.values, { name: '', do: '', dont: '' }] });
            }}
          >
            {t('brand.platform.addValue')}
          </button>
        )}
      </section>

      {/* 三檢：證據。缺就是缺，不是待填。 */}
      <section className="brand-platform__section" data-brand-platform-tests>
        <h3 className="brand-page__versionsTitle">{t('brand.platform.tests')}</h3>
        <p className="design-field__hint">{t('brand.platform.testsHint')}</p>

        <div className="brand-platform__grid">
          {TESTS.map((test) => (
            <label
              className="brand-platform__field"
              key={test.key}
              data-brand-platform-test={test.key}
              data-state={doc.tests[test.key].trim() === '' ? 'missing' : 'ok'}
            >
              <span className="design-field__label">
                {t(test.labelKey)}
                {missing.includes(test.key) && (
                  <span className="brand-platform__missing"> {t('brand.platform.evidenceMissing')}</span>
                )}
              </span>
              <textarea
                className="design-input brand-platform__evidence"
                value={doc.tests[test.key]}
                readOnly={!props.canEdit}
                rows={2}
                onChange={(event) => {
                  patch({ tests: { ...doc.tests, [test.key]: event.target.value } });
                }}
              />
            </label>
          ))}
        </div>
      </section>

      {/* 其餘四格：受眾、本質、為咩存在、特質、參考。 */}
      <section className="brand-platform__section" data-brand-platform-rest>
        <h3 className="brand-page__versionsTitle">{t('brand.platform.audience')}</h3>

        <div className="brand-platform__grid">
          <label className="brand-platform__field">
            <span className="design-field__label">{t('brand.platform.essence')}</span>
            <input
              className="design-input"
              value={doc.essence}
              readOnly={!props.canEdit}
              data-brand-platform-field="essence"
              onChange={(event) => {
                patch({ essence: event.target.value });
              }}
            />
          </label>

          <label className="brand-platform__field">
            <span className="design-field__label">{t('brand.platform.audience')}</span>
            <textarea
              className="design-input"
              value={doc.audience}
              readOnly={!props.canEdit}
              rows={2}
              data-brand-platform-field="audience"
              onChange={(event) => {
                patch({ audience: event.target.value });
              }}
            />
          </label>

          <label className="brand-platform__field">
            <span className="design-field__label">{t('brand.platform.purpose')}</span>
            <textarea
              className="design-input"
              value={doc.purpose}
              readOnly={!props.canEdit}
              rows={2}
              data-brand-platform-field="purpose"
              onChange={(event) => {
                patch({ purpose: event.target.value });
              }}
            />
          </label>

          <label className="brand-platform__field">
            <span className="design-field__label">{t('brand.platform.traits')}</span>
            <input
              className="design-input"
              value={doc.traits.join('、')}
              readOnly={!props.canEdit}
              data-brand-platform-field="traits"
              onChange={(event) => {
                patch({
                  traits: event.target.value
                    .split(/[、,，\n]/)
                    .map((item) => item.trim())
                    .filter((item) => item !== ''),
                });
              }}
            />
            <span className="design-field__hint">{t('brand.platform.traitsHint')}</span>
          </label>

          <label className="brand-platform__field">
            <span className="design-field__label">{t('brand.platform.references')}</span>
            <textarea
              className="design-input"
              value={doc.references.join('\n')}
              readOnly={!props.canEdit}
              rows={3}
              data-brand-platform-field="references"
              onChange={(event) => {
                patch({
                  references: event.target.value
                    .split('\n')
                    .map((item) => item.trim())
                    .filter((item) => item !== ''),
                });
              }}
            />
            <span className="design-field__hint">{t('brand.platform.referencesHint')}</span>
          </label>
        </div>
      </section>

      {picking && (
        <StancePicker
          brandId={props.brandId}
          pageKey="platform"
          doc={doc}
          canEdit={props.canEdit}
          isOwner={props.isOwner}
          onConfirm={(stance) => {
            update({ ...doc, stance });
            setPicking(false);
          }}
          onClose={() => {
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
