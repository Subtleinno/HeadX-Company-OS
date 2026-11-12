import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchBrandPage } from '../api';
import { COLOR_ROLES, parseColorDoc, type ColorDoc } from './brandColors';
import {
  IMAGE_LISTS,
  PHOTO_FIELDS,
  addBanned,
  addColorLink,
  addExample,
  addLine,
  bannedGaps,
  bannedTerms,
  colourOf,
  colourRoleState,
  emptyImageDoc,
  exampleGaps,
  gapCount,
  hasAnyValue,
  imageGaps,
  parseImageDoc,
  removeBanned,
  removeColorLink,
  removeExample,
  removeLine,
  serializeImageDoc,
  setBanned,
  setExample,
  setPhoto,
  type ExampleGap,
  type ImageDoc,
  type ImageListKey,
  type PhotoField,
} from './brandImage';
import { useGapCount } from './useGapCount';

/**
 * 圖像頁的編輯介面（issue #66）。
 *
 * 這一頁寫的是**這個品牌的照片長甚麼樣**：立場句、攝影六格、已核准的真範例、
 * 要與不要、引用哪些色彩角色、授權，以及禁止的題材。
 *
 * 五條界線：
 *   1. 沒有真實範例（冇檔案）就標缺 —— 不用圖庫圖假扮，也不用「暖調自然光」
 *      這種描述當範例。
 *   2. 六格是同一張照片的六個決定，缺一格就講缺那一格；不代填「自然」。
 *   3. 顏色只引用色彩頁的角色名，值由色彩頁來；未定就標「色彩頁未定值」，
 *      不在這一頁補一個色。
 *   4. 插畫「若有」：留空不是缺。
 *   5. 現行內容不是圖像表就講讀不到，不畫六格空的假規格。
 */

