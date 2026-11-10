import { useEffect, type ReactNode } from 'react';
import { t } from '@company-os/i18n';
import { Selector, type SelectorOption } from '@company-os/ui-kit';
import { Icon, type IconName } from './icons.js';
import { applyTheme, type ShellTheme } from './theme.js';
import type { BrandRef, ScopeTarget, ShellNavItem } from './workspace.js';

/**
 * Frame 共用外殼（issue #157）。
 *
 * 由上至下：第一層全域頂欄、第二層模組頁頂欄、左側子頁導覽＋內容區、頁尾。
 * 呢張只交付**結構與行為，冇任何 CSS** —— 樣式屬 F-02（cat:web），class 名
 * 統一 `frame-` 前綴供佢接手。
 *
 * 沿用 `BaseShell.tsx` 檔頭三點原則：
 *
 * 1. 元件**唔會**自己決定去邊個 app、邊個品牌、邊頁。所有選擇都用回呼交返
 *    呼叫端；重新 render 一律以傳入值為準，唔記住任何選擇。
 * 2. 公司範圍（冇傳品牌清單）係純文字，唔渲染一個按落去冇反應嘅失效下拉。
 * 3. 冇子頁時整條左欄唔渲染，側欄開關如實停用。
 *
 * 另外：右側工具只喺呼叫端傳入處理函數時先渲染，唔做死掣；公司標誌只係
 * 名稱嘅視覺附屬（唔係按鈕、唔帶下拉、唔做上傳）；「據點與機器」只係可選
 * slot，本張不內建入口。所有文案取自 #155 交付嘅 `frame.*` 鍵，唔新增鍵、
 * 唔硬寫 UI 字串、唔重用意思唔準確嘅鍵；skip link 沿用既有 `shell.skipToContent`。
 *
 * 元件不呼叫 API、不用 localStorage／cookie、不建立品牌或模式資料（#153 Q6 C），
 * 亦不寫任何 inline style（尤其唔用 `overflow: hidden` 收起捲軸）。
 */

/** App selector 嘅一項。沿用 `ShellNavItem`，只加「狀態標籤」同「是否可選」。 */
export type FrameApp = ShellNavItem & {
  /** 狀態標籤文字，例如「未啟用、不可進入」；由呼叫端傳入。 */
  statusLabel?: string;
  /** false 代表照列但不可進入；預設可選。 */
  selectable?: boolean;
};

/** 左側子頁導覽嘅一個分組。分組標題同子頁文字都由呼叫端傳入。 */
export type FrameSidebarGroup = {
  title?: string;
  items: readonly ShellNavItem[];
};

/** 阻塞狀態：標題同說明都係呼叫端傳入嘅如實文字。 */
export type FrameBlocked = {
  title: string;
  description: string;
};

/**
 * 右側 Needs 欄嘅一項（issue 184）。
 *
 * 文字全部由呼叫端提供：外殼唔自己組「已等 2 日」呢類句子，因為「等」
 * 係業務講法，而外殼唔知業務。外殼只負責順序同版面。
 */
export type FrameNeedItem = {
  id: string;
  code: string;
  title: string;
  kindLabel: string;
  stateLabel: string;
  /** 次要一行，例如「已等 2 日」；undefined 就唔顯示，唔留一個空格。 */
  metaLabel?: string;
};

/**
 * 頂欄嘅 Needs 入口。
 *
 * 唔傳就完全唔渲染 —— 唔做一個冇數字的死掣。`railOpen` 同 `onToggleRail`
 * 一齊缺席，代表呢一頁冇 Needs 欄可言，連開關都唔出現。
 */
export type FrameNeedsEntry = {
  count: number;
  active: boolean;
  onOpen: () => void;
  railOpen?: boolean;
  onToggleRail?: () => void;
};

/** 右側 Needs 欄。items 空都要渲染：欄位穩定，跳版比空白更難用。 */
export type FrameNeedsRail = {
  title: string;
  items: readonly FrameNeedItem[];
  emptyLabel: string;
  totalLabel: string;
  closedLabel: string;
  historyLabel: string;
  onOpenAll: () => void;
  onOpenNeed: (id: string) => void;
};

