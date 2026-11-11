> **收入 repo 的來源**：原檔 `.workbuddy/design/BACKEND-FUNCTIONS-MAP.md`（2026-11-09，長期 gitignored）。2026-11-11 收入 `docs/product/`。
>
> **注意時效**：2026-11-09 首次盤點，**2026-11-11 已同步**（補 `directory`、`needs`、`staff` 的部門與 `brand-focus`，資料實體補到 0012；2026-11-12 補品牌頁版本，到 0013）。
> **真相以 `apps/platform/src/*/routes.ts` 為準**；本檔的價值是用語對照與「邊啲後端功能仲未有畫面」。與程式碼不一致時，改這一頁，不要改程式碼去迎合它。

# company-os 後端功能清單（UI/UX 重設計逐頁對照用）

盤點日期：2026-11-09
來源：`apps/platform/src/*/routes.ts`、`apps/web/src/api.ts`、`db/migrations/*.sql`、六份 `apps/*/manifest.json`、`docs/*`
用途：之後逐頁設計、逐一把功能套入新介面時對照。後端一行都不改。

---

## 0. 先讀：三個會影響設計嘅前提

1. **所有業務 API 都喺 platform**（`apps/platform`，容器內 4420）。前端一律叫 `/api/...`，nginx `proxy_pass http://api:4420/` 會去掉 `/api` 前綴。
2. **六個 manifest app 全部 `available: false`，而且各目錄只有 `manifest.json`**——冇 `dist/index.js`、冇 `dist/web`、冇 `registerApi`。即係 app-host 而家**零條部門 API、零頁部門畫面**。`docs/architecture/CODE-MAP.md` 已經書面確認「現時沒有任何真實的部門 app」。
   - `boss` 老闆台（console，sensitive: true，route `/boss`）
   - `design` 設計／內容／網站、`sales` 銷售、`ops_finance` 營運與財務（sensitive）、`hr` 人事（sensitive）、`support` 客服與 CRM（五個 department，全部 internal）
   - `README.md`：route／exposure／sensitive 現值係暫定，等 app 設計討論後確認。
3. **三道閘門**：入口守衛（`X-Company-OS-Gateway-Token` + `X-Company-OS-Entry: internal`，全部 platform 路由，`/livez`、`/health` 豁免）、CSRF（所有寫入比對 Origin／Host）、初始密碼（`must_change_password` 期間只放行 `GET /me` 同 `POST /auth/change-password`）。

權限代號：`requireOwner` ＝ 已登入且 `role = owner`；`requireUser` ＝ 任何已登入人類；「公開」＝ 唔需要 session，但仍要過入口守衛同 CSRF。

---

## 1. 端點總表（約 50 條 platform 端點，11 組）

標記：✅ 前端已有呼叫｜⬜ 後端完備但前端零畫面｜— 基建／維運，唔需要用戶頁

### 1.1 健康與探針（`app.ts`）
| Method | Path | 功能 | 權限 | 前端 |
|---|---|---|---|---|
| GET | `/livez` | 存活探針 | 入口豁免 | — |
| GET | `/health` | 檢查 db + storage | 入口豁免 | — |
| GET | `/health/storage` | 儲存診斷（bucket／物件／連線） | 仍需入口憑證 | ⬜ 維運向 |

### 1.2 認證與帳戶（`auth/routes.ts`）
| Method | Path | 功能 | 權限 | 前端 |
|---|---|---|---|---|
| GET | `/auth/state` | 開機狀態：要唔要 setup、登咗入未、目前用戶 | 公開 | ✅ `App.tsx` |
| POST | `/auth/setup` | 首次開機建立老闆帳戶 + session（限一次） | 公開、須可信入口 | ✅ `SetupScreen` |
| POST | `/auth/login` | 電郵密碼登入（限流、鎖定、密碼參數升級） | 公開 | ✅ `LoginScreen` |
| POST | `/auth/logout` | 撤銷 session、清 cookie | 公開 | ✅ 三個畫面 |
| POST | `/auth/change-password` | 改自己密碼（驗舊密碼、輪替 session） | 已登入；初始密碼期間可用 | ✅ `AccountScreen` |
| GET | `/me` | 自己嘅公開資料 | 已登入；初始密碼期間可用 | ✅ `AccountScreen` |

