import { useEffect, useState } from 'react';
import { t, type MessageKey } from '@company-os/i18n';
import {
  brandOutputPath,
  fetchBrandPages,
  fetchBrandPromptPack,
  fetchPolicy,
  type BrandOutputKind,
  type BrandPageSummary,
} from '../api';
import {
  addExample,
  addPrompt,
  addRef,
  brandVersionOf,
  exampleGaps,
  hasAnyValue,
  gapCount,
  parseExampleDoc,
  promptStale,
  removeExample,
  removePrompt,
  removeRef,
  reusePlan,
  rowStale,
  rowVersions,
  serializeExampleDoc,
  setExample,
  setPrompt,
  type ExampleDoc,
} from './brandExamples';
import { useGapCount } from './useGapCount';

/**
 * 已核准範例的表身（issue #68）。
 *
 * 這一頁要交兩件事：
 *   1. 「做對的樣子」連格式、連用了哪幾頁哪一版、連為咩好 —— 缺一格就標一格。
 *   2. 成功 prompt：成品、prompt、當時品牌版本三者一齊存；重用一定用**現行**
 *      版本，並當場講出「與當時差在哪」。
 *
 * 兩個誠實位：
 *   - 檔案空白就是冇檔案，不畫一個灰框假裝有圖。
 *   - 品牌版本＝當時每一頁的版號（後端 `brand_release` 的快照內容）。範例保留
 *     它當時那一組，品牌改過之後標「舊版」，而不是把範例的版本改成最新的。
 */

type BrandExamplesEditorProps = {
  brandId: string;
  content: string;
  canEdit: boolean;
  onChange: (next: string) => void;
  onSaveNow: (content: string) => Promise<number | null>;
  onGapCount?: (count: number | null) => void;
};

const OUTPUTS: readonly { kind: BrandOutputKind; label: MessageKey }[] = [
  { kind: 'prompt', label: 'brand.examples.ai.prompt' },
  { kind: 'tokens', label: 'brand.examples.ai.tokens' },
  { kind: 'html', label: 'brand.examples.ai.html' },
  { kind: 'print', label: 'brand.examples.ai.print' },
];

const FORMAT_CHIPS: readonly { key: string; label: MessageKey }[] = [
  { key: 'social', label: 'brand.examples.format.social' },
  { key: 'print', label: 'brand.examples.format.print' },
  { key: 'deck', label: 'brand.examples.format.deck' },
  { key: 'web', label: 'brand.examples.format.web' },
  { key: 'store', label: 'brand.examples.format.store' },
];

const CARRIERS: readonly { key: string; label: MessageKey; note: MessageKey }[] = [
  { key: 'social', label: 'brand.examples.carrier.social', note: 'brand.examples.carrier.socialNote' },
  { key: 'print', label: 'brand.examples.carrier.print', note: 'brand.examples.carrier.printNote' },
  { key: 'deck', label: 'brand.examples.carrier.deck', note: 'brand.examples.carrier.deckNote' },
];

/** 檔案指去一個真的位置（API 或網址）才畫圖；否則是一個「未有檔案」的框。 */
function looksLikeFile(ref: string): boolean {
  return /^(https?:|\/api\/|data:)/.test(ref.trim());
}

const EMPTY_FOR_GAPS: ExampleDoc = { examples: [], prompts: [] };

