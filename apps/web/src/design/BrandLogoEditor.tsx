import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchBrandPage } from '../api';
import { COLOR_ROLES, parseColorDoc, type ColorDoc } from './brandColors';
import {
  ASSET_KINDS,
  LOGO_MODES,
  MAX_ASSETS,
  assetGaps,
  availableKinds,
  emptyLogoDoc,
  gapCount,
  hasAnyValue,
  isVectorFile,
  logoGaps,
  modeRoleValue,
  modeRow,
  parseLogoDoc,
  primaryAsset,
  roleState,
  serializeLogoDoc,
  setMode,
  type AssetGap,
  type LogoAsset,
  type LogoAssetKind,
  type LogoDoc,
  type LogoModeKey,
} from './brandLogo';
import { useGapCount } from './useGapCount';

/**
 * 標誌頁的編輯介面（issue #64，取代 #36）。
 *
 * 這一頁不畫標誌、不上載替代品：它記錄**這個品牌的標誌系統**——五類檔案、
 * 四種顏色模式、淨空間、兩個最小尺寸、組合、背景、錯誤用法。
 *
 * 一個跨頁引用：色值來自色彩頁（讀那一頁的現行版本）。這一頁**沒有**色值
 * 欄位 —— 色彩頁未定那個角色就標缺，不在這裡補一個色。用哪一個角色是這一頁
 * 的決定（#62 從色彩頁搬過來的 `logoRoles`），但色值是色彩頁的。
 *
 * 儲存仍然走 #33 的版本鏈：這裡只把表變成字串交給 `BrandPageScreen` 的
 * draft，按「儲存」才真的新增一版。
 */

type BrandLogoEditorProps = {
  brandId: string;
  content: string;
  canEdit: boolean;
  onChange: (next: string) => void;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

function write(doc: LogoDoc): string {
  return hasAnyValue(doc) ? serializeLogoDoc(doc) : '';
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'wordmark':
      return t('brand.logo.kind.wordmark');
    case 'mark':
      return t('brand.logo.kind.mark');
    case 'monogram':
      return t('brand.logo.kind.monogram');
    case 'appicon':
      return t('brand.logo.kind.appicon');
    default:
      return t('brand.logo.kind.logo');
  }
}

function modeLabel(key: LogoModeKey): string {
  switch (key) {
    case 'mono':
      return t('brand.logo.mode.mono');
    case 'reverse':
      return t('brand.logo.mode.reverse');
    case 'onDark':
      return t('brand.logo.mode.onDark');
    default:
      return t('brand.logo.mode.brand');
  }
}

function assetGapLabel(gap: AssetGap): string {
  if (gap === 'label') {
    return t('brand.logo.assetGapLabel');
  }

  return gap === 'file' ? t('brand.logo.assetGapFile') : t('brand.logo.assetGapVector');
}