### 1.2b 品牌、據點與我的品牌（`directory/routes.ts`）
| Method | Path | 功能 | 權限 | 前端 |
|---|---|---|---|---|
| GET | `/brands` | 品牌清單 | `requireUser`（品牌 selector 要用，任何登入者都讀） | ✅ `DesignApp`、Frame selector |
| POST | `/brands` | 開新品牌 | **`requireOwner`** | ✅ 只有老闆見到表單（#19） |
| GET | `/me/brand-focus` | 我上次工作的品牌，未揀過回 `null` | `requireUser` | ✅ `useDirectory` |
| PUT | `/me/brand-focus` | 記住我這次的品牌（只寫自己那一行；品牌不存在 → `400 unknown_brand`） | `requireUser` | ✅ |
| GET | `/brands/:id/pages` | 品牌頁清單（順手確保五個固定頁存在） | `requireUser` | ✅ `BrandPageScreen` |
| GET | `/brands/:id/pages/:key` | 一頁的現行版本＋版本列表 | `requireUser` | ✅ |
| POST | `/brands/:id/pages/:key/versions` | 儲存＝新增一版（空內容 400） | **`requireOwner`**（品牌級授權見 #32） | ✅ |
| POST | `/brands/:id/pages/:key/versions/:vid/restore` | 用回舊版：以舊內容新增一版，不改歷史 | **`requireOwner`** | ✅ |
| DELETE | `/brands/:id/pages/:key/versions/:vid` | 軟刪除舊版；現行 409 `current_version`、被成品釘住 409 `version_pinned` | **`requireOwner`** | ✅ |
| GET | `/company` | 頁尾要顯示的公司識別（本機公司・公司名・城市） | `requireUser` | ✅ `AppFrame` |
| GET | `/sites` | 據點目錄 | **`requireOwner`** | ✅ `MembersScreen` 之外，`SitesScreen` |
| POST | `/sites` | 新增據點，回一次性邀請憑證 | **`requireOwner`** | ✅ |
| POST | `/sites/:id/approve` | 批准據點 | **`requireOwner`** | ✅ |

> 據點要老闆專用，因為「據點＝一台可以讀全公司資料的機器」，那不是一個功能，是「邊幾台機入得到」。

### 1.2c 需求（`needs/routes.ts`）
| Method | Path | 功能 | 權限 | 前端 |
|---|---|---|---|---|
| GET | `/needs` | 需求列表 | `requireUser` | ✅ `#/needs` |
| GET | `/needs/summary` | 需求摘要（Boss Portal 總覽用） | `requireUser` | ✅ |
| POST | `/needs/:id/claim` | 認領一個需求 | `requireUser` | ✅ |

> **開立需求仍然冇 API**（走 MCP 端），所以畫面上只可以看與認領，不可以新建。不要畫一個按落去冇反應的「新增」。

### 1.3 員工（`staff/routes.ts`）— 全組 `requireOwner`
| Method | Path | 功能 | 前端 |
|---|---|---|---|
| POST | `/staff` | 建立員工（初始密碼、`must_change_password = true`） | ✅ `StaffAgentsScreen` |
| GET | `/staff` | 員工列表（limit／offset） | ✅ 員工頁、授權頁 |
| PATCH | `/staff/:id/department` | 指派／取消部門（值必須是 manifest 的部門 key；`null` ＝取消；老闆受保護） | ✅ `MembersScreen` |
| POST | `/staff/:id/disable` | 停用員工（owner 受保護） | ✅ `MembersScreen` |
| POST | `/staff/:id/enable` | 恢復停用（不改密碼、不開 session、不撤銷任何東西；審計記 `wasDisabledSince`） | ✅ `MembersScreen` |
| POST | `/staff/:id/reset-password` | 重設臨時密碼（**須驗老闆自己密碼**、撤銷全部 session、唔寄信、唔復活停用） | ✅ `MembersScreen` |

