import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchBrandPage } from '../api';
import { parseColorDoc, type ColorDoc } from './brandColors';
import { parseTypeDoc } from './brandType';
import {
  LOGO_MODES,
  MAX_ASSETS,
  assetGaps,
  availableKinds,
  emptyLogoDoc,
  gapCount,
  hasAnyValue,
  logoGaps,
  modeRoleValue,
  parseLogoDoc,
  printSizeOk,
  screenSizeOk,
  serializeLogoDoc,
  type LogoAsset,
  type LogoAssetKind,
  type LogoDoc,
  type LogoModeKey,
} from './brandLogo';

/**
 * 標誌頁的編輯介面（issue #36）。
 *
 * 這一頁不畫標誌、不上載替代品：它記錄**這個品牌的標誌系統**——五類資產、
 * 四種顏色模式、分模式的最小尺寸、安全範圍、方向、背景、錯誤用法。
 *
 * 兩個跨頁引用：
 *   - 色值來自色彩頁（`parseColorDoc` 讀那一頁的現行版本）。這一頁**沒有**
 *     色值欄位：色彩頁未定那個角色就標缺，不在這裡補一個色。
 *   - 字標用的家族來自字體頁（只引用 id）。家族不在這一頁決定。
 *
 * 儲存仍然走 #33 的版本鏈：這裡只把表變成字串交給 `BrandPageScreen` 的
 * draft，按「儲存」才真的新增一版。
 */

type BrandLogoEditorProps = {
  brandId: string;
  content: string;
  canEdit: boolean;
  onChange: (next: string) => void;
};

function write(doc: LogoDoc): string {
  return hasAnyValue(doc) ? serializeLogoDoc(doc) : '';
}

function kindLabel(kind: LogoAssetKind): string {
  switch (kind) {
    case 'logo':
      return t('brand.logo.kind.logo');
    case 'wordmark':
      return t('brand.logo.kind.wordmark');
    case 'mark':
      return t('brand.logo.kind.mark');
    case 'monogram':
      return t('brand.logo.kind.monogram');
    default:
      return t('brand.logo.kind.appicon');
  }
}

function modeLabel(key: LogoModeKey): string {
  switch (key) {
    case 'brand':
      return t('brand.logo.mode.brand');
    case 'mono':
      return t('brand.logo.mode.mono');
    case 'reverse':
      return t('brand.logo.mode.reverse');
    default:
      return t('brand.logo.mode.onDark');
  }
}

function nextAssetId(doc: LogoDoc): string {
  let index = 1;

  while (doc.assets.some((asset) => asset.id === `a-${index}`)) {
    index += 1;
  }

  return `a-${index}`;
}

