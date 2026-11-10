import { useEffect, useState } from 'react';
import { fetchSites, type SiteItem } from '../api';

/**
 * 據點目錄的資料。
 *
 * 只有一個地方讀 `/sites`：目錄表同總覽的數字都由呢個 hook 出。
 * 兩邊各自讀一次的話，批完一個據點之後，總覽會同目錄講唔同的數。
 */

export type SitesState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: readonly SiteItem[] }
  | { kind: 'failed' };

export function useSites(load = true): { state: SitesState; reload: () => void } {
  const [state, setState] = useState<SitesState>({ kind: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!load) {
      return;
    }

    let alive = true;

    void fetchSites().then((result) => {
      if (!alive) {
        return;
      }

      setState(result.ok ? { kind: 'ready', items: result.data.items } : { kind: 'failed' });
    });

    return () => {
      alive = false;
    };
  }, [load, tick]);

  return {
    state,
    reload: () => {
      setTick((value) => value + 1);
    },
  };
}

/** `2026-11-09`。用本地日期：老闆問「幾時換過憑證」講的是香港那日。 */
export function formatDate(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}
