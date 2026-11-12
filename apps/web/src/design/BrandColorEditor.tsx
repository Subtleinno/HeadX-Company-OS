import { useState } from 'react';
import { t } from '@company-os/i18n';
import {
  BODY_CONTRAST,
  COLOR_GROUPS,
  COLOR_ROLES,
  EMPTY_DOC,
  LARGE_CONTRAST,
  contrastRatio,
  hasAnyValue,
  isColorRole,
  isHex,
  logoEligibleRoles,
  missingMustHave,
  missingRoles,
  normalizeHex,
  parseColorDoc,
  parsePair,
  rgbChannels,
  rolesOfGroup,
  serializeColorDoc,
  valuesOf,
  type ColorDoc,
  type ColorGroup,
  type ColorPair,
  type ColorValue,
} from './brandColors';
import { useGapCount } from './useGapCount';

/**
 * 色彩頁的編輯介面（issue #35）。
 *
 * 這一頁不是自由文字框：內容是一張**有角色的表**。理由寫在 `brandColors.ts`
 * 開頭 —— 自由文字裡沒有「哪個角色有值」，畫面就只會把整段文字印出來，
 * 也就是驗收明確禁止的「一排沒有名字的色塊」。
 *
 * 儲存仍然走 #33 的版本鏈：這裡只負責把表變成字串交給上面那一個輸入框的
 * `onChange`（`BrandPageScreen` 的 draft），按「儲存」才真的新增一版。
 * 所以這一頁沒有自己的儲存鍵 —— 兩處各有一個「儲存」，早晚有一邊忘了加
 * 版本號。
 *
 * 三個誠實位：
 *   1. 缺就是缺。角色未有 HEX 就標「缺」，不填一個「差不多」的色。
 *   2. 深色獨有的角色（`surface`）在淺色模式不叫「缺」—— 它不在這裡用。
 *   3. 現行內容不是表（舊的自由文字）就講讀不到，不畫九行假的「缺」。
 */

type Mode = 'light' | 'dark';
type PairList = 'allowed' | 'denied';

