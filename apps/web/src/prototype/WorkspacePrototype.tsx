import { useEffect, useRef, useState } from 'react';
import { t } from '@company-os/i18n';
import {
  FrameShell,
  buildShellHash,
  Icon,
  isScopeAllowed,
  parseShellHash,
  planAppSwitch,
  type AppMode,
  type ScopeTarget,
} from '@company-os/app-shell';
import { useFrameChrome } from '../frame/useFrameChrome';
import {
  findPage,
  PROTOTYPE_APPS,
  PROTOTYPE_BRANDS,
  PROTOTYPE_BRAND_IDS,
  PROTOTYPE_ENTRY_HASH,
} from './fixtures';

/**
 * 原型外殼畫面（issue 118 切片 C）。
 *
 * 呢個畫面嘅目的只有一個：證明共用外殼嘅切換行為講得通。所以佢**唔會**：
 *
 * - 呼叫 `GET /modules`（真實 app 接駁屬 B-06）或者 `GET /org-units`
 *   （仍然 `requireOwner`，C47 明令不得為員工選擇器放寬）；
 * - 建立、修改或撤銷任何授權（C46）；
 * - 顯示任何業務數字 —— 載入結果只講「邊個 app、邊個範圍」，唔會扮有 KPI。
 *
 * 所有資料來自 `fixtures.ts`，並由外殼明確標示為原型。
 */

export type LoadLabelInput = { appId: string; scope: ScopeTarget | null };
export type LoadLabel = (input: LoadLabelInput) => Promise<string>;

type ResolvedHash =
  | { kind: 'invalid' }
  | { kind: 'app'; appId: string; scope: ScopeTarget | null; page: string | null };

/**
 * 網址 → 位置。唔存在嘅 app、唔存在嘅品牌、唔存在嘅頁面一律當「不支援」。
 *
 * 這一條是瀏覽器走查揭出來的：原本 app id 格式合法但唔存在（`#/app/zzz`）
 * 會靜靜跌去 App A，寫一個唔存在嘅品牌（`#/app/b/brand.qq`）會照樣顯示成功畫面。
 * 兩種都係「扮成功」，C48 明令不支援的組合必須如實顯示。
 */
function resolveHash(hash: string): ResolvedHash {
  const parsed = parseShellHash(hash);

  // 冇 app 段落（`#/`、`#/app`）：原型入口等於公司型 App A 的公司範圍。
  if (parsed.kind === 'none') {
    return { kind: 'app', appId: 'a', scope: { kind: 'company' }, page: null };
  }

  if (parsed.kind !== 'app') {
    return { kind: 'invalid' };
  }

  if (!PROTOTYPE_APPS.some((item) => item.id === parsed.appId)) {
    return { kind: 'invalid' };
  }

  if (
    parsed.scope !== null &&
    parsed.scope.kind === 'brand' &&
    !PROTOTYPE_BRAND_IDS.includes(parsed.scope.brandId)
  ) {
    return { kind: 'invalid' };
  }

  if (parsed.page !== null && findPage(parsed.appId, parsed.page) === null) {
    return { kind: 'invalid' };
  }

  return { kind: 'app', appId: parsed.appId, scope: parsed.scope, page: parsed.page };
}

function scopeLabel(scope: ScopeTarget | null): string {
  if (scope === null) {
    return t('shell.scope.selectBrand');
  }

  if (scope.kind === 'company') {
    return t('shell.scope.company');
  }

  return PROTOTYPE_BRANDS.find((brand) => brand.id === scope.brandId)?.name ?? scope.brandId;
}

async function defaultLoadLabel(input: LoadLabelInput): Promise<string> {
  await Promise.resolve();

  const app = PROTOTYPE_APPS.find((item) => item.id === input.appId);

  return `${app?.title ?? input.appId} · ${scopeLabel(input.scope)}`;
}

function scopeKeyOf(scope: ScopeTarget | null): string {
  if (scope === null) {
    return 'none';
  }

  return scope.kind === 'company' ? 'company' : `brand:${scope.brandId}`;
}

