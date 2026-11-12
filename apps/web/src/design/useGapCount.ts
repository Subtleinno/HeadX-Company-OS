import { useEffect } from 'react';

/**
 * 表身把「缺幾項」上報給外面的「這一頁」面板（issue #53）。
 *
 * 為什麼要上報而不是由面板自己算：缺口是各頁自己的專業判斷（色彩計角色、
 * 字體計家族與字階、標誌計資產與模式、語氣計特質與情境）。面板再算一次
 * 就是第二套判斷 —— 早晚一個說缺三項、一個說缺兩項，而兩個都「看起來對」。
 *
 * 傳 `null` 代表表身這一刻講不出數字（例如內容解析不到）。面板收到 `null`
 * 就不講缺口，而不是講 0：「沒有缺口」與「不知道」是兩件事。
 */
export function useGapCount(count: number | null, onGapCount?: (count: number | null) => void): void {
  useEffect(() => {
    onGapCount?.(count);
  }, [count, onGapCount]);
}
