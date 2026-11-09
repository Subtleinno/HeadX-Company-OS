import { createContext, useContext } from 'react';
import { FrameShell, type FrameApp, type FrameShellProps } from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { useAppList, type AppListView } from './useAppList';

/**
 * F-03（issue 160）：共用外殼包裝元件。
 *
 * 三個正式畫面（首頁、個人帳戶、管理區）一律經呢一層攞 app 清單：
 * `useAppList` 喺呢度**只讀一次** `GET /modules` 同逐個 app 嘅存取判斷，
 * 結果一方面變成 `FrameShell` 嘅 `apps`，另一方面經 context 交畀
 * 「我的 Apps」。兩者共用同一份事實，唔可以各自再讀、唔可以喺前端存副本。
 *
 * 刻意唔做嘅嘢：
 *   - 唔新增文案鍵；狀態標籤用既有 `myapps.available.*`，原因用既有
 *     `myapps.entry.unavailable`。
 *   - 只呈現 `kind`（喺「我的 Apps」），唔顯示「公司型・敏感」複合標籤：
 *     `sensitive` 唔喺 `/modules` 白名單內，本張唔改 `modules/routes.ts`、
 *     唔叫後端加欄位、唔喺前端自建模式或敏感表。
 *   - 後端刻意唔公開 manifest 嘅 `route`，app-host 亦未接線，所以所有 app
 *     嘅進入都不可用：selector 項目一律 `selectable: false`，並寫明原因，
 *     唔做一個按落唔知去邊嘅鍵。`currentAppId` 保持空、`onSelectApp` 唔跳轉。
 *   - 唔用 localStorage、唔硬編 app id 或標題；名稱一律用後端 `title`。
 */

const AppListContext = createContext<AppListView | null>(null);

/** 「我的 Apps」由呢度攞共用結果，唔自己再讀一次 `/modules`。 */
export function useSharedAppList(): AppListView {
  const view = useContext(AppListContext);

  if (view === null) {
    throw new Error('MyApps must be rendered inside FrameApps to share the app list');
  }

  return view;
}

export type FrameAppsProps = Omit<
  FrameShellProps,
  'apps' | 'currentAppId' | 'onSelectApp'
> & {
  /** false ＝ 呢個畫面唔讀取 app 清單（首次強制改密碼嘅個人帳戶頁）。 */
  load?: boolean;
  /** false ＝ selector 只需要 app 清單，唔逐個 app 問存取判斷（「我的 Apps」先需要）。 */
  includeAccess?: boolean;
};

/**
 * 只有「讀取成功」先有 app 可以列；載入中、失敗、拒絕、改密碼一律傳空清單
 * 畀外殼（外殼只顯示 placeholder），真正嘅原因由「我的 Apps」如實講，
 * 唔會偽裝成「沒有任何 app」嘅空清單。
 */
function toFrameApps(view: AppListView): readonly FrameApp[] {
  if (view.list.kind !== 'ready') {
    return [];
  }

  return view.list.modules.map((module) => ({
    key: module.id,
    label: module.title,
    statusLabel: `${module.available ? t('myapps.available.yes') : t('myapps.available.no')} · ${t('myapps.entry.unavailable')}`,
    selectable: false,
  }));
}

export function FrameApps({ load = true, includeAccess = true, ...shellProps }: FrameAppsProps) {
  const view = useAppList(load, includeAccess);

  return (
    <AppListContext.Provider value={view}>
      <FrameShell
        {...shellProps}
        apps={toFrameApps(view)}
        currentAppId=""
        onSelectApp={() => undefined}
      />
    </AppListContext.Provider>
  );
}
