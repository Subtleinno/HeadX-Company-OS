/**
 * 外殼的共用詞彙（#118）。
 *
 * 這裡刻意**沒有**任何後端或授權概念：
 *
 * - `AppMode` 只表達「這個 app 的 UI 入口要唔要品牌」，係決策 C46 的定義，
 *   唔係 manifest 欄位、唔係 grant scope、亦唔會寫入 registry。
 * - `ScopeTarget` 係「今次喺邊個工作上下文做事」，同 `UnitScope`（授權範圍）
 *   係兩件事：後者答「你有權去到邊」，前者答「你今次做邊個品牌」。
 *   所以呢個型別唔會出現 `all`。
 * - `BrandRef` 喺本切片只由原型 fixture 提供（C47／C50）；正式品牌身份未定，
 *   唔會由 `org_unit.type`、`null` 或前端硬編清單推出來。
 */

export type AppMode = 'company' | 'brand' | 'mixed';

export type ScopeTarget = { kind: 'company' } | { kind: 'brand'; brandId: string };

export type BrandRef = {
  id: string;
  name: string;
};

export type ShellNavItem = {
  /** 穩定 key。改名不得改這個值 —— 名稱可以改，身份不可以。 */
  key: string;
  label: string;
};

/**
 * 原型 app（C50）。
 *
 * 呢個型別**不是** `ModuleManifest`：它沒有 route、exposure、sensitive、available，
 * 亦不會流入 registry。正式 app 清單仍然只有 `GET /modules` 一個來源，
 * 真實 app 接駁屬 B-06。
 */
export type PrototypeApp = {
  id: string;
  title: string;
  mode: AppMode;
  /** 第一行右側的 app 主選單。 */
  menu: readonly ShellNavItem[];
};