export type FrameShellProps = {
  /** 第一層：App selector。 */
  apps: readonly FrameApp[];
  currentAppId: string;
  onSelectApp: (appId: string) => void;
  /** 範圍位：傳入品牌清單及當前值先渲染 Brand selector，否則純文字公司範圍。 */
  scope?: ScopeTarget | null;
  brands?: readonly BrandRef[];
  onSelectScope?: (scope: ScopeTarget) => void;
  /** 第一層嘅模組分頁。 */
  moduleTabs?: readonly ShellNavItem[];
  currentModuleTabKey?: string | null;
  onSelectModuleTab?: (key: string) => void;
  /** 右側工具：每項只喺傳入處理函數時渲染。 */
  onSearch?: () => void;
  onCommandPalette?: () => void;
  onLanguage?: () => void;
  onNotifications?: () => void;
  onHelp?: () => void;

  /** 主題、帳戶與側欄：行為沿用 `BaseShell`。 */
  theme: ShellTheme;
  /**
   * 唔再由 Frame 顯示切換掣（決策 C65：只有淺色一套）。保留這個屬性係為了
   * 未清走的呼叫端仍然傳得入；一旦全部畫面都唔再傳，就可以刪。
   */
  onToggleTheme?: () => void;
  account: { displayName: string; signingOut: boolean };
  onSignOut: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;

  /** 第二層：目前模組嘅頁面級導覽。 */
  modulePages: readonly ShellNavItem[];
  currentPageKey: string | null;
  onSelectPage: (key: string) => void;

  /** 左側：服務第二層選中頁嘅子頁，支援分組標題。 */
  sidebarGroups?: readonly FrameSidebarGroup[];

  /** Needs 入口（issue 184）。Needs 屬外殼，唔屬任何一個 app。 */
  needs?: FrameNeedsEntry;
  /** 右側 Needs 欄；要 `needs.railOpen === true` 才會渲染。 */
  needsRail?: FrameNeedsRail;

  /** 內容區。 */
  breadcrumbs?: readonly string[];
  pageTitle?: string;
  pageSubtitle?: string;
  primaryAction?: ReactNode;
  blocked?: FrameBlocked;

  /** 頁尾。 */
  companyName?: string;
  region?: string;
  companyMark?: ReactNode;
  sitesEntry?: ReactNode;

  /** 原型標示（決策 C50）。 */
  prototype?: boolean;

  children: ReactNode;
};

type FrameTool = {
  key: string;
  label: string;
  handler?: () => void;
  icon?: IconName;
};

/** 名稱首字做系統字標；空名唔畫一個空白圈，退回一個點。 */
function initialOf(name: string | undefined): string {
  const first = (name ?? '').trim().slice(0, 1);

  return first.length > 0 ? first.toUpperCase() : '·';
}

