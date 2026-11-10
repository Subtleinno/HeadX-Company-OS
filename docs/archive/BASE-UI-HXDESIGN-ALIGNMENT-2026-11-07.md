# Base UI 與 HxDesign 的視覺對照（issue 118）

老闆 2026-11-07 決定：#118 的 Base UI 外殼要以 **HxDesign 的實際前端實作**作為視覺參考，
不是另創一套風格。本文件記錄對照的來源版本、實測數字、差距與本輪做法。

> **2026-11-09 更新（#153 #148 A，issue #156）**：老闆已取消 #148，確認唔再參考 HxDesign 做 UI 基準。**Frame v1.3（Ardot `745493588675335` ＋ `docs/design/frame/*.png`）＋ `docs/product/FRAME-UIUX-HANDOFF.md` v1.4 係唯一 UI 真相**；HxDesign 只作歷史參考。本檔保留作 2026-11-07 嘅歷史對照紀錄，下面所有實測數字同「本輪做法」**唔係今日施工規格、唔係裁決依據**，唔好拎去同 Frame 並存或互相覆寫。見 `DECISIONS.md` C61。

## 參考版本

| 項目 | 值 |
|---|---|
| Repo | `Subtleinno/Hxdesign`（private），`main` |
| Commit | `eb079b6965daa1e57235180111fc9b1cee45ef25`（2026-11-03T05:40:30Z） |
| 本機 checkout | `C:\Users\Billy Chung\src\hxdesign-reference`（= `origin/main`，無落後） |
| 運行中實例 | Docker `hxdesign-web-1` → `http://localhost:3210`（映像 `hxdesign-web:local`，建於 2026-11-03T09:26Z） |
| 量測方式 | Playwright + 真實 Chrome，1440×900／1024×800／360×760，`deviceScaleFactor: 2`；數值取 `getComputedStyle` 與 `getBoundingClientRect`，非目測 |

原碼與運行畫面不一致之處：無。映像建於 commit 之後，兩者一致；下表數字全部來自運行畫面，
與原碼 `apps/web/src/shell/*.css` 逐項對得上。

## 一、外殼骨架

| HxDesign 元件 | 原碼 | 實測值 | Company OS 對應 | 改前差距 | 本輪做法 |
|---|---|---|---|---|---|
| 頂欄 `.topbar` | `shell/Topbar.css` | 高 **52px**、`padding 0 16px`、`gap 8px`、半透明玻璃 `rgba(255,255,255,.82)` + `blur(14px) saturate(160%)`、底線用 `::after` + `scaleY(.5)` 畫 0.5px | `.shell-topbar` | 高 52 但**無玻璃**、`1px` 實線邊、`padding 8px 16px`、`gap 16px`、允許換行 | 玻璃 + 0.5px hairline、`padding 0 16px`、`gap 8px`、不換行 |
| 頂欄左段 `.tb-left` | 同上 | `gap 8px`、`flex: 0 1 auto` | `.shell-topbar__start` | `gap 12px`、`flex-wrap: wrap` | 對齊 |
| 頂欄右段 `.tb-right` | 同上 | `gap 4px`、`flex: 0 0 auto`、`margin-left auto` | `.shell-topbar__tools` | `gap 12px` | 對齊 |
| 圖示鍵 `.icon-btn` | 同上 | **38×38**、圓角 8、hover `fill-quaternary`、active `fill-tertiary`、`::before inset -3px` 做 44px 可按範圍、圖示 19px | `.shell-iconbtn` | **44×44**（視覺過大）、hover 用 `bg-tertiary`（太重）、無 44px 熱區技巧 | 38×38 視覺 + 44px 熱區、hover 用 `fill-quaternary` |
| 子選單列 `.brandbar` | `shell/BrandBar.css` | 高 **46px**、**不透明** `bg-primary`、`padding 0 16px`、`gap 14px`、底 0.5px hairline | `.shell-subnav` | 高 36、`gap 8px`、`1px` 邊 | 46px、gap 14、0.5px |
| 子選單項 `.bb-tab` | 同上 | 高 **30px**、`padding 0 11px`、圓角 **7px**、字 **12.5px/500**、選中 `bg-tertiary` + **600** | `.shell-subtab` | 與主選單同一尺寸（36px/14px）、選中樣式與主選單相同 | 30px/12.5px/7px、選中灰底 600 |
| 主選單項 `.tab` | `shell/Topbar.css` | 高 **36px**、`padding 0 14px`、圓角 8、字 **14px/500**、選中 **黑底白字** | `.shell-tab` | 高 36、`padding 0 12px`、字 17px、選中灰底 | 14px/500、`padding 0 14px`、選中黑底 |
| 工作欄 `.rail` | `shell/Rail.css` | 寬 **300px**、`bg-secondary`、右邊 0.5px hairline（`scaleX(.5)`）、內距 `16px 12px 18px` | `.shell-rail` | 300px 但 `padding 12px`、`1px` 邊 | 內距與 hairline 對齊 |
| 主內容 `.page` | `App.css` | 最大寬 **1080px**、`padding 32px`；≤900px 變 `20px 16px 32px` | `.shell-main` | `padding 24px`、無最大寬 | 32px + 1080px 上限 |

