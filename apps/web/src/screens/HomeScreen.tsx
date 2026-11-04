import { useState } from 'react';
import { AppShell, EmptyState, ShellContent } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { submitLogout, type PublicUser } from '../api';

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
        {error !== null && (
          <p className="home__error" aria-live="polite">
            {error}
          </p>
        )}
      </ShellContent>
    </AppShell>
  );
}
