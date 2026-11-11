import { useEffect, useState } from 'react';
import {
  fetchBrandFocus,
  fetchBrands,
  fetchCompanyIdentity,
  saveBrandFocus,
  type BrandItem,
  type CompanyIdentity,
} from '../api';

/**
 * 品牌清單、「我而家喺邊間公司」，同「我上次做緊邊個品牌」。
 *
 * 為咩要喺模組層共用一份：品牌 selector 喺每一頁都出現，如果每頁自己讀一次
 * `/brands`，切換頁面就會見到 selector 閃一閃、甚至短暫變回「公司範圍」。
 * 呢個快取只存**同一次瀏覽**的結果；換公司或改完品牌之後要重新載入，
 * 由呼叫端 `reload()` 明確叫，唔會自己猜幾時過期。
 *
 * 品牌清單同「我上次做緊邊個」一齊讀（一個 Promise），因為兩者要同時到達畫面：
 * 分開讀就會出現「先畫第一個品牌、再跳去我那個」的一幀閃動。
 */

export type BrandsState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      items: readonly BrandItem[];
      /** 伺服器記住的品牌（issue #15）。`null` ＝ 第一次，未揀過。 */
      focusBrandId: string | null;
    }
  | { kind: 'failed' };

type BrandsPayload = { items: readonly BrandItem[]; focusBrandId: string | null };

let brandsCache: Promise<BrandsPayload> | null = null;

function loadBrands(): Promise<BrandsPayload> {
  if (brandsCache === null) {
    brandsCache = Promise.all([fetchBrands(), fetchBrandFocus()]).then(([brands, focus]) => ({
      items: brands.ok ? brands.data.items : [],
      // 讀唔到 focus 就當「未揀過」：品牌本身仍然顯示得出來，
      // 而且下一次揀品牌會再寫一次。呢個係偏好，唔係資料，
      // 唔應該為咗它令整個品牌 selector 停擺。
      focusBrandId: focus.ok ? focus.data.brandId : null,
    }));
  }

  return brandsCache;
}

export function useBrands(load: boolean): { state: BrandsState; reload: () => void } {
  const [state, setState] = useState<BrandsState>({ kind: 'loading' });

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!load) {
      setState({ kind: 'ready', items: [], focusBrandId: null });
      return;
    }

    let alive = true;

    void loadBrands().then((payload) => {
      if (alive) {
        setState({ kind: 'ready', items: payload.items, focusBrandId: payload.focusBrandId });
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
 * 規則（issue #15）：
 *   1. 伺服器記住的那個（而且仍然在清單內）→ 用它。
 *   2. 冇記錄、或者記錄指的品牌已經唔存在 → **隨機**揀一個，即刻寫返去。
 *      隨機只會發生一次；寫入之後就係「記住」。
 *   3. 之後在同一次瀏覽內轉頁、轉模組，沿用同一個，唔會重新隨機。
 *
 * 為咩唔寫 localStorage：換裝置、換瀏覽器仍然要見到同一個品牌。
 * 呢個係「人的事實」，唔係「這台機的事實」。
 */
let currentBrandId: string | null = null;
/** 已經做過「第一次揀邊個」這一步。模組層，全個 session 一次。 */
let seeded = false;
/** 揀完但未寫入伺服器的那一個；由 effect 沖走。 */
let pendingFocusWrite: string | null = null;
const brandListeners = new Set<() => void>();

function notifyBrandListeners(): void {
  for (const listener of brandListeners) {
    listener();
  }
}

/**
 * 隨機揀一個，並安排寫入。
 *
 * 喺 render 期間執行：它是模組層的初始值，只會成功一次（`seeded`），
 * 而且改的是模組記憶而不是 React state。放在 effect 會令畫面先畫第一個品牌、
 * 再跳去隨機那一個 —— 一幀的錯誤答案也是錯誤答案。
 */
function seedSelection(state: BrandsState): void {
  if (seeded || state.kind !== 'ready' || state.items.length === 0) {
    return;
  }

  seeded = true;

  const remembered = state.focusBrandId;
  const rememberedStillThere =
    remembered !== null && state.items.some((item) => item.id === remembered);

  if (rememberedStillThere) {
    currentBrandId = remembered;
    return;
  }

  const picked = state.items[Math.floor(Math.random() * state.items.length)];

  if (picked === undefined) {
    return;
  }

  currentBrandId = picked.id;
  pendingFocusWrite = picked.id;
}

export function useSelectedBrand(brands: BrandsState): {
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

  // 每次 render 都試一次；`seeded` 保證只有第一次真正生效。
  seedSelection(brands);

  // 寫入係副作用，唔可以喺 render 期間做，所以留給 effect 沖走。
  useEffect(() => {
    if (pendingFocusWrite === null) {
      return;
    }

    const brandId = pendingFocusWrite;
    pendingFocusWrite = null;

    void saveBrandFocus(brandId);
  });

  const items = brands.kind === 'ready' ? brands.items : [];

  // 揀過嘅品牌如果已經唔存在（改名、刪除），退回第一個，
  // 免得 selector 顯示一個空白格。
  const known = items.some((item) => item.id === currentBrandId);
  const brandId = known ? currentBrandId : (items[0]?.id ?? null);

  return {
    brandId,
    selectBrand: (id: string) => {
      currentBrandId = id;
      // 選品牌當下就寫，唔等 effect：用戶揀完即刻關瀏覽器，都要記得住。
      void saveBrandFocus(id);
      notifyBrandListeners();
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
  seeded = false;
  pendingFocusWrite = null;
}