## 二、選擇器與浮層

| HxDesign | 原碼 | 實測值 | Company OS 對應 | 改前差距 | 本輪做法 |
|---|---|---|---|---|---|
| 工作區觸發 `.ws-btn` | `Topbar.css` | 高 **38px**、`padding 0 6px 0 10px`、圓角 8、字 **600 15px/20px**、**無邊框無底**、hover `fill-quaternary`、名字 ellipsis、`max-width 260px` | `.selector__button` | 高 36、**有 1px 邊框**、字 17px、看起來像表單輸入框 | 38px、去邊框、600 15px、hover 淡填、圓角 8 |
| 下拉箭頭 | 同上 | 另一個 38×38 圖示鍵，`chev-down` 17px | `.selector__chevron` | 用 CSS 邊框畫的 6×6 三角 | 改成 monoline 1.6px chevron（見「刻意不照搬」） |
| 浮層 `.menu` | 同上 | 寬 **280px**、圓角 **12**、`padding 4px`、`border .5px border-light`、`shadow 0 12px 40px rgba(0,0,0,.12)`、距觸發 **8px** | `.selector__list` | 圓角 12、`padding 4px`、距 4px、陰影用 hairline（很淡） | 距 8px、`shadow-lg`、0.5px 邊、寬至少 280 |
| 選項 `.menu-item` | 同上 | 高 **36px**、`padding 6px 10px`、圓角 8、字 **14px**、`gap 9px`、hover `bg-secondary`、選中 600 + 右邊 check | `.selector__option` | 高由內容決定、`padding 8px 12px`、字 17px、選中灰底 | 36px、14px、hover `bg-secondary`、選中 600 |
| 浮層小標 `.menu-label` | 同上 | mono **500 10px/14px**、`letter-spacing .06em`、全大寫、次要色 | 無 | 沒有分組標籤 | 原型需要時才用（見「刻意不照搬」） |
| 帳戶 `.account` | 同上 | 高 38、`gap 7px`、avatar **24px 圓**、名字 **13px** 次要色、≤1180px 收起名字 | `.shell-account` | 純文字 13px、無 avatar | 24px avatar + 13px 名字、≤1180px 只留 avatar |

## 三、字體與層級

| 用途 | HxDesign | 實測 | Company OS 改前 | 本輪做法 |
|---|---|---|---|---|
| 正文 | `400 15px/20px`、`letter-spacing -0.01em` | `-0.15px` | `400 17px/22px` | 15px/20px + 負字距 |
| 頁面標題 | `700 28px/34px`、`-0.02em` | 28/34 | 用 `--hx-font-title` 但無頁面框架 | 引入 page 標題層級 |
| 頁面小標 | `500 11px/16px mono`、全大寫、`letter-spacing .06em` | 同 | **無** | 新增 `.page__eyebrow` |
| 頁面副標 | `400 15px/20px` 次要色、`max-width 62ch` | 同 | **無** | 新增 `.page__sub` |
| 空狀態卡 | `padding 24px`、圓角 **16**、`border .5px border-light`、`bg-secondary`、`max-width 62ch` | 同 | 無（原型警告用左邊框灰條） | 新增 `.page__empty` |
| 等寬 | `ui-monospace, 'SF Mono', …` | 同 | **無此 token** | 新增 `--hx-font-mono` |

## 四、顏色

