import { useCallback, useEffect, useState } from 'react';
import { fetchNeedSummary, fetchNeeds, type NeedCounts, type NeedItem } from '../api';

/**
 * 外殼要的 Needs 數字與右側欄清單（issue 184）。
 *
 * 只讀一次 summary、一次清單；計數與清單來自同一個後端，所以頂欄的數字
 * 與右側欄的內容唔會講兩件事。
 *
 * 失敗時回 `null` counts：呼叫端唔渲染個入口。用 0 代替「讀唔到」係講大話 —
 * 用戶見到 0 就會以為冇事要做，而實際係冇讀到。
 */

export type NeedsShellData = {
  counts: NeedCounts | null;
  /** 右側欄最多四項；排序由後端決定（逾期先）。 */
  items: readonly NeedItem[];
  reload: () => void;
};

const RAIL_LIMIT = 4;

export function useNeedsShell(appId: string | undefined, enabled: boolean): NeedsShellData {
  const [counts, setCounts] = useState<NeedCounts | null>(null);
  const [items, setItems] = useState<readonly NeedItem[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let live = true;

    void (async () => {
      const query = appId === undefined ? {} : { appId };
      const [summary, list] = await Promise.all([
        fetchNeedSummary(query),
        fetchNeeds({ ...query, status: 'all', limit: RAIL_LIMIT }),
      ]);

      if (!live) {
        return;
      }

      if (summary.ok) {
        setCounts(summary.data.counts);
      } else {
        setCounts(null);
      }

      setItems(list.ok ? list.data.items : []);
    })();

    return () => {
      live = false;
    };
  }, [appId, enabled, tick]);

  return { counts, items, reload };
}
