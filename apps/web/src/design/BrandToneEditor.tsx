import { useState } from 'react';
import { t } from '@company-os/i18n';
import {
  BILINGUAL_MODES,
  MAX_TRAITS,
  MIN_TRAITS,
  SITUATION_KEYS,
  adjectiveOnly,
  emptyToneDoc,
  gapCount,
  hasAnyValue,
  parseToneDoc,
  serializeToneDoc,
  toneGaps,
  traitGaps,
  type BilingualMode,
  type SituationKey,
  type ToneDoc,
  type ToneTrait,
} from './brandTone';
import { useGapCount } from './useGapCount';

/**
 * 語氣頁的編輯介面（issue #37）。
 *
 * 這一頁寫的是**這個品牌怎樣說話**：三到五個特質（每個都要一句做、一句不做，
 * 兩邊都附實際句子）、禁用詞、繁中與英文是否並用、五個情境的例句。
 *
 * 三條界線：
 *   1. 只有形容詞沒有句子，標成缺 —— 不是「不夠好」，是「未寫」。
 *   2. 這一頁不定顏色、字體、標誌，所以沒有任何跨頁下拉。
 *   3. 不寫渠道尺寸與頁數：語氣是講法，不是版面。
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

function situationLabel(key: SituationKey): string {
  switch (key) {
    case 'explain':
      return t('brand.tone.situation.explain');
    case 'invite':
      return t('brand.tone.situation.invite');
    case 'refuse':
      return t('brand.tone.situation.refuse');
    case 'apologise':
      return t('brand.tone.situation.apologise');
    default:
      return t('brand.tone.situation.incident');
  }
}

function bilingualLabel(mode: BilingualMode): string {
  switch (mode) {
    case 'zhOnly':
      return t('brand.tone.bilingual.zhOnly');
    case 'zhFirst':
      return t('brand.tone.bilingual.zhFirst');
    default:
      return t('brand.tone.bilingual.englishPair');
  }
}

function nextTraitId(doc: ToneDoc): string {
  let index = 1;

  while (doc.traits.some((trait) => trait.id === `t-${index}`)) {
    index += 1;
  }

  return `t-${index}`;
}

export function BrandToneEditor({ content, canEdit, onChange, onGapCount }: BrandToneEditorProps) {
  const [bannedDraft, setBannedDraft] = useState('');

  const parsed = parseToneDoc(content);

  // 在 early return 之前上報：內容壞了要報 null（面板閉嘴），不是報 0。
  useGapCount(parsed.kind === 'ok' ? gapCount(toneGaps(parsed.doc)) : null, onGapCount);

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

  function setTrait(id: string, patch: Partial<ToneTrait>): void {
    commit({
      ...doc,
      traits: doc.traits.map((trait) => (trait.id === id ? { ...trait, ...patch } : trait)),
    });
  }

  function addTrait(): void {
    if (doc.traits.length >= MAX_TRAITS) {
      return;
    }

    commit({
      ...doc,
      traits: [
        ...doc.traits,
        {
          id: nextTraitId(doc),
          name: '',
          does: '',
          doesExample: '',
          doesNot: '',
          doesNotExample: '',
        },
      ],
    });
  }

  function removeTrait(id: string): void {
    commit({ ...doc, traits: doc.traits.filter((trait) => trait.id !== id) });
  }

  function addBanned(): void {
    const next = bannedDraft.trim();

    if (next === '' || doc.banned.includes(next)) {
      setBannedDraft('');
      return;
    }

    commit({ ...doc, banned: [...doc.banned, next] });
    setBannedDraft('');
  }

  const summary: string[] = [];

  if (gaps.tooFew) {
    summary.push(t('brand.tone.gapTooFew', { count: doc.traits.length }));
  }

  if (gaps.traits.length > 0) {
    const names = doc.traits
      .filter((trait) => gaps.traits.includes(trait.id))
      .map((trait) => (trait.name.trim() === '' ? trait.id : trait.name))
      .join('、');

    summary.push(t('brand.tone.gapTraits', { count: gaps.traits.length, names }));
  }

  if (gaps.banned) {
    summary.push(t('brand.tone.gapBanned'));
  }

  if (gaps.bilingual) {
    summary.push(t('brand.tone.gapBilingual'));
  }

  if (gaps.situations.length > 0) {
    summary.push(
      t('brand.tone.gapSituations', { items: gaps.situations.map(situationLabel).join('、') }),
    );
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

      <section className="brand-tone__section" data-tone-traits-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.traits')}</h3>
        <p className="design-field__hint">{t('brand.tone.traitsHint')}</p>

        {doc.traits.length === 0 ? (
          <p className="design-empty">{t('brand.tone.traitEmpty')}</p>
        ) : (
          doc.traits.map((trait) => {
            const gapsOfTrait = traitGaps(trait);

            return (
              <div
                className="brand-tone__trait"
                key={trait.id}
                data-tone-trait={trait.id}
                data-missing={gapsOfTrait.length === 0 ? 'false' : 'true'}
              >
                <div className="brand-tone__traitHead">
                  {adjectiveOnly(trait) && (
                    <span className="brand-tone__badge" data-tone-adjective-only={trait.id}>
                      {t('brand.tone.adjectiveOnly')}
                    </span>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action brand-page__action--danger"
                      data-tone-trait-remove={trait.id}
                      onClick={() => {
                        removeTrait(trait.id);
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
                      data-tone-name={trait.id}
                      value={trait.name}
                      readOnly={!canEdit}
                      autoComplete="off"
                      onChange={(event) => {
                        setTrait(trait.id, { name: event.target.value });
                      }}
                    />
                  </label>

                  <label className="brand-tone__field brand-tone__field--wide">
                    <span className="brand-tone__fieldLabel">{t('brand.tone.traitDoes')}</span>
                    <input
                      className="design-input"
                      data-tone-does={trait.id}
                      value={trait.does}
                      readOnly={!canEdit}
                      autoComplete="off"
                      onChange={(event) => {
                        setTrait(trait.id, { does: event.target.value });
                      }}
                    />
                  </label>

                  <label className="brand-tone__field brand-tone__field--wide">
                    <span className="brand-tone__fieldLabel">{t('brand.tone.traitDoesNot')}</span>
                    <input
                      className="design-input"
                      data-tone-dont={trait.id}
                      value={trait.doesNot}
                      readOnly={!canEdit}
                      autoComplete="off"
                      onChange={(event) => {
                        setTrait(trait.id, { doesNot: event.target.value });
                      }}
                    />
                  </label>
                </div>

                <div className="brand-tone__fields">
                  <label className="brand-tone__field brand-tone__field--half">
                    <span className="brand-tone__fieldLabel">{t('brand.tone.traitDoesExample')}</span>
                    <textarea
                      className="brand-page__textarea brand-tone__textarea"
                      data-tone-do-example={trait.id}
                      value={trait.doesExample}
                      readOnly={!canEdit}
                      rows={2}
                      onChange={(event) => {
                        setTrait(trait.id, { doesExample: event.target.value });
                      }}
                    />
                  </label>

                  <label className="brand-tone__field brand-tone__field--half">
                    <span className="brand-tone__fieldLabel">
                      {t('brand.tone.traitDoesNotExample')}
                    </span>
                    <textarea
                      className="brand-page__textarea brand-tone__textarea"
                      data-tone-dont-example={trait.id}
                      value={trait.doesNotExample}
                      readOnly={!canEdit}
                      rows={2}
                      onChange={(event) => {
                        setTrait(trait.id, { doesNotExample: event.target.value });
                      }}
                    />
                  </label>
                </div>
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
              onClick={addTrait}
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

        {doc.traits.length < MIN_TRAITS && doc.traits.length > 0 && (
          <p className="design-field__hint">{t('brand.tone.gapTooFew', { count: doc.traits.length })}</p>
        )}
      </section>

      <section className="brand-tone__section" data-tone-banned-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.banned')}</h3>
        <p className="design-field__hint">{t('brand.tone.bannedHint')}</p>

        {doc.banned.length === 0 ? (
          <p className="design-empty">{t('brand.tone.bannedEmpty')}</p>
        ) : (
          <ul className="brand-tone__words">
            {doc.banned.map((word) => (
              <li className="brand-tone__word" key={word} data-tone-banned-item={word}>
                <span>{word}</span>
                {canEdit && (
                  <button
                    type="button"
                    className="brand-tone__wordRemove"
                    data-tone-banned-remove={word}
                    aria-label={`${t('brand.tone.bannedRemove')} ${word}`}
                    onClick={() => {
                      commit({ ...doc, banned: doc.banned.filter((item) => item !== word) });
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
          <div className="brand-tone__adder">
            <input
              className="design-input"
              data-tone-banned-input
              value={bannedDraft}
              autoComplete="off"
              placeholder={t('brand.tone.bannedPlaceholder')}
              onChange={(event) => {
                setBannedDraft(event.target.value);
              }}
            />
            <button
              type="button"
              className="brand-page__action"
              data-tone-banned-add
              onClick={addBanned}
            >
              {t('brand.tone.bannedAdd')}
            </button>
          </div>
        )}
      </section>

      <section className="brand-tone__section" data-tone-bilingual-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.bilingual')}</h3>
        <p className="design-field__hint">{t('brand.tone.bilingualHint')}</p>

        <div className="brand-tone__fields">
          <label className="brand-tone__field brand-tone__field--half">
            <select
              className="design-input"
              data-tone-bilingual
              aria-label={t('brand.tone.bilingual')}
              value={doc.bilingual}
              disabled={!canEdit}
              onChange={(event) => {
                commit({ ...doc, bilingual: event.target.value as BilingualMode | '' });
              }}
            >
              <option value="">{t('brand.tone.bilingualEmpty')}</option>
              {BILINGUAL_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {bilingualLabel(mode)}
                </option>
              ))}
            </select>
          </label>

          <label className="brand-tone__field brand-tone__field--half">
            <span className="brand-tone__fieldLabel">{t('brand.tone.bilingualNote')}</span>
            <input
              className="design-input"
              data-tone-bilingual-note
              value={doc.bilingualNote}
              readOnly={!canEdit}
              autoComplete="off"
              placeholder={t('brand.tone.bilingualNotePlaceholder')}
              onChange={(event) => {
                commit({ ...doc, bilingualNote: event.target.value });
              }}
            />
          </label>
        </div>
      </section>

      <section className="brand-tone__section" data-tone-situations-section>
        <h3 className="brand-page__versionsTitle">{t('brand.tone.situations')}</h3>
        <p className="design-field__hint">{t('brand.tone.situationsHint')}</p>

        {SITUATION_KEYS.map((key) => {
          const value = doc.situations[key];

          return (
            <div
              className="brand-tone__situation"
              key={key}
              data-tone-situation={key}
              data-missing={value.trim() === '' ? 'true' : 'false'}
            >
              <span className="brand-tone__situationLabel">{situationLabel(key)}</span>
              <textarea
                className="brand-page__textarea brand-tone__textarea"
                data-tone-situation-text={key}
                value={value}
                readOnly={!canEdit}
                rows={2}
                placeholder={t('brand.tone.situationPlaceholder')}
                onChange={(event) => {
                  commit({ ...doc, situations: { ...doc.situations, [key]: event.target.value } });
                }}
              />
            </div>
          );
        })}
      </section>
    </div>
  );
}
