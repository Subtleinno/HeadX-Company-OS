import { useCallback, useEffect, useRef, useState } from 'react';
import { BaseShell, nextTheme, type ShellTheme, type PrototypeApp, type ShellNavItem } from '@company-os/app-shell';
import { t, type MessageKey } from '@company-os/i18n';
import { submitLogout } from '../api';
import { CompanySettingsScreen } from './CompanySettingsScreen';

/**
 * Boss portal 管理區（issue 119 起）。
 *
 * 外殼用 B-01 的 `BaseShell`，不另建一套：管理區只是同一個外殼的內容，
 * 若另畫一個頂欄，兩邊遲早會長得不一樣。
 *
 * 這裡刻意做三件事：
 *
 * 1. **工作範圍永遠是「公司」**。管理區改的是整間公司，頂欄如果顯示某個品牌，
 *    就會暗示「這一頁只影響該品牌」。公司型 app 的外殼本來就不渲染品牌下拉，
 *    所以這裡不給 brands，也不會出現一個按下去沒反應的品牌選擇器。
 * 2. **沒有工作欄就不畫工作欄**（沿用 C48）。管理區現在沒有工作索引，
 *    左欄開關如實停用。
 * 3. **未儲存就攔住**。切頁、切 app、登出都要先問，瀏覽器關窗由 beforeunload 問。
 *
 * 品牌／組織、員工、授權等頁面屬 B-03 至 B-05，未做就不出現在導覽裡 ——
 * 加一個按下去沒反應的鍵，比沒有這個鍵更差。
 */

const PAGES: readonly { key: AdminPageKey; labelKey: MessageKey }[] = [
  { key: 'settings', labelKey: 'admin.page.settings' },
];

type AdminPageKey = 'settings';

const DEFAULT_PAGE: AdminPageKey = 'settings';

function parseAdminPage(hash: string): AdminPageKey {
  const value = hash.replace(/^#/, '');
  const rest = value.startsWith('/admin/') ? value.slice('/admin/'.length) : '';
  const found = PAGES.find((page) => page.key === rest);

  return found?.key ?? DEFAULT_PAGE;
}

function adminHash(page: AdminPageKey): string {
  return `#/admin/${page}`;
}

export type AdminAreaProps = {
  user: { displayName: string };
  onSignedOut: () => void;
};

export function AdminArea({ user, onSignedOut }: AdminAreaProps) {
  const [page, setPage] = useState<AdminPageKey>(() => parseAdminPage(window.location.hash));
  const [theme, setTheme] = useState<ShellTheme>('light');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  /** 有未儲存修改時，被攔下來的動作；用戶選擇放棄才會執行。 */
  const [pendingLeave, setPendingLeave] = useState<{ run: () => void } | null>(null);
  const dirtyRef = useRef(0);

  useEffect(() => {
    dirtyRef.current = dirtyCount;
  }, [dirtyCount]);

  async function handleSignOut(): Promise<void> {
    if (signingOut) {
      return;
    }

    setSignOutError(null);
    setSigningOut(true);

    const result = await submitLogout();

    if (result.ok) {
      onSignedOut();

      return;
    }

    setSigningOut(false);
    setSignOutError(result.failure.kind === 'network' ? t('error.network') : t('error.unexpected'));
  }

  // 網址是畫面的鏡子：第一次進來把 `/admin` 補成 `/admin/settings`。
  useEffect(() => {
    if (window.location.hash !== adminHash(page)) {
      window.history.replaceState(null, '', adminHash(page));
    }
  }, [page]);

  const requestLeave = useCallback((run: () => void) => {
    if (dirtyRef.current > 0) {
      setPendingLeave({ run });

      return;
    }

    run();
  }, []);

  // 直接在網址欄改 hash 也要攔：先還原網址，再問要不要放棄。
  useEffect(() => {
    const onHashChange = (): void => {
      const requested = parseAdminPage(window.location.hash);

      if (requested === page) {
        return;
      }

      if (dirtyRef.current === 0) {
        setPage(requested);

        return;
      }

      window.history.replaceState(null, '', adminHash(page));
      setPendingLeave({ run: () => setPage(requested) });
    };

    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [page]);

  const adminApp: PrototypeApp = {
    id: 'admin',
    title: t('admin.area'),
    mode: 'company',
    menu: PAGES.map((item) => ({ key: item.key, label: t(item.labelKey) })),
  };

  const subMenuItems: readonly ShellNavItem[] = [];

  function navigateTo(next: AdminPageKey): void {
    if (next === page) {
      return;
    }

    requestLeave(() => {
      window.history.replaceState(null, '', adminHash(next));
      setPage(next);
    });
  }

  return (
    <>
      <BaseShell
        apps={[adminApp]}
        currentAppId={adminApp.id}
        scope={{ kind: 'company' }}
        brands={[]}
        theme={theme}
        sidebarOpen={sidebarOpen}
        account={{ displayName: user.displayName, signingOut }}
        subMenuItems={subMenuItems}
        railItems={[]}
        currentPageKey={page}
        onSelectApp={() => {
          // 目前只有一個 app；切到別的 app 不是這一張的範圍，按下去不做事也不假裝切換。
        }}
        onSelectScope={(scope) => {
          if (scope.kind !== 'company') {
            return;
          }
        }}
        onSelectPage={(key) => {
          const next = PAGES.find((item) => item.key === key);

          if (next !== undefined) {
            navigateTo(next.key);
          }
        }}
        onToggleSidebar={() => {
          setSidebarOpen((open) => !open);
        }}
        onToggleTheme={() => {
          setTheme((current) => nextTheme(current));
        }}
        onSignOut={() => {
          requestLeave(() => {
            void handleSignOut();
          });
        }}
      >
        {page === 'settings' && <CompanySettingsScreen onDirtyCountChange={setDirtyCount} />}
        {signOutError !== null && (
          <p className="admin-notice admin-notice--failed" role="alert">
            {signOutError}
          </p>
        )}
      </BaseShell>

      {pendingLeave !== null && (
        <div className="admin-scrim">
          <div
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-unsaved-title"
            tabIndex={-1}
            ref={(node) => {
              node?.focus();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setPendingLeave(null);
              }
            }}
          >
            <p className="shell-popover__label">{t('admin.nav')}</p>
            <h2 className="admin-dialog__title" id="admin-unsaved-title">
              {t('admin.unsaved.title')}
            </h2>
            <p className="admin-dialog__body">{t('admin.unsaved.body')}</p>
            <p className="admin-dialog__body">
              {t('admin.unsaved.dirtyCount', { count: dirtyCount })}
            </p>
            <div className="admin-dialog__actions">
              <button
                type="button"
                className="button button--text"
                onClick={() => {
                  setPendingLeave(null);
                }}
              >
                {t('admin.unsaved.stay')}
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  const pending = pendingLeave;

                  setDirtyCount(0);
                  dirtyRef.current = 0;
                  setPendingLeave(null);
                  pending.run();
                }}
              >
                {t('admin.unsaved.leave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