export function BrandLogoEditor({ brandId, content, canEdit, onChange, onGapCount }: BrandLogoEditorProps) {
  const [colour, setColour] = useState<ColorDoc | null>(null);
  const [colourLoading, setColourLoading] = useState(true);
  const [lockupDraft, setLockupDraft] = useState({ id: '', use: '', min: '' });
  const [lockupError, setLockupError] = useState<string | null>(null);
  const [misuseDraft, setMisuseDraft] = useState({ example: '', reason: '' });
  const [misuseError, setMisuseError] = useState<string | null>(null);

  const parsed = parseLogoDoc(content);

  useEffect(() => {
    let live = true;

    void fetchBrandPage(brandId, 'color').then((result) => {
      if (!live) {
        return;
      }

      if (result.ok) {
        const doc = parseColorDoc(result.data.current?.content ?? '');

        setColour(doc.kind === 'ok' ? doc.doc : null);
      } else {
        setColour(null);
      }

      setColourLoading(false);
    });

    return () => {
      live = false;
    };
  }, [brandId]);

  // 上報缺口要在 early return 之前：hook 的數目不可以因為內容壞了就變。
  useGapCount(
    parsed.kind === 'invalid' ? null : gapCount(logoGaps(parsed.kind === 'ok' ? parsed.doc : emptyLogoDoc())),
    onGapCount,
  );

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
  const gaps = logoGaps(doc);

  function commit(next: LogoDoc): void {
    onChange(write(next));
  }

  function setAsset(kind: string, patch: Partial<LogoAsset>): void {
    commit({
      ...doc,
      assets: doc.assets.map((asset) => (asset.class === kind ? { ...asset, ...patch } : asset)),
    });
  }

  function addAsset(kind: LogoAssetKind): void {
    if (doc.assets.length >= MAX_ASSETS) {
      return;
    }

    commit({ ...doc, assets: [...doc.assets, { class: kind, label: '', file_ref: '', version: '' }] });
  }

  function addLockup(): void {
    const id = lockupDraft.id.trim();
    const use = lockupDraft.use.trim();

    if (id === '' || use === '') {
      setLockupError(t('brand.logo.lockupInvalid'));
      return;
    }

    const others = doc.lockups.filter((row) => row.id !== id);

    commit({ ...doc, lockups: [...others, { id, use, min: lockupDraft.min.trim() }] });
    setLockupDraft({ id: '', use: '', min: '' });
    setLockupError(null);
  }

  function addMisuse(): void {
    const example = misuseDraft.example.trim();
    const reason = misuseDraft.reason.trim();

    if (example === '' || reason === '') {
      setMisuseError(t('brand.logo.misuseInvalid'));
      return;
    }

    const others = doc.misuse.filter((row) => row.example !== example);

    commit({ ...doc, misuse: [...others, { example, reason }] });
    setMisuseDraft({ example: '', reason: '' });
    setMisuseError(null);
  }

  const summary: string[] = [];

  if (gaps.assets.length > 0) {
    summary.push(t('brand.logo.gapAssets', { count: gaps.assets.length }));
  }

  if (gaps.primary) {
    summary.push(t('brand.logo.gapPrimary'));
  }

  if (gaps.modes.length > 0) {
    summary.push(
      t('brand.logo.gapModes', { modes: gaps.modes.map(modeLabel).join('、') }),
    );
  }

  if (gaps.space) {
    summary.push(t('brand.logo.gapSpace'));
  }

  if (gaps.size) {
    summary.push(t('brand.logo.gapSize'));
  }

  if (gaps.backgrounds) {
    summary.push(t('brand.logo.gapBackgrounds'));
  }

  if (gaps.logic) {
    summary.push(t('brand.logo.gapLogic'));
  }

  const total = gapCount(gaps);
  const primary = primaryAsset(doc);

  return (
    <div className="brand-logo" data-logo-doc>
      <section className="brand-logo__section" data-logo-stance>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.stance')}</h3>

        {doc.stance.trim() === '' ? (
          <p className="design-note" data-logo-stance-missing>
            {t('brand.logo.stanceMissing')}
          </p>
        ) : (
          <p className="brand-logo__stanceText">{doc.stance}</p>
        )}

        <p className="design-field__hint">{t('brand.logo.stanceFrom')}</p>
      </section>

      <p
        className={`brand-logo__missing${total === 0 ? '' : ' brand-logo__missing--gap'}`}
        data-logo-missing={total}
      >
        {total === 0
          ? t('brand.logo.allPresent')
          : t('brand.logo.missingLine', { items: summary.join('、') })}
      </p>

      <section className="brand-logo__section" data-logo-logic>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.logic')}</h3>
        <p className="design-field__hint">{t('brand.logo.logicHint')}</p>

        <textarea
          className="brand-page__textarea brand-logo__textarea"
          data-logo-logic-line
          value={doc.logic_line}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.logo.logicPlaceholder')}
          onChange={(event) => {
            commit({ ...doc, logic_line: event.target.value });
          }}
        />

        <label className="brand-logo__field brand-logo__field--wide">
          <span className="brand-logo__fieldLabel">{t('brand.logo.masterVector')}</span>
          <input
            className="design-input"
            data-logo-master-vector
            value={doc.master_vector}
            readOnly={!canEdit}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('brand.logo.masterVectorPlaceholder')}
            onChange={(event) => {
              commit({ ...doc, master_vector: event.target.value });
            }}
          />
        </label>

        <p className="design-field__hint">{t('brand.logo.masterVectorHint')}</p>
      </section>

      <section className="brand-logo__section" data-logo-assets-section>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.assets')}</h3>
        <p className="design-field__hint">{t('brand.logo.assetsHint')}</p>

        {doc.assets.length === 0 && <p className="design-empty">{t('brand.logo.assetEmpty')}</p>}

        {doc.assets.map((asset) => {
          const gapsOfAsset = assetGaps(asset);

          return (
            <div
              className="brand-logo__asset"
              key={asset.class}
              data-logo-asset={asset.class}
              data-missing={gapsOfAsset.length === 0 ? 'false' : 'true'}
            >
              <div className="brand-logo__assetHead">
                <span className="brand-logo__kind">{kindLabel(asset.class)}</span>
                <code className="brand-logo__key">{asset.class}</code>

                {gapsOfAsset.length > 0 && (
                  <span className="brand-logo__badge" data-logo-asset-badge={asset.class}>
                    {gapsOfAsset.map(assetGapLabel).join('、')}
                  </span>
                )}

                {asset.class === 'logo' && (
                  <span className="brand-logo__primaryTag" data-logo-primary-tag>
                    {t('brand.logo.primary')}
                  </span>
                )}

                {canEdit && (
                  <button
                    type="button"
                    className="brand-page__action brand-page__action--danger"
                    data-logo-asset-remove={asset.class}
                    onClick={() => {
                      commit({
                        ...doc,
                        assets: doc.assets.filter((other) => other.class !== asset.class),
                      });
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
                    data-logo-asset-name={asset.class}
                    value={asset.label}
                    readOnly={!canEdit}
                    autoComplete="off"
                    placeholder={t('brand.logo.assetNamePlaceholder')}
                    onChange={(event) => {
                      setAsset(asset.class, { label: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-logo__field brand-logo__field--wide">
                  <span className="brand-logo__fieldLabel">{t('brand.logo.assetFile')}</span>
                  <input
                    className="design-input"
                    data-logo-asset-file={asset.class}
                    value={asset.file_ref}
                    readOnly={!canEdit}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('brand.logo.assetFilePlaceholder')}
                    onChange={(event) => {
                      setAsset(asset.class, { file_ref: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-logo__field">
                  <span className="brand-logo__fieldLabel">{t('brand.logo.assetVersion')}</span>
                  <input
                    className="design-input"
                    data-logo-asset-version={asset.class}
                    value={asset.version}
                    readOnly={!canEdit}
                    autoComplete="off"
                    placeholder={t('brand.logo.assetVersionPlaceholder')}
                    onChange={(event) => {
                      setAsset(asset.class, { version: event.target.value });
                    }}
                  />
                </label>
              </div>

              {asset.file_ref.trim() !== '' && !isVectorFile(asset.file_ref) && (
                <p className="design-note design-note--error" data-logo-vector-warning={asset.class}>
                  {t('brand.logo.assetGapVector')}
                </p>
              )}
            </div>
          );
        })}

        {doc.assets.length < MAX_ASSETS ? (
          canEdit && (
            <div className="brand-logo__adder" data-logo-asset-adder>
              <span className="brand-logo__fieldLabel">{t('brand.logo.assetAdd')}</span>

              {availableKinds(doc).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="brand-page__action"
                  data-logo-asset-add={kind}
                  onClick={() => {
                    addAsset(kind);
                  }}
                >
                  {kindLabel(kind)}
                </button>
              ))}
            </div>
          )
        ) : (
          <p className="design-field__hint" data-logo-asset-limit>
            {t('brand.logo.assetLimit', { count: ASSET_KINDS.length })}
          </p>
        )}

        <p className="design-field__hint" data-logo-primary-hint>
          {primary === null ? t('brand.logo.primaryEmpty') : t('brand.logo.primaryFrom')}
        </p>
      </section>

      <section className="brand-logo__section" data-logo-lockups>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.lockups')}</h3>
        <p className="design-field__hint">{t('brand.logo.lockupsHint')}</p>

        {doc.lockups.length === 0 ? (
          <p className="design-empty">{t('brand.logo.lockupEmpty')}</p>
        ) : (
          <ul className="brand-logo__recordList">
            {doc.lockups.map((row) => (
              <li className="brand-logo__record" key={row.id} data-logo-lockup={row.id}>
                <code className="brand-logo__key">{row.id}</code>
                <span className="brand-logo__recordSpec" data-logo-lockup-use={row.id}>
                  {row.use}
                </span>
                <span className="brand-logo__recordMeta" data-logo-lockup-min={row.id}>
                  {row.min}
                </span>

                {canEdit && (
                  <button
                    type="button"
                    className="brand-color__iconButton"
                    data-logo-lockup-remove={row.id}
                    aria-label={`${t('brand.logo.remove')} ${row.id}`}
                    onClick={() => {
                      commit({ ...doc, lockups: doc.lockups.filter((other) => other.id !== row.id) });
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {lockupError !== null && (
          <p className="design-note design-note--error" data-logo-lockup-error>
            {lockupError}
          </p>
        )}

        {canEdit && (
          <div className="brand-logo__adder">
            <input
              className="design-input"
              data-logo-lockup-id
              value={lockupDraft.id}
              autoComplete="off"
              placeholder={t('brand.logo.lockupId')}
              onChange={(event) => {
                setLockupDraft({ ...lockupDraft, id: event.target.value });
              }}
            />
            <input
              className="design-input"
              data-logo-lockup-use
              value={lockupDraft.use}
              autoComplete="off"
              placeholder={t('brand.logo.lockupUse')}
              onChange={(event) => {
                setLockupDraft({ ...lockupDraft, use: event.target.value });
              }}
            />
            <input
              className="design-input"
              data-logo-lockup-min-input
              value={lockupDraft.min}
              autoComplete="off"
              placeholder={t('brand.logo.lockupMin')}
              onChange={(event) => {
                setLockupDraft({ ...lockupDraft, min: event.target.value });
              }}
            />
            <button
              type="button"
              className="brand-page__action"
              data-logo-lockup-add
              onClick={addLockup}
            >
              {t('brand.logo.lockupAdd')}
            </button>
          </div>
        )}
      </section>

      <section className="brand-logo__section" data-logo-space>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.space')}</h3>
        <p className="design-field__hint">{t('brand.logo.spaceHint')}</p>

        <div className="brand-logo__fields">
          <label className="brand-logo__field brand-logo__field--wide">
            <span className="brand-logo__fieldLabel">{t('brand.logo.xField')}</span>
            <input
              className="design-input"
              data-logo-space-x
              value={doc.clear_space_x.x}
              readOnly={!canEdit}
              autoComplete="off"
              placeholder={t('brand.logo.xPlaceholder')}
              onChange={(event) => {
                commit({ ...doc, clear_space_x: { ...doc.clear_space_x, x: event.target.value } });
              }}
            />
          </label>

          <label className="brand-logo__field">
            <span className="brand-logo__fieldLabel">{t('brand.logo.multiples')}</span>
            <input
              className="design-input"
              data-logo-space-multiples
              value={doc.clear_space_x.multiples}
              readOnly={!canEdit}
              autoComplete="off"
              placeholder={t('brand.logo.multiplesPlaceholder')}
              onChange={(event) => {
                commit({
                  ...doc,
                  clear_space_x: { ...doc.clear_space_x, multiples: event.target.value },
                });
              }}
            />
          </label>

          <label className="brand-logo__field brand-logo__field--wide">
            <span className="brand-logo__fieldLabel">{t('brand.logo.spaceNote')}</span>
            <input
              className="design-input"
              data-logo-space-note
              value={doc.clear_space_x.note}
              readOnly={!canEdit}
              autoComplete="off"
              placeholder={t('brand.logo.spaceNotePlaceholder')}
              onChange={(event) => {
                commit({ ...doc, clear_space_x: { ...doc.clear_space_x, note: event.target.value } });
              }}
            />
          </label>

          <label className="brand-logo__field">
            <span className="brand-logo__fieldLabel">{t('brand.logo.minScreen')}</span>
            <input
              className="design-input"
              data-logo-min-screen
              value={doc.min_size.screen_px > 0 ? String(doc.min_size.screen_px) : ''}
              readOnly={!canEdit}
              inputMode="numeric"
              autoComplete="off"
              placeholder="24"
              onChange={(event) => {
                const value = Number(event.target.value.trim());

                commit({
                  ...doc,
                  min_size: {
                    ...doc.min_size,
                    screen_px: Number.isFinite(value) && value > 0 ? value : 0,
                  },
                });
              }}
            />
          </label>

          <label className="brand-logo__field">
            <span className="brand-logo__fieldLabel">{t('brand.logo.minPrint')}</span>
            <input
              className="design-input"
              data-logo-min-print
              value={doc.min_size.print_mm > 0 ? String(doc.min_size.print_mm) : ''}
              readOnly={!canEdit}
              inputMode="numeric"
              autoComplete="off"
              placeholder="12"
              onChange={(event) => {
                const value = Number(event.target.value.trim());

                commit({
                  ...doc,
                  min_size: {
                    ...doc.min_size,
                    print_mm: Number.isFinite(value) && value > 0 ? value : 0,
                  },
                });
              }}
            />
          </label>
        </div>

        {doc.min_size.screen_px > 0 && doc.min_size.screen_px === doc.min_size.print_mm && (
          <p className="design-note design-note--error" data-logo-min-same>
            {t('brand.logo.minSizeSame')}
          </p>
        )}

        <label className="brand-logo__field brand-logo__field--stack">
          <span className="brand-logo__fieldLabel">{t('brand.logo.construction')}</span>
          <span className="design-field__hint">{t('brand.logo.constructionHint')}</span>
          <textarea
            className="brand-page__textarea brand-logo__textarea"
            data-logo-construction
            value={doc.construction}
            readOnly={!canEdit}
            rows={2}
            onChange={(event) => {
              commit({ ...doc, construction: event.target.value });
            }}
          />
        </label>
      </section>

      <section className="brand-logo__section" data-logo-modes>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.modes')}</h3>
        <p className="design-field__hint">{t('brand.logo.modesHint')}</p>

        {LOGO_MODES.map((key) => {
          const row = modeRow(doc, key);
          const hex = modeRoleValue(colour, key, doc);
          const state = row.color_role === '' ? 'none' : roleState(row.color_role);

          return (
            <div
              className="brand-logo__mode"
              key={key}
              data-logo-mode={key}
              data-missing={state === 'ok' && hex !== null ? 'false' : 'true'}
            >
              <div className="brand-logo__modeHead">
                <span className="brand-logo__kind">{modeLabel(key)}</span>
                <code className="brand-logo__key">{key}</code>

                {state === 'unknown' && (
                  <span className="brand-logo__badge" data-logo-mode-badge={key}>
                    {t('brand.logo.modeRoleUnknown')}
                  </span>
                )}

                {state === 'function' && (
                  <span className="brand-logo__badge" data-logo-mode-badge={key}>
                    {t('brand.logo.modeRoleFunction')}
                  </span>
                )}
              </div>

              <label className="brand-logo__field">
                <span className="brand-logo__fieldLabel">{t('brand.logo.modeRole')}</span>
                <select
                  className="design-input"
                  data-logo-mode-role={key}
                  value={row.color_role}
                  disabled={!canEdit}
                  onChange={(event) => {
                    commit(setMode(doc, key, { color_role: event.target.value }));
                  }}
                >
                  <option value="">{t('brand.logo.modeRoleUnset')}</option>
                  {COLOR_ROLES.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.group === 'function' ? `${role.key}（${t('brand.logo.modeRoleFunction')}）` : role.key}
                    </option>
                  ))}
                </select>
              </label>

              <p className="brand-logo__modeValue" data-logo-mode-value={key}>
                <span className="brand-logo__fieldLabel">{t('brand.logo.modeValue')}</span>

                {colourLoading ? (
                  <span className="brand-logo__modeMissing">{t('brand.logo.modeColourLoading')}</span>
                ) : hex === null ? (
                  <span className="brand-logo__modeMissing">
                    {t('brand.logo.modeValueMissing', {
                      role: row.color_role === '' ? t('brand.logo.modeRoleUnset') : row.color_role,
                    })}
                  </span>
                ) : (
                  <>
                    <span
                      className="brand-logo__swatch"
                      style={{ backgroundColor: hex }}
                      data-logo-mode-hex={hex}
                      aria-hidden="true"
                    />
                    <code className="brand-logo__hex">{hex}</code>
                  </>
                )}
              </p>

              <label className="brand-logo__field brand-logo__field--wide">
                <span className="brand-logo__fieldLabel">{t('brand.logo.modeNote')}</span>
                <input
                  className="design-input"
                  data-logo-mode-note={key}
                  value={row.note}
                  readOnly={!canEdit}
                  autoComplete="off"
                  placeholder={t('brand.logo.modeNotePlaceholder')}
                  onChange={(event) => {
                    commit(setMode(doc, key, { note: event.target.value }));
                  }}
                />
              </label>
            </div>
          );
        })}
      </section>

      <section className="brand-logo__section" data-logo-backgrounds>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.backgrounds')}</h3>
        <p className="design-field__hint">{t('brand.logo.backgroundsHint')}</p>

        <textarea
          className="brand-page__textarea brand-logo__textarea"
          data-logo-backgrounds-text
          value={doc.backgrounds}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.logo.backgroundsPlaceholder')}
          onChange={(event) => {
            commit({ ...doc, backgrounds: event.target.value });
          }}
        />
      </section>

      <section className="brand-logo__section" data-logo-misuse-section>
        <h3 className="brand-page__versionsTitle">{t('brand.logo.misuse')}</h3>
        <p className="design-field__hint">{t('brand.logo.misuseHint')}</p>

        {doc.misuse.length === 0 ? (
          <p className="design-empty">{t('brand.logo.misuseEmpty')}</p>
        ) : (
          <ul className="brand-logo__recordList">
            {doc.misuse.map((row) => (
              <li className="brand-logo__record" key={row.example} data-logo-misuse-row={row.example}>
                <code className="brand-logo__key">{row.example}</code>
                <span className="brand-logo__recordSpec" data-logo-misuse-reason={row.example}>
                  {row.reason}
                </span>

                {canEdit && (
                  <button
                    type="button"
                    className="brand-color__iconButton"
                    data-logo-misuse-remove={row.example}
                    aria-label={`${t('brand.logo.remove')} ${row.example}`}
                    onClick={() => {
                      commit({
                        ...doc,
                        misuse: doc.misuse.filter((other) => other.example !== row.example),
                      });
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {misuseError !== null && (
          <p className="design-note design-note--error" data-logo-misuse-error>
            {misuseError}
          </p>
        )}

        {canEdit && (
          <div className="brand-logo__adder">
            <input
              className="design-input"
              data-logo-misuse-input
              value={misuseDraft.example}
              autoComplete="off"
              placeholder={t('brand.logo.misusePlaceholder')}
              onChange={(event) => {
                setMisuseDraft({ ...misuseDraft, example: event.target.value });
              }}
            />
            <input
              className="design-input"
              data-logo-misuse-reason-input
              value={misuseDraft.reason}
              autoComplete="off"
              placeholder={t('brand.logo.misuseReasonPlaceholder')}
              onChange={(event) => {
                setMisuseDraft({ ...misuseDraft, reason: event.target.value });
              }}
            />
            <button type="button" className="brand-page__action" data-logo-misuse-add onClick={addMisuse}>
              {t('brand.logo.misuseAdd')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
