import { useState } from 'react';
import { AppShell, EmptyState, ShellContent } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { submitLogout, type PublicUser } from '../api';
import { PROTOTYPE_ENTRY_HASH } from '../prototype/fixtures';
import { MyApps } from './MyApps';

type HomeScreenProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

/**
 * 登入後的首頁骨架。
 *
 * 只有頂欄與一句誠實的空狀態：待批准、Needs、各部門狀況都還沒有資料來源，
 * 所以不放卡片、不放數字、不放圖表。頂欄與內容區的結構已搬去 app-shell（#73 R3）。
 */
export function HomeScreen({ user, onSignedOut }: HomeScreenProps) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <AppShell
      displayName={user.displayName}
      signingOut={signingOut}
      onSignOut={() => void handleSignOut()}
    >
      <ShellContent>
        <h1 className="home__title">{t('home.title')}</h1>
        <EmptyState>{t('home.empty')}</EmptyState>
        {/*
          「我的 Apps」（issue 123）。清單與可用性都來自後端：manifest 是唯一來源，
          可不可以入去由 /app-grants/access/:appId 講。這裡不抄 app 清單，也不自己算授權。
        */}
        <MyApps />
        {/*
          前端入口。新外殼（issue 118）現階段只存在於 `#/app/...`，首頁仍然是舊骨架，
          不給一條路就等於「交付了但到不了」。這裡只放一條連結，
          沒有搬首頁、沒有加卡片，也不算把原型當成產品。
        */}
        <p className="home__proto">
          <a className="home__proto-link" href={PROTOTYPE_ENTRY_HASH}>
            {t('home.protoEntry')}
          </a>
          <span className="home__proto-note">{t('home.protoNote')}</span>
        </p>
        {/*
          管理區入口（issue 119）。只有老闆會見到：員工見到一條按下去會被 403 的連結
          等於騙人。真正把首頁換成新外殼屬 B-02，這裡只放路徑。
        */}
        {user.role === 'owner' && (
          <p className="home__proto">
            <a className="home__admin-link" href="#/admin/settings">
              {t('home.adminEntry')}
            </a>
            <span className="home__proto-note">{t('home.adminNote')}</span>
          </p>
        )}
        {error !== null && (
          <p className="home__error" aria-live="polite">
            {error}
          </p>
        )}
      </ShellContent>
    </AppShell>
  );
}
