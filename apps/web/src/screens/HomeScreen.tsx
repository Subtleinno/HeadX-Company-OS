import { useState } from 'react';
import { EmptyState } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { submitLogout, type PublicUser } from '../api';
import { FrameApps } from '../frame/FrameApps';
import { MAIN_NAV_ROUTE, mainNavItems, type MainNavKey } from '../frame/nav';
import { useFrameChrome } from '../frame/useFrameChrome';
import { navigate } from '../router';
import { PROTOTYPE_ENTRY_HASH } from '../prototype/fixtures';
import { MyApps } from './MyApps';

type HomeScreenProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

/**
 * 登入後的首頁（議題 158 換 Frame 外殼）。
 *
 * 主選單三個標籤全部係真導覽（今日、帳戶；老闆另有管理區），由 moduleTabs
 * 交畀呼叫端 navigate，唔放按落無反應嘅鍵。「我的 Apps」保留做首頁區塊，
 * 原型入口連結不變；舊首頁三條 footer 連結入面嘅「帳戶」同「管理區」已經
 * 交由主選單進入，喺度刪走，唔再並列兩套入口。
 *
 * 公司名同頭像如實顯示未提供：GET /me 無頭像、SettingKey 無公司名 key，
 * 所以唔傳 companyName、唔傳 companyMark，頂欄只顯示 displayName；
 * 外殼自己畫嘅首字頭像同公司字標由 frame.css 隱藏，唔用首字 fallback。
 * 正式 App selector 由共用包裝元件 FrameApps 從 GET /modules 取得真資料，
 * 與「我的 Apps」共用同一份結果，成頁只讀一次。
 */
export function HomeScreen({ user, onSignedOut }: HomeScreenProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chrome = useFrameChrome();

  async function handleSignOut(): Promise<void> {
    if (signingOut) {
      return;
    }

    setError(null);
    setSigningOut(true);

    const result = await submitLogout();

    if (result.ok) {
      onSignedOut();
      return;
    }

    setSigningOut(false);
    setError(result.failure.kind === 'network' ? t('error.network') : t('error.unexpected'));
  }

  return (
    <FrameApps
      moduleTabs={mainNavItems(user.role === 'owner')}
      currentModuleTabKey="today"
      onSelectModuleTab={(key) => {
        const route = MAIN_NAV_ROUTE[key as MainNavKey];

        if (route !== undefined) {
          navigate(route);
        }
      }}
      theme={chrome.theme}
      onToggleTheme={chrome.onToggleTheme}
      account={{ displayName: user.displayName, signingOut }}
      onSignOut={() => void handleSignOut()}
      sidebarOpen={chrome.sidebarOpen}
      onToggleSidebar={chrome.onToggleSidebar}
      modulePages={[]}
      currentPageKey={null}
      onSelectPage={() => undefined}
      pageTitle={t('home.title')}
    >
      <EmptyState>{t('home.empty')}</EmptyState>
      {/*
        「我的 Apps」（issue 123）。清單與可用性都來自後端：manifest 是唯一來源，
        可不可以入去由 /app-grants/access/:appId 講。這裡不抄 app 清單，也不自己算授權。
      */}
      <MyApps />
      {/*
        前端入口。新外殼（issue 118）現階段只存在於 `#/app/...`，這裡只放一條連結，
        沒有搬首頁、沒有加卡片，也不算把原型當成產品。
      */}
      <p className="home__proto">
        <a className="home__proto-link" href={PROTOTYPE_ENTRY_HASH}>
          {t('home.protoEntry')}
        </a>
        <span className="home__proto-note">{t('home.protoNote')}</span>
      </p>
      {error !== null && (
        <p className="home__error" aria-live="polite">
          {error}
        </p>
      )}
    </FrameApps>
  );
}