> 建立員工時可以**一併**帶 `department`（#28；缺席或 `null` ＝未指派）。建立之後仍然可以用 `PATCH` 改 —— 部門會變、人也會調。這是 C92「建立時就要選部門」的落地方式。

### 1.4 Agent 身份與授權（`agents/routes.ts`）— 全組 `requireOwner`
| Method | Path | 功能 | 前端 |
|---|---|---|---|
| POST | `/agents` | 建立 agent 身份（冇密碼、冇 token） | ✅ `StaffAgentsScreen` |
| GET | `/agents` | agent 列表（分頁） | ✅ |
| POST | `/agents/:id/disable` | 停用 agent | ✅ |
| GET | `/agents/:id/grants` | 該 agent 嘅授權列表 | ✅ |
| POST | `/agents/:id/grants` | 直接建立**生效**授權（role 固定 `member`） | ✅ |
| POST | `/agents/:id/grants/:grantId/revoke` | 撤銷 agent 授權（帶 version） | ✅ |
| GET | `/agents/:id/access/:appId` | 用 `canAccessApp` 檢查 agent 能否存取某 app | ✅ |

### 1.5 App 清單（`modules/routes.ts`）
| Method | Path | 功能 | 權限 | 前端 |
|---|---|---|---|---|
| GET | `/modules` | 可見 app 清單，白名單 6 欄；老闆見全部，員工只見自己部門 | `requireUser` | ✅ `MyApps`、員工頁、授權頁 |

> 對外只輸出 `id`、`kind`、`title`、`department`、`order`、`available`、`route` 七欄。`exposure`、`sensitive` 唔對外輸出。
> 前端唔可以自建 app 清單 —— 登入落點（`useLanding`）就是靠這條的 `route` 決定員工去哪一頁。

### 1.6 公司設定與政策（`settings/routes.ts`）— 全組 `requireOwner`
| Method | Path | 功能 | 前端 |
|---|---|---|---|
| GET | `/settings` | 全部公司設定 | ✅ `CompanySettingsScreen` |
| PUT | `/settings/:key` | 逐 key 保存（immutable key 拒改、依 edition 驗證、寫審計） | ✅ |
| GET | `/policy-rules` | 政策規則列表（可依 domain 篩） | ⬜ |
| POST | `/policy-rules` | 新增規則（condition／action／priority／orgUnitId） | ⬜ |
| PATCH | `/policy-rules/:id` | 修改規則 | ⬜ |
| DELETE | `/policy-rules/:id` | 軟刪除規則 | ⬜ |

### 1.7 組織單位（`org/routes.ts`）— 全組 `requireOwner`
| Method | Path | 功能 | 前端 |
|---|---|---|---|
| GET | `/org-units` | 單位 + 上級邊（成張圖） | ✅ `OrganisationScreen` |
| POST | `/org-units` | 新增單位（可多上級） | ✅ |
| PATCH | `/org-units/:id` | 修改單位 | ✅ |
| DELETE | `/org-units/:id` | 軟刪除（根單位／有下級不可） | ✅ |
| POST | `/org-units/:id/parents` | 加上級邊（防成環、防重複） | ✅ |
| DELETE | `/org-units/:id/parents/:parentId` | 移除上級邊（最後一個不可） | ✅ |
| GET | `/org-units/:id/settings` | 有效值 + 繼承來源 + 自身覆寫（繼承由後端算） | ✅ |
| PUT | `/org-units/:id/settings/:key` | 設定單位覆寫（只限 4 個可覆寫 key） | ✅ |
| DELETE | `/org-units/:id/settings/:key` | 移除覆寫＝恢復繼承 | ✅ |

