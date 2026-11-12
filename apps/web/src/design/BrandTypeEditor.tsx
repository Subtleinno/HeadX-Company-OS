import { useState } from 'react';
import { t } from '@company-os/i18n';
import {
  MAX_FAMILIES,
  SCRIPTS,
  TYPE_ROLES,
  WEIGHTS,
  emptyTypeDoc,
  familyGaps,
  familyUsable,
  gapCount,
  hasAnyValue,
  missingScripts,
  nextFamilyId,
  parseTypeDoc,
  roleGaps,
  roleOf,
  serializeTypeDoc,
  setRole,
  typeGaps,
  type FamilyGap,
  type RoleGap,
  type Script,
  type TypeDoc,
} from './brandType';
import { COLOR_ROLES } from './brandColors';
import { useGapCount } from './useGapCount';

/**
 * 字體頁的編輯介面（issue #63，取代 #38）。
 *
 * 這一頁不是「揀一個好看的字」：它是四個層級與最多兩個家族之間的約束表。
 * 理由寫在 `brandType.ts` 開頭 —— 一句「主標用思源黑體」沒有「哪個層級用
 * 哪個家族、幾多 px、行距幾多」的答案，畫面就只能把那句印出來。
 *
 * 儲存仍然走 #33 的版本鏈：這裡只把表變成字串交給 `BrandPageScreen` 的
 * draft，按「儲存」才真的新增一版。所以這一頁沒有自己的儲存鍵。
 *
 * 四個誠實位：
 *   1. 缺授權、缺可嵌入檔，標成缺 —— 不靜靜用系統預設字，也不用備用字頂上。
 *   2. 字級只寫數字（`18`）就是缺：它不是 18 像素。要寫單位。
 *   3. 文字色只可以揀色彩頁的角色名，這一頁沒有第二個放色值的地方。
 *   4. 現行內容不是字體表就講讀不到，不畫四行假的層級。
 */