| Token | HxDesign 淺色 | Company OS 改前 | 本輪 |
|---|---|---|---|
| `bg-primary` | `#ffffff` | `#ffffff` | 不變 |
| `bg-secondary` | `#f5f5f7` | `#f5f5f7` | 不變 |
| `bg-tertiary` | `#e8e8ed` | `#e8e8ed` | 不變 |
| `text-primary` | `#1d1d1f` | `#1d1d1f` | 不變 |
| `text-secondary` | `#68686c` | `#68686c` | 不變 |
| `accent` | `#000000` | `#000000` | 不變 |
| `border` | `#d2d2d7` | `#d2d2d7` | 不變 |
| `border-light` | `#e8e8ed` | **無** | 新增 |
| `hairline` | `rgba(0,0,0,.12)` | 同 | 不變 |
| `fill-quaternary` | `rgba(0,0,0,.04)` | **無** | 新增（hover 用） |
| `fill-tertiary` | `rgba(0,0,0,.06)` | **無** | 新增（active 用） |
| `accent-hover` | `#1d1d1f` | **無** | 新增 |
| 玻璃 | `rgba(255,255,255,.82)` + `saturate(160%) blur(14px)` | **無** | 新增 |
| 陰影 | `0 12px 40px rgba(0,0,0,.12)` | **無** | 新增 |
| 深色 `bg-primary` | `#000000` | `#0b0b0c` | 改為純黑 |
| 深色 `bg-secondary` | `#1c1c1e` | `#161618` | 對齊 |
| 深色 `bg-tertiary` | `#2c2c2e` | `#232327` | 對齊 |
| 深色 玻璃 | `rgba(28,28,30,.82)` | **無** | 新增 |

## 五、刻意不照搬

跟隨視覺語言不等於逐項複製。以下四項是**有意**的差異，不是未完成：

1. **名字與箭頭不分割成兩個可點區**。HxDesign 的 `ws-btn` 點名字＝回品牌主頁，箭頭＝換 workspace。
   Company OS 的 app 選擇器只有一個工作（切換 app），拆成兩個 hit area 會令同一件事有兩個焦點站。
   所以維持單一控制，只把外觀對齊 `.ws-btn`。
2. **工作欄不會為了「看起來像」而畫一條空欄**。HxDesign 的 rail 目前只有框、無列
   （`Rail.jsx` 自述：列搬去了頂欄），所以它在截圖上是一條空的灰色直欄。
   Company OS 的規則（C47 前的既有決定）是「無工作索引就不顯示工作欄」——
   一條空白欄會令人以為載入失敗。寬度、底色、hairline 跟足，出現時機不跟。
3. **不做 `.menu-label` 分組標籤**。HxDesign 的 workspace 選單有 `WORKSPACES` 小標，
   因為它同時有「新增 workspace」「workspace 設定」兩組動作。我們的選擇器只有一個清單，
   加一個只有一組的小標是裝飾。
4. **選中的標示只用「600 字重 + 右對齊勾」，不加額外底色**。HxDesign 的 `menu-item` 選中態
   就是「600 + 勾」。我們跟足，但**不再**用灰色底做選中（灰底留給 hover 與第二行）。
   這一項原本寫成「不加勾」，第二輪量測後已改正：勾已經加，且與 600 同用。

## 六、本輪未對齊項

| 項目 | 原因 |
|---|---|
| HxDesign 的 `⌘K` 搜尋鍵、通知鐘、說明鍵 | 對應功能不在 #118 範圍（B-02 起）。加一個按下去無反應的鍵，正是 C48 禁止的「偽裝可用」。 |
| HxDesign 的語言選單（繁／EN） | 公司語系屬 B-11 佔位 issue，未啟動。 |
| HxDesign 手機版第二行 `mobile-tabs` | 我們的第二行是「頁面子選單」，不是「主選單的複本」；≤900px 時主選單仍留在頂欄，未做置換。360px 實測沒有溢出（scrollWidth 360），但分頁再多就會逼。此差異已知，未在本輪改。 |
| 公司型畫面沒有第二行 | 該頁真的沒有子選單，`height: 0`。HxDesign 每個畫面都有 46px 第二行（因為它總有分頁）。要「有」就得畫一條空欄，與「不要假造導覽」相衝，所以維持收起。 |
| 非法網址畫面沒有外殼 | 該畫面只出標題、說明與返回連結（`.proto-invalid`），沒有頂欄。HxDesign 沒有對應畫面，本輪不自行發明。 |
| 圖示不共用 HxDesign 的 sprite | 需要跨 repo 授權與同步來源。本輪用等效的 monoline 1.6px 幾何自行繪製，尺寸與線寬對齊。 |

## 七、第二輪（同日）：量到的缺陷與改動

第一輪只做到「骨架數字對齊」。老闆看過截圖後指出仍然像「測試頁」，所以第二輪改用
**computed style + 像素取樣**逐項覆核，肉眼判斷有兩次出錯（深色選單底、深色第二行底色），
兩次都由實測糾正。以下每一行都有量到的數字。

