import { useEffect, useState } from 'react';
import {
  fetchBrands,
  fetchCompanyIdentity,
  type BrandItem,
  type CompanyIdentity,
} from '../api';

/**
 * 品牌清單同「我而家喺邊間公司」。
 *
 * 為咩要喺模組層共用一份：品牌 selector 喺每一頁都出現，如果每頁自己讀一次
 * `/brands`，切換頁面就會見到 selector 閃一閃、甚至短暫變回「公司範圍」。
 * 呢個快取只存**同一次瀏覽**的結果；換公司或改完品牌之後要重新載入，
 * 由呼叫端 `reload()` 明確叫，唔會自己猜幾時過期。
 */

export type BrandsState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: readonly BrandItem[] }
  | { kind: 'failed' };

let brandsCache: Promise<readonly BrandItem[]> | null = null;

function loadBrands(): Promise<readonly BrandItem[]> {
  if (brandsCache === null) {
    brandsCache = fetchBrands().then((result) => (result.ok ? result.data.items : []));
  }

  return brandsCache;
}

export function useBrands(load: boolean): { state: BrandsState; reload: () => void } {
  const [state, setState] = useState<BrandsState>(() =>
    brandsCache === null ? { kind: 'loading' } : { kind: 'loading' },
  );

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!load) {
      setState({ kind: 'ready', items: [] });
      return;
    }

    let alive = true;

    void loadBrands().then((items) => {
      if (alive) {
        setState({ kind: 'ready', items });
      }
    });

    return () => {
      alive = false;
    };
  }, [load, tick]);

  return {
    state,
    reload: () => {
      brandsCache = null;
      setTick((value) => value + 1);
    },
  };
}

/**
 * 而家選中邊個品牌。
 *
 * 存喺模組層而唔係每頁 state：轉 app、轉頁、轉模組都要沿用同一個品牌，
 * 否則用戶每轉一次就要重新揀一次。唔寫 localStorage：重新開瀏覽器應該由
 * 第一個品牌開始，而唔係記住三個星期前揀過乜。
 */
let currentBrandId: string | null = null;
const brandListeners = new Set<() => void>();

export function useSelectedBrand(items: readonly BrandItem[]): {
  brandId: string | null;
  selectBrand: (id: string) => void;
} {
  const [, force] = useState(0);

  useEffect(() => {
    const update = (): void => {
      force((value) => value + 1);
    };

    brandListeners.add(update);

    return () => {
      brandListeners.delete(update);
    };
  }, []);

  // 揀過嘅品牌如果已經唔存在（改名、刪除），退回第一個，
  // 免得 selector 顯示一個空白格。
  const known = items.some((item) => item.id === currentBrandId);
  const brandId = known ? currentBrandId : (items[0]?.id ?? null);

  return {
    brandId,
    selectBrand: (id: string) => {
      currentBrandId = id;

      for (const listener of brandListeners) {
        listener();
      }
    },
  };
}

export type CompanyState =
  | { kind: 'loading' }
  | { kind: 'ready'; identity: CompanyIdentity };

let companyCache: Promise<CompanyIdentity | null> | null = null;

export function useCompanyIdentity(load: boolean): CompanyState {
  const [state, setState] = useState<CompanyState>({ kind: 'loading' });

  useEffect(() => {
    if (!load) {
      return;
    }

    let alive = true;

    companyCache ??= fetchCompanyIdentity().then((result) => (result.ok ? result.data : null));

    void companyCache.then((identity) => {
      if (alive && identity !== null) {
        setState({ kind: 'ready', identity });
      }
    });

    return () => {
      alive = false;
    };
  }, [load]);

  return state;
}

/** 測試同「改完公司資料」之後用：唔想下一個畫面仍然讀到舊值。 */
export function resetDirectoryCache(): void {
  brandsCache = null;
  companyCache = null;
  currentBrandId = null;
}
