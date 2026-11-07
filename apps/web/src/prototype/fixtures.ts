import { t } from '@company-os/i18n';
import type { BrandRef, PrototypeApp, ShellNavItem } from '@company-os/app-shell';

/**
 * 原型 fixture（決策 C50）。
 *
 * 呢啲資料**唔會**寫入正式 registry、唔會改任何 manifest、唔會出現在 `GET /modules`。
 * 佢哋只存在於呢個檔，並且由畫面明確標示為原型。
 *
 * 六個真 manifest 今日全部 `available: false`（維持不變）；真實 app 清單與
 * 「我的 Apps」屬 B-06，不在 issue 118。
 *
 * 顯示文字一律經 `t()` 取：i18n 守門測試規定 `apps/web/src` 之內不可以有
 * 寫死的中文介面文字，而且品牌名在原型裡面就是畫面上見得到的字。
 */

export const PROTOTYPE_BRANDS: readonly BrandRef[] = [
  { id: 'jia', name: t('proto.brand.jia') },
  { id: 'yi', name: t('proto.brand.yi') },
];

export const PROTOTYPE_BRAND_IDS: readonly string[] = PROTOTYPE_BRANDS.map((brand) => brand.id);

/**
 * App A／B／C 分別代表公司型、品牌型、混合型。
 *
 * 三行導覽（app 主選單、第二行、工作欄）嘅 `key` 一定要係**頁面 key**。
 * 外殼把三層的「你在這裡」收斂成一條 `currentPageKey`，key 同頁面對唔上會出現
 * 兩種假象：按落去第二行同工作欄即刻消失，而且任何一行都標唔到現行位置。
 * 呢個係視覺對照時量出來的，唔係設計變更。
 */
export const PROTOTYPE_APPS: readonly PrototypeApp[] = [
  {
    id: 'a',
    title: 'App A',
    mode: 'company',
    menu: [{ key: 'home', label: t('proto.menu.a') }],
  },
  {
    id: 'b',
    title: 'App B',
    mode: 'brand',
    menu: [{ key: 'overview', label: t('proto.menu.b') }],
  },
  {
    id: 'c',
    title: 'App C',
    mode: 'mixed',
    menu: [{ key: 'home', label: t('proto.menu.c') }],
  },
];

export type PrototypePage = {
  key: string;
  subMenu: readonly ShellNavItem[];
  rail: readonly ShellNavItem[];
};

/**
 * 頁面資料。原型每個 app 只有一頁，所以三層導覽都指向同一頁：
 * 在這一頁裡面按第二行或工作欄＝留在這一頁，唔會連自己所在嗰行都弄走。
 * 「品牌總覽」只出現在第二行，第一行仍然是 app 主選單，兩行唔會講同一句話。
 */
export const PROTOTYPE_PAGES: Record<string, readonly PrototypePage[]> = {
  a: [{ key: 'home', subMenu: [], rail: [] }],
  b: [
    {
      key: 'overview',
      subMenu: [{ key: 'overview', label: t('proto.page.overview') }],
      rail: [{ key: 'overview', label: t('proto.rail.brand') }],
    },
  ],
  c: [{ key: 'home', subMenu: [], rail: [] }],
};

export function findPage(appId: string, pageKey: string | null): PrototypePage | null {
  if (pageKey === null) {
    return null;
  }

  return PROTOTYPE_PAGES[appId]?.find((page) => page.key === pageKey) ?? null;
}

export const PROTOTYPE_ENTRY_HASH = '#/app/a/company';