| 項目 | 量到的事實（改前） | 本輪改動 |
|---|---|---|
| 原型標示 | 13px、闊 447px、兩行、貼在頁面標題**之上**，主內容第一眼看到的是一段警告 | 改成 **12px 單行**、右對齊到頁面欄（`justify-content: flex-end`、`max-width: 1080px`）＝ HxDesign 第二行右端那種小字備註；文案縮短為「示範用 app 與品牌，未安裝、未授權。」，360px 仍然一行 |
| 重複的 app 名與範圍 | 標題 `App A`、副標 `公司 · …`、再一行 `App A · 公司`（`.page__lead`） | 刪掉 `.page__lead`；載入結果搬入「原型測試」區，前面加 mono 小標 `載入結果`，一眼看出它是診斷值不是頁面內容 |
| 導覽選中狀態 | 實測 `aria-current` **全部係 `null`**：fixture 主選單 key 係 `b.home`，頁面 key 係 `overview`，永遠對不上 | 統一成頁面 key。現時三層都標到，而且黑底只留給主選單、灰底留給第二行與工作欄（跟 HxDesign 註解：*Black is reserved for the one selected top-level tab… never a second black block*） |
| 按主選單會弄走自己所在那行 | 實測：按一下「品牌主頁」，hash 變 `#/app/b/brand.jia/b.home`，`.shell-subnav` 由 46px 變 0、`.shell-rail` 消失 | 同上修正。新增 3 條測試；用舊 fixture 跑過，**3 條全紅**，證明知的是真事 |
| 工作範圍觸發器 | 與 app 名同為 `600 15px`，兩個粗體並排，主次分不出 | 降一級：`14px / 500 / 次要色`（`.shell-slot--scope .selector__button`），與公司型的靜態文字一致 |
| 正文基準字 | `document.body` 實測 **17px**（token 正確，但 base 寫死 17px），HxDesign 係 15px | `15px/20px`、`letter-spacing -0.01em`，並加 `color-scheme: light dark`（深色底的原生控件不再淺色） |
| 第二步浮層 | 品牌列無圖示、36px 高但看起來像一串連結；與 app 選單不同語言 | 加 16px monoline 圖示、右對齊勾（現行品牌會標出來）；保留單一「返回」＋上方分隔線（C51 不變） |
| 360px 浮層 | 實測 `x=62`、寬 300 → 右邊界 **362**，凸出 2px | `--popover-left` 一個值同時決定 `left` 與 `max-width`；360px 時寬 282、右邊界 344（留 16px） |
| 360px 頂欄溢出（覆核） | 上一輪修好，本輪再量：viewport 360、topbar 360、`scrollWidth 360`、`overflow 0`（連長名稱） | 不需再改，數值記在此 |

第二輪之後的實測值（1440×900，`getComputedStyle`）：頂欄 52px、玻璃 `rgba(255,255,255,0.82)` +
`saturate(1.6) blur(14px)`、圖示鍵 38px、選擇器觸發 38px／`600 15px`／無邊框、主選單項 36px／14px、
第二行 46px、子項 30px／12.5px／圓角 7、工作欄 300px／`16px 12px 18px`、主內容 `padding 32px`、
頁面 1080px、標題 `700 28px/34px`、小標 `500 11px/16px` mono、副標 `15px`、body `15px`、`overflow 0`。

## 八、證據與重現方式

截圖與對照圖不放進 repo（含執行環境路徑與帳戶名），放在 `.workbuddy/evidence/118-hx/`：

| 檔案 | 內容 |
|---|---|
| `shots/hx-*.png` | HxDesign 實測畫面（1440×900、深色、360×760、1024×800、下拉、焦點圈） |
| `shots/app-*.png` | Company OS 本分支 build 產物（同樣 viewport） |
| `compare/cmp-0*.png` | 兩邊併在一張、同尺寸同縮放的對照圖（桌面白／桌面深／360／第二步／長名稱／選擇器） |

重現：`npm run build` → `cd apps/web && npx vite preview --port 4310 --strictPort`
（**一定要用 `http://localhost:4310`**：Vite 只綁 `::1`，用 `127.0.0.1` 會連不上），
再跑 `.workbuddy/evidence/118-hx/capture-app.mjs` 與 `compose.mjs`。
唯一假造的是 `**/api/auth/state`（本機 dev DB 仍是 `setupRequired`，#118 不准建真帳戶），
其餘一律真實。數值由 `getComputedStyle` / `getBoundingClientRect` 取得；顏色爭議用像素取樣覆核。

HxDesign 那一邊只做**唯讀**參考：登入用老闆提供的本機開發帳號，沒有改密碼、沒有新增帳號、
沒有改任何資料或設定；帳密只寫入一個即用即刪的臨時檔，沒有進入 repo、issue、PR、腳本或截圖。
