# 00 設計系統（品牌模組 v2）

全部沿用 `docs/product/FRAME-UIUX-HANDOFF.md` v1.5。以下只列品牌模組會用到的部分。

## 外殼（Chrome）
- 頂欄 72px：側欄開關、App selector（公司 Logo＋Design）、Brand selector（品牌 Logo＋「品牌 · Moonic 滿月堂」）、模組分頁（品牌、知識、素材、創作）、Needs 計數掣、語系、avatar。沒有搜尋。
- 左側欄 248px：最頂小標「頁面 PAGES」；分組標題只在兩組以上才出現。選中態：`#F0F1F3` 灰底、黑字、3px 黑左指示條。缺的頁在名稱右側顯示橙色小字「缺」。
- 右側「此頁 Needs」欄 320px：可收起，1280 以下自動收起。
- 頁尾 44px：公司 Logo、本機公司、據點與機器入口、總部主機。
- Chrome 只用黑灰白。

## 色彩與字級（Frame Tokens）
- accent `#0057FF`、accentSoft `#EAF0FF`、ink `#191919`、secondary `#6E6E6E`、muted `#A3A3A3`、border `#E1E4E8`、surface `#F5F6FA`、chromeSelected `#F0F1F3`。
- 狀態色只用於小標籤：通過 `#1F7A4D`、警示 `#B25E00`、不通過 `#C0362C`。
- 藍色只用於寫入或確認的主要按鈕與「進行中」小標籤；次要與離開按鈕用外框。
- UI 15px；頁標題 40/48；副標 17/26；卡標題 22/30；觸控目標至少 40px；圓角 6 至 12px；1px 幼線；只有浮層用陰影。
- 不用 emoji、不用紫色漸層、不用暖色中性。

## 品牌內容區（Brand Canvas）
- 品牌內容區由 payload 渲染，視覺完全由該品牌的角色決定，不受外框色影響。
- 外框與內容區之間只有 1px 邊與 14px 圓角。
- 示範品牌 Moonic：paper `#F6F3FE`、ink `#1F1B2D`、brand.primary `#DADEF8`、focus `#4A5396`。字體：Serif 用 Noto Serif HK，Sans 用 Noto Sans HK。
- 內容區的色值一律來自色彩頁角色；外框不得引用品牌色。

## 硬規則
1. 畫面內所有字都是產品文案，不放說明用的 meta 文字。
2. 缺就顯示「缺」，並給「建立 Need」；不用灰色假內容。
3. 每頁都看得到版本與最後修改者。
4. 一個畫面只有一個藍色主要按鈕。
5. 手機寬度只要求可讀品牌主頁；編輯只要求桌面（Frame v1 只做到 768）。

## 共用元件
- 狀態小標籤（pill）：高 24px、圓角 12px、13px 粗體。
- 檢查摘要條：通過、不通過、無法判斷三種計數＋最重要一條說明＋「查看明細」。
- Need 卡：標題、頁與型別（檔案型或判斷型）、狀態、動作按鈕。狀態：待建立、進行中、待接受。
- 重編橫幅：`#EAF0FF` 底，左文字右藍色按鈕「重編主頁」。
