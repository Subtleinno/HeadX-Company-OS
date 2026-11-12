import { useCallback, useEffect, useState } from 'react';
import { fetchBrandGaps, type BrandGapCounts, type BrandGapItem } from '../api';

/**
 * 一個品牌（或其中一頁）的缺口（#58）。
 *
 * 缺口是資料，不是畫面狀態：它住在每一頁的現行文件裡。這支只負責把它讀回來，
 * 所以換頁、儲存新版本之後再讀，數字自然會變 —— 不存在「畫面幾多個缺」與
 * 「文件幾多個缺」兩個答案。
 *
 * `pageKey === null` 是「整個品牌」（品牌缺口對話框）；給一個頁鍵就是右側欄。
 */

export type BrandGapsState = 'idle' | 'loading' | 'ready' | 'failed';

export type BrandGapsResult = {
  state: BrandGapsState;
  items: BrandGapItem[];
  counts: BrandGapCounts;
  reload: () => void;
};

const EMPTY_COUNTS: BrandGapCounts = { total: 0, file: 0, judgement: 0, open: 0 };
const EMPTY: BrandGapItem[] = [];

export function useBrandGaps(brandId: string | null, pageKey: string | null): BrandGapsResult {
  const [state, setState] = useState<BrandGapsState>(brandId === null ? 'idle' : 'loading');
  const [items, setItems] = useState<BrandGapItem[]>(EMPTY);
  const [counts, setCounts] = useState<BrandGapCounts>(EMPTY_COUNTS);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (brandId === null) {
      setState('idle');
      setItems(EMPTY);
      setCounts(EMPTY_COUNTS);
      return;
    }

    let live = true;

    setState('loading');

    void (async () => {
      const result = await fetchBrandGaps(brandId, pageKey ?? undefined);

      if (!live) {
        return;
      }

      if (!result.ok) {
        setState('failed');
        return;
      }

      setItems(result.data.items);
      setCounts(result.data.counts);
      setState('ready');
    })();

    return () => {
      live = false;
    };
  }, [brandId, pageKey, nonce]);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  return { state, items, counts, reload };
}
