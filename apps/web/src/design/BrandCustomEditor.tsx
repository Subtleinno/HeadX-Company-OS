import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import { fetchBrandPage, fetchPolicy } from '../api';
import { COLOR_ROLES, parseColorDoc, type ColorDoc } from './brandColors';
import { parseTypeDoc, type TypeDoc } from './brandType';
import { parseToneDoc, type ToneDoc } from './brandTone';
import {
  BRIEF_MIN_CHARS,
  bannedInLine,
  briefState,
  colourRoleValue,
  customGaps,
  emptyCustomDoc,
  gapCount,
  hasAnyValue,
  parseCustomDoc,
  serializeCustomDoc,
  typeRoleResolved,
  type CustomDoc,
  type CustomSectionKey,
} from './brandCustom';
import { useGapCount } from './useGapCount';

/**
 * 自定義頁的表身（issue #41）。
 *
 * 這一頁寫的是**這一張頁自己**：它的 brief、它決定什麼、不准決定什麼、規則、
 * 例子、錯誤例子、引用哪些角色。不是一份通用範本換了標題。
 *
 * 四樣來源即時讀：
 *   1. 通用槽原文（`/policy` 的 `custom`）—— 撞了就停手，講明哪兩句撞。
 *   2. 這一頁的 brief（#32 建立時寫的）—— 太空泛就講「未寫這一頁要決定什麼」。
 *   3. 色彩頁與字體頁 —— 只引用名字，值由那兩頁來；未定就標缺。
 *   4. 語氣頁 —— 例子會拿它的禁用詞檢查。
 *
 * 「重編」不是叫 AI 作文，也不改內容：它重新讀這四樣、按現在的策略落一版，
 * 手寫的文字原封不動，舊版仍然在（#33）。
 */

type BrandCustomEditorProps = {
  brandId: string;
  brief: string;
  content: string;
  canEdit: boolean;
  onChange: (next: string) => void;
  /** 重編要真的落一版，所以由外層的儲存通道執行；回傳新版的版號。 */
  onSaveNow: (content: string) => Promise<number | null>;
  /** 把缺口數上報給「這一頁」面板（#53）。解析不到就報 null。 */
  onGapCount?: (count: number | null) => void;
};

function write(doc: CustomDoc): string {
  return hasAnyValue(doc) ? serializeCustomDoc(doc) : '';
}

type ListKey = 'rules' | 'examples' | 'badExamples';

/** 欄目名。`t()` 只認得字面量 key，所以要逐個寫。 */
function sectionTitle(key: CustomSectionKey): string {
  switch (key) {
    case 'decided':
      return t('brand.custom.section.decided');
    case 'notDecided':
      return t('brand.custom.section.notDecided');
    case 'rules':
      return t('brand.custom.section.rules');
    case 'examples':
      return t('brand.custom.section.examples');
    default:
      return t('brand.custom.section.badExamples');
  }
}

