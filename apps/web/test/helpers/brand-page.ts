import userEvent from '@testing-library/user-event';

/**
 * 進入編輯態（v2.1，共通修正第 6 節）。
 *
 * 品牌頁預設閱讀態：表身拿到 `canEdit=false`，輸入框只讀、標籤輸入收起。
 * 所以任何「真的改一格、落一版」的測試，都要先按「編輯」。
 *
 * 找不到鍵就拋錯，不靜靜略過 —— 略過會令測試變成「按不到都過」。
 */
export async function enterEditMode(): Promise<void> {
  const button = document.querySelector<HTMLElement>('[data-brand-page-edit]');

  if (button === null) {
    throw new Error('找不到「編輯」鍵：可能這一頁未有編輯權，或者畫面未載入完成。');
  }

  await userEvent.click(button);
}

/** 等頁面載入到可以按「編輯」為止。 */
export async function whenEditable(): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < 3000) {
    if (document.querySelector('[data-brand-page-edit]') !== null) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error('等了 3 秒仍然沒有「編輯」鍵：頁面可能載入失敗，或者這一頁未有編輯權。');
}
