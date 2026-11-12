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
  agentInstruction,
  formatTime,
  pageLabel,
  refsOf,
  slotOfPageKey,
  type AgentAbilityKey,
  type CustomRefs,
  type GuideSlot,
  type LinkWhat,
  type PageLink,
} from './brandGuide';

/**
 * 每頁頂部的「這一頁」（issue #53，v2.1 重做）。
 *
 * 三段答三個問題，次序就是老闆問的次序：
 *   1. 現況 —— 這一頁現在有幾多、爭幾多、影響誰。
 *   2. 這一頁的標準 —— 這一類頁的專業標準。只有老闆可以改，員工與 agent 讀同一份。
 *   3. 給 agent —— 開放幾多、封死幾多，加一句真的可以照講的指令。
 *
 * **v2.1 改了三件事**（見 `brand-common-fixes.md` 第 2 節）：
 *   - 三段預設收起，各有一個「展開」。一打開見到三行摘要，不是一屏說明。
 *   - 不再顯示 HTTP 方法、路徑與 JSON。那些是給開發者的；端點寫在 `docs/`。
 *     畫面只給一句人話，可以複製給 agent。
 *   - 現況多講一句「誰在用它」，因為引用關係是這一頁最容易被誤解的部份。
 *
 * **策略不在這裡另存。** 讀寫都是 `brand_policy_version`，與 Boss Portal 的
 * 策略頁同一個來源。這裡只是第二個入口 —— 老闆在看著色彩頁時可以直接改
 * 色彩的策略，不用先記住它在另一頁。
 *
 * **缺口數字不是這裡算的。** 每個表身自己知道缺什麼（各頁的 gap 函數），
 * 算完上報一個數字。這裡再算一次就會有兩套判斷，早晚一個說缺三項、
 * 一個說缺兩項。
 */

type BrandPageGuideProps = {
  pageKey: string;
  /** 這一頁的現行版本。未讀到就是 null。 */
  current: BrandPageVersionSummary | null;
  /** 表身算出來的缺口數。`null`＝表身未報（例如表身未能解析）。 */
  gapCount: number | null;
  /** 只有老闆可以改策略（後端 `POST /policy/:slot/versions` 是 requireOwner）。 */
  isOwner: boolean;
  /** 品牌名，用於那一句給 agent 的指令。未讀到就是 null。 */
  brandName?: string | null;
  /** 自定義頁有沒有引用色彩角色／字體層級，決定引用清單。 */
  customRefs?: CustomRefs;
};

type PolicyState = 'loading' | 'ready' | 'failed';

type SectionKey = 'state' | 'policy' | 'agent';

function slotLabel(slot: GuideSlot): string {
  return slot === 'apply' ? t('design.page.brandExamples') : pageLabel(slot);
}

function aboutLabel(slot: GuideSlot): string {
  switch (slot) {
    case 'home':
      return t('brand.guide.about.home');
    case 'platform':
      return t('brand.guide.about.platform');
    case 'logo':
      return t('brand.guide.about.logo');
    case 'color':
      return t('brand.guide.about.color');
    case 'type':
      return t('brand.guide.about.type');
    case 'tone':
      return t('brand.guide.about.tone');
    case 'image':
      return t('brand.guide.about.image');
    case 'apply':
      return t('brand.guide.about.apply');
    case 'custom':
      return t('brand.guide.about.custom');
  }
}

