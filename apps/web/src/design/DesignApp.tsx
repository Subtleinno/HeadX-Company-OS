import { t } from '@company-os/i18n';
import type { ReactNode } from 'react';
import type { BrandItem, PublicUser } from '../api';
import { AppFrame } from '../frame/AppFrame';
import { DESIGN_NAV, resolveNav, type NavPosition } from '../frame/appNav';
import { useBrands, useSelectedBrand } from '../frame/useDirectory';
import { navigatePath, useHashPath } from '../router';
import { BrandScreen } from './BrandScreen';
import { CreateLibrary } from './CreateLibrary';

/**
 * Design app（設計／內容／網站）。
 *
 * 五個模組：Create、Brand、Materials、Knowledge、Templates。
 * Needs 留在外殼，不成為第六個業務模組。
 *
 * 2026-11-17 老闆指示：Create／Materials／Knowledge／Templates 四個模組的
 * 前後端全部清空，由零重做。所以這四個模組**只畫骨架**：第二層頂欄、
 * 左欄、內容區全部留空（`AppFrame` 的 `blank`），連頁名、麵包屑同
 * 「未提供」佔位卡都不畫 —— 任何一格字都會令人以為那頁已經做好。
 * 路由與 `DESIGN_NAV` 保留，重做時在同一個位置接著做。
 *
 * 2026-11-17 另一項：**品牌只在 Boss Portal 建立**（`#/boss/brand`）。
 * 這裡不再有「新增品牌」按鈕與表單 —— 品牌一開全公司都用得，屬公司層動作。
 * 沒有品牌時，這一頁只講清楚去哪裡開，不放一個半功能的表單。
 */

type DesignAppProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

function NoBrand(props: { canCreate: boolean }) {
  return (
    <div className="design-empty" data-brand-nobrand>
      <p className="design-empty__title">{t('brand.page.noBrand')}</p>
      <p className="design-empty__body">{t('brand.page.noBrandBody')}</p>

      {props.canCreate ? (
        <button
          type="button"
          className="design-btn design-btn--primary"
          data-brand-open-boss
          onClick={() => {
            navigatePath('/boss', 'brand');
          }}
        >
          {t('brand.page.openBoss')}
        </button>
      ) : (
        <p className="design-footnote" data-brand-create="owner-only">
          {t('design.brand.ownerOnly')}
        </p>
      )}
    </div>
  );
}

export function DesignApp({ user, onSignedOut }: DesignAppProps) {
  const path = useHashPath();
  const brands = useBrands(true);
  const items: readonly BrandItem[] = brands.state.kind === 'ready' ? brands.state.items : [];
  const { brandId } = useSelectedBrand(brands.state);
  const selected = items.find((item) => item.id === brandId) ?? null;

  const nav = DESIGN_NAV;
  const position = resolveNav(nav, path);
  const inBrand = position.navModule.key === 'brand';
  const inCreate = position.navModule.key === 'create';

  function renderPage(current: NavPosition, sidebar: { open: boolean; toggle: () => void }): ReactNode {
    if (current.navModule.key === 'brand') {
      if (brandId === null) {
        return <NoBrand canCreate={user.role === 'owner'} />;
      }

      return <BrandScreen brandId={brandId} brandName={selected?.name} railOpen={sidebar.open} onToggleRail={sidebar.toggle} />;
    }

    if (current.navModule.key === 'create') {
      if (brandId === null) {
        return <NoBrand canCreate={user.role === 'owner'} />;
      }

      return <CreateLibrary brandId={brandId} railOpen={sidebar.open} onToggleRail={sidebar.toggle} />;
    }

    // Materials／Knowledge／Templates：前後端已清空、由老闆重做，
    // 所以連佔位卡都不畫，只留下空骨架（見下面的 `blank`）。
    return null;
  }

  return (
    <div className="design-modern">
      <AppFrame
        nav={nav}
        user={user}
        path={path}
        onSignOut={onSignedOut}
        {...(inBrand || inCreate ? { hideSidebar: true } : {})}
        {...(inBrand || inCreate ? {} : { blank: true })}
      >
        {(current: NavPosition, sidebar) => renderPage(current, sidebar)}
      </AppFrame>
    </div>
  );
}
