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
import { needDueLabel, needKindLabel, needStateLabel, needWaitingLabel } from '../needs/labels';
import { useNeedsShell, type NeedsShellData } from '../needs/useNeedsShell';
import { navigate, type Route } from '../router';
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
 *   - 唔用 localStorage、唔硬編 app id 或標題；名稱一律用後端 `title`。
 *
 * issue 185 起，app 名稱亦經呢一層補入麵包屑：`/modules` 已經公開 `route`，
 * 所以邊一條路徑屬於邊個 app、嗰個 app 叫乜名，都係後端講嘅事。頁面只需
 * 交「模組 / 頁 / 章節」，第一格由 `withAppCrumb()` 加 —— 咁樣左上角
 * selector 同麵包屑第一格唔會再出現兩個名。
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
  'apps' | 'needs' | 'needsRail' | 'currentAppId' | 'onSelectApp'
> & {
  /**
   * 而家喺邊個 app —— 用**路徑**講（`/boss`），唔用 app id。
   * 清單由後端來，前端用路徑認返邊一個 app 被選中，就唔需要自己
   * 記一份「app id 同網址」對照表。
   */
  currentAppRoute?: string;
  /** 唔傳就照後端 manifest 的 `route` 跳過去。 */
  onSelectApp?: (appId: string) => void;
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

  return view.list.modules.map((module) => {
    // 可以入去 = manifest 話 available，而且真係有一條路徑接住佢。
    // 兩樣缺一都唔可以撳：撳完去一個空白頁比灰掉更差。
    // route 用防禦式讀法：舊版後端唔會回呢個欄位，缺席要當「冇路徑」，
    // 唔可以拋錯 —— 一個欄位缺失唔應該令整個 selector 空白。
    const route = typeof module.route === 'string' ? module.route : '';
    const selectable = module.available && route.length > 0;

    return {
      key: module.id,
      label: module.title,
      ...(selectable ? {} : { statusLabel: t('myapps.available.no') }),
      selectable,
    };
  });
}

/** 由路徑認返邊一個 app：後端清單裡面 route 同傳入路徑一樣嗰個。 */
function currentAppIdOf(view: AppListView, route: string): string {
  if (route.length === 0 || view.list.kind !== 'ready') {
    return '';
  }

  return view.list.modules.find((module) => module.route === route)?.id ?? '';
}

/**
 * 麵包屑第一格 ＝ 目前 app 嘅 manifest 名稱。
 *
 * 讀唔到清單（載入中／失敗）就唔加 —— 寧願少一格，都唔好自己造一個名出嚟。
 * 已經同第一格一樣就唔重複，避免「Boss Portal / Boss Portal / …」。
 */
function withAppCrumb(
  view: AppListView,
  route: string,
  breadcrumbs: readonly string[] | undefined,
): readonly string[] | undefined {
  if (breadcrumbs === undefined || breadcrumbs.length === 0) {
    return breadcrumbs;
  }

  if (view.list.kind !== 'ready' || route.length === 0) {
    return breadcrumbs;
  }

  const title = view.list.modules.find((module) => module.route === route)?.title;

  if (title === undefined || title.length === 0 || title === breadcrumbs[0]) {
    return breadcrumbs;
  }

  return [title, ...breadcrumbs];
}

export function FrameApps({
  load = true,
  includeAccess = true,
  needsActive = false,
  withRail = false,
  currentAppRoute = '',
  onSelectApp,
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
  const crumbs = withAppCrumb(view, currentAppRoute, shellProps.breadcrumbs);

  const needsRail: FrameNeedsRail = {
    title: t('need.rail.title'),
    items: needs.items.map((item) => {
      const railItem: FrameNeedItem = {
        id: item.id,
        code: item.code,
        title: item.title,
        kindLabel: needKindLabel(item),
        stateLabel: needStateLabel(item),
        // 逾期先講逾期，其餘講「已等幾日」—— 一句話講最緊要嘅事。
        metaLabel: item.overdue ? needDueLabel(item, now) : needWaitingLabel(item, now),
        overdue: item.overdue,
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
          {...(crumbs === undefined ? {} : { breadcrumbs: crumbs })}
          {...(needsEntry === undefined ? {} : { needs: needsEntry })}
          {...(withRail ? { needsRail } : {})}
          apps={toFrameApps(view)}
          currentAppId={currentAppIdOf(view, currentAppRoute)}
          onSelectApp={(appId) => {
            if (onSelectApp !== undefined) {
              onSelectApp(appId);
              return;
            }

            const target =
              view.list.kind === 'ready'
                ? view.list.modules.find((module) => module.id === appId)
                : undefined;

            if (target !== undefined && typeof target.route === 'string' && target.route.length > 0) {
              navigate(target.route as Route);
            }
          }}
        />
      </NeedsShellContext.Provider>
    </AppListContext.Provider>
  );
}