### 1.8 App 授權（`grants/routes.ts`）— 全組 `requireUser`，逐筆再驗範圍
| Method | Path | 功能 | 額外檢查 | 前端 |
|---|---|---|---|---|
| GET | `/app-grants` | 授權列表；老闆見全部，非老闆逐筆驗 `canSee` | 可見性過濾 | ✅ `AppGrantsScreen` |
| GET | `/app-grants/access/:appId` | **人**對某 app 嘅存取判斷 | `canAccessApp`（app-grants + entry + exposure + enabled） | ✅ `MyApps` |
| GET | `/app-grants/:id` | 單筆授權（睇唔到一律當 404） | `canSee` | ⬜ |
| POST | `/app-grants` | 申請授權（重送回原列） | `canRequest` | ✅ |
| POST | `/app-grants/:id/approve` | 批准；可一路推到 `active` | `canApprove`（敏感 app 只准老闆）；app 未啟用停 `approved` 回 409 | ✅ |
| POST | `/app-grants/:id/activate` | `approved` → `active` | `canApprove` + `manifest.available` | ✅ |
| POST | `/app-grants/:id/reject` | 拒絕（理由必填） | `canReject` | ✅ |
| POST | `/app-grants/:id/revoke` | 撤銷 | `canRevoke` | ✅ |
| PATCH | `/app-grants/:id` | 縮範圍即時生效（開新列）／擴範圍或升角色開新 `requested` 待批 | `canModify` + 組織範圍計算 + version 樂觀鎖 | ✅ |

> 所有狀態推進同 `audit_log` 同一交易；`version` 唔夾回 409 `stale_version`。app 定義唯一來源係 manifest，冇「手動改 app 定義」API。

### 1.9 檔案層（`files/routes.ts`）— 全組 `requireUser`
| Method | Path | 功能 | 前端 |
|---|---|---|---|
| POST | `/files` | 上傳（binary body、`x-file-name`、可選 sha256 校驗、上限 200 MiB） | ⬜ |
| GET | `/files` | 檔案列表（游標分頁；睇到乜由 store SQL 依 viewer 決定） | ⬜ |
| GET | `/files/:id` | 下載（Range／206／ETag／Content-Disposition／nosniff） | ⬜ |
| HEAD | `/files/:id` | 同上，只回標頭 | ⬜ |
| DELETE | `/files/:id` | 軟刪除 | ⬜ |

### 1.10 app-host（`apps/app-host`）
| Method | Path | 功能 | 前端 |
|---|---|---|---|
| GET | `/livez` | 存活探針 | — |
| GET | `/health` | readiness，回 `exposure` + 已載入 apps | — |
| 動態 | `{manifest.route}/*` | 每個 app 嘅 `registerApi` | **而家零條** |
| 動態 GET | `{route}`／`{route}/*` | 提供 `dist/web` 靜態頁 | **而家零頁** |

### 1.11 gateway（`apps/web/nginx.conf`）
| Path | 功能 |
|---|---|
| `/healthz` | gateway 自身探針 |
| `/api/` | 轉發 platform，去前綴、寫入 `X-Company-OS-Entry: internal`、注入 gateway token、`client_max_body_size 200m` |
| `/` | SPA fallback 去 `index.html` |

---

## 2. 後端完備、但前端零畫面（重設計要新開嘅頁）

| 功能群 | 端點數 | 現況（2026-11-11） |
|---|---|---|
| 政策規則 | 4 | `api.ts` 有列表呼叫；`profiles/default/policy-rules.json` 實際係空陣列 `[]`，所以畫面要顯示誠實空狀態，唔好放示例規則 |
| 檔案層 | 5 | `#/files` 已接（上傳、列表、下載、軟刪除）；nginx 為上傳放寬到 200 MiB |
| 授權單筆詳情 | 1 | 後端有 `GET /app-grants/:id`，前端只有列表同 PATCH |
| 儲存診斷 | 1 | 維運向，唔係用戶頁 |
| **新增需求** | 0 | 後端**冇**這條路（走 MCP 端），所以畫面不可以有「新增需求」的按鈕 |

仍然缺畫面的用戶向端點集中在一條：`GET /app-grants/:id`（授權單筆詳情）。

---

## 3. 現有前端畫面 ↔ 後端對照