export function BrandLogoEditor({ brandId, content, canEdit, onChange }: BrandLogoEditorProps) {
  const [colour, setColour] = useState<ColorDoc | null>(null);
  const [colourLoading, setColourLoading] = useState(true);
  const [families, setFamilies] = useState<{ id: string; label: string }[]>([]);
  const [misuseDraft, setMisuseDraft] = useState('');
  const [newKind, setNewKind] = useState<LogoAssetKind | ''>('');

  // 色彩頁：這一頁的色值全部由它來。讀不到就當作「未有色彩頁」，四種模式標缺。
  useEffect(() => {
    let live = true;

    void (async () => {
      const page = await fetchBrandPage(brandId, 'color');

      if (!live) {
        return;
      }

      if (page.ok) {
        const parsed = parseColorDoc(page.data.current?.content ?? '');

        setColour(parsed.kind === 'ok' ? parsed.doc : null);
      }

      setColourLoading(false);
    })();

    return () => {
      live = false;
    };
  }, [brandId]);

  // 字體頁：字標用了哪一個家族（只引用，不決定）。
  useEffect(() => {
    let live = true;

    void (async () => {
      const page = await fetchBrandPage(brandId, 'type');

      if (!live || !page.ok) {
        return;
      }

      const parsed = parseTypeDoc(page.data.current?.content ?? '');

      if (parsed.kind !== 'ok') {
        return;
      }

      setFamilies(
        parsed.doc.families
          .filter((family) => family.name.trim() !== '')
          .map((family) => ({
            id: family.id,
            label: `${family.script === 'chinese' ? t('brand.logo.scriptChinese') : t('brand.logo.scriptLatin')}・${family.name}`,
          })),
      );
    })();

    return () => {
      live = false;
    };
  }, [brandId]);

  const parsed = parseLogoDoc(content);

  if (parsed.kind === 'invalid') {
    return (
      <div className="brand-logo brand-logo--invalid" data-logo-invalid>
        <p className="design-note design-note--error">{t('brand.logo.invalid')}</p>

        {canEdit && (
          <div className="design-form__actions">
            <button
              type="button"
              className="design-btn"
              data-logo-reset
              onClick={() => {
                onChange(write(emptyLogoDoc()));
              }}
            >
              {t('brand.logo.invalidReset')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const doc = parsed.kind === 'ok' ? parsed.doc : emptyLogoDoc();
  const gaps = logoGaps(doc, colour);
  const available = availableKinds(doc);

  function commit(next: LogoDoc): void {
    onChange(write(next));
  }

  function setAsset(id: string, patch: Partial<LogoAsset>): void {
    commit({
      ...doc,
      assets: doc.assets.map((asset) => (asset.id === id ? { ...asset, ...patch } : asset)),
    });
  }

  function addAsset(): void {
    const kind = newKind !== '' ? newKind : available[0];

    if (kind === undefined || !available.includes(kind)) {
      return;
    }

    commit({
      ...doc,
      assets: [...doc.assets, { id: nextAssetId(doc), kind, name: '', master: '', preview: '' }],
    });
    setNewKind('');
  }

  function removeAsset(id: string): void {
    commit({
      ...doc,
      assets: doc.assets.filter((asset) => asset.id !== id),
      primaryId: doc.primaryId === id ? '' : doc.primaryId,
    });
  }

  function setMode(key: LogoModeKey, patch: { screen?: string; print?: string }): void {
    commit({ ...doc, modes: { ...doc.modes, [key]: { ...doc.modes[key], ...patch } } });
  }

  function addMisuse(): void {
    const next = misuseDraft.trim();

    if (next === '' || doc.misuse.includes(next)) {
      setMisuseDraft('');
      return;
    }

    commit({ ...doc, misuse: [...doc.misuse, next] });
    setMisuseDraft('');
  }

  const summary: string[] = [];

  if (gaps.primary) {
    summary.push(t('brand.logo.gapPrimary'));
  }

  if (gaps.assets.length > 0) {
    summary.push(t('brand.logo.gapAssets', { count: gaps.assets.length }));
  }

  if (gaps.modes.length > 0) {
    summary.push(
      t('brand.logo.gapModes', { modes: gaps.modes.map(modeLabel).join('、') }),
    );
  }

  if (gaps.safeArea) {
    summary.push(t('brand.logo.gapSafeArea'));
  }

  if (gaps.orientation) {
    summary.push(t('brand.logo.gapOrientation'));
  }

  if (gaps.backgrounds) {
    summary.push(t('brand.logo.gapBackgrounds'));
  }

  if (gaps.whenToUse) {
    summary.push(t('brand.logo.gapWhen'));
  }

  if (gaps.howToUse) {
    summary.push(t('brand.logo.gapHow'));
  }

  if (gaps.misuse) {
    summary.push(t('brand.logo.gapMisuse'));
  }

  return (
    <div className="brand-logo" data-logo-doc>
      <p className="design-field__hint" data-logo-note>
        {t('brand.logo.note')}
      </p>

      <p
        className={`brand-logo__missing${gapCount(gaps) === 0 ? '' : ' brand-logo__missing--gap'}`}
        data-logo-missing
      >
        {gapCount(gaps) === 0
          ? t('brand.logo.allPresent')
          : t('brand.logo.missingLine', { items: summary.join('、') })}
      </p>

      <section className="brand-logo__section" data-logo-assets-section>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.assets')}</h3>
        <p className="design-field__hint">{t('brand.logo.assetsHint')}</p>

        {doc.assets.length === 0 ? (
          <p className="design-empty">{t('brand.logo.assetEmpty')}</p>
        ) : (
          doc.assets.map((asset) => {
            const gapsOfAsset = assetGaps(asset);

            return (
              <div
                className="brand-logo__asset"
                key={asset.id}
                data-logo-asset={asset.id}
                data-missing={gapsOfAsset.length === 0 ? 'false' : 'true'}
              >
                <div className="brand-logo__assetHead">
                  <span className="brand-logo__kind">{kindLabel(asset.kind)}</span>
                  <code className="brand-logo__key">{asset.kind}</code>

                  {gapsOfAsset.includes('vector') && (
                    <span className="brand-logo__badge" data-logo-vector-warning>
                      {t('brand.logo.vectorRequired')}
                    </span>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action brand-page__action--danger"
                      data-logo-asset-remove={asset.id}
                      onClick={() => {
                        removeAsset(asset.id);
                      }}
                    >
                      {t('brand.logo.assetRemove')}
                    </button>
                  )}
                </div>

                <div className="brand-logo__fields">
                  <label className="brand-logo__field brand-logo__field--wide">
                    <span className="brand-logo__fieldLabel">{t('brand.logo.assetName')}</span>
                    <input
                      className="design-input"
                      data-logo-asset-name={asset.id}
                      value={asset.name}
                      readOnly={!canEdit}
                      autoComplete="off"
                      onChange={(event) => {
                        setAsset(asset.id, { name: event.target.value });
                      }}
                    />
                  </label>

                  <label className="brand-logo__field brand-logo__field--wide">
                    <span className="brand-logo__fieldLabel">{t('brand.logo.assetMaster')}</span>
                    <input
                      className="design-input"
                      data-logo-asset-master={asset.id}
                      value={asset.master}
                      readOnly={!canEdit}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="brand/logo/moonic-logo.svg"
                      onChange={(event) => {
                        setAsset(asset.id, { master: event.target.value });
                      }}
                    />
                  </label>

                  <label className="brand-logo__field brand-logo__field--wide">
                    <span className="brand-logo__fieldLabel">{t('brand.logo.assetPreview')}</span>
                    <input
                      className="design-input"
                      data-logo-asset-preview={asset.id}
                      value={asset.preview}
                      readOnly={!canEdit}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setAsset(asset.id, { preview: event.target.value });
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })
        )}

        {canEdit && available.length > 0 && (
          <div className="brand-logo__adder" data-logo-asset-adder>
            <label className="brand-logo__field">
              <span className="brand-logo__fieldLabel">{t('brand.logo.assetKind')}</span>
              <select
                className="design-input"
                data-logo-asset-kind
                value={newKind === '' ? (available[0] ?? '') : newKind}
                onChange={(event) => {
                  setNewKind(event.target.value as LogoAssetKind);
                }}
              >
                {available.map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabel(kind)}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="brand-page__action"
              data-logo-asset-add
              onClick={addAsset}
            >
              {t('brand.logo.assetAdd')}
            </button>
          </div>
        )}

        {available.length === 0 && (
          <p className="design-field__hint" data-logo-asset-limit>
            {t('brand.logo.assetLimit', { count: MAX_ASSETS })}
          </p>
        )}
      </section>

      <section className="brand-logo__section" data-logo-primary-section>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.primary')}</h3>
        <p className="design-field__hint">{t('brand.logo.primaryHint')}</p>

        {/* 標題已經寫了「主標誌」，這裡不再重複一個同名標籤。 */}
        <label className="brand-logo__field brand-logo__field--wide">
          <select
            className="design-input"
            data-logo-primary
            aria-label={t('brand.logo.primary')}
            value={doc.primaryId}
            disabled={!canEdit}
            onChange={(event) => {
              commit({ ...doc, primaryId: event.target.value });
            }}
          >
            <option value="">{t('brand.logo.primaryEmpty')}</option>
            {doc.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {`${kindLabel(asset.kind)}・${asset.name === '' ? asset.id : asset.name}`}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="brand-logo__section" data-logo-modes>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.modes')}</h3>
        <p className="design-field__hint">{t('brand.logo.modesHint')}</p>

        {LOGO_MODES.map((mode) => {
          const spec = doc.modes[mode.key];
          const value = modeRoleValue(colour, mode.key);
          const colourGap = !colourLoading && value === null;
          const sizeGap = !screenSizeOk(spec.screen) || !printSizeOk(spec.print);
          // 空白是「未填」，上面那一句已經講了；只有填了但寫錯單位才當場喝停，
          // 否則四行一齊紅，讀的人只會學到紅色等於未填。
          const sizeWrong =
            (spec.screen !== '' && !screenSizeOk(spec.screen)) ||
            (spec.print !== '' && !printSizeOk(spec.print));

          return (
            <div
              className="brand-logo__mode"
              key={mode.key}
              data-logo-mode={mode.key}
              data-missing={colourGap || sizeGap ? 'true' : 'false'}
            >
              <div className="brand-logo__modeHead">
                <span className="brand-logo__kind">{modeLabel(mode.key)}</span>
                <code className="brand-logo__key" data-logo-mode-role={mode.key}>
                  {mode.role}
                </code>
              </div>

              <p className="brand-logo__modeValue" data-logo-mode-value={mode.key}>
                <span className="brand-logo__fieldLabel">{t('brand.logo.modeValue')}</span>
                {colourLoading ? (
                  t('brand.logo.modeColourLoading')
                ) : value === null ? (
                  t('brand.logo.modeValueMissing', { role: mode.role })
                ) : (
                  <>
                    <span
                      className="brand-logo__swatch"
                      style={{ backgroundColor: value }}
                      aria-hidden="true"
                    />
                    <code>{value}</code>
                  </>
                )}
              </p>

              <label className="brand-logo__field">
                <span className="brand-logo__fieldLabel">{t('brand.logo.modeScreen')}</span>
                <input
                  className="design-input"
                  data-logo-screen={mode.key}
                  value={spec.screen}
                  readOnly={!canEdit}
                  autoComplete="off"
                  placeholder="24px"
                  onChange={(event) => {
                    setMode(mode.key, { screen: event.target.value });
                  }}
                />
              </label>

              <label className="brand-logo__field">
                <span className="brand-logo__fieldLabel">{t('brand.logo.modePrint')}</span>
                <input
                  className="design-input"
                  data-logo-print={mode.key}
                  value={spec.print}
                  readOnly={!canEdit}
                  autoComplete="off"
                  placeholder="8mm"
                  onChange={(event) => {
                    setMode(mode.key, { print: event.target.value });
                  }}
                />
              </label>

              {sizeWrong && (
                <p className="design-note design-note--error" data-logo-unit-error={mode.key}>
                  {t('brand.logo.unitError')}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section className="brand-logo__section" data-logo-usage>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.usage')}</h3>
        <p className="design-field__hint">{t('brand.logo.usageHint')}</p>

        <div className="brand-logo__fields">
          <label className="brand-logo__field brand-logo__field--wide">
            <span className="brand-logo__fieldLabel">{t('brand.logo.safeArea')}</span>
            <input
              className="design-input"
              data-logo-safe-area
              value={doc.safeArea}
              readOnly={!canEdit}
              autoComplete="off"
              placeholder="0.5X"
              onChange={(event) => {
                commit({ ...doc, safeArea: event.target.value });
              }}
            />
          </label>

          <label className="brand-logo__field brand-logo__field--wide">
            <span className="brand-logo__fieldLabel">{t('brand.logo.orientation')}</span>
            <input
              className="design-input"
              data-logo-orientation
              value={doc.orientation}
              readOnly={!canEdit}
              autoComplete="off"
              onChange={(event) => {
                commit({ ...doc, orientation: event.target.value });
              }}
            />
          </label>
        </div>

        <label className="brand-logo__field brand-logo__field--full">
          <span className="brand-logo__fieldLabel">{t('brand.logo.backgrounds')}</span>
          <textarea
            className="brand-page__textarea brand-logo__textarea"
            data-logo-backgrounds
            value={doc.backgrounds}
            readOnly={!canEdit}
            rows={2}
            onChange={(event) => {
              commit({ ...doc, backgrounds: event.target.value });
            }}
          />
        </label>

        <label className="brand-logo__field brand-logo__field--full">
          <span className="brand-logo__fieldLabel">{t('brand.logo.when')}</span>
          <textarea
            className="brand-page__textarea brand-logo__textarea"
            data-logo-when
            value={doc.whenToUse}
            readOnly={!canEdit}
            rows={2}
            onChange={(event) => {
              commit({ ...doc, whenToUse: event.target.value });
            }}
          />
        </label>

        <label className="brand-logo__field brand-logo__field--full">
          <span className="brand-logo__fieldLabel">{t('brand.logo.how')}</span>
          <textarea
            className="brand-page__textarea brand-logo__textarea"
            data-logo-how
            value={doc.howToUse}
            readOnly={!canEdit}
            rows={2}
            onChange={(event) => {
              commit({ ...doc, howToUse: event.target.value });
            }}
          />
        </label>

        <label className="brand-logo__field brand-logo__field--wide">
          <span className="brand-logo__fieldLabel">{t('brand.logo.wordmarkFamily')}</span>
          <select
            className="design-input"
            data-logo-wordmark-family
            value={doc.wordmarkFamilyId}
            disabled={!canEdit}
            onChange={(event) => {
              commit({ ...doc, wordmarkFamilyId: event.target.value });
            }}
          >
            <option value="">{t('brand.logo.wordmarkFamilyNone')}</option>
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.label}
              </option>
            ))}
          </select>
          <span className="brand-logo__fieldLabel">
            {families.length === 0 ? t('brand.logo.wordmarkFamilyEmpty') : t('brand.logo.wordmarkFamilyHint')}
          </span>
        </label>
      </section>

      <section className="brand-logo__section" data-logo-misuse-section>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.misuse')}</h3>
        <p className="design-field__hint">{t('brand.logo.misuseHint')}</p>

        {doc.misuse.length === 0 ? (
          <p className="design-empty">{t('brand.logo.misuseEmpty')}</p>
        ) : (
          <ul className="brand-logo__misuseList">
            {doc.misuse.map((item) => (
              <li className="brand-logo__misuseItem" key={item} data-logo-misuse-item={item}>
                <span>{item}</span>
                {canEdit && (
                  <button
                    type="button"
                    className="brand-color__iconButton"
                    data-logo-misuse-remove={item}
                    aria-label={`${t('brand.logo.misuseRemove')} ${item}`}
                    onClick={() => {
                      commit({ ...doc, misuse: doc.misuse.filter((value) => value !== item) });
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
          <div className="brand-logo__adder">
            <input
              className="design-input"
              data-logo-misuse-input
              value={misuseDraft}
              autoComplete="off"
              placeholder={t('brand.logo.misusePlaceholder')}
              onChange={(event) => {
                setMisuseDraft(event.target.value);
              }}
            />
            <button
              type="button"
              className="brand-page__action"
              data-logo-misuse-add
              onClick={addMisuse}
            >
              {t('brand.logo.misuseAdd')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
