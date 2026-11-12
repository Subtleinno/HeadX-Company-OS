import { useState } from 'react';
import { t } from '@company-os/i18n';
import {
  ALIGNS,
  MAX_FAMILIES,
  SCRIPTS,
  TEXT_COLOR_ROLES,
  TYPE_ROLES,
  WEIGHTS,
  emptyRole,
  emptyTypeDoc,
  familyUsable,
  gapCount,
  hasAnyValue,
  missingScripts,
  parseTypeDoc,
  roleGaps,
  serializeTypeDoc,
  sizeHasUnit,
  typeGaps,
  type Align,
  type FontFamily,
  type RoleSpec,
  type Script,
  type TypeDoc,
  type TypeRoleKey,
} from './brandType';
import { isColorRole } from './brandColors';
import { useGapCount } from './useGapCount';

/**
 * 字體頁的編輯介面（issue #38）。
 *
 * 這一頁不是「揀一個好看的字」：它是四個層級與最多兩個家族之間的約束表。
 * 理由寫在 `brandType.ts` 開頭 —— 一句「主標用思源黑體」沒有「哪個層級用
 * 哪個家族、幾多 px、行距幾多」的答案，畫面就只能把那句印出來。
 *
 * 儲存仍然走 #33 的版本鏈：這裡只把表變成字串交給 `BrandPageScreen` 的
 * draft，按「儲存」才真的新增一版。所以這一頁沒有自己的儲存鍵。
 *
 * 四個誠實位：
 *   1. 缺授權、缺中文，標成缺 —— 不靜靜用系統預設字，也不用備用字頂上。
 *   2. 尺寸只寫數字（`18`）就是缺：它不是 18 像素。
 *   3. 文字顏色只可以揀色彩頁的角色名，沒有第二個放色值的地方。
 *   4. 現行內容不是字體表就講讀不到，不畫四行假的層級。
 */

