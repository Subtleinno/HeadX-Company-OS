import { useEffect, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  fetchPolicy,
  savePolicyVersion,
  type BrandPageVersionSummary,
  type PolicySlotView,
} from '../api';
import {
  AGENT_ABILITIES,
  agentExample,
  formatTime,
  refsOf,
  slotOfPageKey,
  type AgentAbilityKey,
  type GuideSlot,
  type LinkWhat,
  type PageLink,
} from './brandGuide';

/**
 * 每頁頂部的「這一頁」（issue #53）。
 *
 * 三段答三個問題，次序就是老闆問的次序：
 *   1. 現況 —— 這一頁現在有幾多、爭幾多、影響誰。
 *   2. 策略 —— 這一類頁的專業標準。只有老闆可以改，員工與 agent 讀同一份。
 *   3. 給 AI Agent —— 這一頁開放幾多、封死幾多，以及一句真的打得中的指令。
 *
 * 兩個決定要講清楚：
 *
 * **策略不在這裡另存。** 讀寫都是 `brand_policy_version`（`GET /policy`、
 * `POST /policy/:slot/versions`），與 Boss Portal 的策略頁同一個來源。這裡只是
 * 第二個入口 —— 老闆在看著色彩頁時可以直接改色彩的策略，不用先記住它在另一頁。
 *
 * **缺口數字不是這裡算的。** 每個表身自己知道缺什麼（各頁的 gap 函數），
 * 算完上報一個數字。這裡再算一次就會有兩套判斷，早晚一個說缺三項、一個說缺兩項。
 */

type BrandPageGuideProps = {
  pageKey: string;
  /** 這一頁的現行版本。未讀到就是 null。 */
  current: BrandPageVersionSummary | null;
  /** 表身算出來的缺口數。`null`＝表身未報（例如表身未能解析）。 */
  gapCount: number | null;
  /** 只有老闆可以改策略（後端 `POST /policy/:slot/versions` 是 requireOwner）。 */
  isOwner: boolean;
};

type PolicyState = 'loading' | 'ready' | 'failed';

function pageLabel(key: string): string {
  switch (key) {
    case 'home':
      return t('design.page.brandHome');
    case 'logo':
      return t('design.page.brandLogo');
    case 'color':
      return t('design.page.brandColor');
    case 'type':
      return t('design.page.brandType');
    case 'tone':
      return t('design.page.brandTone');
    default:
      return key;
  }
}

function aboutLabel(slot: GuideSlot): string {
  switch (slot) {
    case 'home':
      return t('brand.guide.about.home');
    case 'logo':
      return t('brand.guide.about.logo');
    case 'color':
      return t('brand.guide.about.color');
    case 'type':
      return t('brand.guide.about.type');
    case 'tone':
      return t('brand.guide.about.tone');
    case 'custom':
      return t('brand.guide.about.custom');
  }
}

function whatLabel(what: LinkWhat): string {
  switch (what) {
    case 'roles':
      return t('brand.guide.what.roles');
    case 'families':
      return t('brand.guide.what.families');
    case 'assets':
      return t('brand.guide.what.assets');
    case 'traits':
      return t('brand.guide.what.traits');
  }
}

function abilityLabel(key: AgentAbilityKey): string {
  switch (key) {
    case 'read':
      return t('brand.guide.agent.read');
    case 'write':
      return t('brand.guide.agent.write');
    case 'readPolicy':
      return t('brand.guide.agent.readPolicy');
    case 'noPolicy':
      return t('brand.guide.agent.noPolicy');
    case 'noDelete':
      return t('brand.guide.agent.noDelete');
  }
}

function linkText(link: PageLink): string {
  return t('brand.guide.link', { page: pageLabel(link.page), what: whatLabel(link.what) });
}