type BrandColorEditorProps = {
  /** 現行版本的內容（JSON 字串，或者是舊的自由文字）。 */
  content: string;
  canEdit: boolean;
  /** 交回去的是**內容字串**；全空的時候是空字串（等於未有內容）。 */
  onChange: (next: string) => void;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

/** 一份表變成內容字串。全空就交空字串，讓上面那一個「未有內容」的判斷繼續有效。 */
function write(doc: ColorDoc): string {
  return hasAnyValue(doc) ? serializeColorDoc(doc) : '';
}

function swatchStyle(hex: string): { backgroundColor: string } | undefined {
  return isHex(hex) ? { backgroundColor: hex } : undefined;
}

function groupLabel(group: ColorGroup): string {
  if (group === 'brand') {
    return t('brand.color.group.brand');
  }

  return group === 'reading' ? t('brand.color.group.reading') : t('brand.color.group.function');
}

export function BrandColorEditor({ content, canEdit, onChange, onGapCount }: BrandColorEditorProps) {
  const [mode, setMode] = useState<Mode>('light');
  const [rampDraft, setRampDraft] = useState({ role: COLOR_ROLES[0]?.key ?? '', step: '', hex: '' });
  const [rampError, setRampError] = useState<string | null>(null);
  const [pairDraft, setPairDraft] = useState<Record<PairList, string>>({ allowed: '', denied: '' });
  const [pairError, setPairError] = useState<Record<PairList, string | null>>({
    allowed: null,
    denied: null,
  });

  const parsed = parseColorDoc(content);

  // 上報缺口要在 early return 之前：hook 的數目不可以因為內容壞了就變。
  // 解析不到就報 null —— 面板會閉嘴，而不是講「沒有缺口」。
  useGapCount(
    parsed.kind === 'invalid'
      ? null
      : missingRoles(parsed.kind === 'ok' ? parsed.doc : EMPTY_DOC, mode).length,
    onGapCount,
  );

  if (parsed.kind === 'invalid') {
    return (
      <div className="brand-color brand-color--invalid" data-color-invalid>
        <p className="design-note design-note--error">{t('brand.color.invalid')}</p>

        {canEdit && (
          <div className="design-form__actions">
            <button
              type="button"
              className="design-btn"
              data-color-reset
              onClick={() => {
                onChange(write(EMPTY_DOC));
              }}
            >
              {t('brand.color.invalidReset')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const doc = parsed.kind === 'ok' ? parsed.doc : EMPTY_DOC;
  const values = valuesOf(doc, mode);
  const missing = missingRoles(doc, mode);
  const mustHave = missingMustHave(doc, mode);
  const functionRoles = rolesOfGroup('function').map((role) => role.key);

  function commit(next: ColorDoc): void {
    onChange(write(next));
  }

  function setValue(roleKey: string, field: 'hex' | 'cmyk', next: string): void {
    const current: ColorValue = values[roleKey] ?? { hex: '', cmyk: '' };
    const updated: ColorValue = { ...current, [field]: next };
    const bucket: Record<string, ColorValue> = { ...values };

    if (updated.hex.trim() === '' && updated.cmyk.trim() === '') {
      delete bucket[roleKey];
    } else {
      bucket[roleKey] = updated;
    }

    commit(mode === 'light' ? { ...doc, light: bucket } : { ...doc, dark: bucket });
  }

  function addRamp(): void {
    const step = rampDraft.step.trim();
    const hex = rampDraft.hex.trim();

    if (step === '' || !isHex(hex)) {
      setRampError(t('brand.color.rampMissing'));
      return;
    }

    const normalized = normalizeHex(hex) ?? hex;
    const existing = doc.ramps[rampDraft.role] ?? [];
    const steps = [...existing.filter((item) => item.step !== step), { step, hex: normalized }].sort(
      (a, b) => Number(a.step) - Number(b.step) || a.step.localeCompare(b.step),
    );

    commit({ ...doc, ramps: { ...doc.ramps, [rampDraft.role]: steps } });
    setRampDraft({ ...rampDraft, step: '', hex: '' });
    setRampError(null);
  }

  function removeRamp(roleKey: string, step: string): void {
    const steps = (doc.ramps[roleKey] ?? []).filter((item) => item.step !== step);
    const ramps: Record<string, { step: string; hex: string }[]> = { ...doc.ramps };

    if (steps.length === 0) {
      delete ramps[roleKey];
    } else {
      ramps[roleKey] = steps;
    }

    commit({ ...doc, ramps });
  }

  function addPair(list: PairList): void {
    const text = pairDraft[list].trim();

    if (parsePair(text) === null) {
      setPairError({ ...pairError, [list]: t('brand.color.pairInvalid') });
      return;
    }

    setPairDraft({ ...pairDraft, [list]: '' });
    setPairError({ ...pairError, [list]: null });

    // 同一個組合寫兩次只會令人以為有兩個決定。
    if (doc[list].some((item) => item.text === text)) {
      return;
    }

    commit(
      list === 'allowed'
        ? { ...doc, allowed: [...doc.allowed, { text }] }
        : { ...doc, denied: [...doc.denied, { text }] },
    );
  }

  function removePair(list: PairList, text: string): void {
    commit(
      list === 'allowed'
        ? { ...doc, allowed: doc.allowed.filter((item) => item.text !== text) }
        : { ...doc, denied: doc.denied.filter((item) => item.text !== text) },
    );
  }

  function toggleLogoRole(roleKey: string, on: boolean): void {
    const next = on
      ? [...new Set([...doc.logoRoles, roleKey])]
      : doc.logoRoles.filter((key) => key !== roleKey);

    commit({ ...doc, logoRoles: next });
  }

  function pairRow(list: PairList, pair: ColorPair) {
    const split = parsePair(pair.text);
    const keys = split === null ? [] : [split.foreground, split.background];
    const unknown = keys.filter((key) => !isColorRole(key));
    const foreground = split === null ? '' : (values[split.foreground]?.hex ?? '');
    const background = split === null ? '' : (values[split.background]?.hex ?? '');
    const ratio = split === null || unknown.length > 0 ? null : contrastRatio(foreground, background);

    return (
      <li className="brand-color__pair" key={`${list}-${pair.text}`} data-color-pair={list} data-color-pair-text={pair.text}>
        <code className="brand-color__pairText">{pair.text}</code>

        {split === null && (
          <span className="brand-color__pairNote">{t('brand.color.pairInvalid')}</span>
        )}

        {split !== null && unknown.length > 0 && (
          <span className="brand-color__pairNote">
            {t('brand.color.pairUnknown', { roles: unknown.join('、') })}
          </span>
        )}

        {split !== null && unknown.length === 0 && ratio === null && (
          <span className="brand-color__pairNote">{t('brand.color.pairNoValue')}</span>
        )}

        {ratio !== null && (
          <span className="brand-color__ratio" data-color-ratio={ratio.toFixed(2)}>
            <span className="brand-color__ratioValue">
              {t('brand.color.ratio', { ratio: ratio.toFixed(2) })}
            </span>
            <span
              className="brand-color__check"
              data-color-body-pass={ratio >= BODY_CONTRAST ? 'true' : 'false'}
            >
              {t('brand.color.bodyThreshold')}{' '}
              {ratio >= BODY_CONTRAST ? t('brand.color.pass') : t('brand.color.fail')}
            </span>
            <span
              className="brand-color__check"
              data-color-large-pass={ratio >= LARGE_CONTRAST ? 'true' : 'false'}
            >
              {t('brand.color.largeThreshold')}{' '}
              {ratio >= LARGE_CONTRAST ? t('brand.color.pass') : t('brand.color.fail')}
            </span>
          </span>
        )}

        {canEdit && (
          <button
            type="button"
            className="brand-page__action"
            data-color-pair-remove={`${list}:${pair.text}`}
            onClick={() => {
              removePair(list, pair.text);
            }}
          >
            {t('brand.color.pairRemove')}
          </button>
        )}
      </li>
    );
  }

  return (
    <div className="brand-color" data-color-doc>
      <p className="design-field__hint" data-color-screen-print>
        {t('brand.color.screenPrint')}
      </p>

      <div className="brand-color__modes" role="group" aria-label={t('brand.color.roles')}>
        {(['light', 'dark'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className="brand-color__mode"
            data-color-mode={item}
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item);
            }}
          >
            {item === 'light' ? t('brand.color.mode.light') : t('brand.color.mode.dark')}
          </button>
        ))}
        <span className="design-field__hint">{t('brand.color.modeHint')}</span>
      </div>

      <p className="brand-color__missing" data-color-missing>
        {missing.length === 0
          ? t('brand.color.allPresent')
          : t('brand.color.missingLine', { roles: missing.join('、') })}
      </p>

      {mustHave.length > 0 && (
        <p className="design-note" data-color-must-have>
          {t('brand.color.missingMustHave', { roles: mustHave.join('、') })}
        </p>
      )}

      <section className="brand-color__roles" aria-label={t('brand.color.roles')}>
        <h3 className="brand-page__versionsTitle">{t('brand.color.roles')}</h3>
        <p className="design-field__hint">{t('brand.color.rolesHint')}</p>

        {COLOR_GROUPS.map((group) => (
          <div className="brand-color__group" key={group} data-color-group={group}>
            <h4 className="brand-color__groupTitle">{groupLabel(group)}</h4>

            {group === 'function' && (
              <p className="design-field__hint">{t('brand.color.group.functionHint')}</p>
            )}

            {rolesOfGroup(group).map((role) => {
              const value = values[role.key] ?? { hex: '', cmyk: '' };
              const darkOnly = role.requiredIn === 'dark' && mode === 'light';
              const isMissing = value.hex === '' && !darkOnly;

              return (
                <div
                  className="brand-color__row"
                  key={role.key}
                  data-color-role={role.key}
                  data-missing={isMissing ? 'true' : 'false'}
                  data-dark-only={darkOnly ? 'true' : 'false'}
                >
                  <div className="brand-color__roleHead">
                    <span
                      className={`brand-color__swatch${isHex(value.hex) ? '' : ' brand-color__swatch--empty'}`}
                      style={swatchStyle(value.hex)}
                      data-color-swatch={role.key}
                      aria-hidden="true"
                    />
                    <code className="brand-color__name">{role.key}</code>

                    {isMissing && (
                      <span className="brand-color__badge" data-color-badge="missing">
                        {t('brand.color.missing')}
                      </span>
                    )}

                    {darkOnly && value.hex === '' && (
                      <span className="brand-color__badge brand-color__badge--quiet">
                        {t('brand.color.darkOnly')}
                      </span>
                    )}
                  </div>

                  <label className="brand-color__field">
                    <span className="brand-color__fieldLabel">{t('brand.color.hex')}</span>
                    <input
                      className="design-input"
                      data-color-hex={role.key}
                      value={value.hex}
                      readOnly={!canEdit}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={t('brand.color.hexPlaceholder')}
                      onChange={(event) => {
                        setValue(role.key, 'hex', event.target.value);
                      }}
                      onBlur={() => {
                        const normalized = normalizeHex(value.hex);

                        if (normalized !== null && normalized !== value.hex) {
                          setValue(role.key, 'hex', normalized);
                        }
                      }}
                    />
                  </label>

                  <span className="brand-color__derived" data-color-rgb={role.key}>
                    {t('brand.color.rgb')} {rgbChannels(value.hex) ?? '—'}
                  </span>

                  <label className="brand-color__field brand-color__field--wide">
                    <span className="brand-color__fieldLabel">{t('brand.color.cmyk')}</span>
                    <input
                      className="design-input"
                      data-color-cmyk={role.key}
                      value={value.cmyk}
                      readOnly={!canEdit}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={t('brand.color.cmykPlaceholder')}
                      onChange={(event) => {
                        setValue(role.key, 'cmyk', event.target.value);
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        ))}

        <p className="design-field__hint">{t('brand.color.cmykHint')}</p>
      </section>

      <section className="brand-color__section" data-color-ramps>
        <h3 className="brand-page__versionsTitle">{t('brand.color.ramps')}</h3>
        <p className="design-field__hint">{t('brand.color.rampsHint')}</p>

        {Object.keys(doc.ramps).length === 0 ? (
          <p className="design-empty">{t('brand.color.rampEmpty')}</p>
        ) : (
          <ul className="brand-color__rampList">
            {Object.entries(doc.ramps).map(([roleKey, steps]) => (
              <li className="brand-color__ramp" key={roleKey} data-color-ramp={roleKey}>
                <code className="brand-color__name">{roleKey}</code>

                {steps.map((step) => (
                  <span
                    className="brand-color__step"
                    key={`${roleKey}-${step.step}`}
                    data-color-ramp-step={`${roleKey}:${step.step}`}
                  >
                    <span
                      className="brand-color__swatch brand-color__swatch--small"
                      style={swatchStyle(step.hex)}
                      aria-hidden="true"
                    />
                    <span>{step.step}</span>
                    <code>{step.hex}</code>

                    {canEdit && (
                      <button
                        type="button"
                        className="brand-color__iconButton"
                        data-color-ramp-remove={`${roleKey}:${step.step}`}
                        aria-label={`${t('brand.color.rampRemove')} ${roleKey} ${step.step}`}
                        onClick={() => {
                          removeRamp(roleKey, step.step);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="brand-color__adder" data-color-ramp-adder>
            <select
              className="design-input"
              data-color-ramp-role
              value={rampDraft.role}
              onChange={(event) => {
                setRampDraft({ ...rampDraft, role: event.target.value });
              }}
            >
              {COLOR_ROLES.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.key}
                </option>
              ))}
            </select>

            <input
              className="design-input"
              data-color-ramp-step-input
              value={rampDraft.step}
              placeholder={t('brand.color.rampStepPlaceholder')}
              aria-label={t('brand.color.rampStep')}
              autoComplete="off"
              onChange={(event) => {
                setRampDraft({ ...rampDraft, step: event.target.value });
              }}
            />

            <input
              className="design-input"
              data-color-ramp-hex
              value={rampDraft.hex}
              placeholder={t('brand.color.hexPlaceholder')}
              aria-label={t('brand.color.hex')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setRampDraft({ ...rampDraft, hex: event.target.value });
              }}
            />

            <button
              type="button"
              className="brand-page__action"
              data-color-ramp-add
              onClick={addRamp}
            >
              {t('brand.color.rampAdd')}
            </button>
          </div>
        )}

        {rampError !== null && (
          <p className="design-note design-note--error" role="alert" data-color-ramp-error>
            {rampError}
          </p>
        )}
      </section>

      {(['allowed', 'denied'] as const).map((list) => (
        <section className="brand-color__section" key={list} data-color-pairs={list}>
          <h3 className="brand-page__versionsTitle">
            {list === 'allowed' ? t('brand.color.allowed') : t('brand.color.denied')}
          </h3>
          <p className="design-field__hint">{t('brand.color.pairsHint')}</p>

          {doc[list].length === 0 ? (
            <p className="design-empty">{t('brand.color.pairEmpty')}</p>
          ) : (
            <ul className="brand-color__pairList">{doc[list].map((pair) => pairRow(list, pair))}</ul>
          )}

          {canEdit && (
            <div className="brand-color__adder" data-color-pair-adder={list}>
              <input
                className="design-input"
                data-color-pair-input={list}
                value={pairDraft[list]}
                placeholder={t('brand.color.pairPlaceholder')}
                aria-label={t('brand.color.pairPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setPairDraft({ ...pairDraft, [list]: event.target.value });
                }}
              />

              <button
                type="button"
                className="brand-page__action"
                data-color-pair-add={list}
                onClick={() => {
                  addPair(list);
                }}
              >
                {t('brand.color.pairAdd')}
              </button>
            </div>
          )}

          {pairError[list] !== null && (
            <p className="design-note design-note--error" role="alert" data-color-pair-error={list}>
              {pairError[list]}
            </p>
          )}
        </section>
      ))}

      <section className="brand-color__section" data-color-logo>
        <h3 className="brand-page__versionsTitle">{t('brand.color.logoTitle')}</h3>
        <p className="design-field__hint">{t('brand.color.logoHint')}</p>

        <div className="brand-color__logoRoles">
          {logoEligibleRoles().map((role) => {
            const on = doc.logoRoles.includes(role.key);

            return (
              <label className="brand-color__logoRole" key={role.key} data-color-logo-role={role.key}>
                <span
                  className={`brand-color__swatch brand-color__swatch--small${isHex(values[role.key]?.hex ?? '') ? '' : ' brand-color__swatch--empty'}`}
                  style={swatchStyle(values[role.key]?.hex ?? '')}
                  aria-hidden="true"
                />

                {canEdit ? (
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(event) => {
                      toggleLogoRole(role.key, event.target.checked);
                    }}
                  />
                ) : (
                  <span className="brand-color__logoMark" aria-hidden="true">
                    {on ? '✓' : '—'}
                  </span>
                )}

                <code className="brand-color__name">{role.key}</code>
              </label>
            );
          })}
        </div>

        <p className="design-field__hint" data-color-logo-note>
          {t('brand.color.logoNote', { roles: functionRoles.join('、') })}
        </p>
      </section>
    </div>
  );
}