export function BrandExamplesEditor({
  brandId,
  content,
  canEdit,
  onChange,
  onSaveNow,
  onGapCount,
}: BrandExamplesEditorProps) {
  const [pages, setPages] = useState<BrandPageSummary[]>([]);
  const [policyText, setPolicyText] = useState('');
  const [promptPack, setPromptPack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regenerated, setRegenerated] = useState<number | null>(null);
  const [reuseOpen, setReuseOpen] = useState<number | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      const [list, policy, pack] = await Promise.all([
        fetchBrandPages(brandId),
        fetchPolicy(),
        fetchBrandPromptPack(brandId),
      ]);

      if (!live) {
        return;
      }

      if (list.ok) {
        setPages(list.data.items);
      }

      if (policy.ok) {
        setPolicyText(policy.data.slots.find((slot) => slot.slot === 'apply')?.current?.content ?? '');
      }

      setPromptPack(pack.ok ? pack.data : null);
    })();

    return () => {
      live = false;
    };
  }, [brandId]);

  const parsed = parseExampleDoc(content);
  const doc: ExampleDoc = parsed.kind === 'ok' ? parsed.doc : { ...EMPTY_FOR_GAPS };
  const gaps = exampleGaps(doc);

  useGapCount(parsed.kind === 'invalid' ? null : gapCount(gaps), onGapCount);

  if (parsed.kind === 'invalid') {
    return (
      <div className="brand-examples brand-examples--invalid" data-examples-invalid>
        <p className="design-note design-note--error">{t('brand.examples.invalid')}</p>

        {canEdit && (
          <div className="design-form__actions">
            <button
              type="button"
              className="design-btn"
              data-examples-reset
              onClick={() => {
                onChange('');
              }}
            >
              {t('brand.examples.invalidReset')}
            </button>
          </div>
        )}
      </div>
    );
  }

  function commit(next: ExampleDoc): void {
    setRegenerated(null);
    // 空表寫成空字串：一鍵清空要真的是「未開始」，不是一份空 JSON。
    onChange(hasAnyValue(next) ? serializeExampleDoc(next) : '');
  }

  async function regenerate(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setRegenerated(null);

    const no = await onSaveNow(serializeExampleDoc(doc));

    setBusy(false);

    if (no !== null) {
      setRegenerated(no);
    }
  }

  const refPages = pages.filter((page) => !(page.kind === 'fixed' && page.key === 'examples'));

  const summary: string[] = [];

  if (gaps.noExamples) {
    summary.push(t('brand.examples.gapNoExamples'));
  }

  if (gaps.noPrompts) {
    summary.push(t('brand.examples.gapNoPrompts'));
  }

  for (const row of gaps.rows) {
    summary.push(
      t('brand.examples.gapRow', {
        no: row.index + 1,
        items: row.missing.map((field) => t(`brand.examples.field.${field}` as MessageKey)).join('、'),
      }),
    );
  }

  for (const row of gaps.prompts) {
    summary.push(
      t('brand.examples.gapPromptRow', {
        no: row.index + 1,
        items: row.missing.map((field) => t(`brand.examples.field.prompt.${field}` as MessageKey)).join('、'),
      }),
    );
  }

  return (
    <div className="brand-examples" data-examples-doc>
      <p className="design-field__hint" data-examples-note>
        {t('brand.examples.note')}
      </p>

      {policyText.trim() === '' && (
        <p className="design-note design-note--error" data-examples-policy-missing>
          {t('brand.examples.policyMissing')}
        </p>
      )}

      {gapCount(gaps) === 0 ? (
        <p className="brand-examples__missing" data-examples-missing>
          {t('brand.examples.allPresent')}
        </p>
      ) : (
        <div className="brand-examples__missing brand-examples__missing--gap" data-examples-missing>
          <p className="brand-examples__missingLead">{t('brand.examples.missingLead')}</p>
          <ul className="brand-examples__missingList">
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 一、範例卡：三欄。縮圖、標題、格式、為咩好、用了哪幾頁版本。 */}
      <section className="brand-examples__section" data-examples-section="examples">
        <h3 className="brand-page__versionsTitle">{t('brand.examples.examples')}</h3>
        <p className="design-field__hint">{t('brand.examples.examplesHint')}</p>

        {doc.examples.length === 0 ? (
          <p className="design-empty" data-examples-empty>
            {t('brand.examples.exampleEmpty')}
          </p>
        ) : (
          <ul className="brand-examples__cards">
            {doc.examples.map((row, index) => {
              const missing = gaps.rows.find((item) => item.index === index)?.missing ?? [];
              const stale = rowStale(row, pages);

              return (
                <li
                  className="brand-examples__card"
                  key={`example-${index}`}
                  data-example={index}
                  data-example-stale={stale ? 'true' : 'false'}
                >
                  <div className="brand-examples__thumb" data-example-thumb={index}>
                    {looksLikeFile(row.file_ref) ? (
                      <img className="brand-examples__thumbImage" src={row.file_ref} alt="" />
                    ) : (
                      <span className="brand-examples__thumbEmpty">
                        {t('brand.examples.exampleFileMissing')}
                      </span>
                    )}
                  </div>

                  <label className="design-field">
                    <span className="design-field__label">{t('brand.examples.exampleTitle')}</span>
                    <input
                      className="design-input"
                      data-example-title={index}
                      value={row.title}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.examples.exampleTitlePlaceholder')}
                      onChange={(event) => {
                        commit(setExample(doc, index, { title: event.target.value }));
                      }}
                    />
                  </label>

                  <label className="design-field">
                    <span className="design-field__label">{t('brand.examples.exampleFormat')}</span>
                    <input
                      className="design-input"
                      data-example-format={index}
                      value={row.format}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.examples.exampleFormatPlaceholder')}
                      onChange={(event) => {
                        commit(setExample(doc, index, { format: event.target.value }));
                      }}
                    />
                  </label>

                  {canEdit && (
                    <div className="brand-examples__chips">
                      {FORMAT_CHIPS.map((chip) => (
                        <button
                          type="button"
                          className="brand-examples__chipBtn"
                          key={chip.key}
                          data-example-format-chip={`${index}-${chip.key}`}
                          onClick={() => {
                            commit(setExample(doc, index, { format: t(chip.label) }));
                          }}
                        >
                          {t(chip.label)}
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="design-field">
                    <span className="design-field__label">{t('brand.examples.exampleFile')}</span>
                    <input
                      className="design-input"
                      data-example-file={index}
                      value={row.file_ref}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.examples.exampleFilePlaceholder')}
                      onChange={(event) => {
                        commit(setExample(doc, index, { file_ref: event.target.value }));
                      }}
                    />
                  </label>

                  <label className="design-field">
                    <span className="design-field__label">{t('brand.examples.exampleWhy')}</span>
                    <textarea
                      className="design-input"
                      rows={2}
                      data-example-why={index}
                      value={row.why}
                      readOnly={!canEdit}
                      placeholder={t('brand.examples.exampleWhyPlaceholder')}
                      onChange={(event) => {
                        commit(setExample(doc, index, { why: event.target.value }));
                      }}
                    />
                  </label>

                  {/* 用了哪幾頁的哪一版：勾頁，版本預設現行，可以改回當時那一版。 */}
                  <div className="design-field">
                    <span className="design-field__label">{t('brand.examples.exampleRefs')}</span>
                    <p className="design-field__hint">{t('brand.examples.exampleRefsHint')}</p>
                    <ul className="brand-examples__refs">
                      {refPages.map((page) => {
                        const ref = row.page_refs.find((item) => item.page === page.key);

                        return (
                          <li className="brand-examples__refRow" key={page.key}>
                            <label className="brand-examples__check">
                              <input
                                type="checkbox"
                                data-example-ref={`${index}-${page.key}`}
                                checked={ref !== undefined}
                                disabled={!canEdit}
                                onChange={(event) => {
                                  if (!event.target.checked) {
                                    commit(removeRef(doc, index, page.key));
                                    return;
                                  }

                                  commit(addRef(doc, index, page.key, page.current?.versionNo ?? 0));
                                }}
                              />
                              <span>{page.name}</span>
                            </label>

                            {ref !== undefined && (
                              <>
                                <input
                                  className="design-input brand-examples__refVersion"
                                  data-example-ref-version={`${index}-${page.key}`}
                                  type="number"
                                  min={1}
                                  value={ref.version}
                                  readOnly={!canEdit}
                                  aria-label={t('brand.examples.exampleRefVersion')}
                                  onChange={(event) => {
                                    const version = Number(event.target.value);

                                    commit(
                                      setExample(doc, index, {
                                        page_refs: row.page_refs.map((item) =>
                                          item.page === page.key
                                            ? { ...item, version: Number.isFinite(version) ? version : 0 }
                                            : item,
                                        ),
                                      }),
                                    );
                                  }}
                                />
                                {page.current !== null && page.current.versionNo > ref.version && (
                                  <span className="brand-examples__staleTag" data-example-ref-stale={`${index}-${page.key}`}>
                                    {t('brand.examples.exampleRefStale', {
                                      version: page.current.versionNo,
                                    })}
                                  </span>
                                )}
                                {page.current === null && (
                                  <span className="brand-examples__gap" data-example-ref-missing={`${index}-${page.key}`}>
                                    {t('brand.examples.exampleRefMissingPage')}
                                  </span>
                                )}
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <p className="brand-examples__versions" data-example-versions={index}>
                    {row.page_refs.length === 0
                      ? t('brand.examples.exampleNoVersion')
                      : rowVersions(row, pages)}
                    {stale && (
                      <span className="brand-examples__staleTag" data-example-stale-tag={index}>
                        {t('brand.examples.exampleStale')}
                      </span>
                    )}
                  </p>

                  {missing.length > 0 && (
                    <p className="brand-examples__gap" data-example-gap={index}>
                      {missing.map((field) => t(`brand.examples.field.${field}` as MessageKey)).join('、')}
                    </p>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action brand-page__action--danger"
                      data-example-remove={index}
                      onClick={() => {
                        commit(removeExample(doc, index));
                      }}
                    >
                      {t('brand.examples.exampleRemove')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="brand-examples__adder">
            <button
              type="button"
              className="design-btn"
              data-example-add
              onClick={() => {
                commit(addExample(doc));
              }}
            >
              {t('brand.examples.exampleAdd')}
            </button>
          </div>
        )}
      </section>

      {/* 二、成功 prompt：三件一齊存。重用一定用現行版本，並講出差在哪。 */}
      <section className="brand-examples__section" data-examples-section="prompts">
        <h3 className="brand-page__versionsTitle">{t('brand.examples.prompts')}</h3>
        <p className="design-field__hint">{t('brand.examples.promptsHint')}</p>

        {doc.prompts.length === 0 ? (
          <p className="design-empty" data-examples-prompts-empty>
            {t('brand.examples.promptsEmpty')}
          </p>
        ) : (
          <div className="brand-examples__prompts">
            {doc.prompts.map((row, index) => {
              const missing = gaps.prompts.find((item) => item.index === index)?.missing ?? [];
              const stale = promptStale(row, pages);
              const plan = reusePlan(row, pages);

              return (
                <div
                  className="brand-examples__prompt"
                  key={`prompt-${index}`}
                  data-prompt={index}
                  data-prompt-stale={stale ? 'true' : 'false'}
                >
                  <div className="brand-examples__split">
                    <label className="design-field">
                      <span className="design-field__label">{t('brand.examples.promptOutput')}</span>
                      <input
                        className="design-input"
                        data-prompt-output={index}
                        value={row.output_ref}
                        readOnly={!canEdit}
                        autoComplete="off"
                        placeholder={t('brand.examples.promptOutputPlaceholder')}
                        onChange={(event) => {
                          commit(setPrompt(doc, index, { output_ref: event.target.value }));
                        }}
                      />
                    </label>

                    <label className="design-field">
                      <span className="design-field__label">{t('brand.examples.promptBrand')}</span>
                      <input
                        className="design-input"
                        data-prompt-brand={index}
                        value={row.brand_ref}
                        readOnly={!canEdit}
                        autoComplete="off"
                        placeholder={t('brand.examples.promptBrandPlaceholder')}
                        onChange={(event) => {
                          commit(setPrompt(doc, index, { brand_ref: event.target.value }));
                        }}
                      />
                    </label>
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action"
                      data-prompt-brand-fill={index}
                      onClick={() => {
                        commit(setPrompt(doc, index, { brand_ref: brandVersionOf(pages) }));
                      }}
                    >
                      {t('brand.examples.promptBrandFill')}
                    </button>
                  )}

                  <label className="design-field">
                    <span className="design-field__label">{t('brand.examples.promptText')}</span>
                    <textarea
                      className="design-textarea brand-examples__promptText"
                      rows={4}
                      data-prompt-text={index}
                      value={row.prompt}
                      readOnly={!canEdit}
                      placeholder={t('brand.examples.promptTextPlaceholder')}
                      onChange={(event) => {
                        commit(setPrompt(doc, index, { prompt: event.target.value }));
                      }}
                    />
                  </label>

                  <label className="design-field">
                    <span className="design-field__label">{t('brand.examples.promptNote')}</span>
                    <input
                      className="design-input"
                      data-prompt-note={index}
                      value={row.note}
                      readOnly={!canEdit}
                      autoComplete="off"
                      onChange={(event) => {
                        commit(setPrompt(doc, index, { note: event.target.value }));
                      }}
                    />
                  </label>

                  <p className="brand-examples__versions" data-prompt-stale-tag={index}>
                    {row.brand_ref === ''
                      ? t('brand.examples.exampleNoVersion')
                      : row.brand_ref}
                    {stale && (
                      <span className="brand-examples__staleTag">{t('brand.examples.promptStale')}</span>
                    )}
                  </p>

                  {missing.length > 0 && (
                    <p className="brand-examples__gap" data-prompt-gap={index}>
                      {missing
                        .map((field) => t(`brand.examples.field.prompt.${field}` as MessageKey))
                        .join('、')}
                    </p>
                  )}

                  <div className="brand-examples__actions">
                    <button
                      type="button"
                      className="design-btn"
                      data-prompt-reuse={index}
                      onClick={() => {
                        setReuseOpen(reuseOpen === index ? null : index);
                      }}
                    >
                      {t('brand.examples.reuse')}
                    </button>

                    {canEdit && (
                      <button
                        type="button"
                        className="brand-page__action brand-page__action--danger"
                        data-prompt-remove={index}
                        onClick={() => {
                          commit(removePrompt(doc, index));
                          setReuseOpen(null);
                        }}
                      >
                        {t('brand.examples.promptRemove')}
                      </button>
                    )}
                  </div>

                  {reuseOpen === index && (
                    <div className="brand-examples__reuse" data-prompt-reuse-panel={index}>
                      <p className="brand-examples__reuseHead">{t('brand.examples.reuseTitle')}</p>
                      <p className="brand-examples__reuseNow">
                        {t('brand.examples.reuseNow', { now: plan.now })}
                      </p>

                      {plan.moved.length === 0 && plan.gone.length === 0 ? (
                        <p className="design-field__hint">{t('brand.examples.reuseNoDiff')}</p>
                      ) : (
                        <ul className="brand-examples__reuseList">
                          {plan.moved.map((item) => (
                            <li key={`moved-${item.page}`} data-prompt-reuse-moved={item.page}>
                              {t('brand.examples.reuseMoved', {
                                page: item.name,
                                from: item.from,
                                to: item.to,
                              })}
                            </li>
                          ))}
                          {plan.gone.map((name) => (
                            <li key={`gone-${name}`} data-prompt-reuse-gone={name}>
                              {t('brand.examples.reuseGone', { page: name })}
                            </li>
                          ))}
                        </ul>
                      )}

                      <pre className="brand-examples__reusePrompt">{row.prompt}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canEdit && (
          <div className="brand-examples__adder">
            <button
              type="button"
              className="design-btn"
              data-prompt-add
              onClick={() => {
                commit(addPrompt(doc));
              }}
            >
              {t('brand.examples.promptAdd')}
            </button>
          </div>
        )}
      </section>

      {/* 三、載體示範：不是另畫一張圖，是同一份 renderer 的輸出。 */}
      <section className="brand-examples__section" data-examples-section="carrier">
        <h3 className="brand-page__versionsTitle">{t('brand.examples.carrier')}</h3>
        <p className="design-field__hint">{t('brand.examples.carrierHint')}</p>

        <ul className="brand-examples__carriers">
          {CARRIERS.map((carrier) => (
            <li key={carrier.key} data-carrier={carrier.key}>
              <span className="brand-examples__carrierName">{t(carrier.label)}</span>
              <span className="design-field__hint">{t(carrier.note)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 四、輸出：四條路徑與主頁用同一組（prompt 包／tokens／HTML／PDF）。 */}
      <section className="brand-examples__section" data-examples-section="for-ai">
        <h3 className="brand-page__versionsTitle">{t('brand.examples.ai.title')}</h3>
        <p className="design-field__hint">{t('brand.examples.ai.hint')}</p>

        <ul className="brand-examples__outputs">
          {OUTPUTS.map((output) => (
            <li key={output.kind} data-examples-ai-output={output.kind}>
              <a className="brand-examples__link" href={brandOutputPath(brandId, output.kind)}>
                {t(output.label)}
              </a>
            </li>
          ))}
        </ul>

        {promptPack === null || promptPack.trim() === '' ? (
          <p className="design-note design-note--error" data-examples-ai-prompt-missing>
            {t('brand.examples.ai.promptMissing')}
          </p>
        ) : (
          <pre className="brand-examples__prompt" data-examples-ai-prompt>
            {promptPack}
          </pre>
        )}
      </section>

      {canEdit && content.trim() !== '' && (
        <section className="brand-examples__section" data-examples-section="regenerate">
          <h3 className="brand-page__versionsTitle">{t('brand.examples.regenerateTitle')}</h3>
          <p className="design-field__hint">{t('brand.examples.regenerateHint')}</p>

          <button
            type="button"
            className="design-btn"
            data-examples-regenerate
            disabled={busy}
            onClick={() => {
              void regenerate();
            }}
          >
            {t('brand.examples.regenerate')}
          </button>

          {regenerated !== null && (
            <p className="design-note" role="status" data-examples-regenerated>
              {t('brand.examples.regenerated', { no: regenerated })}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
