import { useState } from 'react';
import { t } from '@company-os/i18n';
import {
  CONTEXT_KEYS,
  HARDEST_FIELDS,
  MAX_TRAITS,
  MIN_TRAITS,
  SAMPLE_KINDS,
  SAMPLE_TARGET,
  addBanned,
  addSample,
  addTrait,
  bannedGaps,
  bannedTerms,
  emptyToneDoc,
  gapCount,
  hasAnyValue,
  parseToneDoc,
  removeBanned,
  removeSample,
  removeTrait,
  serializeToneDoc,
  setBanned,
  setContext,
  setHardest,
  setSample,
  setTrait,
  toneGaps,
  traitGaps,
  type ContextKey,
  type HardestField,
  type SampleKind,
  type ToneDoc,
  type TraitGap,
} from './brandTone';
import { useGapCount } from './useGapCount';

/**
 * 語氣頁的編輯介面（issue #65，取代 #37）。
 *
 * 這一頁寫的是**這個品牌怎樣說話**：立場句、三到五個特質（每個都要「會這樣
 * 講」「不會這樣講」加一句真句）、逐個有原因的禁用詞、語言政策、五句像五句
 * 不像、五個情境、最難的一句。
 *
 * 四條界線：
 *   1. 只有形容詞沒有示範句，標成缺 —— 不是「不夠好」，是「未寫」。
 *   2. 禁用詞冇原因同樣標缺：冇原因的禁令，下一次就會被人解禁（`voice.r1`）。
 *   3. 樣本未夠五句就講未夠，不當作「差不多」。
 *   4. 這一頁不定顏色、字體、標誌，也不寫渠道尺寸與頁數。
 *
 * 儲存仍然走 #33 的版本鏈：這裡只把表變成字串交給 `BrandPageScreen` 的
 * draft，按「儲存」才真的新增一版。
 */

