import type { ReactNode } from 'react';
import type { FrameSidebarGroup, FrameSidebarSearch } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import type { PublicUser } from '../api';
import { navigate, navigatePath, type Route } from '../router';
import { navLabel, resolveNav, type AppNav, type NavPosition } from './appNav';
import { FrameApps } from './FrameApps';
import { useBrands, useCompanyIdentity, useSelectedBrand } from './useDirectory';
import { useFrameChrome } from './useFrameChrome';

/**
 * 部門 app 的外殼：把「導覽模型」翻譯成 FrameShell 認得的形狀。
 *
 * 為咩要有呢一層：Boss Portal 同 Design 兩邊的導覽完全唔同，但頂欄、
 * 左側欄、麵包屑、頁尾的組法一模一樣。如果每個 app 各自砌一次，就會出現
 * 「呢個 app 的麵包屑多一格、嗰個少一格」呢種講唔通的分別。
 *
 * 呢一層只做翻譯，唔做決定：
 *   - 邊個 app、邊個模組、邊一頁 → 由 `AppNav` 同網址講，呢度唔自己記。
 *   - 品牌 selector 有冇，由 `nav.scoped` 講（Boss Portal 係公司範圍，冇）。
 *   - 第二層模組頁頂欄（老闆 2026-11-11 定：還原）列出目前模組嘅頁，
 *     同左側欄共用同一份 `AppNav`，唔喺呢度另寫一份頁名。
 */

export type AppFrameProps = {
  nav: AppNav;
  user: PublicUser;
  /** `useHashPath()` 的結果。 */
  path: readonly string[];
  onSignOut: () => void;
  signingOut?: boolean;
  pageTitle?: string;
  pageSubtitle?: string;
  primaryAction?: ReactNode;
  /**
   * 只畫骨架：第二層頂欄、左欄、內容區全部留空（見 `FrameShell.blank`）。
   * 2026-11-17 老闆指示的四個 Design 模組就是這個狀態：由零重做，畫面上
   * 不應該有任何頁名、麵包屑或佔位卡。
   */
  blank?: boolean;
  /** Needs 之外，呢一頁要唔要右側欄。 */
  withRail?: boolean;
  sidebarSearch?: FrameSidebarSearch;
  /** 由目前列表事實推出的資料夾數量，例如各格式的 Project 數。 */
  sidebarBadges?: Readonly<Record<string, string>>;
  /**
   * 只有一頁的模組照樣列出左欄。
   *
   * 預設收起（單頁模組同麵包屑重複三次）。但 Boss Portal 的「品牌」是一個
   * **清單**而不是單頁：即使目前只有一個品牌，老闆也要在左欄見到它在那裡，
   * 否則下一個品牌出現時，他不會知道去哪裡找。
   */
  listSinglePage?: boolean;
  /**
   * 完全唔畫左欄。
   *
   * 品牌模組自己有一棵「資料夾 → 品牌集」的樹：外殼再加一份頁清單就會
   * 出現兩條左欄，兩邊叫同一個東西但內容唔同。所以由呼叫端講明「這頁的
   * 左欄由我自己負責」。
   */
  hideSidebar?: boolean;
  children: (position: NavPosition, sidebar: { open: boolean; toggle: () => void }) => ReactNode;
};

function toRoute(path: string): Route {
  return path as Route;
}

