import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';

/** 應用程式會同步的三條路由（與 src/router.ts 一致）。 */
export type ExpectedRoute = '/' | '/login' | '/setup';

/**
 * 斷言網址已同步為指定路由。
 *
 * 網址是在 App 的 useEffect（被動效果）內寫入的，可能比畫面的 DOM 落地更遲；
 * 整份測試並行跑時，緊接 `findByRole` 就讀 `window.location.hash` 會偶爾讀到舊值。
 * 這裡等它寫入，但斷言目標不變：最後一定要是這條路由，不是「隨便一個值」。
 */
export async function expectHash(route: ExpectedRoute): Promise<void> {
  await waitFor(() => {
    expect(window.location.hash).toBe(`#${route}`);
  });
}
