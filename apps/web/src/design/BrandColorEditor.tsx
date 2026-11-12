import { useState, type ReactNode } from 'react';
import { t } from '@company-os/i18n';
import {
  COLOR_GROUPS,
  COLOR_ROLES,
  EMPTY_DOC,
  MUST_HAVE_ROLES,
  gapCountOf,
  hasAnyValue,
  isHex,
  missingRoles,
  normalizeHexInput,
  patchRole,
  parseColorDoc,
  ratioTotal,
  readPair,
  rgbChannels,
  roleEntry,
  rolesOfGroup,
  serializeColorDoc,
  undecidedRoles,
  type Alternative,
  type ColorDoc,
  type ColorGroup,
  type PairReading,
} from './brandColors';
import { useGapCount } from './useGapCount';

/**
 * 色彩頁的編輯介面（issue #62，取代 #35）。
 *
 * 這一頁不是自由文字框，是一張**有角色的表**：一格一個角色，其餘幾段
 * （立場、用色順序、比例、配對、深淺、下限）都圍繞這張表。理由寫在
 * `brandColors.ts` 開頭 —— 自由文字裡沒有「哪個角色有值」，畫面就只會把
 * 整段文字印出來，也就是驗收明確禁止的「一排沒有名字的色塊」。
 *
 * 儲存仍然走 #33 的版本鏈：這裡只把表變成字串交給上面那一個 draft，
 * 按「儲存」才真的新增一版。所以這一頁沒有自己的儲存鍵。
 *
 * 四個誠實位：
 *   1. 缺就是缺。四個必要角色未有 HEX 就標缺，不填一個「差不多」的色。
 *   2. 未定不是缺。品牌次要色、功能色未填只是未決定，用另一個字講。
 *   3. 不達標的配對旁邊有**替代色與實測數據** —— 只講「不過」等於把問題
 *      丟回去，而設計師要的是下一個可以按的決定。
 *   4. 現行內容不是表（舊的自由文字）就講讀不到，不畫九行假的「缺」。
 */

type PairList = 'allowed' | 'forbidden';

