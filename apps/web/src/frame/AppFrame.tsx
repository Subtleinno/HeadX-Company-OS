import type { ReactNode } from 'react';
import type { FrameSidebarGroup } from '@company-os/app-shell';
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
  pageTitle: string;
  pageSubtitle?: string;
  primaryAction?: ReactNode;
  /** Needs 之外，呢一頁要唔要右側欄。 */
  withRail?: boolean;
  children: (position: NavPosition) => ReactNode;
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
  withRail = false,
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
    group.pages.map((page) => ({ key: page.key, label: navLabel(page) })),
  );

  const sidebarGroups: FrameSidebarGroup[] = position.navModule.groups.map((group) => ({
    ...(group.titleKey === undefined ? {} : { title: t(group.titleKey) }),
    items: group.pages.map((page) => ({
      key: page.key,
      label: navLabel(page),
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

  // 第一格（app 名稱）唔喺呢度砌：名稱只有 manifest 一個來源，由
  // `FrameApps` 補上。呢度只講「模組 / 頁 / 章節」。
  const breadcrumbs = [
    t(position.navModule.labelKey),
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
      currentAppRoute={nav.base}
      moduleTabs={nav.modules.map((item) => ({ key: item.key, label: t(item.labelKey) }))}
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
      modulePages={modulePages}
      currentPageKey={position.page.key}
      onSelectPage={goToPage}
      currentSectionKey={position.section?.key ?? null}
      onSelectSection={(pageKey, sectionKey) => {
        navigatePath(base, position.navModule.key, pageKey, sectionKey);
      }}
      sidebarGroups={sidebarGroups}
      sidebarOpen={chrome.sidebarOpen}
      onToggleSidebar={chrome.onToggleSidebar}
      theme={chrome.theme}
      account={{ displayName: user.displayName, signingOut }}
      onSignOut={onSignOut}
      breadcrumbs={breadcrumbs}
      pageTitle={pageTitle}
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
      {children(position)}
    </FrameApps>
  );
}