export function FrameShell({
  apps,
  currentAppId,
  onSelectApp,
  scope,
  brands,
  onSelectScope,
  moduleTabs,
  currentModuleTabKey,
  onSelectModuleTab,
  onSearch,
  onCommandPalette,
  onLanguage,
  onNotifications,
  onHelp,
  theme,
  account,
  onSignOut,
  sidebarOpen,
  onToggleSidebar,
  modulePages,
  currentPageKey,
  onSelectPage,
  sidebarGroups,
  needs,
  needsRail,
  breadcrumbs,
  pageTitle,
  pageSubtitle,
  primaryAction,
  blocked,
  companyName,
  region,
  companyMark,
  sitesEntry,
  prototype = false,
  children,
}: FrameShellProps) {
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const groups = sidebarGroups ?? [];
  const sidebarItemCount = groups.reduce((total, group) => total + group.items.length, 0);
  const hasSidebar = sidebarItemCount > 0;
  const showSidebar = hasSidebar && sidebarOpen;
  const showRail = needsRail !== undefined && needs?.railOpen === true;

  const showBrandSelector =
    brands !== undefined && brands.length > 0 && scope !== null && scope !== undefined;
  const scopeValue = scope?.kind === 'brand' ? scope.brandId : null;

  const companyNameText = companyName ?? t('frame.company.nameMissing');
  const companyMarkNode = companyMark ?? (
    <span className="frame-mark__initial" aria-hidden="true">
      {initialOf(companyName)}
    </span>
  );

  const appOptions: SelectorOption[] = apps.map((app) => ({
    id: app.key,
    label: app.label,
    description: app.statusLabel,
    disabled: app.selectable === false,
    icon: companyMarkNode,
  }));

  const brandOptions: SelectorOption[] = (brands ?? []).map((brand) => ({
    id: brand.id,
    label: brand.name,
  }));

  // 下拉箭嘴由 ui-kit `Selector` 內建 SVG 提供，icons.tsx 既有 `chev-down` 亦已存在，
  // 兩者都毋須新增圖示名稱；呢度只新增 Frame 用嘅搜尋、通知、說明三枚。
  const tools: readonly FrameTool[] = [
    { key: 'search', label: t('frame.topbar.search'), handler: onSearch, icon: 'search' },
    { key: 'commandPalette', label: t('frame.topbar.commandPalette'), handler: onCommandPalette },
    { key: 'language', label: t('frame.topbar.language'), handler: onLanguage },
    { key: 'notifications', label: t('frame.topbar.notifications'), handler: onNotifications, icon: 'bell' },
    { key: 'help', label: t('frame.topbar.help'), handler: onHelp, icon: 'help' },
  ];

  return (
    <div className="frame-shell" data-frame-theme={theme}>
      <a className="frame-skip" href="#frame-content">
        {t('shell.skipToContent')}
      </a>

      <header className="frame-topbar" aria-label={t('frame.landmark.topbar')}>
        <div className="frame-slot" data-frame-slot="sidebar">
          <button
            type="button"
            className="frame-iconbtn"
            aria-label={t('frame.topbar.sidebarToggle')}
            aria-expanded={hasSidebar ? sidebarOpen : false}
            disabled={!hasSidebar}
            onClick={onToggleSidebar}
          >
            <Icon name="menu" />
          </button>
        </div>

        <div className="frame-slot frame-slot--app" data-frame-slot="app">
          <Selector
            label={t('frame.topbar.appSelector')}
            value={currentAppId}
            options={appOptions}
            placeholder={t('frame.topbar.appSelector')}
            onChange={onSelectApp}
          />
        </div>

        <div className="frame-slot frame-slot--scope" data-frame-slot="scope">
          {showBrandSelector ? (
            <Selector
              label={t('frame.topbar.brandSelector')}
              value={scopeValue}
              options={brandOptions}
              placeholder={t('frame.topbar.brandSelector')}
              onChange={(id) => {
                onSelectScope?.({ kind: 'brand', brandId: id });
              }}
            />
          ) : (
            <span className="frame-scope-static" data-frame-scope="company">
              {t('frame.scope.company')}
            </span>
          )}
        </div>

        <div className="frame-modules" data-frame-slot="modules">
          {(moduleTabs ?? []).map((item) => (
            <button
              key={item.key}
              type="button"
              className="frame-tab"
              aria-current={item.key === currentModuleTabKey ? 'page' : undefined}
              onClick={() => {
                onSelectModuleTab?.(item.key);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="frame-spacer" aria-hidden="true" />

        {needs !== undefined && (
          <div className="frame-needs-entry" data-frame-slot="needs">
            {needs.onToggleRail !== undefined && (
              <button
                type="button"
                className="frame-iconbtn"
                aria-label={t('need.rail.toggle')}
                aria-pressed={needs.railOpen === true}
                onClick={needs.onToggleRail}
              >
                <Icon name="panel" />
              </button>
            )}

            <button
              type="button"
              className="frame-needs-btn"
              aria-label={t('need.topbar.open')}
              aria-current={needs.active ? 'page' : undefined}
              onClick={needs.onOpen}
            >
              <span className="frame-needs-btn__label">{t('need.topbar.label')}</span>
              <span className="frame-needs-btn__count">{needs.count}</span>
            </button>
          </div>
        )}

        <div className="frame-slot frame-tools" data-frame-slot="tools">
          {tools
            .filter((tool) => tool.handler !== undefined)
            .map((tool) => (
              <button
                key={tool.key}
                type="button"
                className="frame-tool"
                aria-label={tool.label}
                onClick={tool.handler}
              >
                {tool.icon !== undefined && <Icon name={tool.icon} />}
                <span className="frame-tool__label">{tool.label}</span>
              </button>
            ))}

          {/* 唔放主題切換：設計稿只有淺色一套（決策 C65），撳落去只會
              換到一套冇人設計過的深色，等於製造一個假功能。 */}

          <span className="frame-account">
            <span className="frame-avatar" aria-hidden="true">
              {initialOf(account.displayName)}
            </span>
            <span className="frame-account__name">
              {account.displayName.trim().length > 0 ? account.displayName : t('frame.account.nameMissing')}
            </span>
          </span>

          <button
            type="button"
            className="frame-iconbtn frame-iconbtn--text"
            disabled={account.signingOut}
            onClick={onSignOut}
          >
            {t('home.signOut')}
          </button>
        </div>
      </header>

      <nav className="frame-subbar" data-frame-subbar aria-label={t('frame.landmark.subbar')}>
        {modulePages.map((item) => (
          <button
            key={item.key}
            type="button"
            className="frame-subtab"
            aria-current={item.key === currentPageKey ? 'page' : undefined}
            onClick={() => {
              onSelectPage(item.key);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div
        className="frame-body"
        data-frame-has-sidebar={showSidebar ? 'true' : 'false'}
        data-frame-has-rail={showRail ? 'true' : 'false'}
      >
        {showSidebar && (
          <aside className="frame-sidebar" data-frame-rail aria-label={t('frame.landmark.sidebar')}>
            {groups.map((group, index) => (
              <section className="frame-sidebar__group" key={group.title ?? `group-${index}`}>
                {group.title !== undefined && (
                  <p className="frame-sidebar__group-title">{group.title}</p>
                )}
                <ul className="frame-sidebar__list">
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        className="frame-sidebar__item"
                        aria-current={item.key === currentPageKey ? 'page' : undefined}
                        onClick={() => {
                          onSelectPage(item.key);
                        }}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </aside>
        )}

        <main
          className="frame-content"
          id="frame-content"
          data-frame-main
          tabIndex={-1}
          aria-label={t('frame.landmark.content')}
        >
          {breadcrumbs !== undefined && breadcrumbs.length > 0 && (
            <nav className="frame-breadcrumb" data-frame-breadcrumb aria-label={t('frame.landmark.breadcrumb')}>
              <ol className="frame-breadcrumb__list">
                {breadcrumbs.map((crumb, index) => (
                  <li key={`${crumb}-${index}`}>{crumb}</li>
                ))}
              </ol>
            </nav>
          )}

          <div className="frame-content__head">
            {pageTitle !== undefined && <h1 className="frame-content__title">{pageTitle}</h1>}
            {pageSubtitle !== undefined && (
              <p className="frame-content__subtitle">{pageSubtitle}</p>
            )}
            {primaryAction !== undefined && (
              <div className="frame-content__action">{primaryAction}</div>
            )}
          </div>

          {prototype && (
            <p className="frame-proto">
              <span className="frame-proto__badge">{t('frame.prototype.badge')}</span>
            </p>
          )}

          {blocked !== undefined ? (
            <div className="frame-content__blocked" role="status">
              <p className="frame-content__blocked-title">{blocked.title}</p>
              <p className="frame-content__blocked-body">{blocked.description}</p>
            </div>
          ) : (
            children
          )}
        </main>

        {showRail && needsRail !== undefined && (
          <aside className="frame-rail" data-frame-needs-rail aria-label={needsRail.title}>
            <div className="frame-rail__head">
              <span className="frame-rail__title">{needsRail.title}</span>
              <button type="button" className="frame-rail__link" onClick={needsRail.onOpenAll}>
                {needsRail.totalLabel}
              </button>
            </div>

            {needsRail.items.length === 0 ? (
              <p className="frame-rail__empty">{needsRail.emptyLabel}</p>
            ) : (
              <ul className="frame-rail__list">
                {needsRail.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="frame-need"
                      onClick={() => {
                        needsRail.onOpenNeed(item.id);
                      }}
                    >
                      <span className="frame-need__head">
                        <span className="frame-need__code">{item.code}</span>
                        <span className="frame-need__kind">{item.kindLabel}</span>
                      </span>
                      <span className="frame-need__title">{item.title}</span>
                      <span className="frame-need__meta">
                        <span>{item.stateLabel}</span>
                        {item.metaLabel !== undefined && (
                          <>
                            <span className="frame-need__sep" aria-hidden="true" />
                            <span>{item.metaLabel}</span>
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="frame-rail__foot">
              <span>{needsRail.closedLabel}</span>
              <button type="button" className="frame-rail__link" onClick={needsRail.onOpenAll}>
                {needsRail.historyLabel}
              </button>
            </div>
          </aside>
        )}
      </div>

      <footer className="frame-footer" data-frame-footer aria-label={t('frame.landmark.footer')}>
        <div className="frame-footer__identity">
          <span className="frame-mark" data-frame-mark aria-hidden="true">
            {companyMarkNode}
          </span>
          <span className="frame-footer__label">{t('frame.footer.localCompany')}</span>
          <span className="frame-footer__company">{companyNameText}</span>
          {region !== undefined && <span className="frame-footer__region">{region}</span>}
        </div>

        {sitesEntry !== undefined && (
          <div className="frame-footer__sites" data-frame-sites>
            {sitesEntry}
          </div>
        )}

        <span className="frame-footer__headoffice">{t('frame.footer.headOffice')}</span>
      </footer>
    </div>
  );
}