type BrandColorEditorProps = {
  /** 現行版本的內容（JSON 字串，或者是舊的自由文字）。 */
  content: string;
  canEdit: boolean;
  /** 交回去的是**內容字串**；全空的時候是空字串（等於未有內容）。 */
  onChange: (next: string) => void;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

/** 一份表變成內容字串。全空就交空字串，讓「未有內容」的判斷繼續有效。 */
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

/** 替代色的說法：用某個現有角色，或者把本來的角色調到某個值。 */
function alternativeLine(alternative: Alternative, role: string): string {
  return alternative.role === null
    ? t('brand.color.altNew', { role, hex: alternative.hex })
    : t('brand.color.altRole', { role: alternative.role, hex: alternative.hex });
}

export function BrandColorEditor({ content, canEdit, onChange, onGapCount }: BrandColorEditorProps) {
  const [ratioDraft, setRatioDraft] = useState({
    role: COLOR_ROLES[0]?.key ?? '',
    percent: '',
    reason: '',
  });
  const [ratioError, setRatioError] = useState<string | null>(null);
  const [tintDraft, setTintDraft] = useState({ name: '', hex: '', reason: '' });
  const [tintError, setTintError] = useState<string | null>(null);
  const [pairDraft, setPairDraft] = useState<Record<PairList, string>>({ allowed: '', forbidden: '' });
  const [pairError, setPairError] = useState<Record<PairList, string | null>>({
    allowed: null,
    forbidden: null,
  });

  const parsed = parseColorDoc(content);

  // 上報缺口要在 early return 之前：hook 的數目不可以因為內容壞了就變。
  // 解析不到就報 null —— 面板會閉嘴，而不是講「沒有缺口」。
  useGapCount(
    parsed.kind === 'invalid' ? null : gapCountOf(parsed.kind === 'ok' ? parsed.doc : EMPTY_DOC),
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
  const missing = missingRoles(doc);
  const undecided = undecidedRoles(doc);
  const total = ratioTotal(doc);

  function commit(next: ColorDoc): void {
    onChange(write(next));
  }

  function setRole(
    key: string,
    field: 'name' | 'hex' | 'cmyk' | 'dark' | 'usage' | 'reason',
    next: string,
  ): void {
    commit(patchRole(doc, key, { [field]: next }));
  }

  function addRatio(): void {
    const percent = Number(ratioDraft.percent.trim());

    if (ratioDraft.role.trim() === '' || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
      setRatioError(t('brand.color.ratioInvalid'));
      return;
    }

    const others = doc.ratios.filter((item) => item.role !== ratioDraft.role);

    commit({
      ...doc,
      ratios: [...others, { role: ratioDraft.role, percent, reason: ratioDraft.reason.trim() }],
    });
    setRatioDraft({ ...ratioDraft, percent: '', reason: '' });
    setRatioError(null);
  }

  function addTint(): void {
    const name = tintDraft.name.trim();
    const hex = normalizeHexInput(tintDraft.hex);

    if (name === '' || hex === null) {
      setTintError(t('brand.color.tintMissing'));
      return;
    }

    const others = doc.tints.filter((item) => item.name !== name);

    commit({ ...doc, tints: [...others, { name, hex, reason: tintDraft.reason.trim() }] });
    setTintDraft({ name: '', hex: '', reason: '' });
    setTintError(null);
  }

  function addPair(list: PairList): void {
    const text = pairDraft[list].trim();
    const match = /^(\S+)\s+on\s+(\S+)$/.exec(text);

    if (match === null || match[1] === undefined || match[2] === undefined) {
      setPairError({ ...pairError, [list]: t('brand.color.pairInvalid') });
      return;
    }

    const fg = match[1];
    const bg = match[2];

    setPairDraft({ ...pairDraft, [list]: '' });
    setPairError({ ...pairError, [list]: null });

    // 同一個組合寫兩次只會令人以為有兩個決定。
    if (doc.pairs[list].some((item) => item.fg === fg && item.bg === bg)) {
      return;
    }

    commit(
      list === 'allowed'
        ? {
            ...doc,
            pairs: {
              ...doc.pairs,
              allowed: [...doc.pairs.allowed, { fg, bg, use: 'body' as const, reason: '' }],
            },
          }
        : {
            ...doc,
            pairs: { ...doc.pairs, forbidden: [...doc.pairs.forbidden, { fg, bg, reason: '' }] },
          },
    );
  }

  function removePair(list: PairList, index: number): void {
    commit(
      list === 'allowed'
        ? { ...doc, pairs: { ...doc.pairs, allowed: doc.pairs.allowed.filter((_, at) => at !== index) } }
        : {
            ...doc,
            pairs: { ...doc.pairs, forbidden: doc.pairs.forbidden.filter((_, at) => at !== index) },
          },
    );
  }

  function readingShell(
    list: PairList,
    reading: PairReading,
    key: string,
    foreground: string,
    head: ReactNode,
  ) {
    return (
      <li className="brand-color__pair" key={key} data-color-pair={list} data-color-pair-state={reading.state}>
        {head}

        {reading.unknownRoles.length > 0 && (
          <span className="brand-color__pairNote">
            {t('brand.color.pairUnknown', { roles: reading.unknownRoles.join('、') })}
          </span>
        )}

        {reading.missing.length > 0 && (
          <span className="brand-color__pairNote">
            {t('brand.color.pairNoValue', { roles: reading.missing.join('、') })}
          </span>
        )}

        {reading.ratio !== null && (
          <span className="brand-color__ratio" data-color-ratio={reading.ratio.toFixed(2)}>
            <span className="brand-color__ratioValue">
              {t('brand.color.ratio', { ratio: reading.ratio.toFixed(2) })}
            </span>
            <span className="brand-color__check" data-color-floor={String(reading.floor)}>
              {t('brand.color.floorLabel', { floor: reading.floor })}{' '}
              {reading.state === 'pass' ? t('brand.color.pass') : t('brand.color.fail')}
            </span>
          </span>
        )}

        {reading.state === 'fail' && (
          <span className="brand-color__alt" data-color-alt data-color-alt-hex={reading.alternative?.hex ?? ''}>
            {reading.alternative === null ? (
              <span className="brand-color__pairNote">{t('brand.color.altNone')}</span>
            ) : (
              <>
                <span className="brand-color__altText">
                  {t('brand.color.alt')}：{alternativeLine(reading.alternative, foreground)}
                </span>
                <span className="brand-color__altRatio" data-color-alt-ratio={reading.alternative.ratio.toFixed(2)}>
                  {t('brand.color.altRatio', { ratio: reading.alternative.ratio.toFixed(2) })}
                </span>

                {canEdit && (
                  <button
                    type="button"
                    className="brand-page__action"
                    data-color-alt-apply={foreground}
                    onClick={() => {
                      commit(patchRole(doc, foreground, { hex: reading.alternative?.hex ?? '' }));
                    }}
                  >
                    {t('brand.color.altApply')}
                  </button>
                )}
              </>
            )}
          </span>
        )}
      </li>
    );
  }

  return (
    <div className="brand-color" data-color-doc>
      <section className="brand-color__section" data-color-stance>
        <h3 className="brand-page__versionsTitle">{t('brand.color.stance')}</h3>

        {doc.stance.trim() === '' ? (
          <p className="design-note" data-color-stance-missing>
            {t('brand.color.stanceMissing')}
          </p>
        ) : (
          <p className="brand-color__stanceText">{doc.stance}</p>
        )}

        <p className="design-field__hint">{t('brand.color.stanceFrom')}</p>
      </section>

      <p className="brand-color__missing" data-color-missing>
        {missing.length === 0
          ? t('brand.color.allPresent')
          : t('brand.color.missingLine', { roles: missing.join('、') })}
      </p>

      {missing.length > 0 && (
        <p className="design-note" data-color-must-have>
          {t('brand.color.missingMustHave', { roles: MUST_HAVE_ROLES.join('、') })}
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
              const value = roleEntry(doc, role.key);
              const isMissing = value.hex === '';
              const mustHave = MUST_HAVE_ROLES.includes(role.key);

              return (
                <div
                  className="brand-color__row"
                  key={role.key}
                  data-color-role={role.key}
                  data-missing={isMissing && mustHave ? 'true' : 'false'}
                >
                  <div className="brand-color__roleHead">
                    <span
                      className={`brand-color__swatch${isHex(value.hex) ? '' : ' brand-color__swatch--empty'}`}
                      style={swatchStyle(value.hex)}
                      data-color-swatch={role.key}
                      aria-hidden="true"
                    />
                    <code className="brand-color__name">{role.key}</code>

                    {isMissing && mustHave && (
                      <span className="brand-color__badge" data-color-badge="missing">
                        {t('brand.color.missing')}
                      </span>
                    )}

                    {isMissing && !mustHave && (
                      <span
                        className="brand-color__badge brand-color__badge--quiet"
                        data-color-badge="undecided"
                      >
                        {t('brand.color.undecided')}
                      </span>
                    )}
                  </div>

                  <label className="brand-color__field">
                    <span className="brand-color__fieldLabel">{t('brand.color.name')}</span>
                    <input
                      className="design-input"
                      data-color-name={role.key}
                      value={value.name}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.color.namePlaceholder')}
                      onChange={(event) => {
                        setRole(role.key, 'name', event.target.value);
                      }}
                    />
                  </label>

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
                        setRole(role.key, 'hex', event.target.value);
                      }}
                      onBlur={() => {
                        const normalized = normalizeHexInput(value.hex);

                        if (normalized !== null && normalized !== value.hex) {
                          setRole(role.key, 'hex', normalized);
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
                        setRole(role.key, 'cmyk', event.target.value);
                      }}
                    />
                  </label>

                  <label className="brand-color__field">
                    <span className="brand-color__fieldLabel">{t('brand.color.dark')}</span>
                    <input
                      className="design-input"
                      data-color-dark={role.key}
                      value={value.dark}
                      readOnly={!canEdit}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={t('brand.color.darkPlaceholder')}
                      onChange={(event) => {
                        setRole(role.key, 'dark', event.target.value);
                      }}
                      onBlur={() => {
                        const normalized = normalizeHexInput(value.dark);

                        if (normalized !== null && normalized !== value.dark) {
                          setRole(role.key, 'dark', normalized);
                        }
                      }}
                    />
                  </label>

                  <label className="brand-color__field">
                    <span className="brand-color__fieldLabel">{t('brand.color.usage')}</span>
                    <input
                      className="design-input"
                      data-color-usage={role.key}
                      value={value.usage}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.color.usagePlaceholder')}
                      onChange={(event) => {
                        setRole(role.key, 'usage', event.target.value);
                      }}
                    />
                  </label>

                  <label className="brand-color__field brand-color__field--wide">
                    <span className="brand-color__fieldLabel">{t('brand.color.reason')}</span>
                    <input
                      className="design-input"
                      data-color-reason={role.key}
                      value={value.reason}
                      readOnly={!canEdit}
                      autoComplete="off"
                      placeholder={t('brand.color.reasonPlaceholder')}
                      onChange={(event) => {
                        setRole(role.key, 'reason', event.target.value);
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        ))}

        <p className="design-field__hint">{t('brand.color.cmykHint')}</p>

        {undecided.length > 0 && (
          <p className="design-field__hint" data-color-undecided>
            {t('brand.color.undecidedLine', { roles: undecided.join('、') })}
          </p>
        )}
      </section>

      <section className="brand-color__section" data-color-order>
        <h3 className="brand-page__versionsTitle">{t('brand.color.order')}</h3>
        <p className="design-field__hint">{t('brand.color.orderHint')}</p>

        <label className="brand-color__field brand-color__field--wide">
          <span className="brand-color__fieldLabel">{t('brand.color.orderText')}</span>
          <input
            className="design-input"
            data-color-order-text
            value={doc.order.text}
            readOnly={!canEdit}
            autoComplete="off"
            placeholder={t('brand.color.orderPlaceholder')}
            onChange={(event) => {
              commit({ ...doc, order: { ...doc.order, text: event.target.value } });
            }}
          />
        </label>

        <label className="brand-color__field brand-color__field--wide">
          <span className="brand-color__fieldLabel">{t('brand.color.reason')}</span>
          <input
            className="design-input"
            data-color-order-reason
            value={doc.order.reason}
            readOnly={!canEdit}
            autoComplete="off"
            placeholder={t('brand.color.orderReasonPlaceholder')}
            onChange={(event) => {
              commit({ ...doc, order: { ...doc.order, reason: event.target.value } });
            }}
          />
        </label>
      </section>

      <section className="brand-color__section" data-color-ratios>
        <h3 className="brand-page__versionsTitle">{t('brand.color.ratios')}</h3>
        <p className="design-field__hint">{t('brand.color.ratiosHint')}</p>

        {doc.ratios.length === 0 ? (
          <p className="design-empty">{t('brand.color.ratioEmpty')}</p>
        ) : (
          <ul className="brand-color__rampList">
            {doc.ratios.map((item) => (
              <li className="brand-color__ramp" key={item.role} data-color-ratio-role={item.role}>
                <code className="brand-color__name">{item.role}</code>
                <span data-color-ratio-percent={item.role}>{item.percent}%</span>
                <span className="brand-color__pairNote">{item.reason}</span>

                {canEdit && (
                  <button
                    type="button"
                    className="brand-color__iconButton"
                    data-color-ratio-remove={item.role}
                    aria-label={`${t('brand.color.remove')} ${item.role}`}
                    onClick={() => {
                      commit({ ...doc, ratios: doc.ratios.filter((other) => other.role !== item.role) });
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="brand-color__pairNote" data-color-ratio-total={total === null ? '' : String(total)}>
          {total === null ? '' : t('brand.color.ratioTotal', { total })}
          {total !== null && total !== 100 ? ` ${t('brand.color.ratioNotHundred')}` : ''}
        </p>

        {canEdit && (
          <div className="brand-color__adder" data-color-ratio-adder>
            <select
              className="design-input"
              data-color-ratio-pick
              value={ratioDraft.role}
              onChange={(event) => {
                setRatioDraft({ ...ratioDraft, role: event.target.value });
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
              data-color-ratio-input
              value={ratioDraft.percent}
              placeholder={t('brand.color.ratioPercent')}
              aria-label={t('brand.color.ratioPercent')}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => {
                setRatioDraft({ ...ratioDraft, percent: event.target.value });
              }}
            />

            <input
              className="design-input"
              data-color-ratio-reason
              value={ratioDraft.reason}
              placeholder={t('brand.color.reason')}
              aria-label={t('brand.color.reason')}
              autoComplete="off"
              onChange={(event) => {
                setRatioDraft({ ...ratioDraft, reason: event.target.value });
              }}
            />

            <button type="button" className="brand-page__action" data-color-ratio-add onClick={addRatio}>
              {t('brand.color.ratioAdd')}
            </button>
          </div>
        )}

        {ratioError !== null && (
          <p className="design-note design-note--error" role="alert" data-color-ratio-error>
            {ratioError}
          </p>
        )}
      </section>

      <section className="brand-color__section" data-color-section="allowed">
        <h3 className="brand-page__versionsTitle">{t('brand.color.allowed')}</h3>
        <p className="design-field__hint">{t('brand.color.pairsHint')}</p>

        {doc.pairs.allowed.length === 0 ? (
          <p className="design-empty">{t('brand.color.pairEmpty')}</p>
        ) : (
          <ul className="brand-color__pairList">
            {doc.pairs.allowed.map((pair, index) => {
              const reading = readPair(doc, pair);
              const text = `${pair.fg} on ${pair.bg}`;

              return readingShell(
                'allowed',
                reading,
                `allowed-${text}`,
                pair.fg,
                <>
                  <code className="brand-color__pairText" data-color-pair-text={text}>
                    {text}
                  </code>

                  <label className="brand-color__field">
                    <span className="brand-color__fieldLabel">{t('brand.color.use')}</span>
                    <select
                      className="design-input"
                      data-color-pair-use={text}
                      value={pair.use}
                      disabled={!canEdit}
                      onChange={(event) => {
                        const use = event.target.value === 'large' ? ('large' as const) : ('body' as const);

                        commit({
                          ...doc,
                          pairs: {
                            ...doc.pairs,
                            allowed: doc.pairs.allowed.map((item, at) =>
                              at === index ? { ...item, use } : item,
                            ),
                          },
                        });
                      }}
                    >
                      <option value="body">{t('brand.color.use.body')}</option>
                      <option value="large">{t('brand.color.use.large')}</option>
                    </select>
                  </label>

                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action"
                      data-color-pair-remove={`allowed:${text}`}
                      onClick={() => {
                        removePair('allowed', index);
                      }}
                    >
                      {t('brand.color.pairRemove')}
                    </button>
                  )}
                </>,
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="brand-color__adder" data-color-pair-adder="allowed">
            <input
              className="design-input"
              data-color-pair-input="allowed"
              value={pairDraft.allowed}
              placeholder={t('brand.color.pairPlaceholder')}
              aria-label={t('brand.color.pairPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setPairDraft({ ...pairDraft, allowed: event.target.value });
              }}
            />

            <button
              type="button"
              className="brand-page__action"
              data-color-pair-add="allowed"
              onClick={() => {
                addPair('allowed');
              }}
            >
              {t('brand.color.pairAdd')}
            </button>
          </div>
        )}

        {pairError.allowed !== null && (
          <p className="design-note design-note--error" role="alert" data-color-pair-error="allowed">
            {pairError.allowed}
          </p>
        )}
      </section>

      <section className="brand-color__section" data-color-section="forbidden">
        <h3 className="brand-page__versionsTitle">{t('brand.color.forbidden')}</h3>
        <p className="design-field__hint">{t('brand.color.forbiddenHint')}</p>

        {doc.pairs.forbidden.length === 0 ? (
          <p className="design-empty">{t('brand.color.pairEmpty')}</p>
        ) : (
          <ul className="brand-color__pairList">
            {doc.pairs.forbidden.map((pair, index) => {
              const reading = readPair(doc, pair);
              const text = `${pair.fg} on ${pair.bg}`;

              return readingShell(
                'forbidden',
                reading,
                `forbidden-${text}`,
                pair.fg,
                <>
                  <code className="brand-color__pairText" data-color-pair-text={text}>
                    {text}
                  </code>

                  <input
                    className="design-input"
                    data-color-pair-reason={text}
                    value={pair.reason}
                    readOnly={!canEdit}
                    autoComplete="off"
                    placeholder={t('brand.color.reason')}
                    aria-label={t('brand.color.reason')}
                    onChange={(event) => {
                      commit({
                        ...doc,
                        pairs: {
                          ...doc.pairs,
                          forbidden: doc.pairs.forbidden.map((item, at) =>
                            at === index ? { ...item, reason: event.target.value } : item,
                          ),
                        },
                      });
                    }}
                  />

                  {canEdit && (
                    <button
                      type="button"
                      className="brand-page__action"
                      data-color-pair-remove={`forbidden:${text}`}
                      onClick={() => {
                        removePair('forbidden', index);
                      }}
                    >
                      {t('brand.color.pairRemove')}
                    </button>
                  )}
                </>,
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="brand-color__adder" data-color-pair-adder="forbidden">
            <input
              className="design-input"
              data-color-pair-input="forbidden"
              value={pairDraft.forbidden}
              placeholder={t('brand.color.pairPlaceholder')}
              aria-label={t('brand.color.pairPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setPairDraft({ ...pairDraft, forbidden: event.target.value });
              }}
            />

            <button
              type="button"
              className="brand-page__action"
              data-color-pair-add="forbidden"
              onClick={() => {
                addPair('forbidden');
              }}
            >
              {t('brand.color.pairAdd')}
            </button>
          </div>
        )}

        {pairError.forbidden !== null && (
          <p className="design-note design-note--error" role="alert" data-color-pair-error="forbidden">
            {pairError.forbidden}
          </p>
        )}
      </section>

      <section className="brand-color__section" data-color-tints>
        <h3 className="brand-page__versionsTitle">{t('brand.color.tints')}</h3>
        <p className="design-field__hint">{t('brand.color.tintsHint')}</p>

        {doc.tints.length === 0 ? (
          <p className="design-empty">{t('brand.color.tintEmpty')}</p>
        ) : (
          <ul className="brand-color__rampList">
            {doc.tints.map((tint) => (
              <li className="brand-color__ramp" key={tint.name} data-color-tint={tint.name}>
                <span
                  className="brand-color__swatch brand-color__swatch--small"
                  style={swatchStyle(tint.hex)}
                  aria-hidden="true"
                />
                <code className="brand-color__name">{tint.name}</code>
                <code>{tint.hex}</code>
                <span className="brand-color__pairNote">{tint.reason}</span>

                {canEdit && (
                  <button
                    type="button"
                    className="brand-color__iconButton"
                    data-color-tint-remove={tint.name}
                    aria-label={`${t('brand.color.remove')} ${tint.name}`}
                    onClick={() => {
                      commit({ ...doc, tints: doc.tints.filter((other) => other.name !== tint.name) });
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
          <div className="brand-color__adder" data-color-tint-adder>
            <input
              className="design-input"
              data-color-tint-name
              value={tintDraft.name}
              placeholder={t('brand.color.tintName')}
              aria-label={t('brand.color.tintName')}
              autoComplete="off"
              onChange={(event) => {
                setTintDraft({ ...tintDraft, name: event.target.value });
              }}
            />

            <input
              className="design-input"
              data-color-tint-hex
              value={tintDraft.hex}
              placeholder={t('brand.color.hexPlaceholder')}
              aria-label={t('brand.color.hex')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setTintDraft({ ...tintDraft, hex: event.target.value });
              }}
            />

            <input
              className="design-input"
              data-color-tint-reason
              value={tintDraft.reason}
              placeholder={t('brand.color.reason')}
              aria-label={t('brand.color.reason')}
              autoComplete="off"
              onChange={(event) => {
                setTintDraft({ ...tintDraft, reason: event.target.value });
              }}
            />

            <button type="button" className="brand-page__action" data-color-tint-add onClick={addTint}>
              {t('brand.color.tintAdd')}
            </button>
          </div>
        )}

        {tintError !== null && (
          <p className="design-note design-note--error" role="alert" data-color-tint-error>
            {tintError}
          </p>
        )}
      </section>

      <section className="brand-color__section" data-color-floors>
        <h3 className="brand-page__versionsTitle">{t('brand.color.floor')}</h3>
        <p className="design-field__hint">{t('brand.color.floorHint')}</p>

        <div className="brand-color__adder">
          <label className="brand-color__field">
            <span className="brand-color__fieldLabel">{t('brand.color.floorBody')}</span>
            <input
              className="design-input"
              data-color-floor-body
              value={String(doc.contrast_floor)}
              readOnly={!canEdit}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => {
                const floor = Number(event.target.value);

                if (Number.isFinite(floor) && floor > 0) {
                  commit({ ...doc, contrast_floor: floor });
                }
              }}
            />
          </label>

          <label className="brand-color__field">
            <span className="brand-color__fieldLabel">{t('brand.color.floorLarge')}</span>
            <input
              className="design-input"
              data-color-floor-large
              value={String(doc.large_floor)}
              readOnly={!canEdit}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => {
                const floor = Number(event.target.value);

                if (Number.isFinite(floor) && floor > 0) {
                  commit({ ...doc, large_floor: floor });
                }
              }}
            />
          </label>
        </div>
      </section>

      <p className="design-field__hint" data-color-screen-print>
        {t('brand.color.screenPrint')}
      </p>
    </div>
  );
}
