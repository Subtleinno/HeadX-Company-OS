import { useEffect, useState } from 'react';
import { fetchModules, type PublicUser } from '../api';
import type { Route } from '../router';

/**
 * 登入之後去邊（issue #14）。
 *
 * 規則只有三條，次序不能換：
 *
 *   1. 老闆 → Boss Portal。老闆冇部門（`department` 一定係 null），
 *      所以「先看 role 再看 department」係唯一正確的次序。
 *   2. 員工有部門 → 該部門的 app。**哪一個 route 由 `/modules` 講**，
 *      這裡不寫死 `/design`；registry 改了 route，分流會自動跟。
 *   3. 員工冇部門、或者部門的 app 未開放 → 不給任何畫面，講清楚原因。
 *      這一條比前兩條重要：把人送去一個空白首頁，等於同佢講「你冇嘢做」，
 *      而事實係「未有人指派你」。
 *
 * 刻意不做的事：不記住「上次去過邊」。落點由身份決定，不由歷史決定；
 * 否則一個被調部門的人會一直回到舊部門的首頁。
 */

export type Landing =
  /** 仲在讀 `/modules`；外殼應該顯示載入，而不是先畫首頁再跳走。 */
  | { kind: 'deciding' }
  | { kind: 'route'; path: Route }
  | { kind: 'noDepartment' }
  | { kind: 'closed'; department: string }
  /**
   * 判斷唔到，交返首頁自己講。`/modules` 讀唔到嘅時候，首頁本身已經會
   * 顯示真正嘅原因（401／403／讀取失敗）同重試掣；喺呢度另外畫一個
   * 「讀唔到」只係多一份更模糊嘅重複文案。
   */
  | { kind: 'home' };

const OWNER_LANDING: Route = '/boss';

/**
 * 外殼真正識得畫的部門入口。
 *
 * registry 講 `available: true` 只代表「這個 app 已接駁」，唔代表外殼有
 * 一個畫面接得住它。呢兩件事要分開：如果一個 manifest 標了 available 但
 * 前端未做，把員工送過去只會落到「我的 Apps」空清單 —— 又一個講唔通的
 * 空畫面。所以未實作的一律當「未開放」，並且照實講。
 */
const IMPLEMENTED_ROUTES: readonly Route[] = ['/boss', '/design'];

function implementedRoute(path: string): Route | null {
  return (IMPLEMENTED_ROUTES as readonly string[]).includes(path) ? (path as Route) : null;
}

export function useLanding(user: PublicUser | undefined): Landing {
  const [resolved, setResolved] = useState<Exclude<Landing, { kind: 'deciding' }> | null>(null);

  const role = user?.role;
  const department = user?.department ?? null;

  useEffect(() => {
    if (role === undefined) {
      return;
    }

    if (role === 'owner') {
      setResolved({ kind: 'route', path: OWNER_LANDING });
      return;
    }

    if (department === null) {
      setResolved({ kind: 'noDepartment' });
      return;
    }

    // 每次換人／換部門都要重新問一次，所以先清掉上一個答案：
    // 留住舊答案會令一個剛被調部門的人短暫見到舊部門的首頁。
    setResolved(null);

    let cancelled = false;

    void (async () => {
      const result = await fetchModules();

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setResolved({ kind: 'home' });
        return;
      }

      const module = result.data.modules.find((item) => item.department === department);
      const target = module === undefined ? null : implementedRoute(module.route);

      if (module === undefined || !module.available || target === null) {
        // 只有一個真相：這個部門現在沒有可以開的畫面。用 manifest 的
        // title 講部門名；連 manifest 都沒有就顯示 key，不假裝它有個名。
        setResolved({ kind: 'closed', department: module?.title ?? department });
        return;
      }

      setResolved({ kind: 'route', path: target });
    })();

    return () => {
      cancelled = true;
    };
  }, [role, department]);

  if (role === undefined) {
    return { kind: 'deciding' };
  }

  return resolved ?? { kind: 'deciding' };
}
