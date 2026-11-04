# packages/

共用底座。每個 package 都是獨立的 npm workspace，供所有 app 使用；目前**未有任何 package**，
第一個在 R3 建立（`design-tokens`、`ui-kit`、`app-shell`、`i18n`）。

## 規則

1. **一個 package 一個資料夾**，資料夾名即 id（小寫字母開頭，只含小寫字母、數字、底線）。
2. **對外只經 `index.ts`**：package 外的程式碼只能引用 `packages/<id>/index.ts`，
   不得引用 package 內的子資料夾。`npm run lint:boundaries` 會擋住（規則
   `package-deep-import-<id>`）。CSS 之後以 `package.json` 的 `exports` 子路徑公開。
3. **不認識任何部門**：package 內不得出現部門名稱或部門邏輯；部門差異留在 app。
4. **不引用 app**：package 只能引用其他 package 的 `index.ts`，不可引用 `apps/`。
5. **一個事實一個來源**：色字間距只有 `design-tokens` 一份，元件不得自己寫死數值。

package 清單與各自職責見 `docs/architecture/CODE-MAP.md` 的「共用 packages」表。
