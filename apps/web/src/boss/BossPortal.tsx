import { useMemo, useEffect, useState } from 'react';
import { t, type MessageKey } from '@company-os/i18n';
import type { PublicUser } from '../api';
import { BrandBusinessStage, CompanyMarketingStage } from '../design/BrandScreen';
import { AppFrame } from '../frame/AppFrame';
import { BOSS_NAV, navLabel, resolveNav, type AppNav, type NavPosition } from '../frame/appNav';
import { useBrands } from '../frame/useDirectory';
import { navigatePath, useHashPath } from '../router';
import { AddSiteScreen } from './AddSiteScreen';
import { BossOverview } from './BossOverview';
import { BrandsScreen } from './BrandsScreen';
import { MembersScreen } from './MembersScreen';
import { PermissionGate } from './PermissionGate';
import { SitesScreen } from './SitesScreen';
import { useSites } from './useSites';

/**
 * Boss Portal：老闆的總覽，唔係一個部門 app（決策 C12、C68）。
 *
 * 佢喺 App selector 入面，但範圍係整間公司 —— 所以冇品牌 selector。
 * 換品牌對「邊幾台機入得到」呢個問題冇意義。
 *
 * 五條模組（總覽／品牌／據點與機器／人員／存取紀錄）之下嘅頁全部喺左側欄
 * （老闆 2026-11-10：頁放左側欄）。未做嘅頁顯示一句如實嘅說明，
 * 唔會放一個假表格。
 *
 * 「品牌」這一條是 2026-11-17 老闆加：00 業務基礎講的是「這門生意怎麼運作」，
 * 不屬於品牌設計，所以由 Design 搬過來。左欄一頁一個品牌，點入去就是那一格
 * 的業務基礎；首頁則是所有品牌的業務總覽。
 *
 * 同日第二項：**新增品牌的入口也在這裡**（`#/boss/brand` 的「全部品牌」頁）。
 * 品牌一開全公司都用得，屬公司層動作；Design 不再有這個按鈕。這一頁是常駐的，
 * 所以連一個品牌都未有時都到得了 —— 否則第一個品牌無處可開。
 */

type BossPortalProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

const SUBTITLE: Record<string, MessageKey> = {
  // 首頁不再是四格數字，所以副標也換一句講「這頁講什麼」。
  // 舊鍵 `boss.overview.lead` 原封不動留低：i18n 有「已交付文案零改動」的閘。
  overview: 'boss.overview.leadBusiness',
  brands: 'boss.brand.lead',
  marketing: 'boss.marketing.lead',
  directory: 'boss.sites.lead',
  add: 'boss.add.lead',
  members: 'boss.members.lead',
};

function BossStub() {
  return (
    <div className="boss-stub">
      <p className="boss-stub__title">{t('boss.stub.title')}</p>
      <p className="boss-stub__body">{t('boss.stub.body')}</p>
    </div>
  );
}

