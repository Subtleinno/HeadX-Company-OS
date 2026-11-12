# 文件入口

這是唯一入口。其他文件與這裡衝突，以這裡為準。

## 三個入口，看你的目的

| 你想 | 讀這份 | 長度 |
|---|---|---|
| **記起這套東西是什麼**（設計真相） | [`CONCEPT.md`](CONCEPT.md) | 一頁十節 |
| **今日做到哪、怎樣跑起來、下一個做什麼** | [`product/HANDOFF.md`](product/HANDOFF.md) | 一頁八節 |
| **某個決定為甚麼這樣定** | [`product/DECISIONS.md`](product/DECISIONS.md) | C1–C113，後者優先 |

其餘全部文件都是這三份的**細節或歷史**，不需要順序讀。

## 文件地圖

### 真相（活著、會改）

| 檔案 | 內容 |
|---|---|
| `CONCEPT.md` | **設計真相**：七個原則、十二物件、Needs 閉環、公司層／品牌層、對外可達性 |
| `product/HANDOFF.md` | **今日交接**：程式碼在哪、五分鐘跑起來、現有畫面、品牌模組 loop 次序（§5）、十一個坑 |
| `product/DECISIONS.md` | **決策日誌** C1–C113，後者優先 |
| `product/FRAME-UIUX-HANDOFF.md` | 外殼行為規格 v1.4（四層導覽、據點目錄、權限門） |
| `product/SCOPE-MODEL.md` | 範圍模型：公司／品牌、三種 app 模式、管寫 vs 管讀 |
| `product/MULTI-MACHINE-ACCESS.md` | 跨機入口：總部＝登記／批准／入口中心，不是資料隧道 |
| `product/BACKEND-FUNCTIONS-MAP.md` | 端點對照：邊啲後端功能仲未有畫面（**有時效**，真相在 `apps/platform/src/*/routes.ts`） |
| `design/frame/frame-0*.png` | 九張**歷史參考稿**。2026-11-11 老闆明確講過：**不是真相**，介面由他當面定 |
| `design/FRAME-DESIGN-INDEX.md` | 九張稿的 node ID、對應章節、施工狀態（同樣是參考，不是規格） |

### 技術（施工時查）

| 檔案 | 內容 |
|---|---|
| `architecture/CODE-MAP.md` | 目錄、模組、分層、邊界規則 |
| `architecture/REPO-MAP.md` | 入口、容器與端口表 |
| `architecture/APP-DESIGN-TEMPLATE.md` | 每個 app 的設計範本 |
| `apps/<app>/DESIGN.md` | 該 app 的設計（app 建立時才有） |
| `app-db-access.md` | app 的資料庫帳號、權限矩陣 |
| `trusted-entry.md` | 可信 internal 入口、入口憑證、`session.entry` |
| `backup-restore.md` | 備份與還原（故障之後才讀它） |
| `deployment/demo-public-stack.md` | Demo Public Stack 部署契約（C52）：隔離條件、啟動、更新、清除、健康檢查。完整路徑 `docs/deployment/demo-public-stack.md` |
| `testing/DEMO-PUBLIC-TESTING.md` | Demo 環境的 UI／UX 測試與帳戶隔離規則 |

### 概念（未來才做，做到那個 app 才讀）

| 檔案 | 內容 |
|---|---|
| `concept/01-company-os-concept.md` | 上位構思的完整細節（`CONCEPT.md` 的來源與延伸） |
| `concept/09-app-forge.md` | 平台自己生出缺少的 app：五步、App Kit、五道機器防護 |
| `concept/10-build-charter.md` | 開發憲章：紅／黃／綠領土、六個配方、六級驗證階梯 |
| `concept/future/02`–`08`、`11` | 各部門 app 構思、App 圖書館、組織層級、情境壓力測試、交付計劃 |

### 歷史（已取代，只為查「當時為甚麼這樣想」）

`archive/` 內全部。重點三份：

| 檔案 | 為何在這裡 |
|---|---|
| `archive/MASTER-PLAN-2026-11-07.md` | 2026-11-07 的舊全盤計劃（國際版／大陸版、三入口、發件箱）。世界觀與現行概念衝突，已被 `CONCEPT.md` 取代 |
| `archive/00-master-plan-v1.0.md` | 2026-11-10 的老闆版入口，內容已併入 `CONCEPT.md` |
| `archive/BASE-UI-DESIGN-2026-11-07.md`、`BASE-UI-HXDESIGN-ALIGNMENT-2026-11-07.md`、`WORKSPACE-APP-SCOPE-DESIGN-v0.3.md` | 舊外殼與 Workspace 規格，C61 已宣告被 Frame v1.4 取代 |

