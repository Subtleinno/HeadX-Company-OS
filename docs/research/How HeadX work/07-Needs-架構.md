# 07 · Needs 架構（全公司通用）

版本 v0.1 ｜ 狀態：規劃稿

## 0. 一句話

**Needs = AI 做唔到、或不應獨自決定的事，變成一張可派工、可追蹤、可閉環的工單。** 每個部門 app 擁有自己的 Needs；**公司層的 Needs 只是所有部門 Needs 的合併視圖**，不另存一份。

## 1. 核心原則

1. **部門擁有、公司投影**：資料由部門 app 存放；Boss Portal 只讀取投影。
2. **兩型為主**：`deliverable`（交東西）與 `decision`（作判斷）。
3. **不是錯誤處理**：缺料是正常路徑；半成品是合法狀態。
4. **AI 先做一次**：decision 型須附建議與依據，人做複核，不是從零決定。
5. **「已吸收」才算完成**：上載或按確認不等於結束，AI 要把結果落實並回填。
6. **一張 Needs 只要一件事**；同類的以「包」組織（見 5.3）。
7. **人的時間最珍貴**：合併、排序、批次處理是系統責任。

## 2. 類型

| 型 | 人要做 | 回傳 | 例 |
|---|---|---|---|
| `deliverable` | 製作並上載 | 檔案或資料 | 拍攝香港夜景、提供產品相、補寫一段簡介 |
| `decision` | 判斷／授權 | 決定＋理由 | 是否採用 AI 生成圖、療效宣稱可否使用、報價可否低於底線 |

### 子類（`subtype`，可由部門增加）

| 部門 | 例子 subtype |
|---|---|
| Marketing | `shoot`、`photo`、`copy`、`ai_image_adopt`、`claim_review`、`brand_confirm`、`music_pick` |
| Sales | `quote_approval`、`contract_sign`、`discount_override` |
| Finance | `reconcile_exception`、`amortization_decision`、`receipt_missing` |
| HR | `leave_exception`、`payroll_review` |
| Platform | `app_orphan`、`framework_approve`（見 02）、`backup_restore_test` |

## 3. 物件模型

```sql
create table need (
  id uuid primary key,
  dept text not null,                   -- 擁有部門 app：marketing|sales|finance|hr|platform|…
  type text not null,                   -- deliverable | decision
  subtype text,
  title text not null,
  status text not null,                 -- 見第 4 節
  priority text default 'normal',       -- low | normal | high | urgent
  due_at timestamptz,
  project_id uuid,                      -- 所屬 Project
  parent_id uuid,                       -- 所屬 Need 包（見 5.3）
  placeholder_ref text,                 -- 要填回哪個位置（composition slot 等）
  assignee_kind text,                   -- user | role | external
  assignee_id text,
  requested_by text,                    -- agent 或人
  spec jsonb not null,                  -- 要求內容（見第 6 節）
  context_refs jsonb,                   -- 引用的策略／知識／素材
  response jsonb,                       -- 人的回覆（檔案、決定、理由）
  absorbed_result jsonb,                -- AI 吸收後的落實記錄
  dedupe_key text,                      -- 去重
  created_at timestamptz default now(), updated_at timestamptz default now(),
  closed_at timestamptz
);

create table need_event (                -- append-only 事件
  id bigserial primary key, need_id uuid, at timestamptz default now(),
  actor text, kind text, detail jsonb
);
```

## 4. 狀態機

```text
deliverable：開立 → 待認領 → 進行中 → 已上載 → 已吸收 → 關閉
                                     ↘ 需要補件（回進行中）
decision   ：開立 → 待認領 → 已裁決 → 已吸收 → 關閉
                         ↘ 需要更多資料（AI 補完，回待認領）
共通：任何狀態 → 擱置（附原因）→ 重開；任何狀態 → 取消（附原因）
```

**不可跳狀態**（例如不可由「開立」直接到「已吸收」）；此為不變量，須以 property test 驗證（見開發憲章）。

