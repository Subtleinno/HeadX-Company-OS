import { createContext, useContext, useState } from 'react';
import {
  FrameShell,
  type FrameApp,
  type FrameNeedItem,
  type FrameNeedsEntry,
  type FrameNeedsRail,
  type FrameShellProps,
} from '@company-os/app-shell';
import { t } from '@company-os/i18n';
import { needKindLabel, needStateLabel, needWaitingLabel } from '../needs/labels';
import { useNeedsShell, type NeedsShellData } from '../needs/useNeedsShell';
import { navigate } from '../router';
import { useAppList, type AppListView } from './useAppList';

/**
 * F-03（issue 160）：共用外殼包裝元件。
 *
 * 三個正式畫面（首頁、個人帳戶、管理區）一律經呢一層攞 app 清單：
 * `useAppList` 喺呢度**只讀一次** `GET /modules` 同逐個 app 嘅存取判斷，
 * 結果一方面變成 `FrameShell` 嘅 `apps`，另一方面經 context 交畀
 * 「我的 Apps」。兩者共用同一份事實，唔可以各自再讀、唔可以喺前端存副本。
 *
 * issue 184 起，Needs 亦經呢一層接駁：頂欄計數同右側欄由同一份 summary
 * 推出來，所以「頂欄話 7、右側欄話 5」呢種矛盾唔會發生。讀唔到 summary
 * 就唔渲染入口 —— 顯示「0」係講大話，用戶會以為真係冇事要做。
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

const NeedsShellContext = createContext<NeedsShellData | null>(null);

/**
 * 頁面內容由呢度攞 Needs 數字，**唔可以自己再開一個 `useNeedsShell`**。
 *
 * 曾經就係咁：Needs 頁自己讀一次 summary，外殼又讀一次，結果喺頁內認領完
 * 只有頁內那份更新，頂欄仍然顯示舊數。同一頁兩份事實，總有一份會過時。
 */
export function useSharedNeeds(): NeedsShellData {
  const data = useContext(NeedsShellContext);

  if (data === null) {
    throw new Error('Needs content must be rendered inside FrameApps to share the Needs summary');
  }

  return data;
}

export type FrameAppsProps = Omit<
  FrameShellProps,
  'apps' | 'currentAppId' | 'onSelectApp' | 'needs' | 'needsRail'
> & {
  /** false ＝ 呢個畫面唔讀取 app 清單（首次強制改密碼嘅個人帳戶頁）。 */
  load?: boolean;
  /** false ＝ selector 只需要 app 清單，唔逐個 app 問存取判斷（「我的 Apps」先需要）。 */
  includeAccess?: boolean;
  /** 而家就係 Needs 頁：頂欄入口顯示為當前頁。 */
  needsActive?: boolean;
  /**
   * 呢一頁要唔要右側 Needs 欄。
   * 只有宣告得到嘅頁面才有欄 —— 唔係每一頁都擠一條欄落去。
   */
  withRail?: boolean;
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

export function FrameApps({
  load = true,
  includeAccess = true,
  needsActive = false,
  withRail = false,
  ...shellProps
}: FrameAppsProps) {
  const view = useAppList(load, includeAccess);
  const needs = useNeedsShell(undefined, load);
  const [railOpen, setRailOpen] = useState(true);

  const counts = needs.counts;
  // 「Needs 7」講嘅係未關閉的工作。已關閉的仍然在系統，但唔應該繼續計，
  // 否則個數字只會一直升，慢慢變成一個冇人看的裝飾。
  const openCount = counts === null ? 0 : counts.total - counts.closed;

  const needsEntry: FrameNeedsEntry | undefined =
    counts === null
      ? undefined
      : {
          count: openCount,
          active: needsActive,
          onOpen: () => {
            navigate('/needs');
          },
          ...(withRail
            ? {
                railOpen,
                onToggleRail: () => {
                  setRailOpen((open) => !open);
                },
              }
            : {}),
        };

  const now = Date.now();

  const needsRail: FrameNeedsRail = {
    title: t('need.rail.title'),
    items: needs.items.map((item) => {
      const railItem: FrameNeedItem = {
        id: item.id,
        code: item.code,
        title: item.title,
        kindLabel: needKindLabel(item),
        stateLabel: needStateLabel(item),
        metaLabel: needWaitingLabel(item, now),
      };

      return railItem;
    }),
    emptyLabel: t('need.rail.empty'),
    totalLabel: t('need.rail.all'),
    closedLabel:
      counts === null ? '' : t('need.rail.closed', { count: counts.closed }),
    historyLabel: t('need.rail.history'),
    onOpenAll: () => {
      navigate('/needs');
    },
    onOpenNeed: () => {
      navigate('/needs');
    },
  };

  return (
    <AppListContext.Provider value={view}>
      <NeedsShellContext.Provider value={needs}>
        <FrameShell
          {...shellProps}
          {...(needsEntry === undefined ? {} : { needs: needsEntry })}
          {...(withRail ? { needsRail } : {})}
          apps={toFrameApps(view)}
          currentAppId=""
          onSelectApp={() => undefined}
        />
      </NeedsShellContext.Provider>
    </AppListContext.Provider>
  );
}
