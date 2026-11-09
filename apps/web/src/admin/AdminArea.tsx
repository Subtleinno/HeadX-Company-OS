import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FrameShell } from '@company-os/app-shell';
import { t, type MessageKey } from '@company-os/i18n';
import { submitLogout } from '../api';
import { FORMAL_APPS, MAIN_NAV_ROUTE, mainNavItems, type MainNavKey } from '../frame/nav';
import { useFrameChrome } from '../frame/useFrameChrome';
import { navigate } from '../router';
import { CompanySettingsScreen } from './CompanySettingsScreen';
import { OrganisationScreen } from './OrganisationScreen';
import { AppGrantsScreen } from './AppGrantsScreen';
import { StaffAgentsScreen } from './StaffAgentsScreen';

/**
 * Boss portal 管理區（issue 119 起）。
 *
 * 外殼用共用嘅 `FrameShell`，不另建一套：管理區只是同一個外殼的內容，
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
  { key: 'organisation', labelKey: 'admin.page.organisation' },
  { key: 'staff', labelKey: 'admin.page.staffAgents' },
  { key: 'grants', labelKey: 'admin.page.grants' },
];

type AdminPageKey = 'settings' | 'organisation' | 'staff' | 'grants';

const DEFAULT_PAGE: AdminPageKey = 'settings';

/**
 * 對話框嘅 focus trap（issue 147 P0-2）。
 *
 * `aria-modal="true"` 只係講咗，唔會自己困住焦點；Tab 要喺呢度明確循環。
 * 由第一個倒退、由最後一個向前、或者焦點根本唔喺對話框入面，都要拉返入嚟。
 * 其餘情況交返畀瀏覽器原本嘅順序，唔好自己重排 DOM 順序。
 */
function trapFocus(event: KeyboardEvent<HTMLDivElement>, dialog: HTMLDivElement | null): void {
  if (event.key !== 'Tab') {
    return;
  }

  if (dialog === null) {
    event.preventDefault();
    return;
  }

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );

  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || active === dialog || !dialog.contains(active)) {
      event.preventDefault();
      last?.focus();
    }

    return;
  }

  if (active === last || active === dialog || !dialog.contains(active)) {
    event.preventDefault();
    first?.focus();
  }
}

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
  /**
   * 管理區需要知道「我是誰、我是不是老闆」：
   * 授權頁要判斷建立／修改是否可以提供（讀組織架構是 `requireOwner`），
   * 以及在自己那一列寫「（你自己）」。角色只影響**顯示**，准駁仍然由後端決定。
   */
  user: { id: string; displayName: string; role: 'owner' | 'staff' };
  onSignedOut: () => void;
};

export function AdminArea({ user, onSignedOut }: AdminAreaProps) {
  const chrome = useFrameChrome();
  const [page, setPage] = useState<AdminPageKey>(() => parseAdminPage(window.location.hash));
  const [dirtyCount, setDirtyCount] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  /** 有未儲存修改時，被攔下來的動作；用戶選擇放棄才會執行。 */
  const [pendingLeave, setPendingLeave] = useState<{ run: () => void } | null>(null);
  const dirtyRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  /** 開對話框之前嘅焦點，關閉之後要還原（切頁鍵、登出鍵或網址攔截前）。 */
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

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

  const openPendingLeave = useCallback((run: () => void): void => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingLeave({ run });
  }, []);

  const requestLeave = useCallback(
    (run: () => void) => {
      if (dirtyRef.current > 0) {
        openPendingLeave(run);

        return;
      }

      run();
    },
    [openPendingLeave],
  );

  // 打開時焦點入對話框；關閉時還原到觸發元件。兩件事都由同一個狀態切換驅動，
  // 唔靠每個按鈕各自記住要 focus 返邊度。
  useEffect(() => {
    if (pendingLeave !== null) {
      dialogRef.current?.focus();
    }
  }, [pendingLeave]);

  useEffect(() => {
    const isOpen = pendingLeave !== null;

    if (wasOpenRef.current && !isOpen) {
      triggerRef.current?.focus();
    }

    wasOpenRef.current = isOpen;
  }, [pendingLeave]);

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
      openPendingLeave(() => setPage(requested));
    };

    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [page, openPendingLeave]);

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
      {/* 對話框開著時，外殼同頁面內容一律 inert：不可聚焦，讀屏亦唔會游走出去。 */}
      <div className="admin-shell" inert={pendingLeave !== null ? true : undefined}>
        <FrameShell
          apps={FORMAL_APPS}
          currentAppId=""
          onSelectApp={() => undefined}
          moduleTabs={mainNavItems(true)}
          currentModuleTabKey="admin"
          onSelectModuleTab={(key) => {
            // 主選單係真導覽，但切走之前照舊經 requestLeave() 保護未儲存的修改。
            if (key === 'admin') {
              return;
            }

            const route = MAIN_NAV_ROUTE[key as MainNavKey];

            if (route !== undefined) {
              requestLeave(() => {
                navigate(route);
              });
            }
          }}
          theme={chrome.theme}
          onToggleTheme={chrome.onToggleTheme}
          account={{ displayName: user.displayName, signingOut }}
          onSignOut={() => {
            requestLeave(() => {
              void handleSignOut();
            });
          }}
          sidebarOpen={chrome.sidebarOpen}
          onToggleSidebar={chrome.onToggleSidebar}
          modulePages={PAGES.map((item) => ({ key: item.key, label: t(item.labelKey) }))}
          currentPageKey={page}
          onSelectPage={(key) => {
            const next = PAGES.find((item) => item.key === key);

            if (next !== undefined) {
              navigateTo(next.key);
            }
          }}
        >
          {page === 'settings' && <CompanySettingsScreen onDirtyCountChange={setDirtyCount} />}
          {page === 'organisation' && <OrganisationScreen onDirtyCountChange={setDirtyCount} />}
          {page === 'staff' && <StaffAgentsScreen onDirtyCountChange={setDirtyCount} />}
          {page === 'grants' && <AppGrantsScreen user={user} onDirtyCountChange={setDirtyCount} />}
          {signOutError !== null && (
            <p className="admin-notice admin-notice--failed" role="alert">
              {signOutError}
            </p>
          )}
        </FrameShell>
      </div>

      {pendingLeave !== null && (
        <div className="admin-scrim">
          <div
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-unsaved-title"
            aria-describedby="admin-unsaved-body admin-unsaved-count"
            tabIndex={-1}
            ref={(node) => {
              dialogRef.current = node;
            }}
            onKeyDown={(event) => {
              trapFocus(event, dialogRef.current);

              if (event.key === 'Escape') {
                setPendingLeave(null);
              }
            }}
          >
            <p className="shell-popover__label">{t('admin.nav')}</p>
            <h2 className="admin-dialog__title" id="admin-unsaved-title">
              {t('admin.unsaved.title')}
            </h2>
            <p className="admin-dialog__body" id="admin-unsaved-body">
              {t('admin.unsaved.body')}
            </p>
            <p className="admin-dialog__body" id="admin-unsaved-count">
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
