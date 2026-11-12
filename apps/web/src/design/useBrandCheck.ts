import { useCallback, useEffect, useState } from 'react';
import { runBrandCheck, type BrandCheckItem, type BrandCheckReport } from '../api';

/**
 * 一頁的檢查結果（#59）。
 *
 * 檢查是**算出來的**，不是存下來的：它讀現行版本，所以每次讀這一頁、每次
 * 儲存新版本之後再讀，結果自然會變。不存在「上一次檢查說合格」這一種狀態 ——
 * 一個會被記住的綠燈，就是一個會被誤信的綠燈。
 *
 * `state === 'failed'` 與「全部通過」是兩件事：跑不到檢查不代表合格，所以
 * 摘要條會講「檢查未跑到」而不是畫一個 0 不通過。
 */

export type BrandCheckState = 'idle' | 'loading' | 'ready' | 'failed';

export type BrandCheckResult = {
  state: BrandCheckState;
  items: BrandCheckItem[];
  summary: BrandCheckReport['summary'];
  headline: BrandCheckItem | null;
  reload: () => void;
};

const EMPTY_SUMMARY: BrandCheckReport['summary'] = { pass: 0, fail: 0, undetermined: 0 };
const EMPTY: BrandCheckItem[] = [];

export function useBrandCheck(brandId: string, pageKey: string): BrandCheckResult {
  const [state, setState] = useState<BrandCheckState>('loading');
  const [items, setItems] = useState<BrandCheckItem[]>(EMPTY);
  const [summary, setSummary] = useState<BrandCheckReport['summary']>(EMPTY_SUMMARY);
  const [headline, setHeadline] = useState<BrandCheckItem | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let live = true;

    setState('loading');

    void (async () => {
      const result = await runBrandCheck(brandId, pageKey);

      if (!live) {
        return;
      }

      if (!result.ok) {
        setState('failed');
        setItems(EMPTY);
        setSummary(EMPTY_SUMMARY);
        setHeadline(null);
        return;
      }

      setItems(result.data.items);
      setSummary(result.data.summary);
      setHeadline(result.data.headline);
      setState('ready');
    })();

    return () => {
      live = false;
    };
  }, [brandId, pageKey, reloadNonce]);

  const reload = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  return { state, items, summary, headline, reload };
}
