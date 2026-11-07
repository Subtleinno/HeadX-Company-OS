import { useEffect, type ReactNode } from 'react';
import { t } from '@company-os/i18n';
import { Selector, type SelectorOption } from '@company-os/ui-kit';
import { Icon, type IconName } from './icons.js';
import { applyTheme, nextTheme, type ShellTheme } from './theme.js';
import type { AppMode, BrandRef, PrototypeApp, ScopeTarget, ShellNavItem } from './workspace.js';

/**
 * Base UI 外殼（#118 切片 B）。
 *
 * 由上至下三層：全局頂欄、頁面子選單列、左工作欄＋右主內容。外殼佔滿視窗，
 * 內容由第二行下方開始靠左排，不是置中的 dashboard 卡片網格。
 *
 * 2026-11-07 起，視覺層對齊 HxDesign 的實際實作（見
 * docs/product/BASE-UI-HXDESIGN-ALIGNMENT.md）。結構與行為**沒有**跟住改：
 *
 * 1. 呢個元件**唔會**自己決定去邊個 app、邊個品牌。所有選擇都用 callback 交返
 *    呼叫端，因為切片 C 要處理「切換失敗時保留原上下文」「舊回應不覆蓋新範圍」；
 *    如果元件自己記住選擇，就無辦法在失敗時原封不動退回。
 * 2. 公司型唔會渲染一個失效的品牌下拉。它顯示公司範圍的資訊 —— 一個按下去
 *    沒反應的按鈕比沒有按鈕更令人以為壞了。
 * 3. 沒有工作索引時整條工作欄不渲染，開關如實停用。空白的工作欄會令人以為
 *    載入失敗或者還有東西未出現。
 *
 * 模式只影響入口（決策 C46），唔會喺呢度建立、修改或撤銷任何授權。
 */

export type BaseShellProps = {
  apps: readonly PrototypeApp[];
  currentAppId: string;
  scope: ScopeTarget | null;
  brands: readonly BrandRef[];
  theme: ShellTheme;
  sidebarOpen: boolean;
  account: { displayName: string; signingOut: boolean };
  /** 第二行：按頁面而變。 */
  subMenuItems: readonly ShellNavItem[];
  /** 左欄：按頁面而變；空陣列代表這個頁面沒有工作索引。 */
  railItems: readonly ShellNavItem[];
  currentPageKey: string | null;
  /** 原型標示（決策 C50）。正式接駁時會是 false。 */
  prototype?: boolean;
  onSelectApp: (appId: string) => void;
  onSelectScope: (scope: ScopeTarget) => void;
  onSelectPage: (pageKey: string) => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
  children: ReactNode;
};

const SCOPE_COMPANY_ID = 'company';
const BRAND_PREFIX = 'brand:';

/**
 * 模式 → 圖示。跟 HxDesign 把 workspace 種類畫成不同 glyph 的做法一致，
 * 但這裡畫的是**模式**，不是資料種類：純視覺約定，不帶授權語意（C46）。
 */
const MODE_ICON: Record<AppMode, IconName> = {
  company: 'monitor',
  brand: 'cube',
  mixed: 'sparkle',
};

function brandOptionId(brandId: string): string {
  return `${BRAND_PREFIX}${brandId}`;
}

function scopeToOptionId(scope: ScopeTarget | null): string | null {
  if (scope === null) {
    return null;
  }

  return scope.kind === 'company' ? SCOPE_COMPANY_ID : brandOptionId(scope.brandId);
}

function optionIdToScope(id: string): ScopeTarget {
  return id === SCOPE_COMPANY_ID
    ? { kind: 'company' }
    : { kind: 'brand', brandId: id.slice(BRAND_PREFIX.length) };
}

/** 帳戶名稱取第一個字做頭像。空字串不可以畫出一個空白圓，所以退回一個點。 */
function initialOf(displayName: string): string {
  const first = displayName.trim().slice(0, 1);

  return first.length > 0 ? first.toUpperCase() : '·';
}

