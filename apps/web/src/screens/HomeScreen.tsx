import { useState } from 'react';
import { submitLogout, type PublicUser } from '../api';

type HomeScreenProps = {
  user: PublicUser;
  onSignedOut: () => void;
};

/**
 * 登入後的首頁骨架。
 *
 * 只有頂欄與一句誠實的空狀態：待批准、Needs、各部門狀況都還沒有資料來源，
 * 所以不放卡片、不放數字、不放圖表。
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
    setError(
      result.failure.kind === 'network'
        ? '錯誤：無法連線到伺服器，請稍後再試。'
        : '錯誤：發生未預期的錯誤，請稍後再試。',
    );
  }

  return (
    <div className="shell">
      <header className="toolbar">
        <div className="toolbar__brand">
          <span className="brand__mark" aria-hidden="true" />
          <span>Company OS</span>
        </div>
        <div className="toolbar__account">
          <span className="toolbar__name">{user.displayName}</span>
          <button
            type="button"
            className="button button--text"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            登出
          </button>
        </div>
      </header>

      <main className="home">
        <h1 className="home__title">今日</h1>
        <p className="home__empty">
          目前沒有任何待處理事項。待批准、Needs 與各部門的狀況，會在對應功能建好後出現在這裡。
        </p>
        {error !== null && (
          <p className="home__error" aria-live="polite">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
