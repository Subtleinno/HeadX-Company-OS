# Company OS — Frame 設計稿索引

| 項目 | 內容 |
|---|---|
| 版本 | v1.4（對應 `docs/product/FRAME-UIUX-HANDOFF.md` v1.4；#153 裁決已落地） |
| 日期 | 2026-11-09 |
| 設計檔 | `company-os App UI v2`，Ardot fileId `745493588675335` |
| Ardot 網址 | https://ardot.tencent.com/file/745493588675335 |
| 狀態 | **Frame 設計定稿；#153 主色 A 與 Q1–Q9 已裁決（`DECISIONS.md` C53–C61）；原型示意值；未接任何 API；未施工** |
| 行為規格 | `docs/product/FRAME-UIUX-HANDOFF.md`（唯一文字規格，本目錄只放可視化圖） |
| 頁數 | 9 頁可編輯圖層＋9 張匯出 PNG（1440／1024／768） |

> v1.4（issue #156）：#153 主色 A 同 Q1–Q9 已裁決，決策唯一來源係 `docs/product/DECISIONS.md` C53–C61；本索引只同步裁決後嘅施工狀態，唔重新裁決、唔改設計圖。

呢份索引係為咗令**另一個 WorkBuddy session**可以攞到同一套設計：唔靠記憶、唔靠對話紀錄，淨係靠 repo 同 Ardot 檔。

## 兩條使用路（兩條都要試）

1. **可編輯圖層**：喺 WorkBuddy 開 Ardot 檔 `https://ardot.tencent.com/file/745493588675335`，用下表嘅 node ID 逐頁讀圖層／改圖層。呢個係設計嘅**原始真相**，匯出圖只係快照。
2. **匯出快照**：直接讀 `docs/design/frame/*.png`。GitHub 同本機 repo 都睇到；WorkBuddy 可以用圖片檢視逐頁對照，唔使開設計工具。

兩者唔一致時，**以 Ardot 圖層為準**，並喺 issue 留言講明要重新匯出；唔好兩邊各自改。

## 九頁對照

| 頁 | 匯出檔 | Ardot node | 狀態 | 展示重點 | 規格章節 | 施工狀態 |
|---|---|---|---|---|---|---|
| 01 | `frame/frame-01-shell-1440.png` | `10:13` | 1440 預設 | 兩層頂欄・左側子頁導覽・誠實空狀態・Logo 貼名・左下據點入口 | 2.1–2.4、2.7 | 未施工 |
| 02 | `frame/frame-02-app-selector.png` | `10:122` | App selector 展開 | 六個 manifest app（全部未啟用）；Boss Portal 標公司型・敏感；無「底座管理」入口 | 2.2、2.5、1.6 | 未施工 |
| 03 | `frame/frame-03-brand-selector.png` | `10:231` | Brand selector 展開 | Moonic／HxDesign／Subtle Inno；無「全部品牌」 | 2.2、2.5、2.6 | 阻塞（C47／#153 Q5 B：員工 Brand selector 暫不做） |
| 04 | `frame/frame-04-1024.png` | `10:340` | 1024 筆電 | 側欄 200px、收右側工具、收模組頁、padding 收窄 | 2.9 | 未施工 |
| 05 | `frame/frame-05-768.png` | `10:449` | 768 平板 | 模組分頁收成「模組 · 品牌 ▾」、側欄 180px | 2.9 | 未施工；360px 未設計（Q7） |
| 06 | `frame/frame-06-boss-portal-sites.png` | `10:597` | 據點與機器・總部目錄 | Boss／管理級先見到；純目錄，無假在線燈 | 2.8、1.6 | 已裁 Q9 A：視覺／互動規格定稿；施工仍阻塞（Q1–Q3 契約未落地、`available: false`） |
| 07 | `frame/frame-07-add-site.png` | `10:758` | 新增據點・三步憑證 | 進行到步驟 2；一次性邀請憑證（72h、單次） | 2.8 | 阻塞（同上） |
| 08 | `frame/frame-08-permission-gate.png` | `10:919` | 權限閘門・非管理級 | 直入網址見誠實狀態；頁尾唔顯示據點入口；身份「設計主管」 | 2.8、2.11 | 阻塞（Q2） |
| 09 | `frame/frame-09-footer-sites-menu.png` | `10:1080` | 本機公司身份・據點與機器入口（左下） | 由頁尾左側開啟；列出其他據點＋管理入口；開新分頁由該機自己驗身份 | 2.8、1.6 | 已裁 Q9 A：視覺／互動規格定稿；施工仍阻塞（Q1–Q3 契約未落地、`available: false`） |

頁 01–05 係品牌型（Design app）外殼；頁 06–09 係公司型（**Boss Portal**）外殼概念畫面。App selector 只有六個 manifest app，唔存在第七個叫「底座管理」嘅 app。

## WorkBuddy 開工卡（可成段貼去另一個 session）

```text
你係 company-os 嘅 Worker（WorkBuddy），唔係 PM。開工前順序讀：
AGENTS.md → docs/INDEX.md → docs/planning-loop.md →
docs/product/FRAME-UIUX-HANDOFF.md → docs/design/FRAME-DESIGN-INDEX.md →
你認領嗰張 GitHub issue。

設計點攞：
- 可編輯圖層：開 Ardot https://ardot.tencent.com/file/745493588675335 ，
  用 FRAME-DESIGN-INDEX.md 表入面嘅 node ID 逐頁讀（原始真相）。
- 快照：讀 docs/design/frame/*.png 九張，逐頁對照版面同狀態。
- 兩者不一致以 Ardot 為準，並喺 issue 留言，唔好自己改圖。

只做一張 issue：確認 Depends-on 全部已合併、同範疇無 status:building，
先加 status:building，開 task/<issue 號>-<短英文名>，先寫會 fail 嘅測試，
再寫實作，跑齊 issue 入面嘅驗收指令並貼實際輸出，開 PR 指向 main，
PR 描述四段（為什麼／改了什麼／驗證／不做什麼），完成後移除 status:building。
Q1–Q9 同主色已由 #153 裁決（見 DECISIONS.md C53–C61），唔好重新詮釋；其他規格有衝突或未裁決就停低，喺 issue 提問，唔好猜、唔好靜靜合併 main。
```

## 邊界（唔好踩）

- 九頁全部係**原型示意值**：公司名、品牌名、據點、指紋、日期、角色都唔係真資料；未接任何 API。
- **Logo 管理四頁已撤回**（`10:1385`／`10:2005`／`10:1703`／`10:1823` 已由畫布刪除），唔喺呢個目錄、唔係規格、唔好拆 issue。
- 頁 06–09 已由 #153 Q9 A 定為 Boss Portal 第一批據點管理畫面嘅**視覺／互動規格**，唔係施工授權；Boss Portal 完整業務頁未開始。`manifest.json` 嘅 `available: false` 維持不變（C50）。
- 「總部主機」＝登記／批准／入口中心，**唔係即時跨機資料連線**。
- 主色已由 #153 主色 A 裁決：chrome 黑灰白、內容區 `#0057FF`、`#B8F36B` 停用；`AGENTS.md` 色彩條目已由 #156 同步，唔好兩套並存（`DECISIONS.md` C53）。
- 呢個目錄**唔係施工授權**。每頁仍然要一張獨立 issue、一個分支、一個 PR、一組先 fail 嘅測試（`AGENTS.md` 第 2、3 條、`docs/planning-loop.md`）。
- 唔好改 `apps/web`／`packages/*`／`apps/platform`／`db/*`／`AGENTS.md`，除非被指派嘅 issue 明確授權。