export function BaseShell({
  apps,
  currentAppId,
  scope,
  brands,
  theme,
  sidebarOpen,
  account,
  subMenuItems,
  railItems,
  currentPageKey,
  prototype = false,
  onSelectApp,
  onSelectScope,
  onSelectPage,
  onToggleSidebar,
  onToggleTheme,
  onSignOut,
  children,
}: BaseShellProps) {
  const app = apps.find((item) => item.id === currentAppId) ?? null;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const hasRail = railItems.length > 0;
  const showRail = hasRail && sidebarOpen;

  // 品牌型必須有明確品牌；冇就唔會渲染成功畫面（切片 C 會接手第二步選擇）。
  const needsBrand = app?.mode === 'brand' && scope?.kind !== 'brand';

  const brandOptions: SelectorOption[] = brands.map((brand) => ({
    id: brandOptionId(brand.id),
    label: `${t('shell.scope.brand')} · ${brand.name}`,
  }));

  // 品牌型只列出可以進入的品牌；混合型先有公司呢一項。
  const scopeOptions: SelectorOption[] =
    app?.mode === 'brand'
      ? brandOptions
      : [{ id: SCOPE_COMPANY_ID, label: t('shell.scope.company') }, ...brandOptions];

  const appOptions: SelectorOption[] = apps.map((item) => ({
    id: item.id,
    label: item.title,
    icon: <Icon name={MODE_ICON[item.mode]} />,
  }));

  const scopeValue = scopeToOptionId(scope);
  const scopeKind = scope?.kind ?? 'none';
  const themeLabel = theme === 'dark' ? t('shell.theme.toLight') : t('shell.theme.toDark');

  function renderScope() {
    if (app === null) {
      return null;
    }

    if (app.mode === 'company') {
      return (
        <span className="shell-scope-static" data-scope-static="true">
          {t('shell.scope.company')}
        </span>
      );
    }

    if (app.mode === 'brand' && brands.length === 0) {
      return <span className="shell-scope-static">{t('shell.scope.none')}</span>;
    }

    return (
      <Selector
        label={t('shell.scope')}
        value={scopeValue}
        options={scopeOptions}
        placeholder={t('shell.scope.selectBrand')}
        onChange={(id) => {
          onSelectScope(optionIdToScope(id));
        }}
      />
    );
  }

  function renderBlockedMain() {
    if (app === null) {
      return <p className="shell-main__blocked">{t('shell.app.missing')}</p>;
    }

    if (needsBrand) {
      return (
        <div className="shell-main__blocked" role="status">
          <p className="shell-main__blocked-title">{t('shell.scope.selectBrand')}</p>
          <p className="shell-main__blocked-body">{t('shell.scope.required')}</p>
        </div>
      );
    }

    return children;
  }

  return (
    <div className="shell-frame" data-shell-theme={theme}>
      <a className="shell__skip" href="#shell-main">
        {t('shell.skipToContent')}
      </a>

      <header className="shell-topbar">
        <div className="shell-topbar__start">
          <div className="shell-slot" data-shell-slot="sidebar">
            <button
              type="button"
              className="shell-iconbtn"
              aria-label={t('shell.rail.toggle')}
              aria-expanded={sidebarOpen}
              disabled={!hasRail}
              title={hasRail ? undefined : t('shell.rail.empty')}
              onClick={onToggleSidebar}
            >
              <Icon name="menu" />
            </button>
          </div>

          <div className="shell-slot shell-slot--app" data-shell-slot="app">
            <Selector
              label={t('shell.appSwitcher')}
              value={app?.id ?? null}
              options={appOptions}
              placeholder={t('shell.appSwitcher.empty')}
              disabled={appOptions.length === 0}
              onChange={onSelectApp}
            />
          </div>

          <div className="shell-slot shell-slot--scope" data-shell-slot="scope" data-scope-kind={scopeKind}>
            {renderScope()}
          </div>

          <div className="shell-slot shell-topbar__menu" data-shell-slot="app-menu">
            <nav className="shell-tabs" aria-label={t('shell.mainNav')}>
              {app?.menu.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="shell-tab"
                  aria-current={item.key === currentPageKey ? 'page' : undefined}
                  onClick={() => {
                    onSelectPage(item.key);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="shell-slot shell-topbar__tools" data-shell-slot="tools">
          <button type="button" className="shell-iconbtn" aria-label={themeLabel} onClick={onToggleTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>

          <span className="shell-account">
            <span className="shell-avatar" aria-hidden="true">
              {initialOf(account.displayName)}
            </span>
            <span className="shell-account__name" aria-label={t('shell.account')}>
              {account.displayName}
            </span>
          </span>

          <button
            type="button"
            className="shell-iconbtn shell-iconbtn--text"
            disabled={account.signingOut}
            onClick={onSignOut}
          >
            {t('home.signOut')}
          </button>
        </div>
      </header>

      <div
        className="shell-subnav"
        data-shell-row="subnav"
        role="navigation"
        aria-label={t('shell.subnav')}
      >
        {subMenuItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className="shell-subtab"
            aria-current={item.key === currentPageKey ? 'page' : undefined}
            onClick={() => {
              onSelectPage(item.key);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="shell-body" data-shell-has-rail={showRail ? 'true' : 'false'}>
        {showRail && (
          <aside className="shell-rail" data-shell-rail aria-label={t('shell.rail')}>
            <ul className="shell-rail__list">
              {railItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className="shell-railitem"
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
          </aside>
        )}

        <main className="shell-main" id="shell-main" data-shell-main tabIndex={-1}>
          {prototype && (
            <p className="shell-proto">
              <span className="shell-proto__badge">{t('shell.prototype.badge')}</span>
              <span className="shell-proto__text">{t('shell.prototype')}</span>
            </p>
          )}
          {renderBlockedMain()}
        </main>
      </div>
    </div>
  );
}

/** 對外公開「下一個主題」，令呼叫端不必自己寫三元式。 */
export { nextTheme };