### 「已吸收」做甚麼

| 型 | 吸收動作 |
|---|---|
| deliverable（素材） | AI 分析、標籤、入庫（見 03）→ 填回 placeholder → 通知 Project 重新檢查 |
| deliverable（文字） | 入知識或文案欄位 → 填回 |
| decision | 把決定落實成動作（改欄位、放行、更新策略解讀）→ 記錄「AI 建議 vs 人的決定＋理由」 |

## 5. 設計重點

### 5.1 公司層合併（Company Needs）

```text
Boss Portal 的「全公司 Needs」＝ UNION(各部門 app 暴露的 needs)
```

- 每個部門 app 必須透過 **Registry 的 `needs` shape** 暴露：列表、計數、單張詳情、可執行動作。
- Portal 不寫入部門資料，只顯示與導向（點進該部門 app 處理）。
- 全公司視圖的排序：逾期 > 緊急 > 阻塞其他 Needs 數量 > 到期日。

### 5.2 去重與合併（dedupe）

- `dedupe_key` 例：`marketing:photo:place=hongkong.tai-kwun:orientation=portrait`。
- 同一 key 已有開立中的 Needs → 不重開，而是把新的 Project 掛到同一張（`need_link`）。
- 這樣十個產出都缺「大館直幅相」，只會要求你拍一次。

### 5.3 Need 包（Bundle）：把零散要求變成一次行動

人拍攝不應是 12 張獨立工單。建立 `parent` Need：

```text
Shoot Package「香港歷史建築一日拍攝」（parent，deliverable）
 ├── 子項：大館 直幅 黃昏（含 3 個構圖建議）
 ├── 子項：中環街市 橫幅 白天
 ├── 子項：影片 6 個鏡頭（分鏡、對白、導演描述）
 └── 子項：背景音樂 prompt（供生成，或由人揀選）
```

- 包有**拍攝日程建議**（按地點、光線、路線排序）、**清單**、**檢查表**。
- 人上載時，按子項對應；缺的子項保持開立。
- 子項全部完成，包自動關閉。

### 5.4 Need 內容（`spec`）

**deliverable：**
```json
{
  "what": "大館正面直幅相片",
  "format": { "type": "photo", "orientation": "portrait", "min_px": 3000, "ratio": "4:5" },
  "count": 3,
  "why": "IG carousel 封面；策略「品牌介紹敘事」第 1 頁",
  "guide": {
    "shot_list": [{ "id": 1, "composition": "…", "light": "黃昏", "notes": "留白放標題" }],
    "reference_images": ["material:ai-ref-001"],
    "storyboard": null,
    "script": null,
    "music_prompt": null,
    "dont": ["不要拍到清晰人臉", "避免閃光燈"]
  },
  "constraints": { "consent_needed": false, "location_permit": "unknown" },
  "accept_if": ["直幅", "上三分之一留空", "解像度達標"]
}
```

**decision：**
```json
{
  "question": "此療程描述是否可使用「改善睡眠」一語？",
  "options": ["使用", "改為「有助放鬆」", "不使用"],
  "ai_recommendation": "改為「有助放鬆」",
  "basis": [{ "kb": "kb-reg-ad-medical-hk-001", "section": "療效宣稱" }],
  "if_agree": "按建議修改並繼續 render",
  "risk": "宣稱可能被視為療效保證；須專業人士確認"
}
```

### 5.5 指引圖與參考（你特別強調）

- 影片類 Needs：**每個場口一至數張參考圖＋對白＋導演描述**。
- 參考圖預設為 `reference_only`；若人決定直接採用 AI 圖，須另開 `ai_image_adopt`（decision），記錄決定人、日期、模型、prompt。
- 配樂：附「選曲方向」與「生成 prompt」兩選項，由人揀。

## 6. 角色與派工

