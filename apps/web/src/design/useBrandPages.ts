import { useCallback, useEffect, useState } from 'react';
import { fetchBrandPages, type BrandPageSummary } from '../api';

/**
 * 一個品牌的頁清單（issue #32）。
 *
 * 這一支是「這個品牌有哪幾頁」的唯一來源：左側導覽、頁籤、品牌主頁的入口，
 * 全部由同一份清單推出來。兩處各讀一次，早晚會出現「左側有四頁、頁籤有五頁」
 * 這種講不通的分別。
 *
 * `canEdit` 由伺服器一併回（老闆，或者被老闆授予品牌編輯權的人）。前端用它
 * 決定顯示什麼，但**不決定可不可以做** —— 每一條寫入路徑後端都會再問一次。
 *
 * 冇品牌（`brandId === null`）是 `idle`，不是 `failed`：那不是讀不到，是
 * 這間公司還未開第一個品牌。兩者擺在同一個狀態只會令人以為系統壞了。
 */

export type BrandPagesView =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; items: BrandPageSummary[]; canEdit: boolean }
  | { kind: 'failed' };

export type BrandPagesResult = {
  state: BrandPagesView;
  /** 方便取用的展開值：未讀到就是空的，不是上一次品牌的殘留。 */
  items: BrandPageSummary[];
  canEdit: boolean;
  reload: () => void;
};

const EMPTY: BrandPageSummary[] = [];

export function useBrandPages(brandId: string | null): BrandPagesResult {
  const [state, setState] = useState<BrandPagesView>(
    brandId === null ? { kind: 'idle' } : { kind: 'loading' },
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (brandId === null) {
      setState({ kind: 'idle' });
      return;
    }

    let live = true;

    setState({ kind: 'loading' });

    void (async () => {
      const result = await fetchBrandPages(brandId);

      // 中途換了品牌就把舊回應丟掉：晚到的回應不應該蓋住新品牌。
      if (!live) {
        return;
      }

      if (!result.ok) {
        setState({ kind: 'failed' });
        return;
      }

      setState({ kind: 'ready', items: result.data.items, canEdit: result.data.canEdit });
    })();

    return () => {
      live = false;
    };
  }, [brandId, nonce]);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  if (state.kind !== 'ready') {
    return { state, items: EMPTY, canEdit: false, reload };
  }

  return { state, items: state.items, canEdit: state.canEdit, reload };
}
