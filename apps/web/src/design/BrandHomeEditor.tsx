import { useEffect, useState } from 'react';
import { t, type MessageKey } from '@company-os/i18n';
import {
  brandOutputPath,
  fetchBrandPage,
  fetchBrandPages,
  fetchBrandPromptPack,
  fetchPolicy,
  type BrandOutputKind,
  type BrandPageSummary,
} from '../api';
import { parseColorDoc, type ColorDoc } from './brandColors';
import { LOGO_MODES, parseLogoDoc, type LogoDoc, type LogoModeKey } from './brandLogo';
import { parseTypeDoc, type TypeDoc, type TypeRoleKey } from './brandType';
import { parseToneDoc, type ToneDoc } from './brandTone';
import { parseExampleDoc, rowStale, rowVersions, type ExampleDoc } from './brandExamples';
import {
  KEYWORD_MAX,
  KEYWORD_MIN,
  LAYOUT_BLOCKS,
  addKeyword,
  addLayout,
  addSystem,
  addVoiceSample,
  colourSwatches,
  gapCount,
  hasAnyValue,
  homeGaps,
  homeRefs,
  logoUsage,
  moveLayout,
  pageRows,
  parseHomeDoc,
  removeKeyword,
  removeLayout,
  removeSystem,
  removeVoiceSample,
  serializeHomeDoc,
  setEmphasis,
  setLayout,
  setSystem,
  toneSample,
  typeRows,
  type HomeDoc,
  type HomeRef,
  type RefPage,
} from './brandHome';
import { useGapCount } from './useGapCount';

/**
 * 品牌主頁的表身（issue #67，取代 #39）。
 *
 * 這一頁**不重寫**任何來源頁的規則：它自己只擁有立場句、一句話說自己是誰、
 * 關鍵詞、版面決定（用哪幾塊、先後、重點、為咩），以及四個引用（用色順序、
 * 標誌預設、字體分工、語氣樣本）。其餘全部即時由來源頁砌出來。
 *
 * 五個誠實位：
 *   1. 每個引用都寫明來源頁與當時版本 —— 這是「追得回來源頁」的做法，不是註釋。
 *   2. 引用追不到（頁未有版本、認不到、未定值）逐條標，不畫假色假字。
 *   3. 版面每一塊都要有理由；冇理由的區塊在輸出時不會出現，所以當場講。
 *   4. 現行內容是舊形狀（#39 的 `intro`／`logoMode`）就講讀不到，不當成空白主頁。
 *   5. 「給 AI 用」讀的是伺服器真正會交出去的 prompt 包，不是在這裡再砌一份。
 */