| 畫面 | 用途 | 主要端點 |
|---|---|---|
| `SetupScreen` | 首次開機建立老闆（只出現一次） | `POST /auth/setup` |
| `LoginScreen` | 登入；401 統一訊息、429 用 `Retry-After` | `POST /auth/login` |
| `HomeScreen` | 首頁骨架：頂欄 + 誠實空狀態 + `MyApps` + 三條入口連結 | `POST /auth/logout` |
| `MyApps` | 我嘅 Apps：清單由 `/modules` 來、逐 app 問存取；未啟用照列但標明、跳轉停用 | `/modules`、`/app-grants/access/:appId` |
| `AccountScreen` | 個人帳戶、改密碼、登出；首次強制改密碼落點 | `/me`、`/auth/change-password`、`/auth/logout` |
| `AdminArea` | Boss portal 管理區外殼，四分頁，未儲存修改攔截切頁／登出 | `/auth/logout` |
| `CompanySettingsScreen` | 公司設定：**一個 key 一次保存** | `/settings`、`PUT /settings/:key` |
| `OrganisationScreen` | 品牌與組織：單位 CRUD、上級邊、設定繼承／覆寫 | `/org-units*` |
| `StaffAgentsScreen` | 員工與 agent 名冊、重設密碼、agent 授權與存取檢查 | `/staff*`、`/agents*`、`/modules`、`/org-units` |
| `AppGrantsScreen` | 申請／批准／生效／拒絕／撤銷／修改，人與 agent 兩視角 | `/app-grants*`、`/agents/:id/grants` 等 |
| `WorkspacePrototype` | `#/app/*` 原型外殼，**唔叫任何真 API**、唔顯示業務數字 | 無（fixtures） |
| `BossPortal`／`MembersScreen` | `#/boss/people/members`：員工名單、建立員工、指派部門、停用、恢復、重設密碼 | `/staff*`、`/modules` |
| `DesignApp` | `#/design`：品牌清單、新增品牌（只老闆）、記住上次品牌 | `/brands`、`/me/brand-focus` |
| `NeedsScreen` | `#/needs`：需求列表與認領（**不可以新增**） | `/needs`、`/needs/:id/claim` |
| `FilesScreen` | `#/files`：上傳、列表、下載、軟刪除 | `/files*` |

---

## 4. 資料實體（`db/migrations/0001`–`0013`）

| 實體 | 一句說明 |
|---|---|
| `audit_log` | 只准追加嘅審計紀錄，trigger 擋 UPDATE／DELETE／TRUNCATE |
| `app_user` | 使用者帳戶（owner／staff、部門、密碼雜湊、停用），唯一索引保證全公司只有一個老闆 |
| `auth_session` | session，只存 token 嘅 SHA-256，附到期、撤銷時間、`entry` |
| `stored_file` | 檔案中繼資料，實體檔喺 MinIO |
| `company_setting` | 公司設定 key／jsonb value，合法 key 由 `settings/schema.ts` 定義 |
| `policy_rule` | 政策規則（domain、condition、allow／require_approval、priority、軟刪除），最細 priority 命中 |
| `org_unit` / `org_unit_edge` / `org_unit_setting` | 單位（可多上級、菱形繼承）、上級邊、單位層級設定覆寫 |
| `app_grant` | **一列＝一個版本**；`requested→approved→active→rejected/revoked`，trigger 禁止原地擴權 |
| `agent_identity` | AI agent 身份（冇密碼、冇部門、冇 token；MCP token 留待 S3-01） |
| `job` | Postgres 背景工作隊列（至少一次、租約、退避、冪等鍵），唔用 Redis |
| `need` | 需求（`deliverable`／`decision` 兩型、狀態、認領），0010 新增 |
| `brand` / `site` | 品牌（`code` 唯一、`sort_order`）與據點目錄（一次性邀請憑證、批准狀態），0011 新增 |
| `user_brand_focus` | 每位員工上次工作的品牌；`user_id` 做主鍵（一人一格），0012 新增 |
| `brand_page` | 品牌的一頁：`kind`（fixed／custom）＋`key`（五個固定鍵或 slug）、名稱、brief、次序；部分唯一索引管「同品牌未刪的鍵唯一」，0013 新增 |
| `brand_page_version` | 頁的版本快照：`version_no` 逐頁計、`content`、`note`、`created_by`；**只加不改**由 trigger 強制，軟刪除是唯一合法 UPDATE，0013 新增 |
| `brand_page_version_pin` | 已出街成品釘住某一版；現時未有任何寫入者，但刪除檢查已讀它，0013 新增 |

