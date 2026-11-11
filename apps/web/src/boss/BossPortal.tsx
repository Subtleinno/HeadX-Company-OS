import { t, type MessageKey } from '@company-os/i18n';
import type { PublicUser } from '../api';
import { AppFrame } from '../frame/AppFrame';
import { BOSS_NAV, resolveNav, type NavPosition } from '../frame/appNav';
import { navigatePath, useHashPath } from '../router';
import { AddSiteScreen } from './AddSiteScreen';
import { BossOverview } from './BossOverview';
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
 * 四條模組（總覽／據點與機器／人員／存取紀錄）之下嘅頁全部喺左側欄
 * （老闆 2026-11-10：頁放左側欄）。未做嘅頁顯示一句如實嘅說明，
 * 唔會放一個假表格。
 */

type BossPortalProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

const SUBTITLE: Record<string, MessageKey> = {
  overview: 'boss.overview.lead',
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
  const position = resolveNav(BOSS_NAV, path);
  const isOwner = user.role === 'owner';
  const sites = useSites(isOwner);

  if (!isOwner) {
    return <PermissionGate role={user.role} />;
  }

  const subtitleKey = SUBTITLE[position.page.key];

  function renderPage(current: NavPosition) {
    if (current.page.key === 'overview') {
      return <BossOverview sites={sites.state} />;
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
      nav={BOSS_NAV}
      user={user}
      path={path}
      onSignOut={onSignedOut}
      pageTitle={t(position.page.labelKey)}
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
    >
      {(current: NavPosition) => renderPage(current)}
    </AppFrame>
  );
}