type BrandHomeEditorProps = {
  brandId: string;
  content: string;
  canEdit: boolean;
  onChange: (next: string) => void;
  /** 重編要真的落一版，所以由外層的儲存通道執行；回傳新版的版號。 */
  onSaveNow: (content: string) => Promise<number | null>;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

type PageSlice<T> = { doc: T | null; versionNo: number | null };

function write(doc: HomeDoc): string {
  return hasAnyValue(doc) ? serializeHomeDoc(doc) : '';
}

/** 模式名。`t()` 只認字面量 key，所以要逐個寫。 */
function modeLabel(key: LogoModeKey): string {
  switch (key) {
    case 'brand':
      return t('brand.home.mode.brand');
    case 'mono':
      return t('brand.home.mode.mono');
    case 'reverse':
      return t('brand.home.mode.reverse');
    default:
      return t('brand.home.mode.onDark');
  }
}

/** 來源頁的名字。同上：`t()` 只認字面量 key。 */
function refPageName(page: RefPage): string {
  switch (page) {
    case 'color':
      return t('design.page.brandColor');
    case 'logo':
      return t('design.page.brandLogo');
    case 'type':
      return t('design.page.brandType');
    default:
      return t('design.page.brandTone');
  }
}

/** 文字層級名。同上。 */
function typeRoleLabel(key: TypeRoleKey): string {
  switch (key) {
    case 'display':
      return t('brand.home.typeRole.display');
    case 'heading':
      return t('brand.home.typeRole.heading');
    case 'body':
      return t('brand.home.typeRole.body');
    default:
      return t('brand.home.typeRole.caption');
  }
}

/** 樣本用的字級：只在寫得成 px 時才套，寫唔成就不套（不猜）。 */
function pxSize(value: string): string | undefined {
  return /^\d+(\.\d+)?px$/.test(value.trim()) ? value.trim() : undefined;
}

const OUTPUTS: readonly { kind: BrandOutputKind; label: MessageKey }[] = [
  { kind: 'prompt', label: 'brand.home.ai.prompt' },
  { kind: 'tokens', label: 'brand.home.ai.tokens' },
  { kind: 'html', label: 'brand.home.ai.html' },
  { kind: 'print', label: 'brand.home.ai.print' },
];

export function BrandHomeEditor({
  brandId,
  content,
  canEdit,
  onChange,
  onSaveNow,
  onGapCount,
}: BrandHomeEditorProps) {
  const [pages, setPages] = useState<BrandPageSummary[]>([]);
  const [colour, setColour] = useState<PageSlice<ColorDoc>>({ doc: null, versionNo: null });
  const [type, setType] = useState<PageSlice<TypeDoc>>({ doc: null, versionNo: null });
  const [logo, setLogo] = useState<PageSlice<LogoDoc>>({ doc: null, versionNo: null });
  const [tone, setTone] = useState<PageSlice<ToneDoc>>({ doc: null, versionNo: null });
  const [examples, setExamples] = useState<PageSlice<ExampleDoc>>({ doc: null, versionNo: null });
  const [policyText, setPolicyText] = useState('');
  const [promptPack, setPromptPack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regenerated, setRegenerated] = useState<number | null>(null);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [voiceDraft, setVoiceDraft] = useState('');

  useEffect(() => {
    let live = true;

    void (async () => {
      const [list, colourPage, typePage, logoPage, tonePage, examplesPage, policy, pack] =
        await Promise.all([
          fetchBrandPages(brandId),
          fetchBrandPage(brandId, 'color'),
          fetchBrandPage(brandId, 'type'),
          fetchBrandPage(brandId, 'logo'),
          fetchBrandPage(brandId, 'tone'),
          fetchBrandPage(brandId, 'examples'),
          fetchPolicy(),
          fetchBrandPromptPack(brandId),
        ]);

      if (!live) {
        return;
      }

      if (list.ok) {
        setPages(list.data.items);
      }

      if (colourPage.ok) {
        const parsed = parseColorDoc(colourPage.data.current?.content ?? '');

        setColour({
          doc: parsed.kind === 'ok' ? parsed.doc : null,
          versionNo: colourPage.data.current?.versionNo ?? null,
        });
      }

      if (typePage.ok) {
        const parsed = parseTypeDoc(typePage.data.current?.content ?? '');

        setType({
          doc: parsed.kind === 'ok' ? parsed.doc : null,
          versionNo: typePage.data.current?.versionNo ?? null,
        });
      }

      if (logoPage.ok) {
        const parsed = parseLogoDoc(logoPage.data.current?.content ?? '');

        setLogo({
          doc: parsed.kind === 'ok' ? parsed.doc : null,
          versionNo: logoPage.data.current?.versionNo ?? null,
        });
      }

      if (tonePage.ok) {
        const parsed = parseToneDoc(tonePage.data.current?.content ?? '');

        setTone({
          doc: parsed.kind === 'ok' ? parsed.doc : null,
          versionNo: tonePage.data.current?.versionNo ?? null,
        });
      }

      if (examplesPage.ok) {
        const parsed = parseExampleDoc(examplesPage.data.current?.content ?? '');

        setExamples({
          doc: parsed.kind === 'ok' ? parsed.doc : null,
          versionNo: examplesPage.data.current?.versionNo ?? null,
        });
      }

      if (policy.ok) {
        setPolicyText(policy.data.slots.find((slot) => slot.slot === 'home')?.current?.content ?? '');
      }

      // 讀不到就講讀不到：`null` 與「空字串」在畫面上是兩件事。
      setPromptPack(pack.ok ? pack.data : null);
    })();

    return () => {
      live = false;
    };
  }, [brandId]);

  const parsed = parseHomeDoc(content);

  const refInput = {
    colour: colour.doc,
    colourVersion: colour.versionNo,
    type: type.doc,
    typeVersion: type.versionNo,
    logo: logo.doc,
    logoVersion: logo.versionNo,
    tone: tone.doc,
    toneVersion: tone.versionNo,
  };

  // 在 early return 之前上報。四頁未讀到時 `homeGaps` 已經把相關項目標成缺。
  useGapCount(
    parsed.kind === 'invalid'
      ? null
      : gapCount(homeGaps({ doc: parsed.kind === 'ok' ? parsed.doc : { ...EMPTY_FOR_GAPS }, pages, ...refInput })),
    onGapCount,
  );

  // 舊形狀不是這份表：講明讀不到，不當成「空白主頁」靜靜蓋掉。
  if (parsed.kind === 'invalid') {
    return (
      <div className="brand-home brand-home--invalid" data-home-invalid>
        <p className="design-note design-note--error">{t('brand.home.invalid')}</p>

        {canEdit && (
          <div className="design-form__actions">
            <button
              type="button"
              className="design-btn"
              data-home-reset
              onClick={() => {
                onChange('');
              }}
            >
              {t('brand.home.invalidReset')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const doc: HomeDoc = parsed.kind === 'ok' ? parsed.doc : { ...EMPTY_FOR_GAPS };
  const gaps = homeGaps({ doc, pages, ...refInput });
  const refs = homeRefs(doc, refInput);
  const swatches = colourSwatches(colour.doc, 'light');
  const samples = typeRows(type.doc, colour.doc);
  const usage = logoUsage(logo.doc, doc.logo_default as '' | LogoModeKey, colour.doc);
  const sentence = toneSample(tone.doc);
  const rows = pageRows(pages);
  const exampleRows = examples.doc?.examples ?? [];

  function commit(next: HomeDoc): void {
    setRegenerated(null);
    onChange(write(next));
  }

  async function regenerate(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setRegenerated(null);

    // 與自定義頁同一個道理：重編不改內容，只按現在的來源落一版。手改的欄位
    // 與版面原封不動（issue #67 第 5 點）。
    const no = await onSaveNow(serializeHomeDoc(doc));

    setBusy(false);

    if (no !== null) {
      setRegenerated(no);
    }
  }

  function refStateLabel(ref: HomeRef): string {
    switch (ref.state) {
      case 'missing-page':
        return t('brand.home.refMissingPage', { page: refPageName(ref.page) });
      case 'unknown':
        return t('brand.home.refUnknown', { page: refPageName(ref.page) });
      default:
        return t('brand.home.refMissingValue', { page: refPageName(ref.page) });
    }
  }

  const summary: string[] = [];

  if (gaps.stance) {
    summary.push(t('brand.home.gapStance'));
  }

  if (gaps.who) {
    summary.push(t('brand.home.gapWho'));
  }

  if (gaps.keywords === 'empty') {
    summary.push(t('brand.home.gapKeywordsEmpty'));
  }

  if (gaps.keywords === 'tooFew') {
    summary.push(t('brand.home.gapKeywordsTooFew', { count: doc.keywords.length, min: KEYWORD_MIN }));
  }

  if (gaps.keywords === 'tooMany') {
    summary.push(t('brand.home.gapKeywordsTooMany', { count: doc.keywords.length, max: KEYWORD_MAX }));
  }

  if (gaps.layout) {
    summary.push(t('brand.home.gapLayoutEmpty'));
  }

  if (gaps.colorOrder) {
    summary.push(t('brand.home.gapColorOrder'));
  }

  if (gaps.logoDefault) {
    summary.push(t('brand.home.gapLogoDefault'));
  }

  if (gaps.typeSplit) {
    summary.push(t('brand.home.gapTypeSplit'));
  }

  if (gaps.voiceSamples) {
    summary.push(t('brand.home.gapVoiceSamples'));
  }

  if (gaps.layoutReasons.length > 0) {
    summary.push(
      t('brand.home.gapLayoutReason', {
        items: gaps.layoutReasons.map((index) => `#${index + 1}`).join('、'),
      }),
    );
  }

  if (gaps.refs.length > 0) {
    summary.push(t('brand.home.gapRefs', { count: gaps.refs.length }));
  }

  if (gaps.tone) {
    summary.push(t('brand.home.gapTonePage'));
  }

  if (gaps.pages.length > 0) {
    summary.push(t('brand.home.gapPages', { items: gaps.pages.join('、') }));
  }

  return (
    <div className="brand-home" data-home-doc>
      <p className="design-field__hint" data-home-note>
        {t('brand.home.note')}
      </p>

      {policyText.trim() === '' && (
        <p className="design-note design-note--error" data-home-policy-missing>
          {t('brand.home.policyMissing')}
        </p>
      )}

      {/* 缺幾項是一眼要看到的數量，逐項讀是第二眼：所以是一個短列表，不是
          一句用「；」串起來的長句 —— 六項串成一行，讀的人會漏掉一半。 */}
      {gapCount(gaps) === 0 ? (
        <p className="brand-home__missing" data-home-missing>
          {t('brand.home.allPresent')}
        </p>
      ) : (
        <div className="brand-home__missing brand-home__missing--gap" data-home-missing>
          <p className="brand-home__missingLead">{t('brand.home.missingLead')}</p>
          <ul className="brand-home__missingList">
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 一、立場與是誰：主頁自己擁有的內容。 */}
      <section className="brand-home__section" data-home-section="stance">
        <h3 className="brand-page__versionsTitle">{t('brand.home.stance')}</h3>
        <p className="design-field__hint">{t('brand.home.stanceHint')}</p>
        <textarea
          className="brand-page__textarea brand-home__textarea"
          data-home-stance
          value={doc.stance}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.home.stancePlaceholder')}
          onChange={(event) => {
            commit({ ...doc, stance: event.target.value });
          }}
        />

        <h3 className="brand-page__versionsTitle">{t('brand.home.who')}</h3>
        <p className="design-field__hint">{t('brand.home.whoHint')}</p>
        <input
          className="design-input"
          data-home-who
          value={doc.who}
          readOnly={!canEdit}
          autoComplete="off"
          placeholder={t('brand.home.whoPlaceholder')}
          onChange={(event) => {
            commit({ ...doc, who: event.target.value });
          }}
        />
      </section>

      {/* 二、關鍵詞：三到五個，來自平台頁，不另創新詞。 */}
      <section className="brand-home__section" data-home-section="keywords">
        <h3 className="brand-page__versionsTitle">{t('brand.home.keywords')}</h3>
        <p className="design-field__hint">{t('brand.home.keywordsHint', { min: KEYWORD_MIN, max: KEYWORD_MAX })}</p>

        {doc.keywords.length === 0 ? (
          <p className="design-empty">{t('brand.home.keywordsEmpty')}</p>
        ) : (
          <ul className="brand-home__chips">
            {doc.keywords.map((word, index) => (
              <li className="brand-home__chip" key={word} data-home-keyword={index}>
                <span>{word}</span>
                {canEdit && (
                  <button
                    type="button"
                    className="brand-home__chipRemove"
                    data-home-keyword-remove={index}
                    aria-label={`${t('brand.home.keywordRemove')} ${word}`}
                    onClick={() => {
                      commit(removeKeyword(doc, index));
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && doc.keywords.length < KEYWORD_MAX && (
          <div className="brand-home__adder">
            <input
              className="design-input"
              data-home-keyword-input
              value={keywordDraft}
              autoComplete="off"
              placeholder={t('brand.home.keywordPlaceholder')}
              onChange={(event) => {
                setKeywordDraft(event.target.value);
              }}
            />
            <button
              type="button"
              className="design-btn"
              data-home-keyword-add
              onClick={() => {
                commit(addKeyword(doc, keywordDraft));
                setKeywordDraft('');
              }}
            >
              {t('brand.home.keywordAdd')}
            </button>
          </div>
        )}
      </section>

      {/* 三、版面：這一頁自己的判斷。次序可以改，但每一塊都要有理由。 */}
      <section className="brand-home__section" data-home-section="layout">
        <h3 className="brand-page__versionsTitle">{t('brand.home.layout')}</h3>
        <p className="design-field__hint">{t('brand.home.layoutHint')}</p>

        {doc.layout.length === 0 ? (
          <p className="design-note design-note--error" data-home-layout-empty>
            {t('brand.home.layoutEmpty')}
          </p>
        ) : (
          <ol className="brand-home__layout">
            {doc.layout.map((row, index) => (
              <li
                className="brand-home__layoutRow"
                key={`layout-${index}`}
                data-home-layout={index}
                data-missing={row.reason.trim() === '' ? 'true' : 'false'}
              >
                <div className="brand-home__layoutHead">
                  <span className="brand-home__layoutIndex">#{index + 1}</span>

                  <select
                    className="design-input brand-home__layoutBlock"
                    data-home-layout-block={index}
                    aria-label={t('brand.home.layoutBlock')}
                    value={row.block}
                    disabled={!canEdit}
                    onChange={(event) => {
                      commit(setLayout(doc, index, { block: event.target.value as HomeDoc['layout'][number]['block'] }));
                    }}
                  >
                    {LAYOUT_BLOCKS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>

                  <input
                    className="design-input brand-home__layoutSource"
                    data-home-layout-source={index}
                    aria-label={t('brand.home.layoutSource')}
                    value={row.source}
                    readOnly={!canEdit}
                    autoComplete="off"
                    placeholder={t('brand.home.layoutSourcePlaceholder')}
                    onChange={(event) => {
                      commit(setLayout(doc, index, { source: event.target.value }));
                    }}
                  />

                  <label className="brand-home__layoutEmphasis">
                    <input
                      type="radio"
                      name="home-layout-lead"
                      data-home-layout-emphasis={index}
                      checked={row.emphasis === 'lead'}
                      disabled={!canEdit}
                      onChange={() => {
                        commit(setEmphasis(doc, index));
                      }}
                    />
                    <span>{t('brand.home.layoutLead')}</span>
                  </label>

                  {canEdit && (
                    <span className="brand-home__layoutActions">
                      <button
                        type="button"
                        className="brand-page__action"
                        data-home-layout-up={index}
                        disabled={index === 0}
                        aria-label={t('brand.home.layoutUp')}
                        onClick={() => {
                          commit(moveLayout(doc, index, -1));
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="brand-page__action"
                        data-home-layout-down={index}
                        disabled={index === doc.layout.length - 1}
                        aria-label={t('brand.home.layoutDown')}
                        onClick={() => {
                          commit(moveLayout(doc, index, 1));
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="brand-page__action brand-page__action--danger"
                        data-home-layout-remove={index}
                        onClick={() => {
                          commit(removeLayout(doc, index));
                        }}
                      >
                        {t('brand.home.layoutRemove')}
                      </button>
                    </span>
                  )}
                </div>

                <input
                  className="design-input"
                  data-home-layout-reason={index}
                  aria-label={t('brand.home.layoutReason')}
                  value={row.reason}
                  readOnly={!canEdit}
                  autoComplete="off"
                  placeholder={t('brand.home.layoutReasonPlaceholder')}
                  onChange={(event) => {
                    commit(setLayout(doc, index, { reason: event.target.value }));
                  }}
                />

                {row.reason.trim() === '' && (
                  <span className="brand-home__gap" data-home-layout-reason-gap={index}>
                    {t('brand.home.layoutReasonMissing')}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {canEdit && (
          <div className="brand-home__adder">
            <button
              type="button"
              className="design-btn"
              data-home-layout-add
              onClick={() => {
                commit(addLayout(doc));
              }}
            >
              {t('brand.home.layoutAdd')}
            </button>
          </div>
        )}
      </section>

      {/* 四、引用與來源：每一條都寫明來源頁與版本 —— 驗收第一條的做法。 */}
      <section className="brand-home__section" data-home-section="refs">
        <h3 className="brand-page__versionsTitle">{t('brand.home.refs')}</h3>
        <p className="design-field__hint">{t('brand.home.refsHint')}</p>

        {refs.length === 0 ? (
          <p className="design-empty">{t('brand.home.refsEmpty')}</p>
        ) : (
          <ul className="brand-home__refs">
            {refs.map((ref) => (
              <li
                className="brand-home__ref"
                key={`${ref.page}-${ref.item}`}
                data-home-ref={ref.item}
                data-home-ref-state={ref.state}
              >
                <span className="brand-home__refItem">{ref.label}</span>
                <span className="brand-home__refSource">
                  {ref.version === null
                    ? t('brand.home.refNoVersion', { page: refPageName(ref.page) })
                    : t('brand.home.refSource', { page: refPageName(ref.page), version: ref.version })}
                </span>
                {ref.state !== 'ok' && <span className="brand-home__gap">{refStateLabel(ref)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 五、用色順序：只寫角色名，色值住在色彩頁。 */}
      <section className="brand-home__section" data-home-section="colour">
        <h3 className="brand-page__versionsTitle">{t('brand.home.colour')}</h3>
        <p className="design-field__hint">{t('brand.home.colourHint')}</p>

        {swatches.length === 0 ? (
          <p className="design-note design-note--error" data-home-colour-missing>
            {t('brand.home.colourMissing')}
          </p>
        ) : (
          <ul className="brand-home__swatches">
            {swatches.map((swatch) => (
              <li className="brand-home__swatchItem" key={swatch.role} data-home-swatch={swatch.role}>
                <span
                  className="brand-home__swatchChip"
                  style={{ backgroundColor: swatch.hex }}
                  aria-hidden="true"
                />
                <span className="brand-home__swatchName">{swatch.role}</span>
                <code className="brand-home__roleValue">{swatch.hex}</code>
              </li>
            ))}
          </ul>
        )}

        <label className="design-field">
          <span className="design-field__label">{t('brand.home.colourNote')}</span>
          <input
            className="design-input"
            data-home-colour-note
            value={doc.color_order.note}
            readOnly={!canEdit}
            autoComplete="off"
            placeholder={t('brand.home.colourNotePlaceholder')}
            onChange={(event) => {
              commit({ ...doc, color_order: { ...doc.color_order, note: event.target.value } });
            }}
          />
        </label>

        {doc.color_order.roles.length === 0 && (
          <p className="design-note design-note--error" data-home-colour-empty>
            {t('brand.home.colourOrderEmpty')}
          </p>
        )}
      </section>

      {/* 六、標誌預設：引用標誌頁的模式，色值仍然在色彩頁。 */}
      <section className="brand-home__section" data-home-section="logo">
        <h3 className="brand-page__versionsTitle">{t('brand.home.logo')}</h3>
        <p className="design-field__hint">{t('brand.home.logoHint')}</p>

        <label className="design-field">
          <span className="design-field__label">{t('brand.home.logoMode')}</span>
          <select
            className="design-input"
            data-home-logo-mode
            value={doc.logo_default}
            disabled={!canEdit}
            onChange={(event) => {
              commit({ ...doc, logo_default: event.target.value });
            }}
          >
            <option value="">{t('brand.home.logoModeNone')}</option>
            {LOGO_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabel(mode)}
              </option>
            ))}
          </select>
        </label>

        {usage === null ? (
          <p className="design-note design-note--error" data-home-logo-missing>
            {logo.doc === null ? t('brand.home.logoPageMissing') : t('brand.home.logoModeMissing')}
          </p>
        ) : (
          <div className="brand-home__logo" data-home-logo>
            <p className="brand-home__logoAsset">
              {usage.assetName === '' ? t('brand.home.logoAssetMissing') : usage.assetName}
            </p>
            <p className="brand-home__logoMeta">
              {t('brand.home.logoRoleLine', { role: usage.role })}
              {usage.hex === null ? (
                <span className="brand-home__gap">{t('brand.home.roleValueMissing')}</span>
              ) : (
                <>
                  <span
                    className="brand-home__swatch"
                    style={{ backgroundColor: usage.hex }}
                    aria-hidden="true"
                  />
                  <code className="brand-home__roleValue">{usage.hex}</code>
                </>
              )}
            </p>
            <p className="brand-home__logoMeta">
              {usage.screen === '' && usage.print === ''
                ? t('brand.home.logoSizeMissing')
                : t('brand.home.logoSize', {
                    screen: usage.screen === '' ? '—' : usage.screen,
                    print: usage.print === '' ? '—' : usage.print,
                  })}
            </p>
          </div>
        )}
      </section>

      {/* 七、字體分工：只寫家族名；字階住在字體頁。 */}
      <section className="brand-home__section" data-home-section="type">
        <h3 className="brand-page__versionsTitle">{t('brand.home.type')}</h3>
        <p className="design-field__hint">{t('brand.home.typeHint')}</p>

        <div className="brand-home__split">
          <label className="design-field">
            <span className="design-field__label">{t('brand.home.typeSerif')}</span>
            <input
              className="design-input"
              data-home-type-serif
              value={doc.type_split.serif}
              readOnly={!canEdit}
              autoComplete="off"
              placeholder={t('brand.home.typeSerifPlaceholder')}
              onChange={(event) => {
                commit({ ...doc, type_split: { ...doc.type_split, serif: event.target.value } });
              }}
            />
          </label>

          <label className="design-field">
            <span className="design-field__label">{t('brand.home.typeSans')}</span>
            <input
              className="design-input"
              data-home-type-sans
              value={doc.type_split.sans}
              readOnly={!canEdit}
              autoComplete="off"
              placeholder={t('brand.home.typeSansPlaceholder')}
              onChange={(event) => {
                commit({ ...doc, type_split: { ...doc.type_split, sans: event.target.value } });
              }}
            />
          </label>
        </div>

        <label className="design-field">
          <span className="design-field__label">{t('brand.home.typeNote')}</span>
          <input
            className="design-input"
            data-home-type-note
            value={doc.type_split.note}
            readOnly={!canEdit}
            autoComplete="off"
            placeholder={t('brand.home.typeNotePlaceholder')}
            onChange={(event) => {
              commit({ ...doc, type_split: { ...doc.type_split, note: event.target.value } });
            }}
          />
        </label>

        {type.doc === null ? (
          <p className="design-note design-note--error" data-home-type-missing>
            {t('brand.home.typePageMissing')}
          </p>
        ) : (
          <ul className="brand-home__types">
            {samples.rows.map((row) => (
              <li className="brand-home__typeRow" key={row.role} data-home-type={row.role}>
                <span className="brand-home__typeHead">
                  {typeRoleLabel(row.role)}
                  {row.familyName === '' ? (
                    <span className="brand-home__gap">{t('brand.home.roleMissing')}</span>
                  ) : (
                    <code className="brand-home__roleValue">{row.familyName}</code>
                  )}
                  {row.size !== '' && <span className="brand-home__typeMeta">{row.size}</span>}
                  {row.weight !== '' && <span className="brand-home__typeMeta">{row.weight}</span>}
                </span>
                {row.familyName !== '' && (
                  <span
                    className="brand-home__typeSample"
                    style={{ fontSize: pxSize(row.size), color: row.colourHex ?? undefined }}
                  >
                    {t('brand.home.typeSample')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 八、語氣樣本：引用語氣頁的句子，不在這裡另寫。 */}
      <section className="brand-home__section" data-home-section="tone">
        <h3 className="brand-page__versionsTitle">{t('brand.home.tone')}</h3>
        <p className="design-field__hint">{t('brand.home.toneHint')}</p>

        {sentence === '' ? (
          <p className="design-note design-note--error" data-home-tone-missing>
            {t('brand.home.toneMissing')}
          </p>
        ) : (
          <blockquote className="brand-home__tone" data-home-tone>
            {sentence}
          </blockquote>
        )}

        {doc.voice_samples.length > 0 && (
          <ul className="brand-home__quotes">
            {doc.voice_samples.map((line, index) => (
              <li className="brand-home__quote" key={line} data-home-voice={index}>
                <span>{line}</span>
                {canEdit && (
                  <button
                    type="button"
                    className="brand-home__chipRemove"
                    data-home-voice-remove={index}
                    aria-label={`${t('brand.home.voiceRemove')} ${line}`}
                    onClick={() => {
                      commit(removeVoiceSample(doc, index));
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
          <div className="brand-home__adder">
            <input
              className="design-input"
              data-home-voice-input
              value={voiceDraft}
              autoComplete="off"
              placeholder={t('brand.home.voicePlaceholder')}
              onChange={(event) => {
                setVoiceDraft(event.target.value);
              }}
            />
            <button
              type="button"
              className="design-btn"
              data-home-voice-add
              onClick={() => {
                commit(addVoiceSample(doc, voiceDraft));
                setVoiceDraft('');
              }}
            >
              {t('brand.home.voiceAdd')}
            </button>
          </div>
        )}
      </section>

      {/* 九、品牌專屬系統：自定義頁的精華，只放入口不放副本。 */}
      <section className="brand-home__section" data-home-section="systems">
        <h3 className="brand-page__versionsTitle">{t('brand.home.systems')}</h3>
        <p className="design-field__hint">{t('brand.home.systemsHint')}</p>

        {doc.systems.length === 0 ? (
          <p className="design-empty">{t('brand.home.systemsEmpty')}</p>
        ) : (
          <div className="brand-home__systems">
            {doc.systems.map((system, index) => (
              <div className="brand-home__system" key={`system-${index}`} data-home-system={index}>
                <div className="brand-home__split">
                  <label className="design-field">
                    <span className="design-field__label">{t('brand.home.systemName')}</span>
                    <input
                      className="design-input"
                      data-home-system-name={index}
                      value={system.name}
                      readOnly={!canEdit}
                      autoComplete="off"
                      onChange={(event) => {
                        commit(setSystem(doc, index, { name: event.target.value }));
                      }}
                    />
                  </label>

                  <label className="design-field">
                    <span className="design-field__label">{t('brand.home.systemNote')}</span>
                    <input
                      className="design-input"
                      data-home-system-note={index}
                      value={system.note}
                      readOnly={!canEdit}
                      autoComplete="off"
                      onChange={(event) => {
                        commit(setSystem(doc, index, { note: event.target.value }));
                      }}
                    />
                  </label>
                </div>

                {canEdit && (
                  <button
                    type="button"
                    className="brand-page__action brand-page__action--danger"
                    data-home-system-remove={index}
                    onClick={() => {
                      commit(removeSystem(doc, index));
                    }}
                  >
                    {t('brand.home.systemRemove')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="brand-home__adder">
            <button
              type="button"
              className="design-btn"
              data-home-system-add
              onClick={() => {
                commit(addSystem(doc));
              }}
            >
              {t('brand.home.systemAdd')}
            </button>
          </div>
        )}
      </section>

      {/* 十、已核准範例：只引用名稱與當時版本，內容住在應用層那一頁。 */}
      <section className="brand-home__section" data-home-section="examples">
        <h3 className="brand-page__versionsTitle">{t('brand.home.examples')}</h3>
        <p className="design-field__hint">{t('brand.home.examplesHint')}</p>

        {exampleRows.length === 0 ? (
          <p className="design-empty" data-home-examples-empty>
            {t('brand.home.examplesEmpty')}
          </p>
        ) : (
          <ul className="brand-home__refs">
            {exampleRows.map((row, index) => (
              <li
                className="brand-home__ref"
                key={`example-${index}`}
                data-home-example={index}
                data-home-example-stale={rowStale(row, pages) ? 'true' : 'false'}
              >
                <span className="brand-home__refItem">
                  {row.title === '' ? t('brand.home.exampleUntitled') : row.title}
                </span>
                <span className="brand-home__refSource" data-home-example-versions={index}>
                  {row.page_refs.length === 0
                    ? t('brand.home.exampleNoVersion')
                    : rowVersions(row, pages)}
                </span>
                {rowStale(row, pages) && (
                  <span className="brand-home__gap">{t('brand.home.exampleStale')}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <a className="brand-home__pageLink" href="#/design/brand/examples" data-home-examples-link>
          {t('brand.home.examplesLink')}
        </a>
      </section>

      {/* 十、每一頁的入口：清單由後端來，自定義頁各自一條。 */}
      <section className="brand-home__section" data-home-section="pages">
        <h3 className="brand-page__versionsTitle">{t('brand.home.pages')}</h3>
        <p className="design-field__hint">{t('brand.home.pagesHint')}</p>

        <ul className="brand-home__pages">
          {rows.map((row) => (
            <li className="brand-home__page" key={row.key} data-home-page={row.key}>
              <a className="brand-home__pageLink" href={row.href}>
                {row.name}
              </a>
              {row.versionNo === null ? (
                <span className="brand-home__gap">{t('brand.home.pageMissing')}</span>
              ) : (
                <span className="brand-home__pageVersion" data-home-page-version={row.key}>
                  {t('brand.home.pageVersion', { no: row.versionNo })}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 十一、給 AI 用：讀的是伺服器真正會交出去的那一份，不是這裡再砌一份。 */}
      <section className="brand-home__section" data-home-section="for-ai">
        <h3 className="brand-page__versionsTitle">{t('brand.home.ai.title')}</h3>
        <p className="design-field__hint">{t('brand.home.ai.hint')}</p>

        <ul className="brand-home__outputs">
          {OUTPUTS.map((output) => (
            <li key={output.kind} data-home-ai-output={output.kind}>
              <a className="brand-home__pageLink" href={brandOutputPath(brandId, output.kind)}>
                {t(output.label)}
              </a>
            </li>
          ))}
        </ul>

        <div data-home-ai-composed>
          <h4 className="brand-home__aiHead">{t('brand.home.ai.composed')}</h4>
          <ul className="brand-home__pages">
            {rows.map((row) => (
              <li className="brand-home__page" key={`composed-${row.key}`}>
                <span className="brand-home__swatchName">{row.name}</span>
                <span className="brand-home__pageVersion">
                  {row.versionNo === null
                    ? t('brand.home.pageMissing')
                    : t('brand.home.pageVersion', { no: row.versionNo })}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <h4 className="brand-home__aiHead">{t('brand.home.ai.promptTitle')}</h4>
        {promptPack === null || promptPack.trim() === '' ? (
          <p className="design-note design-note--error" data-home-ai-prompt-missing>
            {t('brand.home.ai.promptMissing')}
          </p>
        ) : (
          <pre className="brand-home__prompt" data-home-ai-prompt>
            {promptPack}
          </pre>
        )}
      </section>

      {/* 重編是把**現有**內容重新落一版：第一版都未有的時候，那一塊只是一粒
          按不下的灰鍵，對讀的人沒有意思。 */}
      {canEdit && content.trim() !== '' && (
        <section className="brand-home__section" data-home-section="regenerate">
          <h3 className="brand-page__versionsTitle">{t('brand.home.regenerateTitle')}</h3>
          <p className="design-field__hint">{t('brand.home.regenerateHint')}</p>

          <button
            type="button"
            className="design-btn"
            data-home-regenerate
            disabled={busy}
            onClick={() => {
              void regenerate();
            }}
          >
            {t('brand.home.regenerate')}
          </button>

          {regenerated !== null && (
            <p className="design-note" role="status" data-home-regenerated>
              {t('brand.home.regenerated', { no: regenerated })}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** 缺口計算用的空表：只在內容未有一版時用，不寫入任何地方。 */
const EMPTY_FOR_GAPS: HomeDoc = {
  stance: '',
  who: '',
  keywords: [],
  color_order: { roles: [], note: '' },
  logo_default: '',
  type_split: { serif: '', sans: '', note: '' },
  voice_samples: [],
  systems: [],
  layout: [],
};