export function BossPortal({ user, onSignedOut }: BossPortalProps) {
  const path = useHashPath();
  const isOwner = user.role === 'owner';
  const sites = useSites(isOwner);
  const brands = useBrands(isOwner);
  const brandItems = brands.state.kind === 'ready' ? brands.state.items : [];
  // 新增品牌的表單是否打開。它在頁頭按鈕裡開，所以狀態住在這裡。
  const [creating, setCreating] = useState(false);

  /**
   * 導覽由品牌清單推出來：`brand` 模組永遠有第一頁「全部品牌」
   * （`#/boss/brand`），品牌清單讀到甚麼就接在後面，一頁一個
   * （`#/boss/brand/<id>`）。一個品牌都未有時，這頁仍然到得了 ——
   * 否則連第一個品牌都無處可開。
   *
   * 只有一頁時，AppFrame 預設會收起左欄；這裡照樣列出，因為「品牌」
   * 是一個清單，不是一頁。
   */
  const nav = useMemo<AppNav>(() => {
    if (brandItems.length === 0) {
      return BOSS_NAV;
    }

    const modules = BOSS_NAV.modules.map((module) => {
      if (module.key !== 'brand') {
        return module;
      }

      return {
        ...module,
        groups: [
          {
            pages: [
              ...module.groups[0]!.pages,
              ...brandItems.map((brand) => ({ key: brand.id, label: brand.name })),
            ],
          },
        ],
      };
    });

    return { ...BOSS_NAV, modules };
  }, [brandItems]);

  const position = resolveNav(nav, path);

  // 一離開「全部品牌」就收起表單：回來時不應該是半張已被遺忘的表單。
  const pageKey = position.page.key;
  useEffect(() => {
    setCreating(false);
  }, [pageKey]);

  if (!isOwner) {
    return <PermissionGate role={user.role} />;
  }

  const subtitleKey = SUBTITLE[position.page.key];

  function renderPage(current: NavPosition) {
    // 網址指住某個品牌（`#/boss/brand/<id>`）：清單未到就講「讀緊」，讀失敗就
    // 講讀唔到，清單到了但沒有這個 id 就是真的找不到。三種情況都不可以靜靜
    // 畫返「全部品牌」扮無事發生 —— 用戶會以為品牌被消失了。
    if (path[0] === 'brand' && path[1] !== undefined) {
      if (brands.state.kind === 'loading') {
        return <p className="boss-note">{t('brandBuild.loading')}</p>;
      }

      if (brands.state.kind === 'failed') {
        return (
          <p className="boss-note boss-note--error" role="alert">
            {t('boss.overview.readFailed')}
          </p>
        );
      }

      if (current.page.key !== path[1]) {
        return <p className="boss-note">{t('boss.brand.notFound')}</p>;
      }
    }

    if (current.navModule.key === 'brand') {
      // 「全部品牌」是清單與新增入口；其餘 key 就是某個品牌，開它的 00 業務基礎。
      if (current.page.key === 'brands') {
        return (
          <BrandsScreen
            state={brands.state}
            canCreate={isOwner}
            creating={creating}
            onCreated={() => {
              setCreating(false);
              brands.reload();
            }}
            onCancel={() => {
              setCreating(false);
            }}
          />
        );
      }

      return <BrandBusinessStage brandId={current.page.key} brandName={navLabel(current.page)} />;
    }

    if (current.navModule.key === 'marketing') {
      // 04F 行銷內容：公司層一份，只有老闆讀得到（後端 403 把關）。
      return <CompanyMarketingStage brandName={t('boss.marketing.scope')} />;
    }

    if (current.page.key === 'overview') {
      return <BossOverview />;
    }

    if (current.page.key === 'directory') {
      return (
        <SitesScreen
          state={sites.state}
          onApproved={sites.reload}
          onAdd={() => {
            navigatePath('/boss', 'sites', 'add');
          }}
        />
      );
    }

    if (current.page.key === 'add') {
      return (
        <AddSiteScreen
          onDone={() => {
            sites.reload();
            navigatePath('/boss', 'sites', 'directory');
          }}
        />
      );
    }

    if (current.page.key === 'members') {
      return <MembersScreen />;
    }

    return <BossStub />;
  }

  return (
    <AppFrame
      nav={nav}
      user={user}
      path={path}
      onSignOut={onSignedOut}
      pageTitle={navLabel(position.page)}
      {...(position.navModule.key === 'brand' ? { listSinglePage: true } : {})}
      {...(subtitleKey === undefined ? {} : { pageSubtitle: t(subtitleKey) })}
      {...(position.page.key === 'directory'
        ? {
            primaryAction: (
              <button
                type="button"
                className="boss-btn boss-btn--primary"
                onClick={() => {
                  navigatePath('/boss', 'sites', 'add');
                }}
              >
                {t('boss.sites.addAction')}
              </button>
            ),
          }
        : {})}
      {...(position.page.key === 'brands' && !creating
        ? {
            primaryAction: (
              <button
                type="button"
                className="boss-btn boss-btn--primary"
                data-brand-add
                onClick={() => {
                  setCreating(true);
                }}
              >
                {t('boss.brand.add')}
              </button>
            ),
          }
        : {})}
    >
      {(current: NavPosition) => renderPage(current)}
    </AppFrame>
  );
}