> 歸檔不是刪除，git 歷史仍在。但**歸檔的文件不是真相**，不要在裡面找現行規則。

---

## 一個真相，一個方向

每個東西只有一個來源、一個流向。同一個事實存在兩處，其中一處就會悄悄過時。

| 事實 | 唯一來源 | 流向 |
|---|---|---|
| 有哪些 app 與導航 | `apps/<app>/manifest.json` | manifest → platform 的 app 註冊 → 我的 Apps |
| app 的路由與對外程度 | `apps/<app>/manifest.json`（`route`、`exposure`、`sensitive`） | manifest → gateway 路由表（CI 檢查一致） |
| 版本差異（入口、容器組合、端口、渠道、預設語言） | `packages/edition-profile` | edition-profile → compose、`.env.example`、`ports:check`、安裝精靈 |
| 目錄、模組與邊界規則 | `docs/architecture/CODE-MAP.md` | 規則 → `lint:boundaries` |
| 容器端口表 | `docs/architecture/REPO-MAP.md` | 文件 → edition-profile 對照檢查 |
| session 從哪個入口登入 | `auth_session.entry` | gateway 寫入 → app 驗證是否接受 |
| 哪些請求算「可信入口」 | `INTERNAL_GATEWAY_TOKEN`（只注入 gateway 與 platform） | gateway 覆寫標頭 → platform 驗證 → 寫入 `auth_session.entry` |
| 誰能進哪個 app | `app_grant` 表 | 資料庫 → platform 介面 → 各 app、我的 Apps |
| 資料形狀 | `db/migrations/<schema>/*.sql` | migration → 資料庫 → API |
| 誰可以做什麼 | `packages/policy` | policy → API → 拒絕理由 |
| 色字間距與共用元件 | `packages/design-tokens`、`packages/ui-kit` | tokens → 生成 CSS → 元件 |
| 公司設定、發件規則、門檻 | `company_setting`、`policy_rule` | 資料庫 → platform 介面 → UI、worker |
| 公司結構（brand、分部、法人） | `org_unit`、`org_unit_edge` | 資料庫 → platform 介面 |
| 我是誰（員工、夥伴） | `app_user` | 資料庫 → `GET /me` |
| 登入狀態 | `auth_session`（只存 token 的 SHA-256） | cookie → session |
| Need 的內容 | `need` | 資料庫 → platform 介面 → UI／MCP |
| Need 的狀態、逾期 | `need_event`（只追加）加 `due_at`，現算 | 查詢計算，不存 |
| 成果檔案 | `stored_file` 加 MinIO | 單一位置，無副本 |
| 隊列工作 | `job` | 資料庫 → worker |
| 各 app 的摘要數字 | 該 app 的摘要介面 | app → Boss Portal（Portal 不讀別人的資料表） |
| app 的資料庫帳號與權限 | `npm run db:app-access` | 工具 → Postgres ACL → app-host |
| 審計 | `audit_log`（trigger 只准追加） | 只能寫入 |
| 被刪除的東西 | `deleted_at` | 回收桶 |
| 品牌頁的現行版本 | 該頁**最新、未刪除**的版本，查詢時算出來（不存 `is_current` 旗標，C97） | 計算 → 各頁、品牌主頁 |
| 備份 | `BACKUP_ROOT` 的備份目錄加 manifest | 見 `docs/backup-restore.md` |

本表描述各領域唯一來源，不代表每項已有可用 API、UI 或已通過驗收。

**前端不准擁有自己的資料副本。** API 沒回傳，畫面就顯示空狀態，不是顯示一個看起來合理的數字；若原因是拒絕或失敗則明示，不偽裝無資料。

---

## 開工與改文件的規矩

1. 先讀 `CONCEPT.md`、`AGENTS.md`、`HANDOFF.md`，再讀你被指派的 issue。issue 是唯一授權；文件存在不等於批准施工。
2. **改概念先改 `CONCEPT.md`**，再改下面。概念改了就同步 `DECISIONS.md` 記一條，否則兩處會各說各話。**但文件與程式碼不一致（純粹過時）時，直接改文件，不要等 issue**（C93）—— 過時的手冊比沒有手冊更貴。
3. 一份文件只有一個責任。新文件之前先問：這件事是否已有主人？有就把舊的歸檔，不要留兩份。
4. 歷史留在 `archive/`，不刪。但**不在歸檔文件裡找現行規則**。