function whatLabel(what: LinkWhat): string {
  switch (what) {
    case 'stance':
      return t('brand.guide.what.stance');
    case 'keywords':
      return t('brand.guide.what.keywords');
    case 'essence':
      return t('brand.guide.what.essence');
    case 'roles':
      return t('brand.guide.what.roles');
    case 'families':
      return t('brand.guide.what.families');
    case 'assets':
      return t('brand.guide.what.assets');
    case 'traits':
      return t('brand.guide.what.traits');
    case 'photos':
      return t('brand.guide.what.photos');
    case 'examples':
      return t('brand.guide.what.examples');
    case 'systems':
      return t('brand.guide.what.systems');
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

/**
 * 同一頁的多條引用合成一句：`品牌主頁（關鍵詞、品牌本質）`。
 *
 * 不合成就會出現「品牌主頁（關鍵詞）、品牌主頁（品牌本質）」—— 同一頁講兩次，
 * 讀的人要自己數有幾個。
 */
function refText(links: readonly PageLink[]): string {
  const byPage = new Map<string, LinkWhat[]>();

  for (const link of links) {
    const whats = byPage.get(link.page) ?? [];
    whats.push(link.what);
    byPage.set(link.page, whats);
  }

  return [...byPage.entries()]
    .map(([page, whats]) => t('brand.guide.link', { page: pageLabel(page), what: whats.map(whatLabel).join('、') }))
    .join('、');
}

export function BrandPageGuide({
  pageKey,
  current,
  gapCount,
  isOwner,
  brandName = null,
  customRefs,
}: BrandPageGuideProps) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    state: false,
    policy: false,
    agent: false,
  });
  const [slots, setSlots] = useState<PolicySlotView[] | null>(null);
  const [policyState, setPolicyState] = useState<PolicyState>('loading');

  const [editing, setEditing] = useState(false);
  const [policyDraft, setPolicyDraft] = useState('');
  const [policyNote, setPolicyNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const slot = slotOfPageKey(pageKey);
  const refs = refsOf(pageKey, customRefs);
  const instruction = agentInstruction(pageKey, brandName);

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

  function toggle(section: SectionKey): void {
    setOpen((previous) => ({ ...previous, [section]: !previous[section] }));
  }

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

    // 就地更新這一個槽，不重讀九個槽：重讀會令整塊面板跳一下，而剛剛
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

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(instruction);
      setCopied(true);
    } catch {
      // 剪貼板被瀏覽器拒絕：指令本身已經顯示在畫面上，可以自己選取。
      setCopied(false);
    }
  }

  function sectionHead(
    key: SectionKey,
    title: string,
    lead: string,
  ): React.ReactElement {
    return (
      <header className="brand-guide__row">
        <div className="brand-guide__rowText">
          <h3 className="brand-guide__heading">{title}</h3>
          <p className="brand-guide__rowLead">{lead}</p>
        </div>
        <button
          type="button"
          className="brand-guide__toggle"
          data-guide-toggle={key}
          aria-expanded={open[key]}
          onClick={() => {
            toggle(key);
          }}
        >
          {open[key] ? t('brand.guide.collapse') : t('brand.guide.expand')}
        </button>
      </header>
    );
  }

  return (
    <section className="brand-guide" data-page-guide={pageKey} data-guide-slot={slot}>
      <h2 className="brand-guide__title">{t('brand.guide.title')}</h2>

      <div className="brand-guide__section" data-guide-section="state">
        {sectionHead('state', t('brand.guide.state'), t('brand.guide.stateLead'))}

        {open.state && (
          <div className="brand-guide__body">
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
                <li data-guide-uses>
                  {refs.uses.length === 0
                    ? t('brand.guide.noUses')
                    : t('brand.guide.uses', { list: refText(refs.uses) })}
                </li>
                <li data-guide-used-by>
                  {refs.usedBy.length === 0
                    ? t('brand.guide.noUsedBy')
                    : t('brand.guide.usedBy', { list: refText(refs.usedBy) })}
                </li>
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="brand-guide__section" data-guide-section="policy">
        {sectionHead('policy', t('brand.guide.policySection'), t('brand.guide.policyLead'))}

        {open.policy && (
          <div className="brand-guide__body">
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

            {policyState === 'ready' && (
              <p className="brand-guide__line" data-guide-policy={view?.current?.versionNo ?? 'none'}>
                {view?.current == null
                  ? t('brand.guide.policySummaryNoVersion', { slot: slotLabel(slot) })
                  : t('brand.guide.policySummary', {
                      slot: slotLabel(slot),
                      no: view.current.versionNo,
                    })}
              </p>
            )}

            {policyState === 'ready' && (view === null || view.current === null) && (
              <p className="brand-guide__line brand-guide__line--gap" data-guide-policy-missing>
                {t('brand.guide.policyMissing')}
              </p>
            )}

            {policyState === 'ready' && view !== null && view.current !== null && (
              <>
                <p className="brand-guide__line brand-guide__line--muted">{aboutLabel(slot)}</p>

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

            <p className="design-footnote" data-guide-policy-portal>
              {t('brand.guide.changeAtPortal')}
            </p>
          </div>
        )}
      </div>

      <div className="brand-guide__section" data-guide-section="agent">
        {sectionHead('agent', t('brand.guide.agentSection'), t('brand.guide.agentSectionLead'))}

        {open.agent && (
          <div className="brand-guide__body">
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

            {/* 一句人話，不是 HTTP。可以照講，也可以複製。 */}
            <p className="brand-guide__instruction" data-guide-instruction>
              {instruction}
            </p>

            <div className="brand-guide__actions">
              <button
                type="button"
                className="design-btn"
                data-guide-copy
                onClick={() => {
                  void handleCopy();
                }}
              >
                {copied ? t('brand.guide.agentCopied') : t('brand.guide.agentCopy')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