export function AppFrame({
  nav,
  user,
  path,
  onSignOut,
  signingOut = false,
  pageTitle,
  pageSubtitle,
  primaryAction,
  blank = false,
  withRail = false,
  sidebarSearch,
  sidebarBadges,
  listSinglePage = false,
  hideSidebar = false,
  children,
}: AppFrameProps) {
  const chrome = useFrameChrome();
  const position = resolveNav(nav, path);
  const brands = useBrands(true);
  const brandItems = brands.state.kind === 'ready' ? brands.state.items : [];
  const { brandId, selectBrand } = useSelectedBrand(brands.state);
  const company = useCompanyIdentity(true);

  const base = toRoute(nav.base);

  // 第二層模組頁頂欄嘅頁籤。由 nav 模型直接推，`onSelectPage` 同左側欄
  // 用同一個 key，所以兩邊點選結果一定一致。
  const modulePages = position.navModule.groups.flatMap((group) =>
    group.pages
      .filter((page) => page.subbar !== false)
      .map((page) => ({ key: page.key, label: navLabel(page) })),
  );

  const sidebarGroups: FrameSidebarGroup[] = position.navModule.groups.map((group) => ({
    ...(group.titleKey === undefined ? {} : { title: t(group.titleKey) }),
    items: group.pages.map((page) => ({
      key: page.key,
      label: navLabel(page),
      ...(page.badge === undefined && sidebarBadges?.[page.key] === undefined
        ? {}
        : { badge: page.badge ?? sidebarBadges?.[page.key], badgeTone: page.badgeTone ?? 'muted' }),
      ...(page.sections === undefined
        ? {}
        : {
            sections: page.sections.map((section) => ({
              key: section.key,
              label: navLabel(section),
            })),
          }),
    })),
  }));

  // 只有一頁的模組：左下角「頁面」清單只會列出一項，同麵包屑重複三次。
  // 單頁模組直接收起那條欄，內容區因此更寬（品牌、素材等只有一頁的模組）。
  const pageCount = position.navModule.groups.reduce((total, group) => total + group.pages.length, 0);
  const visibleSidebarGroups: FrameSidebarGroup[] = hideSidebar
    ? []
    : pageCount > 1 || (listSinglePage && pageCount > 0)
      ? sidebarGroups
      : [];

  // 第一格（app 名稱）唔喺呢度砌：名稱只有 manifest 一個來源，由
  // `FrameApps` 補上。呢度只講「模組 / 頁 / 章節」。
  const breadcrumbs = [
    navLabel(position.navModule),
    navLabel(position.page),
    ...(position.section === null ? [] : [navLabel(position.section)]),
  ];

  const goToPage = (pageKey: string): void => {
    navigatePath(base, position.navModule.key, pageKey);
  };

  const identity = company.kind === 'ready' ? company.identity : null;

  return (
    <FrameApps
      {...(withRail ? { withRail } : {})}
      {...(blank ? { blank } : {})}
      currentAppRoute={nav.base}
      moduleTabs={nav.modules.map((item) => ({ key: item.key, label: navLabel(item) }))}
      currentModuleTabKey={position.navModule.key}
      onSelectModuleTab={(key) => {
        // 轉模組一律由第一頁開始：留住上一模組的頁名會對唔到任何一頁。
        const target = nav.modules.find((item) => item.key === key);

        if (target !== undefined) {
          const firstPage = target.groups[0]?.pages[0];

          navigatePath(base, key, ...(firstPage === undefined ? [] : [firstPage.key]));
        }
      }}
      {...(nav.scoped && brandId !== null
        ? {
            scope: { kind: 'brand' as const, brandId },
            brands: brandItems.map((item) => ({ id: item.id, name: item.name })),
            onSelectScope: (scope: { kind: string; brandId?: string }) => {
              if (scope.kind === 'brand' && typeof scope.brandId === 'string') {
                selectBrand(scope.brandId);
              }
            },
          }
        : {})}
      modulePages={blank ? [] : modulePages}
      currentPageKey={position.page.key}
      onSelectPage={goToPage}
      currentSectionKey={position.section?.key ?? null}
      onSelectSection={(pageKey, sectionKey) => {
        navigatePath(base, position.navModule.key, pageKey, sectionKey);
      }}
      sidebarGroups={blank ? [] : visibleSidebarGroups}
      {...(hideSidebar ? { hasCustomSidebar: true } : {})}
      {...(sidebarSearch === undefined ? {} : { sidebarSearch })}
      sidebarOpen={chrome.sidebarOpen}
      onToggleSidebar={chrome.onToggleSidebar}
      theme={chrome.theme}
      account={{ displayName: user.displayName, signingOut }}
      onSignOut={onSignOut}
      breadcrumbs={blank ? [] : breadcrumbs}
      {...(blank || pageTitle === undefined ? {} : { pageTitle })}
      {...(pageSubtitle === undefined ? {} : { pageSubtitle })}
      {...(primaryAction === undefined ? {} : { primaryAction })}
      {...(identity === null ? {} : { companyName: identity.name ?? undefined, region: identity.city ?? undefined })}
      {...(user.role === 'owner'
        ? {
            sitesEntry: (
              <button
                type="button"
                className="frame-footer__link"
                onClick={() => {
                  navigate('/boss');
                }}
              >
                {t('frame.footer.sitesEntry')}
              </button>
            ),
          }
        : {})}
    >
      {children(position, { open: chrome.sidebarOpen, toggle: chrome.onToggleSidebar })}
    </FrameApps>
  );
}
