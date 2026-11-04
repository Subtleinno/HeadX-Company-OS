import { t } from '@company-os/i18n';

/**
 * 頁面外殼：頂欄（品牌 + 帳戶）＋ 內容區。
 *
 * 只抽 apps/web 本來就有的結構（`.shell` ＋ `.toolbar` ＋ `.home`），沒有新增導覽項目、
 * 沒有新增按鈕。樣式仍由使用方的樣式表提供，令 R3 的像素與改動前完全一致。
 */

type AppShellProps = {
  displayName: string;
  signingOut: boolean;
  onSignOut: () => void;
  children: React.ReactNode;
};

export function AppShell({ displayName, signingOut, onSignOut, children }: AppShellProps) {
  return (
    <div className="shell">
      <header className="toolbar">
        <div className="toolbar__brand">
          <span className="brand__mark" aria-hidden="true" />
          <span>{t('app.name')}</span>
        </div>
        <div className="toolbar__account">
          <span className="toolbar__name">{displayName}</span>
          <button
            type="button"
            className="button button--text"
            disabled={signingOut}
            onClick={onSignOut}
          >
            {t('home.signOut')}
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}

/** 外殼內容區（`.home`）。 */
export function ShellContent({ children }: { children: React.ReactNode }) {
  return <main className="home">{children}</main>;
}