type BrandImageEditorProps = {
  brandId: string;
  content: string;
  canEdit: boolean;
  onChange: (next: string) => void;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

function write(doc: ImageDoc): string {
  return hasAnyValue(doc) ? serializeImageDoc(doc) : '';
}

function photoLabel(field: PhotoField): string {
  switch (field) {
    case 'subject':
      return t('brand.image.photoSubject');
    case 'composition':
      return t('brand.image.photoComposition');
    case 'light':
      return t('brand.image.photoLight');
    case 'tone':
      return t('brand.image.photoTone');
    case 'space':
      return t('brand.image.photoSpace');
    default:
      return t('brand.image.photoProps');
  }
}

function photoHint(field: PhotoField): string {
  switch (field) {
    case 'subject':
      return t('brand.image.photoSubjectHint');
    case 'composition':
      return t('brand.image.photoCompositionHint');
    case 'light':
      return t('brand.image.photoLightHint');
    case 'tone':
      return t('brand.image.photoToneHint');
    case 'space':
      return t('brand.image.photoSpaceHint');
    default:
      return t('brand.image.photoPropsHint');
  }
}

function listLabel(key: ImageListKey): string {
  return key === 'like' ? t('brand.image.like') : t('brand.image.unlike');
}

function exampleGapLabel(gap: ExampleGap): string {
  switch (gap) {
    case 'label':
      return t('brand.image.exampleLabel');
    case 'file':
      return t('brand.image.exampleFile');
    default:
      return t('brand.image.exampleUse');
  }
}

export function BrandImageEditor({
  brandId,
  content,
  canEdit,
  onChange,
  onGapCount,
}: BrandImageEditorProps) {
  const [colour, setColour] = useState<ColorDoc | null>(null);
  const [drafts, setDrafts] = useState<Record<ImageListKey, string>>({ like: '', unlike: '' });
  const [bannedDraft, setBannedDraft] = useState({ term: '', reason: '' });
  const [bannedError, setBannedError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      const page = await fetchBrandPage(brandId, 'color');

      if (!live || !page.ok) {
        return;
      }

      const parsed = parseColorDoc(page.data.current?.content ?? '');

      setColour(parsed.kind === 'ok' ? parsed.doc : null);
    })();

    return () => {
      live = false;
    };
  }, [brandId]);

  const parsed = parseImageDoc(content);

  // 上報缺口要在 early return 之前：hook 的數目不可以因為內容壞了就變。
  useGapCount(
    parsed.kind === 'invalid'
      ? null
      : gapCount(imageGaps(parsed.kind === 'ok' ? parsed.doc : emptyImageDoc())),
    onGapCount,
  );

  if (parsed.kind === 'invalid') {
    return (
      <div className="brand-image brand-image--invalid" data-image-invalid>
        <p className="design-note design-note--error">{t('brand.image.invalid')}</p>

        {canEdit && (
          <div className="design-form__actions">
            <button
              type="button"
              className="design-btn"
              data-image-reset
              onClick={() => {
                onChange(write(emptyImageDoc()));
              }}
            >
              {t('brand.image.invalidReset')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const doc = parsed.kind === 'ok' ? parsed.doc : emptyImageDoc();
  const gaps = imageGaps(doc);

  function commit(next: ImageDoc): void {
    onChange(write(next));
  }

  function submitLine(key: ImageListKey): void {
    const value = drafts[key];

    if (value.trim() === '') {
      return;
    }

    commit(addLine(doc, key, value));
    setDrafts({ ...drafts, [key]: '' });
  }

  function submitBanned(): void {
    const term = bannedDraft.term.trim();

    if (term === '') {
      setBannedError(t('brand.image.bannedTermMissing'));
      return;
    }

    if (bannedTerms(doc).includes(term)) {
      setBannedError(t('brand.image.bannedDuplicate', { term }));
      return;
    }

    setBannedError(null);
    commit(addBanned(doc, term, bannedDraft.reason));
    setBannedDraft({ term: '', reason: '' });
  }

  const summary: string[] = [];

  if (gaps.stance) {
    summary.push(t('brand.image.gapStance'));
  }

  if (gaps.photo.length > 0) {
    summary.push(t('brand.image.gapPhoto', { items: gaps.photo.map(photoLabel).join('、') }));
  }

  if (gaps.realExample) {
    summary.push(t('brand.image.gapRealExample'));
  }

  if (gaps.examples.length > 0) {
    summary.push(
      t('brand.image.gapExamples', {
        items: gaps.examples.map((index) => `#${index + 1}`).join('、'),
      }),
    );
  }

  if (gaps.lists.length > 0) {
    summary.push(t('brand.image.gapLists', { items: gaps.lists.map(listLabel).join('、') }));
  }

  if (gaps.colorLink) {
    summary.push(t('brand.image.gapColorLink'));
  }

  if (gaps.colorUnknown.length > 0) {
    summary.push(t('brand.image.gapColorUnknown', { items: gaps.colorUnknown.join('、') }));
  }

  if (gaps.rights) {
    summary.push(t('brand.image.gapRights'));
  }

  if (gaps.banned) {
    summary.push(t('brand.image.gapBanned'));
  }

  if (gaps.bannedReasons.length > 0) {
    const terms = gaps.bannedReasons
      .map((index) => doc.banned[index]?.term.trim() ?? '')
      .filter((term) => term !== '')
      .join('、');

    summary.push(t('brand.image.gapBannedReasons', { count: gaps.bannedReasons.length, terms }));
  }

  return (
    <div className="brand-image" data-image-doc>
      <p className="design-field__hint" data-image-note>
        {t('brand.image.note')}
      </p>

      <p
        className={`brand-image__missing${gapCount(gaps) === 0 ? '' : ' brand-image__missing--gap'}`}
        data-image-missing
      >
        {gapCount(gaps) === 0
          ? t('brand.image.allPresent')
          : t('brand.image.missingLine', { items: summary.join('、') })}
      </p>

      <section className="brand-image__section" data-image-stance-section>
        <h3 className="brand-page__versionsTitle">{t('brand.image.stance')}</h3>
        <p className="design-field__hint">{t('brand.image.stanceHint')}</p>
        <textarea
          className="brand-page__textarea brand-image__textarea"
          data-image-stance
          value={doc.stance}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.image.stancePlaceholder')}
          onChange={(event) => {
            commit({ ...doc, stance: event.target.value });
          }}
        />
      </section>

      <section className="brand-image__section" data-image-photo-section>
        <h3 className="brand-page__versionsTitle">{t('brand.image.photo')}</h3>
        <p className="design-field__hint">{t('brand.image.photoHint')}</p>

        <div className="brand-image__photo">
          {PHOTO_FIELDS.map((field) => {
            const missing = doc.photo[field].trim() === '';

            return (
              <label
                className="brand-image__field"
                key={field}
                data-image-photo-field={field}
                data-missing={missing ? 'true' : 'false'}
              >
                <span className="brand-image__fieldLabel">{photoLabel(field)}</span>
                <textarea
                  className="brand-page__textarea brand-image__textarea"
                  data-image-photo={field}
                  value={doc.photo[field]}
                  readOnly={!canEdit}
                  rows={2}
                  placeholder={photoHint(field)}
                  aria-label={photoLabel(field)}
                  onChange={(event) => {
                    commit(setPhoto(doc, field, event.target.value));
                  }}
                />
              </label>
            );
          })}
        </div>
      </section>

      <section className="brand-image__section" data-image-examples-section>
        <h3 className="brand-page__versionsTitle">{t('brand.image.examples')}</h3>
        <p className="design-field__hint">{t('brand.image.examplesHint')}</p>

        {gaps.realExample && (
          <p className="design-note design-note--error" data-image-real-example>
            {t('brand.image.realExampleMissing')}
          </p>
        )}

        {doc.approved_examples.length === 0 ? (
          <p className="design-empty">{t('brand.image.examplesEmpty')}</p>
        ) : (
          <div className="brand-image__recordList">
            {doc.approved_examples.map((example, index) => {
              const gapsOfExample = exampleGaps(example);

              return (
                <div
                  className="brand-image__example"
                  key={`example-${index}`}
                  data-image-example={index}
                  data-missing={gapsOfExample.length === 0 ? 'false' : 'true'}
                >
                  <div className="brand-image__fields">
                    <label className="brand-image__field">
                      <span className="brand-image__fieldLabel">{t('brand.image.exampleLabel')}</span>
                      <input
                        className="design-input"
                        data-image-example-label={index}
                        value={example.label}
                        readOnly={!canEdit}
                        autoComplete="off"
                        placeholder={t('brand.image.exampleLabelPlaceholder')}
                        onChange={(event) => {
                          commit(setExample(doc, index, { label: event.target.value }));
                        }}
                      />
                    </label>

                    <label className="brand-image__field">
                      <span className="brand-image__fieldLabel">{t('brand.image.exampleFile')}</span>
                      <input
                        className="design-input"
                        data-image-example-file={index}
                        value={example.file_ref}
                        readOnly={!canEdit}
                        autoComplete="off"
                        placeholder={t('brand.image.exampleFilePlaceholder')}
                        onChange={(event) => {
                          commit(setExample(doc, index, { file_ref: event.target.value }));
                        }}
                      />
                    </label>

                    <label className="brand-image__field brand-image__field--wide">
                      <span className="brand-image__fieldLabel">{t('brand.image.exampleUse')}</span>
                      <input
                        className="design-input"
                        data-image-example-use={index}
                        value={example.use}
                        readOnly={!canEdit}
                        autoComplete="off"
                        placeholder={t('brand.image.exampleUsePlaceholder')}
                        onChange={(event) => {
                          commit(setExample(doc, index, { use: event.target.value }));
                        }}
                      />
                    </label>
                  </div>

                  <div className="brand-image__exampleHead">
                    {gapsOfExample.length > 0 && (
                      <span className="brand-image__badge" data-image-example-gap={index}>
                        {t('brand.image.exampleGaps', {
                          items: gapsOfExample.map(exampleGapLabel).join('、'),
                        })}
                      </span>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        className="brand-page__action brand-page__action--danger"
                        data-image-example-remove={index}
                        onClick={() => {
                          commit(removeExample(doc, index));
                        }}
                      >
                        {t('brand.image.exampleRemove')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {canEdit && (
          <div className="brand-image__adder">
            <button
              type="button"
              className="brand-page__action"
              data-image-example-add
              onClick={() => {
                commit(addExample(doc));
              }}
            >
              {t('brand.image.exampleAdd')}
            </button>
          </div>
        )}
      </section>

      <section className="brand-image__section" data-image-lists-section>
        <h3 className="brand-page__versionsTitle">{t('brand.image.lists')}</h3>
        <p className="design-field__hint">{t('brand.image.listsHint')}</p>

        {IMAGE_LISTS.map((key) => (
          <div className="brand-image__list" key={key} data-image-list={key}>
            <div className="brand-image__head">
              <span className="brand-image__label">{listLabel(key)}</span>
              <span className="brand-image__count" data-image-list-count={key}>
                {t('brand.image.listCount', { count: doc[key].length })}
              </span>
            </div>

            {doc[key].length === 0 ? (
              <p className="design-empty">{t('brand.image.listEmpty')}</p>
            ) : (
              <ul className="brand-image__words">
                {doc[key].map((line, index) => (
                  <li className="brand-image__word" key={`${key}-${line}`} data-image-line={`${key}-${index}`}>
                    <span>{line}</span>
                    {canEdit && (
                      <button
                        type="button"
                        className="brand-image__wordRemove"
                        data-image-line-remove={`${key}-${index}`}
                        aria-label={`${t('brand.image.listRemove')} ${line}`}
                        onClick={() => {
                          commit(removeLine(doc, key, index));
                        }}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <div className="brand-image__adder">
                <input
                  className="design-input"
                  data-image-line-input={key}
                  value={drafts[key]}
                  autoComplete="off"
                  placeholder={t('brand.image.listPlaceholder')}
                  aria-label={listLabel(key)}
                  onChange={(event) => {
                    setDrafts({ ...drafts, [key]: event.target.value });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitLine(key);
                    }
                  }}
                />
                <button
                  type="button"
                  className="brand-page__action"
                  data-image-line-add={key}
                  onClick={() => {
                    submitLine(key);
                  }}
                >
                  {t('brand.image.listAdd')}
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="brand-image__section" data-image-colour-section>
        <h3 className="brand-page__versionsTitle">{t('brand.image.colourTitle')}</h3>
        <p className="design-field__hint">{t('brand.image.colourHint')}</p>

        {doc.color_link.length === 0 ? (
          <p className="design-empty">{t('brand.image.colourEmpty')}</p>
        ) : (
          <ul className="brand-image__words">
            {doc.color_link.map((role) => {
              const hex = colourOf(colour, role);
              const state = colourRoleState(role);

              return (
                <li
                  className="brand-image__word"
                  key={role}
                  data-image-color-link={role}
                  data-missing={hex === null || state === 'unknown' ? 'true' : 'false'}
                >
                  <span
                    className="brand-image__swatch"
                    data-image-color-hex={role}
                    style={{ background: hex ?? 'transparent' }}
                  />
                  <span data-image-color-name={role}>{role}</span>
                  {hex !== null && <span className="brand-image__hex">{hex}</span>}
                  {hex === null && state !== 'unknown' && (
                    <span className="brand-image__note">{t('brand.image.colourNoValue')}</span>
                  )}
                  {state === 'unknown' && (
                    <span className="brand-image__note" data-image-color-unknown={role}>
                      {t('brand.image.colourUnknown')}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      className="brand-image__wordRemove"
                      data-image-color-remove={role}
                      aria-label={`${t('brand.image.colourRemove')} ${role}`}
                      onClick={() => {
                        commit(removeColorLink(doc, role));
                      }}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="brand-image__adder">
            <select
              className="design-input"
              data-image-color-add
              aria-label={t('brand.image.colourAdd')}
              value=""
              onChange={(event) => {
                if (event.target.value !== '') {
                  commit(addColorLink(doc, event.target.value));
                }
              }}
            >
              <option value="">{t('brand.image.colourAdd')}</option>
              {COLOR_ROLES.filter((role) => !doc.color_link.includes(role.key)).map((role) => (
                <option key={role.key} value={role.key}>
                  {role.key}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="brand-image__section" data-image-extra-section>
        <h3 className="brand-page__versionsTitle">{t('brand.image.illustrationTitle')}</h3>
        <p className="design-field__hint">{t('brand.image.illustrationHint')}</p>
        <textarea
          className="brand-page__textarea brand-image__textarea"
          data-image-illustration
          value={doc.illustration}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.image.illustrationPlaceholder')}
          onChange={(event) => {
            commit({ ...doc, illustration: event.target.value });
          }}
        />

        <h3 className="brand-page__versionsTitle">{t('brand.image.rights')}</h3>
        <p className="design-field__hint">{t('brand.image.rightsHint')}</p>
        <textarea
          className="brand-page__textarea brand-image__textarea"
          data-image-rights
          value={doc.rights}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.image.rightsPlaceholder')}
          onChange={(event) => {
            commit({ ...doc, rights: event.target.value });
          }}
        />
      </section>

      <section className="brand-image__section" data-image-banned-section>
        <h3 className="brand-page__versionsTitle">{t('brand.image.banned')}</h3>
        <p className="design-field__hint">{t('brand.image.bannedHint')}</p>

        {doc.banned.length === 0 ? (
          <p className="design-empty">{t('brand.image.bannedEmpty')}</p>
        ) : (
          <div className="brand-image__recordList">
            {doc.banned.map((item, index) => {
              const gapsOfItem = bannedGaps(item);

              return (
                <div
                  className="brand-image__record"
                  key={`banned-${index}`}
                  data-image-banned-row={index}
                  data-missing={gapsOfItem.length === 0 ? 'false' : 'true'}
                >
                  <input
                    className="design-input brand-image__recordTerm"
                    data-image-banned-term={index}
                    value={item.term}
                    readOnly={!canEdit}
                    autoComplete="off"
                    aria-label={t('brand.image.bannedTerm')}
                    onChange={(event) => {
                      commit(setBanned(doc, index, { term: event.target.value }));
                    }}
                  />
                  <input
                    className="design-input"
                    data-image-banned-reason={index}
                    value={item.reason}
                    readOnly={!canEdit}
                    autoComplete="off"
                    placeholder={t('brand.image.bannedReasonPlaceholder')}
                    aria-label={t('brand.image.bannedReason')}
                    onChange={(event) => {
                      commit(setBanned(doc, index, { reason: event.target.value }));
                    }}
                  />
                  {gapsOfItem.includes('reason') && (
                    <span className="brand-image__badge" data-image-banned-gap={index}>
                      {t('brand.image.bannedReasonMissing')}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action brand-page__action--danger"
                      data-image-banned-remove={index}
                      onClick={() => {
                        commit(removeBanned(doc, index));
                      }}
                    >
                      {t('brand.image.bannedRemove')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && (
          <div className="brand-image__adder">
            <input
              className="design-input"
              data-image-banned-input
              value={bannedDraft.term}
              autoComplete="off"
              placeholder={t('brand.image.bannedPlaceholder')}
              aria-label={t('brand.image.bannedTerm')}
              onChange={(event) => {
                setBannedDraft({ ...bannedDraft, term: event.target.value });
              }}
            />
            <input
              className="design-input"
              data-image-banned-reason-input
              value={bannedDraft.reason}
              autoComplete="off"
              placeholder={t('brand.image.bannedReasonPlaceholder')}
              aria-label={t('brand.image.bannedReason')}
              onChange={(event) => {
                setBannedDraft({ ...bannedDraft, reason: event.target.value });
              }}
            />
            <button type="button" className="brand-page__action" data-image-banned-add onClick={submitBanned}>
              {t('brand.image.bannedAdd')}
            </button>
          </div>
        )}

        {bannedError !== null && (
          <p className="design-note design-note--error" data-image-banned-error>
            {bannedError}
          </p>
        )}
      </section>
    </div>
  );
}