type BrandToneEditorProps = {
  content: string;
  canEdit: boolean;
  onChange: (next: string) => void;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

function write(doc: ToneDoc): string {
  return hasAnyValue(doc) ? serializeToneDoc(doc) : '';
}

function traitGapLabel(gap: TraitGap): string {
  switch (gap) {
    case 'name':
      return t('brand.tone.traitName');
    case 'do':
      return t('brand.tone.traitDo');
    case 'dont':
      return t('brand.tone.traitDont');
    default:
      return t('brand.tone.traitSentence');
  }
}

function contextLabel(key: ContextKey): string {
  switch (key) {
    case 'explain':
      return t('brand.tone.context.explain');
    case 'invite':
      return t('brand.tone.context.invite');
    case 'decline':
      return t('brand.tone.context.decline');
    case 'apologize':
      return t('brand.tone.context.apologize');
    default:
      return t('brand.tone.context.incident');
  }
}

function sampleLabel(kind: SampleKind): string {
  return kind === 'like' ? t('brand.tone.sampleLike') : t('brand.tone.sampleUnlike');
}

function hardestLabel(field: HardestField): string {
  return field === 'wrong' ? t('brand.tone.hardestWrong') : t('brand.tone.hardestRight');
}

export function BrandToneEditor({ content, canEdit, onChange, onGapCount }: BrandToneEditorProps) {
  const [bannedDraft, setBannedDraft] = useState({ term: '', reason: '' });
  const [bannedError, setBannedError] = useState<string | null>(null);

  const parsed = parseToneDoc(content);

  // 上報缺口要在 early return 之前：hook 的數目不可以因為內容壞了就變。
  useGapCount(
    parsed.kind === 'invalid'
      ? null
      : gapCount(toneGaps(parsed.kind === 'ok' ? parsed.doc : emptyToneDoc())),
    onGapCount,
  );

  if (parsed.kind === 'invalid') {
    return (
      <div className="brand-tone brand-tone--invalid" data-tone-invalid>
        <p className="design-note design-note--error">{t('brand.tone.invalid')}</p>

        {canEdit && (
          <div className="design-form__actions">
            <button
              type="button"
              className="design-btn"
              data-tone-reset
              onClick={() => {
                onChange(write(emptyToneDoc()));
              }}
            >
              {t('brand.tone.invalidReset')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const doc = parsed.kind === 'ok' ? parsed.doc : emptyToneDoc();
  const gaps = toneGaps(doc);

  function commit(next: ToneDoc): void {
    onChange(write(next));
  }

  function submitBanned(): void {
    const term = bannedDraft.term.trim();

    if (term === '') {
      setBannedError(t('brand.tone.bannedTermMissing'));
      return;
    }

    if (bannedTermExists(doc, term)) {
      setBannedError(t('brand.tone.bannedDuplicate', { term }));
      return;
    }

    setBannedError(null);
    commit(addBanned(doc, term, bannedDraft.reason));
    setBannedDraft({ term: '', reason: '' });
  }

  const summary: string[] = [];

  if (gaps.stance) {
    summary.push(t('brand.tone.gapStance'));
  }

  if (gaps.tooFew) {
    summary.push(t('brand.tone.gapTooFew', { count: doc.traits.length }));
  }

  if (gaps.traits.length > 0) {
    const names = gaps.traits
      .map((index) => doc.traits[index]?.name.trim() ?? '')
      .map((name, at) => (name === '' ? `#${(gaps.traits[at] ?? 0) + 1}` : name))
      .join('、');

    summary.push(t('brand.tone.gapTraits', { count: gaps.traits.length, names }));
  }

  if (gaps.banned) {
    summary.push(t('brand.tone.gapBanned'));
  }

  if (gaps.bannedReasons.length > 0) {
    const terms = gaps.bannedReasons
      .map((index) => doc.banned[index]?.term.trim() ?? '')
      .filter((term) => term !== '')
      .join('、');

    summary.push(t('brand.tone.gapBannedReasons', { count: gaps.bannedReasons.length, terms }));
  }

  if (gaps.languagePolicy) {
    summary.push(t('brand.tone.gapLanguage'));
  }

  if (gaps.contexts.length > 0) {
    summary.push(t('brand.tone.gapContexts', { items: gaps.contexts.map(contextLabel).join('、') }));
  }

  if (gaps.samples.length > 0) {
    summary.push(
      t('brand.tone.gapSamples', { items: gaps.samples.map(sampleLabel).join('、'), target: SAMPLE_TARGET }),
    );
  }

  if (gaps.hardest.length > 0) {
    summary.push(t('brand.tone.gapHardest', { items: gaps.hardest.map(hardestLabel).join('、') }));
  }

  return (
    <div className="brand-tone" data-tone-doc>
      <p className="design-field__hint" data-tone-note>
        {t('brand.tone.note')}
      </p>

      <p
        className={`brand-tone__missing${gapCount(gaps) === 0 ? '' : ' brand-tone__missing--gap'}`}
        data-tone-missing
      >
        {gapCount(gaps) === 0
          ? t('brand.tone.allPresent')
          : t('brand.tone.missingLine', { items: summary.join('、') })}
      </p>

      <section className="brand-tone__section" data-tone-stance-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.stance')}</h3>
        <p className="design-field__hint">{t('brand.tone.stanceHint')}</p>
        <textarea
          className="brand-page__textarea brand-tone__textarea"
          data-tone-stance
          value={doc.stance}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.tone.stancePlaceholder')}
          onChange={(event) => {
            commit({ ...doc, stance: event.target.value });
          }}
        />
      </section>

      <section className="brand-tone__section" data-tone-traits-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.traits')}</h3>
        <p className="design-field__hint">{t('brand.tone.traitsHint')}</p>

        {doc.traits.length === 0 ? (
          <p className="design-empty">{t('brand.tone.traitEmpty')}</p>
        ) : (
          doc.traits.map((trait, index) => {
            const gapsOfTrait = traitGaps(trait);
            const adjectiveOnly = trait.name.trim() !== '' && trait.sentence.trim() === '';

            return (
              <div
                className="brand-tone__trait"
                key={`trait-${index}`}
                data-tone-trait={index}
                data-missing={gapsOfTrait.length === 0 ? 'false' : 'true'}
              >
                <div className="brand-tone__traitHead">
                  <span className="brand-tone__traitIndex">#{index + 1}</span>

                  {adjectiveOnly && (
                    <span className="brand-tone__badge" data-tone-adjective-only={index}>
                      {t('brand.tone.adjectiveOnly')}
                    </span>
                  )}

                  {gapsOfTrait.length > 0 && !adjectiveOnly && (
                    <span className="brand-tone__badge" data-tone-trait-gaps={index}>
                      {t('brand.tone.traitGaps', {
                        items: gapsOfTrait.map(traitGapLabel).join('、'),
                      })}
                    </span>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action brand-page__action--danger"
                      data-tone-trait-remove={index}
                      onClick={() => {
                        commit(removeTrait(doc, index));
                      }}
                    >
                      {t('brand.tone.traitRemove')}
                    </button>
                  )}
                </div>

                <div className="brand-tone__fields">
                  <label className="brand-tone__field">
                    <span className="brand-tone__fieldLabel">{t('brand.tone.traitName')}</span>
                    <input
                      className="design-input"
                      data-tone-name={index}
                      value={trait.name}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.tone.traitNamePlaceholder')}
                      onChange={(event) => {
                        commit(setTrait(doc, index, { name: event.target.value }));
                      }}
                    />
                  </label>

                  <label className="brand-tone__field brand-tone__field--wide">
                    <span className="brand-tone__fieldLabel">{t('brand.tone.traitDo')}</span>
                    <input
                      className="design-input"
                      data-tone-do={index}
                      value={trait.do}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.tone.traitDoPlaceholder')}
                      onChange={(event) => {
                        commit(setTrait(doc, index, { do: event.target.value }));
                      }}
                    />
                  </label>

                  <label className="brand-tone__field brand-tone__field--wide">
                    <span className="brand-tone__fieldLabel">{t('brand.tone.traitDont')}</span>
                    <input
                      className="design-input"
                      data-tone-dont={index}
                      value={trait.dont}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.tone.traitDontPlaceholder')}
                      onChange={(event) => {
                        commit(setTrait(doc, index, { dont: event.target.value }));
                      }}
                    />
                  </label>
                </div>

                <label className="brand-tone__field brand-tone__field--half">
                  <span className="brand-tone__fieldLabel">{t('brand.tone.traitSentence')}</span>
                  <textarea
                    className="brand-page__textarea brand-tone__textarea"
                    data-tone-sentence={index}
                    value={trait.sentence}
                    readOnly={!canEdit}
                    rows={2}
                    placeholder={t('brand.tone.traitSentencePlaceholder')}
                    onChange={(event) => {
                      commit(setTrait(doc, index, { sentence: event.target.value }));
                    }}
                  />
                </label>
              </div>
            );
          })
        )}

        {canEdit && doc.traits.length < MAX_TRAITS && (
          <div className="brand-tone__adder">
            <button
              type="button"
              className="brand-page__action"
              data-tone-trait-add
              onClick={() => {
                commit(addTrait(doc));
              }}
            >
              {t('brand.tone.traitAdd')}
            </button>
          </div>
        )}

        {doc.traits.length >= MAX_TRAITS && (
          <p className="design-field__hint" data-tone-trait-limit>
            {t('brand.tone.traitLimit', { count: MAX_TRAITS })}
          </p>
        )}

        {gaps.tooFew && doc.traits.length > 0 && (
          <p className="design-field__hint">{t('brand.tone.gapTooFew', { count: doc.traits.length })}</p>
        )}

        {doc.traits.length === 0 && (
          <p className="design-field__hint">{t('brand.tone.traitMin', { count: MIN_TRAITS })}</p>
        )}
      </section>

      <section className="brand-tone__section" data-tone-banned-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.banned')}</h3>
        <p className="design-field__hint">{t('brand.tone.bannedHint')}</p>

        {doc.banned.length === 0 ? (
          <p className="design-empty">{t('brand.tone.bannedEmpty')}</p>
        ) : (
          <div className="brand-tone__recordList">
            {doc.banned.map((item, index) => {
              const gapsOfItem = bannedGaps(item);

              return (
                <div
                  className="brand-tone__record"
                  key={`banned-${index}`}
                  data-tone-banned-row={index}
                  data-missing={gapsOfItem.length === 0 ? 'false' : 'true'}
                >
                  <input
                    className="design-input brand-tone__recordTerm"
                    data-tone-banned-term={index}
                    value={item.term}
                    readOnly={!canEdit}
                    autoComplete="off"
                    aria-label={t('brand.tone.bannedTerm')}
                    onChange={(event) => {
                      commit(setBanned(doc, index, { term: event.target.value }));
                    }}
                  />

                  <input
                    className="design-input"
                    data-tone-banned-reason={index}
                    value={item.reason}
                    readOnly={!canEdit}
                    autoComplete="off"
                    placeholder={t('brand.tone.bannedReasonPlaceholder')}
                    aria-label={t('brand.tone.bannedReason')}
                    onChange={(event) => {
                      commit(setBanned(doc, index, { reason: event.target.value }));
                    }}
                  />

                  {gapsOfItem.includes('reason') && (
                    <span className="brand-tone__badge" data-tone-banned-gap={index}>
                      {t('brand.tone.bannedReasonMissing')}
                    </span>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action brand-page__action--danger"
                      data-tone-banned-remove={index}
                      onClick={() => {
                        commit(removeBanned(doc, index));
                      }}
                    >
                      {t('brand.tone.bannedRemove')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && (
          <div className="brand-tone__adder">
            <input
              className="design-input"
              data-tone-banned-input
              value={bannedDraft.term}
              autoComplete="off"
              placeholder={t('brand.tone.bannedPlaceholder')}
              aria-label={t('brand.tone.bannedTerm')}
              onChange={(event) => {
                setBannedDraft({ ...bannedDraft, term: event.target.value });
              }}
            />
            <input
              className="design-input"
              data-tone-banned-reason-input
              value={bannedDraft.reason}
              autoComplete="off"
              placeholder={t('brand.tone.bannedReasonPlaceholder')}
              aria-label={t('brand.tone.bannedReason')}
              onChange={(event) => {
                setBannedDraft({ ...bannedDraft, reason: event.target.value });
              }}
            />
            <button type="button" className="brand-page__action" data-tone-banned-add onClick={submitBanned}>
              {t('brand.tone.bannedAdd')}
            </button>
          </div>
        )}

        {bannedError !== null && (
          <p className="design-note design-note--error" data-tone-banned-error>
            {bannedError}
          </p>
        )}
      </section>

      <section className="brand-tone__section" data-tone-language-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.languageTitle')}</h3>
        <p className="design-field__hint">{t('brand.tone.languageHint')}</p>
        <textarea
          className="brand-page__textarea brand-tone__textarea"
          data-tone-language
          value={doc.language_policy}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.tone.languagePlaceholder')}
          onChange={(event) => {
            commit({ ...doc, language_policy: event.target.value });
          }}
        />
      </section>

      <section className="brand-tone__section" data-tone-samples-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.samples')}</h3>
        <p className="design-field__hint">{t('brand.tone.samplesHint', { target: SAMPLE_TARGET })}</p>

        {SAMPLE_KINDS.map((kind) => (
          <div className="brand-tone__sampleGroup" key={kind} data-tone-sample={kind}>
            <div className="brand-tone__sampleHead">
              <span className="brand-tone__sampleLabel">{sampleLabel(kind)}</span>
              <span className="brand-tone__sampleCount" data-tone-sample-count={kind}>
                {t('brand.tone.sampleCount', {
                  count: doc.samples[kind].filter((line) => line.trim() !== '').length,
                  target: SAMPLE_TARGET,
                })}
              </span>
            </div>

            {doc.samples[kind].length === 0 ? (
              <p className="design-empty">{t('brand.tone.sampleEmpty')}</p>
            ) : (
              doc.samples[kind].map((line, index) => (
                <div className="brand-tone__sampleRow" key={`${kind}-${index}`}>
                  <span className="brand-tone__sampleIndex">#{index + 1}</span>
                  <input
                    className="design-input"
                    data-tone-sample-line={`${kind}-${index}`}
                    value={line}
                    readOnly={!canEdit}
                    autoComplete="off"
                    placeholder={t('brand.tone.samplePlaceholder')}
                    aria-label={`${sampleLabel(kind)} #${index + 1}`}
                    onChange={(event) => {
                      commit(setSample(doc, kind, index, event.target.value));
                    }}
                  />
                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action brand-page__action--danger"
                      data-tone-sample-remove={`${kind}-${index}`}
                      onClick={() => {
                        commit(removeSample(doc, kind, index));
                      }}
                    >
                      {t('brand.tone.sampleRemove')}
                    </button>
                  )}
                </div>
              ))
            )}

            {canEdit && doc.samples[kind].length < SAMPLE_TARGET && (
              <div className="brand-tone__adder">
                <button
                  type="button"
                  className="brand-page__action"
                  data-tone-sample-add={kind}
                  onClick={() => {
                    commit(addSample(doc, kind));
                  }}
                >
                  {t('brand.tone.sampleAdd')}
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="brand-tone__section" data-tone-contexts-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.contexts')}</h3>
        <p className="design-field__hint">{t('brand.tone.contextsHint')}</p>

        {CONTEXT_KEYS.map((key) => {
          const value = doc.contexts[key];

          return (
            <div
              className="brand-tone__situation"
              key={key}
              data-tone-context={key}
              data-missing={value.trim() === '' ? 'true' : 'false'}
            >
              <span className="brand-tone__situationLabel">{contextLabel(key)}</span>
              <textarea
                className="brand-page__textarea brand-tone__textarea"
                data-tone-context-text={key}
                value={value}
                readOnly={!canEdit}
                rows={2}
                placeholder={t('brand.tone.contextPlaceholder')}
                aria-label={contextLabel(key)}
                onChange={(event) => {
                  commit(setContext(doc, key, event.target.value));
                }}
              />
            </div>
          );
        })}
      </section>

      <section className="brand-tone__section" data-tone-hardest-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.hardest')}</h3>
        <p className="design-field__hint">{t('brand.tone.hardestHint')}</p>

        {HARDEST_FIELDS.map((field) => (
          <div
            className="brand-tone__situation"
            key={field}
            data-tone-hardest={field}
            data-missing={doc.hardest_line[field].trim() === '' ? 'true' : 'false'}
          >
            <span className="brand-tone__situationLabel">{hardestLabel(field)}</span>
            <textarea
              className="brand-page__textarea brand-tone__textarea"
              data-tone-hardest-text={field}
              value={doc.hardest_line[field]}
              readOnly={!canEdit}
              rows={2}
              placeholder={t('brand.tone.hardestPlaceholder')}
              aria-label={hardestLabel(field)}
              onChange={(event) => {
                commit(setHardest(doc, field, event.target.value));
              }}
            />
          </div>
        ))}
      </section>
    </div>
  );
}

/** 同一個詞不重覆：第二個原因是第二份真相。（編輯器要知道才擋得住。） */
function bannedTermExists(doc: ToneDoc, term: string): boolean {
  return bannedTerms(doc).includes(term.trim());
}