type BrandTypeEditorProps = {
  content: string;
  canEdit: boolean;
  onChange: (next: string) => void;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

function write(doc: TypeDoc): string {
  return hasAnyValue(doc) ? serializeTypeDoc(doc) : '';
}

function scriptLabel(script: Script): string {
  return script === 'latin' ? t('brand.type.scriptLatin') : t('brand.type.scriptChinese');
}

function alignLabel(value: Align): string {
  if (value === 'left') {
    return t('brand.type.alignLeft');
  }

  return value === 'justify' ? t('brand.type.alignJustify') : t('brand.type.alignCenter');
}

/** 下一個未用的家族 id。用細號而不是時間戳：同一份內容重讀幾次都一樣。 */
function nextFamilyId(doc: TypeDoc): string {
  let index = 1;

  while (doc.families.some((family) => family.id === `f-${index}`)) {
    index += 1;
  }

  return `f-${index}`;
}

export function BrandTypeEditor({ content, canEdit, onChange, onGapCount }: BrandTypeEditorProps) {
  const [misuseDraft, setMisuseDraft] = useState('');

  const parsed = parseTypeDoc(content);

  // 在 early return 之前上報：內容壞了要報 null（面板閉嘴），不是報 0。
  useGapCount(
    parsed.kind === 'invalid'
      ? null
      : gapCount(typeGaps(parsed.kind === 'ok' ? parsed.doc : emptyTypeDoc())),
    onGapCount,
  );

  if (parsed.kind === 'invalid') {
    return (
      <div className="brand-type brand-type--invalid" data-type-invalid>
        <p className="design-note design-note--error">{t('brand.type.invalid')}</p>

        {canEdit && (
          <div className="design-form__actions">
            <button
              type="button"
              className="design-btn"
              data-type-reset
              onClick={() => {
                onChange(write(emptyTypeDoc()));
              }}
            >
              {t('brand.type.invalidReset')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const doc = parsed.kind === 'ok' ? parsed.doc : emptyTypeDoc();
  const gaps = typeGaps(doc);
  const missing = missingScripts(doc);

  function commit(next: TypeDoc): void {
    onChange(write(next));
  }

  function setFamily(id: string, patch: Partial<FontFamily>): void {
    commit({
      ...doc,
      families: doc.families.map((family) => (family.id === id ? { ...family, ...patch } : family)),
    });
  }

  function addFamily(): void {
    if (doc.families.length >= MAX_FAMILIES) {
      return;
    }

    // 補一個未用過的腳本：兩個家族最常見就是中英各一。
    const usedScripts = new Set(doc.families.map((family) => family.script));
    const script = SCRIPTS.find((item) => !usedScripts.has(item)) ?? 'latin';

    commit({
      ...doc,
      families: [
        ...doc.families,
        { id: nextFamilyId(doc), script, name: '', licence: '', webEmbeddable: false },
      ],
    });
  }

  function removeFamily(id: string): void {
    const roles = { ...doc.roles };

    for (const key of TYPE_ROLES) {
      if (roles[key].familyId === id) {
        roles[key] = { ...roles[key], familyId: '' };
      }
    }

    commit({ ...doc, families: doc.families.filter((family) => family.id !== id), roles });
  }

  function setRole(key: TypeRoleKey, patch: Partial<RoleSpec>): void {
    commit({ ...doc, roles: { ...doc.roles, [key]: { ...doc.roles[key], ...patch } } });
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

  function removeMisuse(value: string): void {
    commit({ ...doc, misuse: doc.misuse.filter((item) => item !== value) });
  }

  const summary: string[] = [];

  if (gaps.scripts.length > 0) {
    summary.push(
      t('brand.type.gapScripts', {
        scripts: gaps.scripts.map(scriptLabel).join('、'),
      }),
    );
  }

  if (gaps.roles.length > 0) {
    summary.push(t('brand.type.gapRoles', { roles: gaps.roles.join('、') }));
  }

  if (gaps.pairing) {
    summary.push(t('brand.type.gapPairing'));
  }

  if (gaps.measure) {
    summary.push(t('brand.type.gapMeasure'));
  }

  if (gaps.align) {
    summary.push(t('brand.type.gapAlign'));
  }

  return (
    <div className="brand-type" data-type-doc>
      <p className="design-field__hint" data-type-color-note>
        {t('brand.type.colorNote')}
      </p>

      <p
        className={`brand-type__missing${gapCount(gaps) === 0 ? '' : ' brand-type__missing--gap'}`}
        data-type-missing
      >
        {gapCount(gaps) === 0
          ? t('brand.type.allPresent')
          : t('brand.type.missingLine', { items: summary.join('、') })}
      </p>

      <section className="brand-type__section" data-type-families>
        <h3 className="brand-page__versionsTitle">{t('brand.type.families')}</h3>
        <p className="design-field__hint">{t('brand.type.familiesHint')}</p>

        {doc.families.length === 0 && (
          <p className="design-empty">{t('brand.type.familyEmpty')}</p>
        )}

        {doc.families.map((family) => {
          const usable = familyUsable(family);
          const reason = !family.name.trim()
            ? t('brand.type.familyMissingName')
            : !family.licence.trim()
              ? t('brand.type.familyMissingLicence')
              : !family.webEmbeddable
                ? t('brand.type.familyMissingEmbed')
                : '';

          return (
            <div
              className="brand-type__family"
              key={family.id}
              data-type-family={family.id}
              data-missing={usable ? 'false' : 'true'}
            >
              <div className="brand-type__familyHead">
                <code className="brand-type__key">{family.script}</code>
                <span className="brand-type__familyName">
                  {family.name === '' ? t('brand.type.familyUnnamed') : family.name}
                </span>

                {!usable && (
                  <span className="brand-type__badge" data-type-family-badge>
                    {reason}
                  </span>
                )}

                {canEdit && (
                  <button
                    type="button"
                    className="brand-page__action brand-page__action--danger"
                    data-type-family-remove={family.id}
                    onClick={() => {
                      removeFamily(family.id);
                    }}
                  >
                    {t('brand.type.familyRemove')}
                  </button>
                )}
              </div>

              <div className="brand-type__familyFields">
                <label className="brand-type__field">
                  <span className="brand-type__fieldLabel">{t('brand.type.script')}</span>
                  <select
                    className="design-input"
                    data-type-family-script={family.id}
                    value={family.script}
                    disabled={!canEdit}
                    onChange={(event) => {
                      setFamily(family.id, {
                        script: event.target.value === 'chinese' ? 'chinese' : 'latin',
                      });
                    }}
                  >
                    {SCRIPTS.map((script) => (
                      <option key={script} value={script}>
                        {scriptLabel(script)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="brand-type__field brand-type__field--wide">
                  <span className="brand-type__fieldLabel">{t('brand.type.familyNameField')}</span>
                  <input
                    className="design-input"
                    data-type-family-name={family.id}
                    value={family.name}
                    readOnly={!canEdit}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('brand.type.familyNamePlaceholder')}
                    onChange={(event) => {
                      setFamily(family.id, { name: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-type__field brand-type__field--wide">
                  <span className="brand-type__fieldLabel">{t('brand.type.familyLicence')}</span>
                  <input
                    className="design-input"
                    data-type-family-licence={family.id}
                    value={family.licence}
                    readOnly={!canEdit}
                    autoComplete="off"
                    placeholder={t('brand.type.familyLicencePlaceholder')}
                    onChange={(event) => {
                      setFamily(family.id, { licence: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-type__check">
                  <input
                    type="checkbox"
                    data-type-family-embed={family.id}
                    checked={family.webEmbeddable}
                    disabled={!canEdit}
                    onChange={(event) => {
                      setFamily(family.id, { webEmbeddable: event.target.checked });
                    }}
                  />
                  <span>{t('brand.type.familyEmbed')}</span>
                </label>
              </div>
            </div>
          );
        })}

        {doc.families.length < MAX_FAMILIES ? (
          canEdit && (
            <div className="brand-type__adder">
              <button
                type="button"
                className="brand-page__action"
                data-type-family-add
                onClick={addFamily}
              >
                {t('brand.type.familyAdd')}
              </button>
            </div>
          )
        ) : (
          <p className="design-field__hint" data-type-family-limit>
            {t('brand.type.familyLimit')}
          </p>
        )}

        {missing.length > 0 && (
          <p className="design-note design-note--error" data-type-family-gap>
            {t('brand.type.familyGap', {
              scripts: missing.map(scriptLabel).join('、'),
            })}
          </p>
        )}
      </section>

      <section className="brand-type__section" data-type-roles>
        <h3 className="brand-page__versionsTitle">{t('brand.type.roles')}</h3>
        <p className="design-field__hint">{t('brand.type.rolesHint')}</p>
        <p className="design-field__hint">{t('brand.type.leadingHint')}</p>

        {TYPE_ROLES.map((key) => {
          const role = doc.roles[key] ?? emptyRole();
          const roleGapList = roleGaps(doc, key);
          const missingUnit = !sizeHasUnit(role.size) && role.size.trim() !== '';
          const missingMinUnit = !sizeHasUnit(role.minSize) && role.minSize.trim() !== '';

          return (
            <div
              className="brand-type__row"
              key={key}
              data-type-role={key}
              data-missing={roleGapList.length === 0 ? 'false' : 'true'}
            >
              <div className="brand-type__roleHead">
                <code className="brand-type__key">{key}</code>

                {roleGapList.length > 0 && (
                  <span className="brand-type__badge">{t('brand.type.missing')}</span>
                )}
              </div>

              <label className="brand-type__field brand-type__field--wide">
                <span className="brand-type__fieldLabel">{t('brand.type.roleFamily')}</span>
                <select
                  className="design-input"
                  data-type-family-select={key}
                  value={role.familyId}
                  disabled={!canEdit}
                  onChange={(event) => {
                    setRole(key, { familyId: event.target.value });
                  }}
                >
                  <option value="">{t('brand.type.roleUnassigned')}</option>
                  {doc.families.map((family) => (
                    <option key={family.id} value={family.id}>
                      {`${scriptLabel(family.script)}・${family.name === '' ? t('brand.type.familyUnnamed') : family.name}${familyUsable(family) ? '' : `（${t('brand.type.missing')}）`}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleSize')}</span>
                <input
                  className="design-input"
                  data-type-size={key}
                  value={role.size}
                  readOnly={!canEdit}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="56px"
                  onChange={(event) => {
                    setRole(key, { size: event.target.value });
                  }}
                />
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleLeading')}</span>
                <input
                  className="design-input"
                  data-type-leading={key}
                  value={role.leading}
                  readOnly={!canEdit}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="64px"
                  onChange={(event) => {
                    setRole(key, { leading: event.target.value });
                  }}
                />
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleWeight')}</span>
                <select
                  className="design-input"
                  data-type-weight={key}
                  value={role.weight}
                  disabled={!canEdit}
                  onChange={(event) => {
                    setRole(key, { weight: event.target.value });
                  }}
                >
                  <option value="">—</option>
                  {WEIGHTS.map((weight) => (
                    <option key={weight} value={weight}>
                      {weight}
                    </option>
                  ))}
                </select>
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleMinSize')}</span>
                <input
                  className="design-input"
                  data-type-min-size={key}
                  value={role.minSize}
                  readOnly={!canEdit}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="14px"
                  onChange={(event) => {
                    setRole(key, { minSize: event.target.value });
                  }}
                />
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleColor')}</span>
                <select
                  className="design-input"
                  data-type-color={key}
                  value={isColorRole(role.colorRole) ? role.colorRole : ''}
                  disabled={!canEdit}
                  onChange={(event) => {
                    setRole(key, { colorRole: event.target.value });
                  }}
                >
                  <option value="">—</option>
                  {TEXT_COLOR_ROLES.map((colorRole) => (
                    <option key={colorRole} value={colorRole}>
                      {colorRole}
                    </option>
                  ))}
                </select>
              </label>

              {(missingUnit || missingMinUnit) && (
                <p className="design-note design-note--error" data-type-unit-error={key}>
                  {t('brand.type.unitError')}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section className="brand-type__section" data-type-pairing-section>
        <h3 className="brand-page__versionsTitle">{t('brand.type.pairing')}</h3>
        <p className="design-field__hint">{t('brand.type.pairingHint')}</p>

        <textarea
          className="brand-page__textarea brand-type__textarea"
          data-type-pairing
          value={doc.pairing}
          readOnly={!canEdit}
          rows={3}
          onChange={(event) => {
            commit({ ...doc, pairing: event.target.value });
          }}
        />
      </section>

      <section className="brand-type__section" data-type-fallbacks>
        <h3 className="brand-page__versionsTitle">{t('brand.type.fallbacks')}</h3>
        <p className="design-field__hint">{t('brand.type.fallbackHint')}</p>

        <div className="brand-type__familyFields">
          <label className="brand-type__field brand-type__field--wide">
            <span className="brand-type__fieldLabel">{t('brand.type.fallbackLatin')}</span>
            <input
              className="design-input"
              data-type-fallback-latin
              value={doc.fallbackLatin}
              readOnly={!canEdit}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                commit({ ...doc, fallbackLatin: event.target.value });
              }}
            />
          </label>

          <label className="brand-type__field brand-type__field--wide">
            <span className="brand-type__fieldLabel">{t('brand.type.fallbackChinese')}</span>
            <input
              className="design-input"
              data-type-fallback-chinese
              value={doc.fallbackChinese}
              readOnly={!canEdit}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                commit({ ...doc, fallbackChinese: event.target.value });
              }}
            />
          </label>
        </div>
      </section>

      <section className="brand-type__section" data-type-measure-section>
        <h3 className="brand-page__versionsTitle">{t('brand.type.measureTitle')}</h3>

        <div className="brand-type__familyFields">
          <label className="brand-type__field brand-type__field--wide">
            <span className="brand-type__fieldLabel">{t('brand.type.measure')}</span>
            <input
              className="design-input"
              data-type-measure
              value={doc.measure}
              readOnly={!canEdit}
              autoComplete="off"
              placeholder={t('brand.type.measurePlaceholder')}
              onChange={(event) => {
                commit({ ...doc, measure: event.target.value });
              }}
            />
          </label>

          <label className="brand-type__field">
            <span className="brand-type__fieldLabel">{t('brand.type.align')}</span>
            <select
              className="design-input"
              data-type-align
              value={doc.align}
              disabled={!canEdit}
              onChange={(event) => {
                const value = ALIGNS.find((item) => item === event.target.value) ?? '';
                commit({ ...doc, align: value });
              }}
            >
              <option value="">—</option>
              {ALIGNS.map((item) => (
                <option key={item} value={item}>
                  {alignLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="brand-type__section" data-type-misuse-section>
        <h3 className="brand-page__versionsTitle">{t('brand.type.misuse')}</h3>
        <p className="design-field__hint">{t('brand.type.misuseHint')}</p>

        {doc.misuse.length === 0 ? (
          <p className="design-empty">{t('brand.type.misuseEmpty')}</p>
        ) : (
          <ul className="brand-type__misuseList">
            {doc.misuse.map((item) => (
              <li className="brand-type__misuseItem" key={item} data-type-misuse-item={item}>
                <span>{item}</span>
                {canEdit && (
                  <button
                    type="button"
                    className="brand-color__iconButton"
                    data-type-misuse-remove={item}
                    aria-label={`${t('brand.type.misuseRemove')} ${item}`}
                    onClick={() => {
                      removeMisuse(item);
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
          <div className="brand-type__adder">
            <input
              className="design-input"
              data-type-misuse-input
              value={misuseDraft}
              autoComplete="off"
              placeholder={t('brand.type.misusePlaceholder')}
              onChange={(event) => {
                setMisuseDraft(event.target.value);
              }}
            />
            <button
              type="button"
              className="brand-page__action"
              data-type-misuse-add
              onClick={addMisuse}
            >
              {t('brand.type.misuseAdd')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