---

## 5. 規劃中但唔存在（**唔好畫成可用**）

`docs/INDEX.md` 唯一來源表列咗 `need`、`need_event`、`outbox`、`approval`、`notification_channel`、`mcp_token`、`customer_account`、`delivery_log`，但 `db/migrations` 入面**冇呢啲表**。
`MASTER-PLAN.md` 規劃嘅 Boss portal 業務頁（今日、批准收件匣、各部門摘要）同樣未落地。
新介面要沿用「如實講未有／未啟用」，唔好假造入口或者 KPI——呢條係 repo 不變量（失敗要看得見、空畫面要講真話）。

---

## 6. 設計時要保留嘅狀態同錯誤語意

- 授權：「批准」唔等於「生效」；`approved`／`active` 要分開呈現。
- 版本衝突 `stale_version` 要如實顯示，**唔可以自動重送**。
- `password_change_required` 唔係「冇權限」，要帶去 `/account`。
- `entry_untrusted`、`app_not_enabled`、`grant_missing` 等拒絕原因要轉述，唔好摺成一句「失敗」。
- 查唔到（network／5xx）唔可以當成「不允許」，亦唔可以當成「允許」，要明講查唔到。
- 未啟用 app 要列出但標明「未啟用、不可進入」，唔好畀一個按咗冇反應嘅鍵。
- 敏感 app（boss／ops_finance／hr）嘅授權要老闆批准；授權、改權限、改設定一律寫審計。

---

## 7. 建議逐頁設計順序（待確認）

1. 外殼與導覽（首頁／app launcher／頂欄／側欄、六個 app 嘅位置）
2. 登入、首次開機、強制改密碼、個人帳戶
3. Boss portal 管理區四頁：公司設定／品牌與組織／員工與 agent／app 授權
4. 補新頁：政策規則、檔案、授權單筆詳情
5. 部門 app 嘅空殼與「未啟用」呈現（等 manifest 確認後先至畫業務頁）

每一頁對照本清單嘅端點，逐一把功能套入；一頁一張 issue、一個分支、一個 PR（`AGENTS.md` 開工規則）。

---

## 8. Ardot 設計稿頁面對照（2026-11-09 第一版）

設計檔：`company-os 底座 UI 設計`（Ardot fileId `745489967955017`），一個總覽板、`layout: wrap` 排 10 張 1440×900 頁面。

| 頁 | 名稱 | 覆蓋本清單邊幾節 |
|---|---|---|
| 00 | 設計基礎｜色彩 字級 元件 狀態 | 風格約束、四種狀態標籤 |
| 01 | 身份｜登入 開機 改密碼 個人帳戶 | 1.2、0 三道閘門 |
| 02 | 外殼｜App Launcher 我的 Apps | 1.5、1.8、5.1 |
| 03 | 設定｜公司設定 | 1.6 前兩條、`setting-labels.ts` |
| 04 | 組織｜品牌與組織 繼承 | 1.7、`org_unit_setting` |
| 05 | 員工與 Agent｜名冊 授權 存取 | 1.3、1.4 |
| 06 | 授權｜App 授權 狀態流程 | 1.8、6 錯誤語意 |
| 07 | 政策規則｜新頁 誠實空狀態 | 2 未接功能、1.6 後四條 |
| 08 | 檔案｜上傳 列表 下載 軟刪除 | 1.9、2 未接功能 |
| 09 | 今日｜狀態與錯誤語意 | 5 規劃中但唔存在、6 狀態語意 |

八張後台頁每頁底部都有「後端端點／驗收要點」功能對照區，可直接當落 issue 嘅驗收條件。
字形用 `Noto Sans HK`；白底黑字、黑色 accent、細線分隔、`#B8F36B` 只作狀態點；無 emoji、無紫色漸層。
設計稿係可編輯圖層，落實到 `apps/web` 嘅 React TSX 屬下一步，後端一行都唔改。