export function BrandCustomEditor({
  brandId,
  brief,
  content,
  canEdit,
  onChange,
  onSaveNow,
  onGapCount,
}: BrandCustomEditorProps) {
  const [colour, setColour] = useState<ColorDoc | null>(null);
  const [type, setType] = useState<TypeDoc | null>(null);
  const [tone, setTone] = useState<ToneDoc | null>(null);
  const [policyText, setPolicyText] = useState('');
  const [drafts, setDrafts] = useState<Record<ListKey, string>>({
    rules: '',
    examples: '',
    badExamples: '',
  });
  const [regenerated, setRegenerated] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;

    void (async () => {
      const [colourPage, typePage, tonePage, policy] = await Promise.all([
        fetchBrandPage(brandId, 'color'),
        fetchBrandPage(brandId, 'type'),
        fetchBrandPage(brandId, 'tone'),
        fetchPolicy(),
      ]);

      if (!live) {
        return;
      }

      if (colourPage.ok) {
        const parsed = parseColorDoc(colourPage.data.current?.content ?? '');

        setColour(parsed.kind === 'ok' ? parsed.doc : null);
      }

      if (typePage.ok) {
        const parsed = parseTypeDoc(typePage.data.current?.content ?? '');

        setType(parsed.kind === 'ok' ? parsed.doc : null);
      }

      if (tonePage.ok) {
        const parsed = parseToneDoc(tonePage.data.current?.content ?? '');

        setTone(parsed.kind === 'ok' ? parsed.doc : null);
      }

      if (policy.ok) {
        const slot = policy.data.slots.find((item) => item.slot === 'custom');

        setPolicyText(slot?.current?.content ?? '');
      }

    })();

    return () => {
      live = false;
    };
  }, [brandId]);

  const parsed = parseCustomDoc(content);

  // 在 early return 之前上報。跨頁資料（色彩／字體／語氣／策略）未讀到時，
  // `customGaps` 已經把相關項目標成缺，所以這個數字是真的。
  useGapCount(
    parsed.kind === 'invalid'
      ? null
      : gapCount(
          customGaps({
            doc: parsed.kind === 'ok' ? parsed.doc : emptyCustomDoc(),
            brief,
            colour,
            type,
            tone,
            policyText,
          }),
        ),
    onGapCount,
  );

  if (parsed.kind === 'invalid') {
    return (
      <div className="brand-custom brand-custom--invalid" data-custom-invalid>
        <p className="design-note design-note--error">{t('brand.custom.invalid')}</p>

        {canEdit && (
          <div className="design-form__actions">
            <button
              type="button"
              className="design-btn"
              data-custom-reset
              onClick={() => {
                onChange(write(emptyCustomDoc()));
              }}
            >
              {t('brand.custom.invalidReset')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const doc = parsed.kind === 'ok' ? parsed.doc : emptyCustomDoc();
  const gaps = customGaps({ doc, brief, colour, type, tone, policyText });

  function commit(next: CustomDoc): void {
    setRegenerated(null);
    onChange(write(next));
  }

  function setSection(key: 'decided' | 'notDecided', value: string): void {
    commit({ ...doc, [key]: value });
  }

  function addLine(key: ListKey): void {
    const next = drafts[key].trim();

    if (next === '' || doc[key].includes(next)) {
      setDrafts({ ...drafts, [key]: '' });
      return;
    }

    commit({ ...doc, [key]: [...doc[key], next] });
    setDrafts({ ...drafts, [key]: '' });
  }

  function removeLine(key: ListKey, value: string): void {
    commit({ ...doc, [key]: doc[key].filter((item) => item !== value) });
  }

  function toggle(key: 'colorRoles' | 'typeRoles', value: string): void {
    const current = doc[key];

    commit({
      ...doc,
      [key]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  }

  async function regenerate(): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setRegenerated(null);

    /**
     * 重編**不改內容**：它做的正是 issue #41 驗收那句「改通用槽之後，三張頁
     * 都不會自己變；逐張按重編才出新版本」—— 按一下，就按現在的通用槽與四樣
     * 來源落一版，記住當時用的是哪一版策略。
     *
     * 這裡刻意**不**清走「色彩頁或字體頁未有值」的引用：那是「缺」，不是
     * 「失效」。清走等於替設計師刪了他寫的一句「這一頁用品牌主色」，而他
     * 打開只會見到那一行靜靜消失。真的失效（名字不在那一頁的詞彙表）在讀入
     * 時已經丟掉，不需要重編再丟一次。
     */
    const no = await onSaveNow(serializeCustomDoc(doc));

    setBusy(false);

    if (no !== null) {
      setRegenerated(no);
    }
  }

  const summary: string[] = [];

  if (gaps.brief === 'empty') {
    summary.push(t('brand.custom.gapBriefEmpty'));
  }

  if (gaps.brief === 'vague') {
    summary.push(t('brand.custom.gapBriefVague'));
  }

  if (gaps.sections.length > 0) {
    summary.push(
      t('brand.custom.gapSections', {
        items: gaps.sections.map((key) => sectionTitle(key)).join('、'),
      }),
    );
  }

  // 角色的缺只講「有缺、在下面那一段」，不把角色名再抄一次 —— 名字連同
  // 「缺」就寫在那一行 checkbox 旁邊，抄上來的第二份只會令人找兩次。
  if (gaps.colorRoles.length > 0 || gaps.typeRoles.length > 0) {
    summary.push(t('brand.custom.gapRoles'));
  }

  if (gaps.tone) {
    summary.push(t('brand.custom.gapTone'));
  }

  const briefStatus = briefState(brief);

  /**
   * 一條一條的清單（規則／例子／錯誤例子）。
   *
   * 屬性名不可以動態組，所以用 spread 傳 `data-custom-rule` 這種靜態名字；
   * 標題與說明由外面用字面 key 傳入 —— `t()` 只認得字面量 key。
   */
  function listSection(config: {
    key: ListKey;
    attr: string;
    title: string;
    hint: string;
    empty: string;
    addLabel: string;
    removeLabel: string;
    placeholder: string;
    /** 這一句犯了哪幾條禁用詞；只有「例子」會查。 */
    flagLine?: (line: string) => string[];
  }) {
    const { key, attr, title, hint, empty, addLabel, removeLabel, placeholder, flagLine } = config;

    return (
      <section className="brand-custom__section" data-custom-section={key}>
        <h3 className="brand-page__versionsTitle">{title}</h3>
        <p className="design-field__hint">{hint}</p>

        {doc[key].length === 0 ? (
          <p className="design-empty" {...{ [`data-custom-${attr}-empty`]: true }}>
            {empty}
          </p>
        ) : (
          <ul className="brand-custom__lines">
            {doc[key].map((line) => {
              // 在上面那個紅 banner 之外，逐句標出是哪一句犯了：只講「用了
              // 禁用詞」而唔講邊句，寫的人要自己逐句對。
              const hits = flagLine?.(line) ?? [];

              return (
                <li className="brand-custom__line" key={line} {...{ [`data-custom-${attr}`]: line }}>
                  <span>
                    {line}
                    {hits.length > 0 && (
                      <span
                        className="brand-custom__lineFlag"
                        {...{ [`data-custom-${attr}-banned`]: hits.join('、') }}
                      >
                        {t('brand.custom.lineBanned', { words: hits.join('、') })}
                      </span>
                    )}
                  </span>
                {canEdit && (
                  <button
                    type="button"
                    className="brand-tone__wordRemove"
                    {...{ [`data-custom-${attr}-remove`]: line }}
                    aria-label={`${removeLabel} ${line}`}
                    onClick={() => {
                      removeLine(key, line);
                    }}
                  >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="brand-custom__adder">
            <input
              className="design-input"
              {...{ [`data-custom-${attr}-input`]: true }}
              value={drafts[key]}
              autoComplete="off"
              placeholder={placeholder}
              onChange={(event) => {
                setDrafts({ ...drafts, [key]: event.target.value });
              }}
            />
            <button
              type="button"
              className="brand-page__action"
              {...{ [`data-custom-${attr}-add`]: true }}
              onClick={() => {
                addLine(key);
              }}
            >
              {addLabel}
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="brand-custom" data-custom-doc>
      <p className="design-field__hint" data-custom-note>
        {t('brand.custom.note')}
      </p>

      {/* brief 原文照登：這是這一頁的來源，不是標題。 */}
      <section className="brand-custom__brief" data-custom-brief>
        <span className="brand-custom__briefLabel">{t('brand.custom.brief')}</span>
        <p className="brand-custom__briefText">{brief.trim() === '' ? '——' : brief}</p>
      </section>

      {briefStatus !== 'ok' && (
        <p className="design-note design-note--error" data-custom-brief-gap>
          {briefStatus === 'empty'
            ? t('brand.custom.briefEmpty')
            : t('brand.custom.briefVague', { brief, min: BRIEF_MIN_CHARS })}
        </p>
      )}

      {gaps.conflict !== null && (
        <div className="brand-custom__conflict" data-custom-conflict>
          <p className="brand-custom__conflictTitle">{t('brand.custom.conflictTitle')}</p>
          <p className="brand-custom__conflictLine">
            {gaps.conflict.policyLine === ''
              ? t('brand.custom.conflictNoPolicy', { phrase: gaps.conflict.phrase })
              : t('brand.custom.conflictLine', {
                  phrase: gaps.conflict.phrase,
                  line: gaps.conflict.policyLine,
                })}
          </p>
        </div>
      )}

      {/* 禁用詞是語氣頁的事，所以獨立一句講明是哪幾個字 —— 埋在長長的
          「未填」裡面，寫的人會以為只是未填。 */}
      {gaps.banned.length > 0 && (
        <p className="design-note design-note--error" data-custom-banned>
          {t('brand.custom.gapBanned', { words: gaps.banned.join('、') })}
        </p>
      )}

      <p
        className={`brand-custom__missing${gapCount(gaps) === 0 ? '' : ' brand-custom__missing--gap'}`}
        data-custom-missing
      >
        {gapCount(gaps) === 0
          ? t('brand.custom.allPresent')
          : t('brand.custom.missingLine', { items: summary.join('；') })}
      </p>

      <section className="brand-custom__section" data-custom-section="decided">
        <h3 className="brand-page__versionsTitle">{t('brand.custom.decided')}</h3>
        <p className="design-field__hint">{t('brand.custom.decidedHint')}</p>
        <textarea
          className="brand-page__textarea brand-custom__textarea"
          data-custom-decided
          value={doc.decided}
          readOnly={!canEdit}
          rows={2}
          onChange={(event) => {
            setSection('decided', event.target.value);
          }}
        />
      </section>

      <section className="brand-custom__section" data-custom-section="notDecided">
        <h3 className="brand-page__versionsTitle">{t('brand.custom.notDecided')}</h3>
        <p className="design-field__hint">{t('brand.custom.notDecidedHint')}</p>
        <textarea
          className="brand-page__textarea brand-custom__textarea"
          data-custom-not-decided
          value={doc.notDecided}
          readOnly={!canEdit}
          rows={2}
          onChange={(event) => {
            setSection('notDecided', event.target.value);
          }}
        />
      </section>

      {listSection({
        key: 'rules',
        attr: 'rule',
        title: t('brand.custom.rules'),
        hint: t('brand.custom.rulesHint'),
        empty: t('brand.custom.rulesEmpty'),
        addLabel: t('brand.custom.ruleAdd'),
        removeLabel: t('brand.custom.ruleRemove'),
        placeholder: t('brand.custom.rulePlaceholder'),
      })}

      {listSection({
        key: 'examples',
        attr: 'example',
        title: t('brand.custom.examples'),
        hint: t('brand.custom.examplesHint'),
        empty: t('brand.custom.examplesEmpty'),
        flagLine: (line) => bannedInLine(line, tone),
        addLabel: t('brand.custom.exampleAdd'),
        removeLabel: t('brand.custom.exampleRemove'),
        placeholder: t('brand.custom.examplePlaceholder'),
      })}

      {listSection({
        key: 'badExamples',
        attr: 'bad-example',
        title: t('brand.custom.badExamples'),
        hint: t('brand.custom.badExamplesHint'),
        empty: t('brand.custom.badExamplesEmpty'),
        addLabel: t('brand.custom.badExampleAdd'),
        removeLabel: t('brand.custom.badExampleRemove'),
        placeholder: t('brand.custom.badExamplePlaceholder'),
      })}

      <section className="brand-custom__section" data-custom-section="roles">
        <h3 className="brand-page__versionsTitle">{t('brand.custom.roles')}</h3>
        <p className="design-field__hint">{t('brand.custom.rolesHint')}</p>

        <div className="brand-custom__roles">
          <span className="brand-custom__roleGroup">{t('brand.custom.colorRoles')}</span>
          {COLOR_ROLES.map((role) => {
            const value = colourRoleValue(colour, role.key);
            // 有值就畫出色點（順便給人挑），但「缺」只標在這一頁**真的引用
            // 了**的角色上：九個角色逐個標缺，等於叫讀的人自己找回哪一個
            // 與他有關。
            const referenced = doc.colorRoles.includes(role.key);

            return (
              <label className="brand-custom__role" key={role.key}>
                <input
                  type="checkbox"
                  data-custom-color-role={role.key}
                  checked={referenced}
                  disabled={!canEdit}
                  onChange={() => {
                    toggle('colorRoles', role.key);
                  }}
                />
                <span className="brand-custom__roleName" data-custom-role={role.key}>
                  {role.key}
                  {value !== null ? (
                    <>
                      <span
                        className="brand-custom__swatch"
                        style={{ backgroundColor: value }}
                        aria-hidden="true"
                      />
                      <code className="brand-custom__roleValue">{value}</code>
                    </>
                  ) : referenced ? (
                    <span className="brand-custom__roleGap">{t('brand.custom.roleMissing')}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        <div className="brand-custom__roles">
          <span className="brand-custom__roleGroup">{t('brand.custom.typeRoles')}</span>
          {(['display', 'heading', 'body', 'caption'] as const).map((role) => {
            const referenced = doc.typeRoles.includes(role);

            return (
              <label className="brand-custom__role" key={role}>
                <input
                  type="checkbox"
                  data-custom-type-role={role}
                  checked={referenced}
                  disabled={!canEdit}
                  onChange={() => {
                    toggle('typeRoles', role);
                  }}
                />
                <span className="brand-custom__roleName">
                  {role}
                  {referenced && !typeRoleResolved(type, role) ? (
                    <span className="brand-custom__roleGap">{t('brand.custom.roleMissing')}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        {(gaps.colorRoles.length > 0 || gaps.typeRoles.length > 0) && (
          <p className="design-note design-note--error" data-custom-role-gap>
            {t('brand.custom.roleGap', {
              items: [...gaps.colorRoles, ...gaps.typeRoles].join('、'),
            })}
          </p>
        )}
      </section>

      {canEdit && (
        <section className="brand-custom__section" data-custom-section="regenerate">
          <h3 className="brand-page__versionsTitle">{t('brand.custom.regenerateTitle')}</h3>
          <p className="design-field__hint">{t('brand.custom.regenerateHint')}</p>

          <div className="brand-custom__adder">
            <button
              type="button"
              className="design-btn"
              data-custom-regenerate
              disabled={busy}
              onClick={() => {
                void regenerate();
              }}
            >
              {t('brand.custom.regenerate')}
            </button>
          </div>

          {regenerated !== null && (
            <p className="design-note" role="status" data-custom-regenerated>
              {t('brand.custom.regenerated', { no: regenerated })}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