type BrandTypeEditorProps = {
  /** 現行版本的內容（JSON 字串，或者是舊形狀）。 */
  content: string;
  canEdit: boolean;
  /** 交回去的是**內容字串**；全空的時候是空字串（等於未有內容）。 */
  onChange: (next: string) => void;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

/** 一份表變成內容字串。全空就交空字串，讓「未有內容」的判斷繼續有效。 */
function write(doc: TypeDoc): string {
  return hasAnyValue(doc) ? serializeTypeDoc(doc) : '';
}

function scriptLabel(script: Script): string {
  return script === 'latin' ? t('brand.type.scriptLatin') : t('brand.type.scriptChinese');
}

function familyGapLabel(gap: FamilyGap): string {
  if (gap === 'name') {
    return t('brand.type.familyGapName');
  }

  return gap === 'licence' ? t('brand.type.familyGapLicence') : t('brand.type.familyGapFile');
}

function roleGapLabel(gap: RoleGap): string {
  switch (gap) {
    case 'family':
      return t('brand.type.gapFamily');
    case 'size':
      return t('brand.type.gapSize');
    case 'leading':
      return t('brand.type.gapLeading');
    case 'weight':
      return t('brand.type.gapWeight');
    case 'min':
      return t('brand.type.gapMin');
    default:
      return t('brand.type.gapColor');
  }
}

export function BrandTypeEditor({ content, canEdit, onChange, onGapCount }: BrandTypeEditorProps) {
  const [printDraft, setPrintDraft] = useState({ item: '', spec: '' });
  const [printError, setPrintError] = useState<string | null>(null);
  const [misuseDraft, setMisuseDraft] = useState({ example: '', reason: '' });
  const [misuseError, setMisuseError] = useState<string | null>(null);

  const parsed = parseTypeDoc(content);

  // 上報缺口要在 early return 之前：hook 的數目不可以因為內容壞了就變。
  // 解析不到就報 null —— 面板會閉嘴，而不是講「沒有缺口」。
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

  function patchFamily(id: string, patch: Partial<TypeDoc['families'][number]>): void {
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
    const used = new Set(doc.families.map((family) => family.script));
    const script = SCRIPTS.find((item) => !used.has(item)) ?? 'latin';

    commit({
      ...doc,
      families: [
        ...doc.families,
        {
          id: nextFamilyId(doc),
          name: '',
          script,
          license_web: '',
          license_print: '',
          license_app: '',
          license_desktop: '',
          file_ref: '',
        },
      ],
    });
  }

  function removeFamily(id: string): void {
    // 刪走家族，指向它的層級一併清空 —— 否則層級會指著一個不存在的家族，
    // 畫面看起來有值，實際排不出字。
    let next: TypeDoc = { ...doc, families: doc.families.filter((family) => family.id !== id) };

    for (const key of TYPE_ROLES) {
      if (roleOf(next, key).family === id) {
        next = setRole(next, key, { family: '' });
      }
    }

    commit(next);
  }

  function addPrint(): void {
    const item = printDraft.item.trim();
    const spec = printDraft.spec.trim();

    if (item === '' || spec === '') {
      setPrintError(t('brand.type.printInvalid'));
      return;
    }

    // 同一項目寫兩次只會令人以為有兩個決定。
    const others = doc.print_matrix.filter((row) => row.item !== item);

    commit({ ...doc, print_matrix: [...others, { item, spec }] });
    setPrintDraft({ item: '', spec: '' });
    setPrintError(null);
  }

  function addMisuse(): void {
    const example = misuseDraft.example.trim();
    const reason = misuseDraft.reason.trim();

    if (example === '' || reason === '') {
      setMisuseError(t('brand.type.misuseInvalid'));
      return;
    }

    const others = doc.misuse.filter((row) => row.example !== example);

    commit({ ...doc, misuse: [...others, { example, reason }] });
    setMisuseDraft({ example: '', reason: '' });
    setMisuseError(null);
  }

  const summary: string[] = [];

  if (gaps.families.length > 0) {
    summary.push(t('brand.type.gapFamilies', { count: gaps.families.length }));
  }

  if (gaps.scripts.length > 0) {
    summary.push(t('brand.type.gapScripts', { scripts: gaps.scripts.map(scriptLabel).join('、') }));
  }

  if (gaps.roles.length > 0) {
    summary.push(t('brand.type.gapRoles', { roles: gaps.roles.join('、') }));
  }

  if (gaps.pairing) {
    summary.push(t('brand.type.gapPairing'));
  }

  if (gaps.philosophy) {
    summary.push(t('brand.type.gapPhilosophy'));
  }

  const total = gapCount(gaps);

  return (
    <div className="brand-type" data-type-doc>
      <section className="brand-type__section" data-type-stance>
        <h3 className="brand-page__versionsTitle">{t('brand.type.stance')}</h3>

        {doc.stance.trim() === '' ? (
          <p className="design-note" data-type-stance-missing>
            {t('brand.type.stanceMissing')}
          </p>
        ) : (
          <p className="brand-type__stanceText">{doc.stance}</p>
        )}

        <p className="design-field__hint">{t('brand.type.stanceFrom')}</p>
      </section>

      <p
        className={`brand-type__missing${total === 0 ? '' : ' brand-type__missing--gap'}`}
        data-type-missing={total}
      >
        {total === 0
          ? t('brand.type.allPresent')
          : t('brand.type.missingLine', { items: summary.join('、') })}
      </p>

      <section className="brand-type__section" data-type-philosophy>
        <h3 className="brand-page__versionsTitle">{t('brand.type.philosophy')}</h3>
        <p className="design-field__hint">{t('brand.type.philosophyHint')}</p>

        <textarea
          className="brand-page__textarea brand-type__textarea"
          data-type-philosophy-text
          value={doc.philosophy}
          readOnly={!canEdit}
          rows={2}
          placeholder={t('brand.type.philosophyPlaceholder')}
          onChange={(event) => {
            commit({ ...doc, philosophy: event.target.value });
          }}
        />
      </section>

      <section className="brand-type__section" data-type-families>
        <h3 className="brand-page__versionsTitle">{t('brand.type.families')}</h3>
        <p className="design-field__hint">{t('brand.type.familiesHint')}</p>

        {doc.families.length === 0 && <p className="design-empty">{t('brand.type.familyEmpty')}</p>}

        {doc.families.map((family) => {
          const familyGapList = familyGaps(family);

          return (
            <div
              className="brand-type__family"
              key={family.id}
              data-type-family={family.id}
              data-missing={familyGapList.length === 0 ? 'false' : 'true'}
            >
              <div className="brand-type__familyHead">
                <code className="brand-type__key">{family.script}</code>
                <span className="brand-type__familyName">
                  {family.name === '' ? t('brand.type.familyUnnamed') : family.name}
                </span>

                {familyGapList.length > 0 && (
                  <span className="brand-type__badge" data-type-family-badge={family.id}>
                    {familyGapList.map(familyGapLabel).join('、')}
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
                      patchFamily(family.id, { name: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-type__field">
                  <span className="brand-type__fieldLabel">{t('brand.type.script')}</span>
                  <select
                    className="design-input"
                    data-type-family-script={family.id}
                    value={family.script}
                    disabled={!canEdit}
                    onChange={(event) => {
                      patchFamily(family.id, {
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

                <label className="brand-type__field">
                  <span className="brand-type__fieldLabel">{t('brand.type.licenceWeb')}</span>
                  <input
                    className="design-input"
                    data-type-family-licence-web={family.id}
                    value={family.license_web}
                    readOnly={!canEdit}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('brand.type.licencePlaceholder')}
                    onChange={(event) => {
                      patchFamily(family.id, { license_web: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-type__field">
                  <span className="brand-type__fieldLabel">{t('brand.type.licencePrint')}</span>
                  <input
                    className="design-input"
                    data-type-family-licence-print={family.id}
                    value={family.license_print}
                    readOnly={!canEdit}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('brand.type.licencePlaceholder')}
                    onChange={(event) => {
                      patchFamily(family.id, { license_print: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-type__field">
                  <span className="brand-type__fieldLabel">{t('brand.type.licenceApp')}</span>
                  <input
                    className="design-input"
                    data-type-family-licence-app={family.id}
                    value={family.license_app}
                    readOnly={!canEdit}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('brand.type.licencePlaceholder')}
                    onChange={(event) => {
                      patchFamily(family.id, { license_app: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-type__field">
                  <span className="brand-type__fieldLabel">{t('brand.type.licenceDesktop')}</span>
                  <input
                    className="design-input"
                    data-type-family-licence-desktop={family.id}
                    value={family.license_desktop}
                    readOnly={!canEdit}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('brand.type.licencePlaceholder')}
                    onChange={(event) => {
                      patchFamily(family.id, { license_desktop: event.target.value });
                    }}
                  />
                </label>

                <label className="brand-type__field brand-type__field--wide">
                  <span className="brand-type__fieldLabel">{t('brand.type.fileRef')}</span>
                  <input
                    className="design-input"
                    data-type-family-file={family.id}
                    value={family.file_ref}
                    readOnly={!canEdit}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('brand.type.fileRefPlaceholder')}
                    onChange={(event) => {
                      patchFamily(family.id, { file_ref: event.target.value });
                    }}
                  />
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

        <p className="design-field__hint">{t('brand.type.licenceHint')}</p>
        <p className="design-field__hint">{t('brand.type.fileRefHint')}</p>

        {missing.length > 0 && (
          <p className="design-note design-note--error" data-type-family-gap>
            {t('brand.type.familyGap', { scripts: missing.map(scriptLabel).join('、') })}
          </p>
        )}
      </section>

      <section className="brand-type__section" data-type-roles>
        <h3 className="brand-page__versionsTitle">{t('brand.type.roles')}</h3>
        <p className="design-field__hint">{t('brand.type.rolesHint')}</p>
        <p className="design-field__hint">{t('brand.type.leadingHint')}</p>

        {TYPE_ROLES.map((key) => {
          const role = roleOf(doc, key);
          const roleGapList = roleGaps(doc, key);

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
                  <span className="brand-type__badge" data-type-role-badge={key}>
                    {roleGapList.map(roleGapLabel).join('、')}
                  </span>
                )}
              </div>

              <label className="brand-type__field brand-type__field--wide">
                <span className="brand-type__fieldLabel">{t('brand.type.roleFamily')}</span>
                <select
                  className="design-input"
                  data-type-role-family={key}
                  value={role.family}
                  disabled={!canEdit}
                  onChange={(event) => {
                    commit(setRole(doc, key, { family: event.target.value }));
                  }}
                >
                  <option value="">{t('brand.type.roleUnassigned')}</option>
                  {doc.families.map((family) => (
                    <option key={family.id} value={family.id}>
                      {`${scriptLabel(family.script as Script)}・${
                        family.name === '' ? t('brand.type.familyUnnamed') : family.name
                      }${familyUsable(family) ? '' : `（${t('brand.type.missing')}）`}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleSize')}</span>
                <input
                  className="design-input"
                  data-type-role-size={key}
                  value={role.size}
                  readOnly={!canEdit}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('brand.type.roleSizePlaceholder')}
                  onChange={(event) => {
                    commit(setRole(doc, key, { size: event.target.value }));
                  }}
                />
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleLeading')}</span>
                <input
                  className="design-input"
                  data-type-role-leading={key}
                  value={role.leading}
                  readOnly={!canEdit}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('brand.type.roleLeadingPlaceholder')}
                  onChange={(event) => {
                    commit(setRole(doc, key, { leading: event.target.value }));
                  }}
                />
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleWeight')}</span>
                <select
                  className="design-input"
                  data-type-role-weight={key}
                  value={role.weight}
                  disabled={!canEdit}
                  onChange={(event) => {
                    commit(setRole(doc, key, { weight: event.target.value }));
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
                <span className="brand-type__fieldLabel">{t('brand.type.roleMin')}</span>
                <input
                  className="design-input"
                  data-type-role-min={key}
                  value={role.min > 0 ? String(role.min) : ''}
                  readOnly={!canEdit}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="14"
                  onChange={(event) => {
                    const value = Number(event.target.value.trim());

                    commit(
                      setRole(doc, key, { min: Number.isFinite(value) && value > 0 ? value : 0 }),
                    );
                  }}
                />
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleMeasure')}</span>
                <input
                  className="design-input"
                  data-type-role-measure={key}
                  value={role.measure}
                  readOnly={!canEdit}
                  autoComplete="off"
                  placeholder={t('brand.type.roleMeasurePlaceholder')}
                  onChange={(event) => {
                    commit(setRole(doc, key, { measure: event.target.value }));
                  }}
                />
              </label>

              <label className="brand-type__field">
                <span className="brand-type__fieldLabel">{t('brand.type.roleColor')}</span>
                <select
                  className="design-input"
                  data-type-role-color={key}
                  value={role.color_role}
                  disabled={!canEdit}
                  onChange={(event) => {
                    commit(setRole(doc, key, { color_role: event.target.value }));
                  }}
                >
                  <option value="">—</option>
                  {COLOR_ROLES.map((colorRole) => (
                    <option key={colorRole.key} value={colorRole.key}>
                      {colorRole.key}
                    </option>
                  ))}
                </select>
              </label>

              <label className="brand-type__field brand-type__field--wide">
                <span className="brand-type__fieldLabel">{t('brand.type.roleReason')}</span>
                <input
                  className="design-input"
                  data-type-role-reason={key}
                  value={role.reason}
                  readOnly={!canEdit}
                  autoComplete="off"
                  placeholder={t('brand.type.roleReasonPlaceholder')}
                  onChange={(event) => {
                    commit(setRole(doc, key, { reason: event.target.value }));
                  }}
                />
              </label>

              {role.size.trim() !== '' && roleGapList.includes('size') && (
                <p className="design-note design-note--error" data-type-unit-error={key}>
                  {t('brand.type.unitError')}
                </p>
              )}
            </div>
          );
        })}

        <p className="design-field__hint">{t('brand.type.colorNote')}</p>
      </section>

      <section className="brand-type__section" data-type-pairing-section>
        <h3 className="brand-page__versionsTitle">{t('brand.type.pairing')}</h3>
        <p className="design-field__hint">{t('brand.type.pairingHint')}</p>

        <textarea
          className="brand-page__textarea brand-type__textarea"
          data-type-pairing
          value={doc.pairing}
          readOnly={!canEdit}
          rows={2}
          onChange={(event) => {
            commit({ ...doc, pairing: event.target.value });
          }}
        />

        <label className="brand-type__field brand-type__field--stack">
          <span className="brand-type__fieldLabel">{t('brand.type.anatomy')}</span>
          <span className="design-field__hint">{t('brand.type.anatomyHint')}</span>
          <textarea
            className="brand-page__textarea brand-type__textarea"
            data-type-anatomy
            value={doc.sentence_anatomy}
            readOnly={!canEdit}
            rows={2}
            placeholder={t('brand.type.anatomyPlaceholder')}
            onChange={(event) => {
              commit({ ...doc, sentence_anatomy: event.target.value });
            }}
          />
        </label>

        <label className="brand-type__field brand-type__field--stack">
          <span className="brand-type__fieldLabel">{t('brand.type.mixedSetting')}</span>
          <span className="design-field__hint">{t('brand.type.mixedHint')}</span>
          <textarea
            className="brand-page__textarea brand-type__textarea"
            data-type-mixed
            value={doc.mixed_setting}
            readOnly={!canEdit}
            rows={2}
            placeholder={t('brand.type.mixedPlaceholder')}
            onChange={(event) => {
              commit({ ...doc, mixed_setting: event.target.value });
            }}
          />
        </label>
      </section>

      <section className="brand-type__section" data-type-print-section>
        <h3 className="brand-page__versionsTitle">{t('brand.type.print')}</h3>
        <p className="design-field__hint">{t('brand.type.printHint')}</p>

        {doc.print_matrix.length === 0 ? (
          <p className="design-empty">{t('brand.type.printEmpty')}</p>
        ) : (
          <ul className="brand-type__recordList">
            {doc.print_matrix.map((row) => (
              <li className="brand-type__record" key={row.item} data-type-print-row={row.item}>
                <code className="brand-type__key">{row.item}</code>
                <span className="brand-type__recordSpec" data-type-print-spec={row.item}>
                  {row.spec}
                </span>

                {canEdit && (
                  <button
                    type="button"
                    className="brand-color__iconButton"
                    data-type-print-remove={row.item}
                    aria-label={`${t('brand.type.remove')} ${row.item}`}
                    onClick={() => {
                      commit({
                        ...doc,
                        print_matrix: doc.print_matrix.filter((other) => other.item !== row.item),
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

        {printError !== null && (
          <p className="design-note design-note--error" data-type-print-error>
            {printError}
          </p>
        )}

        {canEdit && (
          <div className="brand-type__adder">
            <input
              className="design-input"
              data-type-print-item
              value={printDraft.item}
              autoComplete="off"
              placeholder={t('brand.type.printItem')}
              onChange={(event) => {
                setPrintDraft({ ...printDraft, item: event.target.value });
              }}
            />
            <input
              className="design-input"
              data-type-print-spec-input
              value={printDraft.spec}
              autoComplete="off"
              placeholder={t('brand.type.printSpec')}
              onChange={(event) => {
                setPrintDraft({ ...printDraft, spec: event.target.value });
              }}
            />
            <button type="button" className="brand-page__action" data-type-print-add onClick={addPrint}>
              {t('brand.type.printAdd')}
            </button>
          </div>
        )}
      </section>

      <section className="brand-type__section" data-type-misuse-section>
        <h3 className="brand-page__versionsTitle">{t('brand.type.misuse')}</h3>
        <p className="design-field__hint">{t('brand.type.misuseHint')}</p>

        {doc.misuse.length === 0 ? (
          <p className="design-empty">{t('brand.type.misuseEmpty')}</p>
        ) : (
          <ul className="brand-type__recordList">
            {doc.misuse.map((row) => (
              <li className="brand-type__record" key={row.example} data-type-misuse-row={row.example}>
                <code className="brand-type__key">{row.example}</code>
                <span className="brand-type__recordSpec" data-type-misuse-reason={row.example}>
                  {row.reason}
                </span>

                {canEdit && (
                  <button
                    type="button"
                    className="brand-color__iconButton"
                    data-type-misuse-remove={row.example}
                    aria-label={`${t('brand.type.remove')} ${row.example}`}
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
          <p className="design-note design-note--error" data-type-misuse-error>
            {misuseError}
          </p>
        )}

        {canEdit && (
          <div className="brand-type__adder">
            <input
              className="design-input"
              data-type-misuse-input
              value={misuseDraft.example}
              autoComplete="off"
              placeholder={t('brand.type.misusePlaceholder')}
              onChange={(event) => {
                setMisuseDraft({ ...misuseDraft, example: event.target.value });
              }}
            />
            <input
              className="design-input"
              data-type-misuse-reason-input
              value={misuseDraft.reason}
              autoComplete="off"
              placeholder={t('brand.type.misuseReasonPlaceholder')}
              onChange={(event) => {
                setMisuseDraft({ ...misuseDraft, reason: event.target.value });
              }}
            />
            <button type="button" className="brand-page__action" data-type-misuse-add onClick={addMisuse}>
              {t('brand.type.misuseAdd')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
