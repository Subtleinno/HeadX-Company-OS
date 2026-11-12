import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  EMPTY_PLATFORM_DOC,
  KEYWORD_MAX,
  KEYWORD_MIN,
  POSITIONING_FIELDS,
  TESTS,
  addKeyword,
  hasAnyValue,
  isBlank,
  keywordsOverLimit,
  missingTests,
  parsePlatformDoc,
  platformGapCount,
  removeKeyword,
  serializePlatformDoc,
  type PlatformDoc,
} from './brandPlatform';
import { BrandPageEmpty, type BrandEmptyItem } from './BrandPageEmpty';
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

/**
 * 標籤輸入：一個一個加，不用逗號分隔文字（v2.1）。
 *
 * 為甚麼不用一個 `a、b、c` 的文字框：分開、去重、刪走一個都要人自己按逗號，
 * 而逗號可以是全形半形、可以漏、可以多。標籤輸入把這件事變成按鍵。
 */
function TagInput(props: {
  values: readonly string[];
  canEdit: boolean;
  placeholder: string;
  dataName: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function commit(): void {
    const value = draft.trim();

    if (value === '') {
      return;
    }

    props.onAdd(value);
    setDraft('');
  }

  return (
    <div className="brand-platform__tags">
      <ul className="brand-platform__tagList">
        {props.values.map((value) => (
          <li className="brand-platform__tag" key={value} data-brand-platform-chip={value}>
            <span>{value}</span>
            {props.canEdit && (
              <button
                type="button"
                className="brand-platform__tagRemove"
                aria-label={t('brand.platform.removeTag', { value })}
                data-brand-platform-tag-remove={value}
                onClick={() => {
                  props.onRemove(value);
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {props.canEdit && (
        <input
          className="design-input brand-platform__tagInput"
          value={draft}
          placeholder={props.placeholder}
          autoComplete="off"
          data-brand-platform-tag-input={props.dataName}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      )}
    </div>
  );
}

/**
 * 「這一頁要寫的」八項，次序照畫面（立場 → 關鍵詞 → 本質 → 定位 → 價值 →
 * 個性 → 受眾 → 三檢）。每一項的「已有」門檻與缺口規則**不是同一件事**：
 * 這裡答「寫了沒有」，缺口答「有沒有規則 id」，兩者故意分開。
 */
function emptyItems(doc: PlatformDoc): BrandEmptyItem[] {
  return [
    { key: 'stance', labelKey: 'brand.platform.stanceTitle', filled: doc.stance.trim() !== '' },
    {
      key: 'keywords',
      labelKey: 'brand.platform.keywords',
      filled: doc.keywords.length >= KEYWORD_MIN,
    },
    {
      key: 'essence',
      labelKey: 'brand.platform.essenceSection',
      filled: doc.essence.trim() !== '' && doc.purpose.trim() !== '',
    },
    {
      key: 'positioning',
      labelKey: 'brand.platform.positioning',
      filled: POSITIONING_FIELDS.every((field) => doc.positioning[field.key].trim() !== ''),
    },
    {
      key: 'values',
      labelKey: 'brand.platform.values',
      filled:
        doc.values.length > 0 &&
        doc.values.every((value) => value.name.trim() !== '' && value.do.trim() !== '' && value.dont.trim() !== ''),
    },
    { key: 'traits', labelKey: 'brand.platform.traits', filled: doc.traits.length > 0 },
    { key: 'audience', labelKey: 'brand.platform.audience', filled: doc.audience.trim() !== '' },
    { key: 'tests', labelKey: 'brand.platform.tests', filled: missingTests(doc).length === 0 },
  ];
}

/**
 * 缺口上報：只有一個來源（`platformGapCount(doc)`），每次文件變就報一次。
 *
 * 為甚麼是一個子元件而不是在 `update()` 裡報：全空狀態根本沒有 `update()`，
 * 缺口會永遠是 null，「這一頁」那一段就少了「缺口 6 項」。而且 `update()` 只在
 * 有人打字時才跑，一打開頁面不報 —— 開啟時的缺口與改完之後的缺口是同一件事，
 * 不應該只有後者算數。
 */
function GapReporter({ count, onCount }: { count: number; onCount?: (count: number | null) => void }) {
  useEffect(() => {
    onCount?.(count);
  }, [count, onCount]);

  return null;
}

export type BrandPlatformEditorProps = {
  brandId: string;
  /** 有沒有編輯權。與 `canEdit` 不同：`canEdit` 還要「正在編輯」。 */
  mayEdit?: boolean;
  /** 由閱讀態開始改：按「選一句立場」時通知外殼切去編輯態。 */
  onStartEdit?: () => void;
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
          }}
        >
          {t('brand.page.manage.new')}
        </button>
      </div>
    );
  }

  const doc = parsed.doc;
  const gapCount = platformGapCount(doc);

  function update(next: PlatformDoc): void {
    props.onChange(write(next));
  }

  function patch(change: Partial<PlatformDoc>): void {
    update({ ...doc, ...change });
  }

  function patchPositioning(key: keyof PlatformDoc['positioning'], value: string): void {
    update({ ...doc, positioning: { ...doc.positioning, [key]: value } });
  }

  const missing = missingTests(doc);

  // 全空（v2.1）：只做一件事 —— 選一句立場。下面是「這一頁要寫的」清單，
  // 不是八個空表。八個空格等於叫人在白紙上自己找起點。
  if (isBlank(doc)) {
    return (
      <div className="brand-platform" data-brand-platform="empty">
        <GapReporter count={gapCount} onCount={props.onGapCount} />
        <BrandPageEmpty
          pageKey="platform"
          titleKey="brand.platform.emptyTitle"
          leadKey="brand.platform.emptyLead"
          primary={
            // 全空的第一件事在閱讀態都要按得落：這一頁唯一的動作就是選立場，
            // 要人先按「編輯」再按「選一句立場」是兩步做一件事。
            (props.mayEdit ?? props.canEdit)
              ? {
                  labelKey: 'brand.platform.pick',
                  dataName: 'stance',
                  onSelect: () => {
                    props.onStartEdit?.();
                    setPicking(true);
                  },
                }
              : null
          }
          items={emptyItems(doc)}
        />

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

  return (
    <div className="brand-platform" data-brand-platform="ready">
      <GapReporter count={gapCount} onCount={props.onGapCount} />
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

      {/* 關鍵詞（v2.1）：三到五個，標籤輸入，一個一個加。 */}
      <section className="brand-platform__section" data-brand-platform-keywords>
        <h3 className="brand-page__versionsTitle">
          {t('brand.platform.keywords')}
          <span className="brand-platform__count" data-brand-platform-keyword-count>
            {doc.keywords.length}／{KEYWORD_MAX}
          </span>
        </h3>
        <p className="design-field__hint">{t('brand.platform.keywordsHint')}</p>

        <TagInput
          values={doc.keywords}
          canEdit={props.canEdit}
          placeholder={t('brand.platform.keywordPlaceholder')}
          dataName="keyword"
          onAdd={(value) => {
            patch(addKeyword(doc, value));
          }}
          onRemove={(value) => {
            patch(removeKeyword(doc, value));
          }}
        />

        {doc.keywords.length < KEYWORD_MIN && (
          <p className="brand-platform__missing" data-brand-platform-keyword-short>
            {t('brand.platform.keywordsShort', { min: KEYWORD_MIN })}
          </p>
        )}
        {keywordsOverLimit(doc) && (
          <p className="brand-platform__missing" data-brand-platform-keyword-over>
            {t('brand.platform.keywordsOver', { max: KEYWORD_MAX })}
          </p>
        )}
      </section>

      {/* 品牌本質與目的：拿掉所有形容詞之後仍然成立的那一句。 */}
      <section className="brand-platform__section" data-brand-platform-essence>
        <h3 className="brand-page__versionsTitle">{t('brand.platform.essenceSection')}</h3>

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
        </div>
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

      {/* 個性：標籤輸入，一個一個加（v2.1）。 */}
      <section className="brand-platform__section" data-brand-platform-traits>
        <h3 className="brand-page__versionsTitle">{t('brand.platform.traits')}</h3>
        <p className="design-field__hint">{t('brand.platform.traitsHint')}</p>

        <TagInput
          values={doc.traits}
          canEdit={props.canEdit}
          placeholder={t('brand.platform.traitPlaceholder')}
          dataName="trait"
          onAdd={(value) => {
            patch({ traits: [...doc.traits, value] });
          }}
          onRemove={(value) => {
            patch({ traits: doc.traits.filter((item) => item !== value) });
          }}
        />
      </section>

      {/* 受眾與參考對象：參考對象不是模仿，是「寫給誰」的旁證。 */}
      <section className="brand-platform__section" data-brand-platform-audience>
        <h3 className="brand-page__versionsTitle">{t('brand.platform.audienceSection')}</h3>

        <div className="brand-platform__grid">
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