| 角色 | 權限 |
|---|---|
| Boss | 看全部；可重新指派 |
| Staff | 看與做自己的（及其部門） |
| AI Agent | 開立、補件、驗收、吸收；**不可替人做 decision 型的裁決** |
| External | 只見被指派給自己的 Needs（magic link、限定帳號；離開任務即失權） |

**派工規則（可配置）：** 按 `dept` ＋ `subtype` 對應預設角色；可設代理人與休假轉派；逾期自動升級給主管／Boss。

## 7. 通知與介面

| 位置 | 內容 |
|---|---|
| 收件箱（人） | 我的 Needs：分組（今日、本週、等待他人）；每張卡有「做甚麼、為何、截止、附件、一鍵回覆」 |
| Email／訊息 | 摘要通知；External 以 magic link 直達 |
| Boss Portal | 全公司計數、逾期、阻塞、各部門負載 |
| 手機 | 拍攝清單模式：離線檢查表＋直接上傳 |

**批次處理：** 同類 decision（例如十條文案確認）合併成一個畫面逐條按確認。

## 8. 與 Edit／View／Agent 的關係

| 頁 | 內容 |
|---|---|
| Edit | Needs 規則（派工、subtype、模板）、單張編輯 |
| View | 收件箱、看板、全公司 Portal 投影 |
| Agent | 開 Needs 的標準：「何時應開、必填欄位、範例、不要開的情況」 |

### AI 的開立準則（寫入 Agent 頁）

應開：缺素材、缺決策、需授權、法規／療效等敏感判斷、AI 信心低於門檻。
不應開：自己可查證的資料、重複的要求（先 dedupe）、可由配方預設解決的選擇。

## 9. MCP 工具

```text
needs.create(dept, type, subtype, spec, project_id, dedupe_key)
needs.list(filters)            → L1 卡片
needs.get(id)
needs.bundle(parent_spec, children[])
needs.attach(project_id, need_id)        # 掛到既有 Need
needs.respond(id, response)               # 人／External 的回覆入口
needs.absorb(id, result)                  # AI 完成吸收
needs.reassign / defer / cancel
needs.stats(dept?)                        # 供 Portal 與路由使用
```

## 10. Registry 的 needs shape（契約）

每個部門 app 必須實作：

```text
GET /registry/needs?status=&assignee=&due_before=   → 列表（卡片）
GET /registry/needs/{id}                             → 詳情
GET /registry/needs/summary                          → { open, overdue, urgent, blocked_by }
POST /registry/needs/{id}/actions                    → claim|respond|defer|cancel
```

契約測試（機器驗證）：缺少任何一項，該 app 不可註冊。

## 11. 事件

`need.created` `need.assigned` `need.responded` `need.absorbed` `need.closed` `need.overdue` `need.escalated`

下游：Project 狀態更新、Materials 入庫、Portal 計數、通知。

## 12. 指標

| 指標 | 意義 |
|---|---|
| 平均回應時間 | 人是否成為瓶頸 |
| 退件率（需補件） | 指引是否清晰 |
| 重複開立率 | 去重是否有效 |
| 吸收失敗率 | AI 是否能正確落實 |
| 素材重用率 | 一張 Needs 帶來多少次後續使用（你的「越用越快」指標） |

## 13. 分期

1. P0：deliverable＋decision 核心、狀態機、收件箱、Marketing 的 `photo`／`shoot`／`ai_image_adopt`。
2. P1：去重與包、手機拍攝清單、Email 通知。
3. P2：Sales 的 `quote_approval` 接入，驗證 Registry 契約（兩個 producer）。
4. P3：External、升級規則、全公司 Portal 投影。

## 14. 風險

| 風險 | 對策 |
|---|---|
| Needs 氾濫 | 去重、包、開立準則、冷卻時間 |
| 人不回覆 | 升級、代理、到期自動「擱置並通知」 |
| decision 變成推卸 | 強制附建議與依據；空白 decision 不可建立 |
| 吸收失敗 | 失敗回「已上載」並開內部 Needs 給維護者 |