/** 模式只作入口說明（C46），不會帶任何授權語意。 */
function modeLabel(mode: AppMode | undefined): string {
  switch (mode) {
    case 'company':
      return t('proto.mode.company');
    case 'brand':
      return t('proto.mode.brand');
    case 'mixed':
      return t('proto.mode.mixed');
    default:
      return '';
  }
}

export function WorkspacePrototype({ loadLabel = defaultLoadLabel }: { loadLabel?: LoadLabel }) {
  const initial = useRef(resolveHash(window.location.hash)).current;

  const [appId, setAppId] = useState<string>(initial.kind === 'app' ? initial.appId : 'a');
  const [scope, setScope] = useState<ScopeTarget | null>(initial.kind === 'app' ? initial.scope : null);
  const [page, setPage] = useState<string | null>(initial.kind === 'app' ? initial.page : null);
  const [invalidHash, setInvalidHash] = useState(initial.kind === 'invalid');

  const chrome = useFrameChrome();

  const [pendingAppId, setPendingAppId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | (() => void)>(null);
  const [note, setNote] = useState('');

  const [loadedLabel, setLoadedLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  const sequence = useRef(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const app = PROTOTYPE_APPS.find((item) => item.id === appId) ?? null;
  const currentPage = findPage(appId, page);
  const dirty = note.trim().length > 0;
  const scopeKey = scopeKeyOf(scope);

  // 網址變了就重新解析：手動改網址、按非法畫面的「回到 app 入口」、貼一條連結
  // 都會跟住行。自己寫網址用 replaceState，不會觸發 hashchange，所以不會迴圈。
  useEffect(() => {
    function onHashChange(): void {
      const next = resolveHash(window.location.hash);

      if (next.kind === 'invalid') {
        setInvalidHash(true);
        return;
      }

      setInvalidHash(false);
      setAppId(next.appId);
      setScope(next.scope);
      setPage(next.page);
    }

    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const needsBrand = app?.mode === 'brand' && scope?.kind !== 'brand';

  useEffect(() => {
    if (invalidHash || app === null || needsBrand) {
      return;
    }

    const ticket = sequence.current + 1;
    sequence.current = ticket;
    setStatus('loading');

    loadLabel({ appId: app.id, scope }).then(
      (label) => {
        // 舊回應唔可以蓋過新範圍：只有仍然係最新一張票才寫入。
        if (sequence.current === ticket) {
          setLoadedLabel(label);
          setStatus('ready');
        }
      },
      () => {
        if (sequence.current === ticket) {
          setStatus('error');
        }
      },
    );
  }, [app, scopeKey, needsBrand, invalidHash, reloadKey, loadLabel]);

  function writeHash(nextAppId: string, nextScope: ScopeTarget | null, nextPage: string | null): void {
    const hash = buildShellHash({ appId: nextAppId, scope: nextScope, page: nextPage });

    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }

  /** 有未保存輸入就先問，唔會靜靜丟走（切片 C 規則）。 */
  function commit(run: () => void): void {
    if (dirty) {
      setConfirm(() => run);
      return;
    }

    run();
  }

  function applySwitch(nextAppId: string, nextScope: ScopeTarget | null): void {
    setAppId(nextAppId);
    setScope(nextScope);
    setPage(null);
    setNote('');
    writeHash(nextAppId, nextScope, null);
  }

  function selectApp(targetId: string): void {
    const target = PROTOTYPE_APPS.find((item) => item.id === targetId);

    if (target === undefined || targetId === appId) {
      return;
    }

    const plan = planAppSwitch({
      target,
      currentScope: scope,
      availableBrandIds: PROTOTYPE_BRAND_IDS,
    });

    if (plan.kind === 'needs-scope') {
      setPendingAppId(targetId);
      return;
    }

    commit(() => {
      applySwitch(targetId, plan.scope);
    });
  }

  /**
   * 第二步選品牌（issue 147 P0-1）。
   *
   * 之前呢一步直接叫 `applySwitch()`，`setNote('')` 會靜靜丟走未保存輸入；
   * 而切 app／切頁都經 `commit()`。同一個動作兩條路兩個答案，其中一個係錯。
   * 而家統一經 `commit()`：有未保存就先問，揀「放棄」先至清空同切換。
   * 目標 app 同品牌喺 closure 入面留住，確認對話框收起之後仍然切去原本揀嗰個。
   */
  function chooseBrandFromStep(brandId: string): void {
    if (pendingAppId === null) {
      return;
    }

    const targetAppId = pendingAppId;

    commit(() => {
      setPendingAppId(null);
      applySwitch(targetAppId, { kind: 'brand', brandId });
    });
  }

  /** 「留低」只收起確認；第二步仍然開住，app、品牌、頁面、備註全部唔變。 */
  function cancelConfirm(): void {
    setConfirm(null);
  }

  function selectScope(nextScope: ScopeTarget): void {
    if (app === null) {
      return;
    }

    if (!isScopeAllowed({ app, scope: nextScope, availableBrandIds: PROTOTYPE_BRAND_IDS })) {
      return;
    }

    commit(() => {
      setScope(nextScope);
      setPage(null);
      setNote('');
      writeHash(appId, nextScope, null);
    });
  }

  function selectPage(pageKey: string): void {
    commit(() => {
      setPage(pageKey);
      setNote('');
      writeHash(appId, scope, pageKey);
    });
  }

  // 浮層一開就把焦點移入去：鍵盤用戶不會被留在頂欄，按 Tab 也不會跳過它。
  useEffect(() => {
    if (pendingAppId === null && confirm === null) {
      return;
    }

    popoverRef.current?.focus();
  }, [pendingAppId, confirm]);

  if (invalidHash) {
    return (
      <main className="proto-invalid">
        <div className="proto-invalid__head">
          <h1 className="proto-invalid__title">{t('proto.invalidTitle')}</h1>
          <p className="page__sub">{t('proto.invalidBody')}</p>
          <a className="proto-invalid__link" href={PROTOTYPE_ENTRY_HASH}>
            {t('proto.entry')}
          </a>
        </div>
      </main>
    );
  }

  // 原型 fixtures 映射到 Frame 外殼嘅三層導覽：
  // 第一層 moduleTabs = app 主選單、第二層 modulePages = 頁面子選單、
  // 左欄 sidebarGroups = 工作欄。三層嘅 key 都係頁面 key，同舊外殼一致。
  // 正式畫面嘅 FORMAL_APPS 空清單同呢份原型 fixtures 完全分開，唔互相影響。
  const frameApps = PROTOTYPE_APPS.map((item) => ({ key: item.id, label: item.title }));
  const moduleTabs = app?.menu ?? [];
  const modulePages = currentPage?.subMenu ?? [];
  const railItems = currentPage?.rail ?? [];
  const sidebarGroups = railItems.length > 0 ? [{ items: railItems }] : [];
  const showBrandSelector = app !== null && app.mode !== 'company';

  return (
    <FrameShell
      apps={frameApps}
      currentAppId={appId}
      onSelectApp={selectApp}
      scope={scope}
      brands={showBrandSelector ? PROTOTYPE_BRANDS : undefined}
      onSelectScope={selectScope}
      moduleTabs={moduleTabs}
      currentModuleTabKey={page}
      onSelectModuleTab={selectPage}
      theme={chrome.theme}
      onToggleTheme={chrome.onToggleTheme}
      account={{ displayName: t('proto.account'), signingOut: false }}
      onSignOut={() => undefined}
      sidebarOpen={chrome.sidebarOpen}
      onToggleSidebar={chrome.onToggleSidebar}
      modulePages={modulePages}
      currentPageKey={page}
      onSelectPage={selectPage}
      sidebarGroups={sidebarGroups}
      prototype
      blocked={
        needsBrand
          ? { title: t('shell.scope.selectBrand'), description: t('shell.scope.required') }
          : undefined
      }
    >
      <div className="page">
        <div className="page__head">
          <p className="page__eyebrow">{modeLabel(app?.mode)}</p>
          <h1 className="page__title">{app?.title ?? ''}</h1>
          <p className="page__sub">
            {scopeLabel(scope)} · {t('proto.pageSub')}
          </p>
        </div>

        {/*
          測試控制集中在一個清楚標示的區塊，不讓它主導正常展示：
          這是原型 harness，不是產品的一部分。載入狀態本身也是診斷資訊
          （慢回應、失敗重試都靠它看），所以跟備註放在一起，不放在標題下面。
        */}
        <div className="proto-zone">
          <p className="proto-zone__label">{t('proto.zone')}</p>

          <div
            className="proto-log"
            data-proto-status={status}
            role={status === 'error' ? 'alert' : 'status'}
          >
            <span className="proto-log__key">{t('proto.logLabel')}</span>
            <span className="proto-log__text">
              {status === 'loading' && t('proto.loading')}
              {status === 'error' && t('proto.failed')}
              {status === 'ready' && (loadedLabel ?? '')}
            </span>
            {status === 'error' && (
              <button
                type="button"
                className="shell-iconbtn shell-iconbtn--text"
                onClick={() => {
                  setReloadKey((key) => key + 1);
                }}
              >
                {t('proto.retry')}
              </button>
            )}
          </div>

          <label className="proto-field">
            <span className="proto-field__label">{t('proto.note')}</span>
            <textarea
              className="proto-field__input"
              aria-label={t('proto.note')}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
            <span className="proto-field__hint">{t('proto.note.hint')}</span>
          </label>
        </div>
      </div>

      {confirm === null && pendingAppId !== null && (
        <div
          className="shell-popover"
          role="dialog"
          aria-label={t('proto.chooseScope')}
          tabIndex={-1}
          ref={popoverRef}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setPendingAppId(null);
            }
          }}
        >
          <p className="shell-popover__label">{t('proto.chooseScope')}</p>
          <p className="shell-popover__title">
            {PROTOTYPE_APPS.find((item) => item.id === pendingAppId)?.title}
          </p>

          {/*
            第二步直接列出合法範圍，不用收起的下拉：這一步只有少數選項，
            而且要令人一眼看到「目標 app 要邊幾個品牌」，不是再開一次選單。
          */}
          <ul className="shell-popover__list" role="listbox" aria-label={t('proto.chooseScope')}>
            {PROTOTYPE_BRANDS.map((brand) => {
              // 由「品牌甲」轉去 App B 時，品牌甲就已經是現行範圍：標示出來，
              // 否則這一步看起來像每次都重新選一次（C46：只作入口說明）。
              const isCurrent = scope?.kind === 'brand' && scope.brandId === brand.id;

              return (
                <li
                  key={brand.id}
                  role="option"
                  aria-selected={isCurrent}
                  tabIndex={0}
                  className="shell-popover__item"
                  onClick={() => {
                    chooseBrandFromStep(brand.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return;
                    }

                    event.preventDefault();
                    chooseBrandFromStep(brand.id);
                  }}
                >
                  <Icon name="cube" className="ic shell-popover__icon" />
                  <span className="shell-popover__item-label">{brand.name}</span>
                  <svg
                    className="shell-popover__check"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </li>
              );
            })}
          </ul>

          <div className="shell-popover__sep" />

          {/*
            只有一個離開動作：這一步從未離開原 app，所以「返回」就是「取消」。
            按下去只收掉這一步，不改授權、不改資料歸屬、不寫網址。
          */}
          <button
            type="button"
            className="shell-popover__item shell-popover__item--muted"
            onClick={() => {
              setPendingAppId(null);
            }}
          >
            {t('proto.back')}
          </button>
        </div>
      )}

      {confirm !== null && (
        <div
          className="shell-popover"
          role="dialog"
          aria-label={t('proto.unsaved.title')}
          tabIndex={-1}
          ref={popoverRef}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelConfirm();
            }
          }}
        >
          <p className="shell-popover__label">{t('proto.unsaved.title')}</p>
          <p className="shell-popover__body">{t('proto.unsaved.body')}</p>

          <div className="shell-popover__sep" />

          <button
            type="button"
            className="shell-popover__item"
            onClick={() => {
              const action = confirm;

              setConfirm(null);
              action();
            }}
          >
            {t('proto.discard')}
          </button>
          <button
            type="button"
            className="shell-popover__item shell-popover__item--muted"
            onClick={() => {
              cancelConfirm();
            }}
          >
            {t('proto.cancel')}
          </button>
        </div>
      )}
    </FrameShell>
  );
}
