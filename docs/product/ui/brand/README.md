# 品牌模組 v2 UI 設計稿（完整版）

狀態：完整版。沿用 Frame v1.5 的外殼與視覺語言，只定義品牌模組 v2 新增或改變的畫面。

## 怎樣讀
1. 先讀 `00-design-system.md`：外殼、色彩、字級、硬規則。
2. 再讀各畫面規格 `NN-*.md`：版面、文案、互動、狀態、權限、資料來源、驗收。
3. 視覺對照圖在 `png/NN-*.png`（1440 寬高保真圖，使用品牌 Moonic 滿月堂作示範內容）。若 `png/` 尚未有圖，停下回報，不要自己畫。

## 與現有決定的關係
- 本設計取代 DECISIONS C96「品牌模組五頁」：頁清單改為「品牌主頁、平台、色彩、字體、標誌、語氣、圖像、自定義頁、已核准範例」。實作前必須在 DECISIONS.md 新增一條裁決，寫明取代 C96。沒有這條裁決，不要改左側欄頁清單。
- Needs 沿用 C69：Needs 住在外殼（頂欄計數掣＋右側「此頁 Needs」欄），不是一個 app。缺口一律以 Needs 呈現，不另造缺口頁。
- 全站沒有搜尋（C63）、沒有深色 UI（C65）；本設計一律遵守。
- 品牌切換用頂欄既有的 Brand selector（D7），工作台不另設品牌清單。

## 畫面清單
| 規格 | 畫面 | 對應 issue |
|---|---|---|
| 01-workbench.md | 創作工作台 | 5、14 |
| 02-brand-home.md | 品牌主頁 | 12 |
| 03-page-read-edit.md | 頁閱讀與編輯（含檢查） | 6 至 11 |
| 04-version-drawer.md | 版本抽屜 | #33、2 |
| 05-stance-picker.md | 立場句選擇 | 6 |
| 06-gaps-and-needs.md | 品牌缺口 | 3 |
| 07-system-suggestion.md | 專屬系統建議 | 5 |
| 08-for-ai.md | 給 AI 用 | 2、12 |
| 09-strategy-boss-portal.md | 策略（Boss Portal） | 1 |
| 10-approved-examples.md | 已核准範例 | 13 |

## 規則
- 設計稿與 issue 衝突，或缺畫面，Workbuddy 停下回報，不自己決定。
- 示範內容（Moonic 的色值、文案）只是示範資料，不可寫死進程式；真正內容來自 payload。
