import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchBrandPage, fetchBrandPages, fetchPolicy, type BrandPageSummary } from '../api';
import { parseColorDoc, type ColorDoc } from './brandColors';
import { LOGO_MODES, parseLogoDoc, type LogoDoc, type LogoModeKey } from './brandLogo';
import { parseTypeDoc, type TypeDoc, type TypeRoleKey } from './brandType';
import { parseToneDoc, type ToneDoc } from './brandTone';
import {
  INTRO_MIN_CHARS,
  colourSwatches,
  gapCount,
  hasAnyValue,
  homeGaps,
  introState,
  logoUsage,
  pageRows,
  parseHomeDoc,
  serializeHomeDoc,
  toneSample,
  typeRows,
  type HomeDoc,
  type LogoGap,
} from './brandHome';
import { useGapCount } from './useGapCount';

/**
 * 品牌主頁的表身（issue #39）。
 *
 * 這一頁**不重寫**任何來源頁的規則：它只讀四頁的現行版本，砌出可見樣本，
 * 再加上自己那兩件事（這段是誰、標誌預設用哪個模式）。
 *
 * 缺就標缺：某頁未有現行版本、某個角色未定值、某個層級未有家族、標誌未揀
 * 預設模式 —— 逐項寫明缺什麼，不畫示意圖、假色、假字。
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

export function BrandHomeEditor({
  brandId,
  content,
  canEdit,
  onChange,
  onSaveNow,
  onGapCount,
}: BrandHomeEditorProps) {
  const [pages, setPages] = useState<BrandPageSummary[]>([]);
  const [colour, setColour] = useState<ColorDoc | null>(null);
  const [type, setType] = useState<TypeDoc | null>(null);
  const [logo, setLogo] = useState<LogoDoc | null>(null);
  const [tone, setTone] = useState<ToneDoc | null>(null);
  const [policyText, setPolicyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [regenerated, setRegenerated] = useState<number | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      const [list, colourPage, typePage, logoPage, tonePage, policy] = await Promise.all([
        fetchBrandPages(brandId),
        fetchBrandPage(brandId, 'color'),
        fetchBrandPage(brandId, 'type'),
        fetchBrandPage(brandId, 'logo'),
        fetchBrandPage(brandId, 'tone'),
        fetchPolicy(),
      ]);

      if (!live) {
        return;
      }

      if (list.ok) {
        setPages(list.data.items);
      }

      if (colourPage.ok) {
        const parsed = parseColorDoc(colourPage.data.current?.content ?? '');

        setColour(parsed.kind === 'ok' ? parsed.doc : null);
      }

      if (typePage.ok) {
        const parsed = parseTypeDoc(typePage.data.current?.content ?? '');

        setType(parsed.kind === 'ok' ? parsed.doc : null);
      }

      if (logoPage.ok) {
        const parsed = parseLogoDoc(logoPage.data.current?.content ?? '');

        setLogo(parsed.kind === 'ok' ? parsed.doc : null);
      }

      if (tonePage.ok) {
        const parsed = parseToneDoc(tonePage.data.current?.content ?? '');

        setTone(parsed.kind === 'ok' ? parsed.doc : null);
      }

      if (policy.ok) {
        setPolicyText(policy.data.slots.find((slot) => slot.slot === 'home')?.current?.content ?? '');
      }
    })();

    return () => {
      live = false;
    };
  }, [brandId]);

  const parsed = parseHomeDoc(content);

  // 在 early return 之前上報。四頁未讀到時 `homeGaps` 已經把相關項目標成缺。
  useGapCount(
    parsed.kind === 'invalid'
      ? null
      : gapCount(
          homeGaps({
            doc: parsed.kind === 'ok' ? parsed.doc : { intro: '', logoMode: '' },
            colour,
            type,
            logo,
            tone,
            pages,
          }),
        ),
    onGapCount,
  );

  // 舊的自由文字不是這份表：講明讀不到，不當成「空白主頁」靜靜蓋掉。
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

  const doc: HomeDoc = parsed.kind === 'ok' ? parsed.doc : { intro: '', logoMode: '' };
  /** 那一頁有沒有現行版本。頁清單未讀到時當作未有，但不當成「有頁但缺」。 */
  function hasCurrent(key: string): boolean {
    return pages.some((item) => item.key === key && item.current !== null);
  }

  const computed = homeGaps({ doc, colour, type, logo, tone, pages });

  // 空字串解出來是「零資產」的合法文件，所以「標誌頁未有版本」與「有頁但
  // 冇主標誌」在解析結果上長得一樣。用頁清單改正它，免得叫設計師去補一個
  // 他其實要先開頁的洞。
  const gaps = {
    ...computed,
    logo: hasCurrent('logo') ? computed.logo : (['page'] as LogoGap[]),
  };
  const swatches = colourSwatches(colour, 'light');
  const samples = typeRows(type, colour);
  const usage = logoUsage(logo, doc.logoMode, colour);
  const sentence = toneSample(tone);
  const rows = pageRows(pages);

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

    // 與自定義頁同一個道理：重編不改內容，只按現在的來源落一版。手改的那段
    // 與標誌模式原封不動（issue #39 第 5 點）。
    const no = await onSaveNow(serializeHomeDoc(doc));

    setBusy(false);

    if (no !== null) {
      setRegenerated(no);
    }
  }

  const summary: string[] = [];

  if (gaps.intro === 'empty') {
    summary.push(t('brand.home.gapIntroEmpty'));
  }

  if (gaps.intro === 'short') {
    summary.push(t('brand.home.gapIntroShort'));
  }

  if (gaps.logoMode) {
    summary.push(t('brand.home.gapLogoMode'));
  }

  // 「整頁未有版本」與「頁有了但有幾項未填」是兩件事，但前者已經由下面
  // 那一句「未有現行版本：…」講齊 —— 同一個缺講兩次，讀的人只會以為缺了
  // 更多東西。所以整頁未有版本時這裡不再重複。
  //
  // 判斷「整頁未有版本」要看頁清單，不是看解析結果：空字串解出來是一份
  // 「零資產」的合法文件，於是標誌頁明明未有版本，仍會被當成「有頁但冇
  // 主標誌」。
  if (hasCurrent('logo') && gaps.logo.length > 0) {
    summary.push(t('brand.home.gapLogo'));
  }

  if (hasCurrent('color') && gaps.colour.length > 0) {
    summary.push(t('brand.home.gapColourSome'));
  }

  if (hasCurrent('type') && gaps.type.length > 0) {
    summary.push(t('brand.home.gapTypeSome'));
  }

  if (voiceMissingPages(gaps.pages)) {
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

      {/* 一、這個品牌是誰：主頁唯一自己擁有的內容。 */}
      <section className="brand-home__section" data-home-section="intro">
        <h3 className="brand-page__versionsTitle">{t('brand.home.intro')}</h3>
        <p className="design-field__hint">{t('brand.home.introHint')}</p>
        <textarea
          className="brand-page__textarea brand-home__textarea"
          data-home-intro
          value={doc.intro}
          readOnly={!canEdit}
          rows={3}
          onChange={(event) => {
            commit({ ...doc, intro: event.target.value });
          }}
        />

        {introState(doc.intro) !== 'ok' && (
          <p className="design-note design-note--error" data-home-intro-gap>
            {introState(doc.intro) === 'empty'
              ? t('brand.home.introEmpty')
              : t('brand.home.introShort', { min: INTRO_MIN_CHARS })}
          </p>
        )}
      </section>

      {/* 二、標誌的預設用法：只引用 #36 的模式與色彩頁的角色。 */}
      <section className="brand-home__section" data-home-section="logo">
        <h3 className="brand-page__versionsTitle">{t('brand.home.logo')}</h3>
        <p className="design-field__hint">{t('brand.home.logoHint')}</p>

        <label className="design-field">
          <span className="design-field__label">{t('brand.home.logoMode')}</span>
          <select
            className="design-input"
            data-home-logo-mode
            value={doc.logoMode}
            disabled={!canEdit}
            onChange={(event) => {
              commit({ ...doc, logoMode: event.target.value as '' | LogoModeKey });
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
            {gaps.logo.includes('page')
              ? t('brand.home.logoPageMissing')
              : t('brand.home.logoModeMissing')}
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

      {/* 三、色彩角色的可見樣本：只畫色彩頁真的有值的角色。 */}
      <section className="brand-home__section" data-home-section="colour">
        <h3 className="brand-page__versionsTitle">{t('brand.home.colour')}</h3>
        <p className="design-field__hint">{t('brand.home.colourHint')}</p>

        {swatches.length === 0 ? (
          <p className="design-note design-note--error" data-home-colour-missing>
            {t('brand.home.colourMissing')}
          </p>
        ) : (
          <>
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

            {gaps.colour.length > 0 && (
              <p className="brand-home__gap" data-home-colour-some-missing>
                {t('brand.home.colourSomeMissing', { count: gaps.colour.length })}
              </p>
            )}
          </>
        )}
      </section>

      {/* 四、字體層級的可見樣本。家族只記名與授權，所以樣本用系統字渲染。 */}
      <section className="brand-home__section" data-home-section="type">
        <h3 className="brand-page__versionsTitle">{t('brand.home.type')}</h3>
        <p className="design-field__hint">{t('brand.home.typeHint')}</p>

        {type === null ? (
          <p className="design-note design-note--error" data-home-type-missing>
            {t('brand.home.typeMissing')}
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

        <p className="design-field__hint" data-home-type-note>
          {t('brand.home.typeNote')}
        </p>
      </section>

      {/* 五、語氣短例：拿句子，不拿形容詞。 */}
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
      </section>

      {/* 六、每一頁的入口：清單由後端來，自定義頁各自一條。 */}
      <section className="brand-home__section" data-home-section="pages">
        <h3 className="brand-page__versionsTitle">{t('brand.home.pages')}</h3>
        <p className="design-field__hint">{t('brand.home.pagesHint')}</p>

        <ul className="brand-home__pages">
          {rows.map((row) => (
            <li className="brand-home__page" key={row.key} data-home-page={row.key}>
              <a className="brand-home__pageLink" href={row.href}>
                {row.name}
              </a>
              {!row.hasCurrent && (
                <span className="brand-home__gap">{t('brand.home.pageMissing')}</span>
              )}
            </li>
          ))}
        </ul>
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

/** 頁清單本身可能是空的（後端未回），那就不是「有頁未有版本」，而是未讀到。 */
function voiceMissingPages(names: string[]): boolean {
  return names.length > 0;
}