export function BrandPageGuide({ pageKey, current, gapCount, isOwner }: BrandPageGuideProps) {
  const [open, setOpen] = useState(true);
  const [slots, setSlots] = useState<PolicySlotView[] | null>(null);
  const [policyState, setPolicyState] = useState<PolicyState>('loading');

  const [editing, setEditing] = useState(false);
  const [policyDraft, setPolicyDraft] = useState('');
  const [policyNote, setPolicyNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slot = slotOfPageKey(pageKey);
  const refs = refsOf(pageKey);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const result = await fetchPolicy();

      if (!alive) {
        return;
      }

      if (!result.ok) {
        setPolicyState('failed');
        return;
      }

      setSlots(result.data.slots);
      setPolicyState('ready');
    })();

    return () => {
      alive = false;
    };
  }, []);

  const view = slots?.find((item) => item.slot === slot) ?? null;
  const example = agentExample(pageKey);

  async function handleSavePolicy(): Promise<void> {
    if (saving) {
      return;
    }

    if (policyDraft.trim() === '') {
      setError(t('brand.guide.policyEmpty'));
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    const result = await savePolicyVersion(slot, {
      content: policyDraft,
      ...(policyNote.trim() === '' ? {} : { note: policyNote.trim() }),
    });

    setSaving(false);

    if (!result.ok) {
      setError(t('brand.guide.policySaveFailed'));
      return;
    }

    const saved = result.data.version;

    // 就地更新這一個槽，不重讀六個槽：重讀會令整塊面板跳一下，而剛剛
    // 儲存的是這一版，畫面沒有理由先收起它再畫一次。
    setSlots((previous) =>
      previous === null
        ? previous
        : previous.map((item) =>
            item.slot === slot
              ? {
                  ...item,
                  current: saved,
                  versions: [
                    {
                      id: saved.id,
                      versionNo: saved.versionNo,
                      createdAt: saved.createdAt,
                      note: saved.note,
                      preview: saved.content.slice(0, 160),
                    },
                    ...item.versions,
                  ],
                }
              : item,
          ),
    );

    setEditing(false);
    setPolicyNote('');
    setNotice(t('brand.guide.policySaved', { no: saved.versionNo }));
  }

  return (
    <section className="brand-guide" data-page-guide={pageKey}>
      <header className="brand-guide__head">
        <h2 className="brand-guide__title">{t('brand.guide.title')}</h2>
        <p className="brand-guide__lead">{aboutLabel(slot)}</p>
        <button
          type="button"
          className="brand-guide__toggle"
          data-guide-toggle
          aria-expanded={open}
          onClick={() => {
            setOpen((previous) => !previous);
          }}
        >
          {open ? '−' : '+'}
        </button>
      </header>

      {open && (
        <>
          <div className="brand-guide__section" data-guide-section="state">
            <h3 className="brand-guide__heading">{t('brand.guide.state')}</h3>

            <p
              className="brand-guide__line"
              data-guide-current={current === null ? 'none' : String(current.versionNo)}
            >
              {current === null
                ? t('brand.guide.noVersion')
                : t('brand.guide.current', { no: current.versionNo, at: formatTime(current.createdAt) })}
            </p>

            {gapCount !== null && (
              <p
                className={`brand-guide__line${gapCount === 0 ? '' : ' brand-guide__line--gap'}`}
                data-guide-gaps={String(gapCount)}
              >
                {gapCount === 0
                  ? t('brand.guide.noGaps')
                  : t('brand.guide.gaps', { count: gapCount })}
              </p>
            )}

            {/* 未有版本就不講「策略版本未記錄」：上一句已經講了未有版本，
                再講一次只是同一個缺講兩次。 */}
            {current !== null && (
              <p className="brand-guide__line" data-guide-policy-used>
                {current.policyVersionNo == null
                  ? t('brand.page.policyUnrecorded')
                  : t('brand.page.policyVersionNo', { no: current.policyVersionNo })}
              </p>
            )}

            {refs.uses.length === 0 && refs.usedBy.length === 0 ? (
              <p className="brand-guide__line brand-guide__line--muted" data-guide-refs="none">
                {t('brand.guide.noRefs')}
              </p>
            ) : (
              <ul className="brand-guide__refs" data-guide-refs>
                {refs.uses.length > 0 && (
                  <li data-guide-uses>
                    {t('brand.guide.uses', { list: refs.uses.map(linkText).join('、') })}
                  </li>
                )}
                {refs.usedBy.length > 0 && (
                  <li data-guide-used-by>
                    {t('brand.guide.usedBy', { list: refs.usedBy.map(linkText).join('、') })}
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="brand-guide__section" data-guide-section="policy">
            <h3 className="brand-guide__heading">{t('brand.guide.policyTitle')}</h3>

            {policyState === 'loading' && (
              <p className="brand-guide__line brand-guide__line--muted">
                {t('brand.guide.policyLoading')}
              </p>
            )}

            {policyState === 'failed' && (
              <p className="brand-guide__line brand-guide__line--muted">
                {t('brand.guide.policyLoadFailed')}
              </p>
            )}

            {/* `view === null` 也當缺：後端回的槽齊六個，缺一個代表這一份回應
                不完整。與其靜靜不畫，不如跟「未有策略」用同一句 —— 兩者對
                讀的人都是同一件事：這一頁現在沒有標準可依。 */}
            {policyState === 'ready' && (view === null || view.current === null) && (
              <p className="brand-guide__line brand-guide__line--gap" data-guide-policy="none">
                {t('brand.guide.policyMissing')}
              </p>
            )}

            {policyState === 'ready' && view !== null && view.current !== null && (
              <>
                <p className="brand-guide__policyNo" data-guide-policy={view.current.versionNo}>
                  {t('brand.page.versionNo', { no: view.current.versionNo })}
                  <span className="brand-guide__policyTime">
                    {formatTime(view.current.createdAt)}
                  </span>
                </p>
                {/* 編輯中不再畫一次正文：textarea 裡面就是同一段字，
                    上面再畫一次只會令人懷疑「我改的是哪一份」。 */}
                {!editing && (
                  <p className="brand-guide__policyBody" data-guide-policy-body>
                    {view.current.content}
                  </p>
                )}
              </>
            )}

            {notice !== null && (
              <p className="brand-guide__line" role="status" data-guide-policy-notice>
                {notice}
              </p>
            )}

            {error !== null && (
              <p className="brand-guide__line brand-guide__line--gap" role="alert" data-guide-policy-error>
                {error}
              </p>
            )}

            {isOwner ? (
              editing ? (
                <div className="brand-guide__editor" data-guide-policy-editor>
                  <label className="design-field">
                    <span className="design-field__label">{t('brand.guide.policyLabel')}</span>
                    <textarea
                      className="brand-page__textarea"
                      rows={8}
                      value={policyDraft}
                      spellCheck={false}
                      onChange={(event) => {
                        setPolicyDraft(event.target.value);
                      }}
                    />
                  </label>

                  <label className="design-field">
                    <span className="design-field__label">{t('brand.guide.policyNote')}</span>
                    <input
                      className="design-input"
                      value={policyNote}
                      autoComplete="off"
                      onChange={(event) => {
                        setPolicyNote(event.target.value);
                      }}
                    />
                  </label>

                  <p className="design-field__hint">{t('brand.guide.policyImmutable')}</p>

                  <div className="brand-guide__actions">
                    <button
                      type="button"
                      className="design-btn design-btn--primary"
                      data-guide-policy-save
                      disabled={saving || policyDraft.trim() === ''}
                      onClick={() => {
                        void handleSavePolicy();
                      }}
                    >
                      {saving ? t('brand.guide.policySaving') : t('brand.guide.policySave')}
                    </button>
                    <button
                      type="button"
                      className="design-btn"
                      onClick={() => {
                        setEditing(false);
                        setError(null);
                      }}
                    >
                      {t('brand.guide.policyCancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="brand-guide__actions">
                  <button
                    type="button"
                    className="design-btn"
                    data-guide-policy-edit
                    onClick={() => {
                      setPolicyDraft(view?.current?.content ?? '');
                      setPolicyNote('');
                      setNotice(null);
                      setError(null);
                      setEditing(true);
                    }}
                  >
                    {t('brand.guide.policyEdit')}
                  </button>
                </div>
              )
            ) : (
              <p className="design-footnote" data-guide-policy-owner-only>
                {view?.current == null
                  ? t('brand.guide.policyMissing')
                  : t('brand.guide.policyOwnerOnly', { no: view.current.versionNo })}
              </p>
            )}
          </div>

          <div className="brand-guide__section" data-guide-section="agent">
            <h3 className="brand-guide__heading">{t('brand.guide.agentTitle')}</h3>
            <p className="brand-guide__line brand-guide__line--muted">{t('brand.guide.agentLead')}</p>

            <div className="brand-guide__agent">
              <div data-guide-agent="allowed">
                <p className="brand-guide__agentTitle">{t('brand.guide.agentAllowed')}</p>
                <ul className="brand-guide__agentList">
                  {AGENT_ABILITIES.filter((item) => item.allowed).map((item) => (
                    <li key={item.key} data-guide-ability={item.key}>
                      {abilityLabel(item.key)}
                    </li>
                  ))}
                </ul>
              </div>

              <div data-guide-agent="blocked">
                <p className="brand-guide__agentTitle">{t('brand.guide.agentBlocked')}</p>
                <ul className="brand-guide__agentList brand-guide__agentList--blocked">
                  {AGENT_ABILITIES.filter((item) => !item.allowed).map((item) => (
                    <li key={item.key} data-guide-ability={item.key}>
                      {abilityLabel(item.key)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="brand-guide__line brand-guide__line--muted">
              {t('brand.guide.agent.example')}
            </p>

            <pre className="brand-guide__code" data-guide-agent-example>
              {`${example.method} ${example.path}\n${example.body}`}
            </pre>
          </div>
        </>
      )}
    </section>
  );
}
