# 02 · AI 自動創建框架（Framework Engine）

版本 v0.1 ｜ 狀態：規劃稿

## 0. 一句話

**不是讓 AI 寫新程式，而是讓 AI 寫「規格（Framework Spec）」，由一套固定的通用引擎把規格變成 Edit／View／Agent 三頁。** 這樣你不需要懂得怎樣做，AI 也不會碰到核心程式。

## 1. 先講你需要知道的三個概念

| 名稱 | 白話 | 例子 |
|---|---|---|
| **Framework（框架）** | 一種「文件類型」，例如「品牌定位」「香港景點資料卡」「活動企劃」 | 品牌模組裏每一份文件 |
| **Framework Spec** | 描述這種文件有哪些欄位、選項、檢查規則的一份 JSON | 欄位：名稱、受眾、語氣… |
| **Renderer（通用引擎）** | 讀 Spec 後自動畫出 Edit／View／Agent 三頁的程式 | 只寫一次，所有框架共用 |

所以新增一種文件 = 新增一份 Spec（資料），不是新增程式碼。

## 2. 成長階梯（資料 → Storage → Source code）

| 層 | 內容 | 誰可改 | 存放 |
|---|---|---|---|
| L0 Spec | 純 JSON 規格，用通用 Renderer | AI 提議，**你確認** | Postgres |
| L1 自訂外觀 | 需要特別排版時的自訂 View 模板、自訂檢查腳本（沙盒） | AI 提議，**你確認** | MinIO（Storage） |
| L2 晉級 | 某框架穩定、用量大，才寫進 source code | AI 開 PR，**你合併** | Git repo |

原則：**90% 的框架停在 L0。** 只有真的需要特殊互動才升 L1，只有核心且穩定才升 L2。

## 3. Framework Spec 長甚麼樣

```json
{
  "id": "hongkong-location-card",
  "version": 1,
  "title": { "zh": "香港地點資料卡" },
  "owner_app": "marketing",
  "purpose": "記錄一個可拍攝／可報導的香港地點，供內容與素材檢索使用",
  "fields": [
    { "key": "name_zh", "type": "text", "label": "中文名稱", "required": true },
    { "key": "name_en", "type": "text", "label": "英文名稱" },
    { "key": "area", "type": "select", "label": "區域",
      "options": ["香港島", "九龍", "新界", "離島"] },
    { "key": "shoot_notes", "type": "longtext", "label": "拍攝注意事項" },
    { "key": "permit_needed", "type": "tri", "label": "需要拍攝許可？",
      "options": ["未知", "需要", "不需要"] }
  ],
  "decision_states": ["未決定", "AI提案", "已確認", "需修訂"],
  "views": {
    "view": { "layout": "summary-cards", "highlight": ["name_zh", "area"] },
    "agent": { "include": ["name_zh", "area", "shoot_notes"],
               "exclude_when_unconfirmed": ["permit_needed"] }
  },
  "checks": [
    { "id": "need-area", "rule": "area is not empty", "level": "warn" }
  ],
  "retention": { "min_years": 0, "deletable": true },
  "links": [{ "to": "material", "relation": "has_photos" }]
}
```

### 欄位型別白名單（Spec 只可使用這些）

`text` `longtext` `number` `select` `multiselect` `tri`（是／否／未知）`date` `url` `color` `file` `ref`（連結另一物件）`list`（重複欄位組）`rich`（受限 Markdown）

**不在白名單內的欄位型別，AI 不可自創**，須走 L2 晉級。

## 4. 「Framework Architect」Skill：AI 怎樣做

這是你要的 Skill。它是一份給 AI 的操作手冊加一組工具。

### 4.1 流程

```text
① 偵測需求：人說「我想記錄每個景點的拍攝許可」，或 AI 在工作中發現沒有地方放某種資料
② 先搜尋：現有框架有沒有 80% 吻合？有就擴充，不新建（避免增生）
③ 選模式：從「模式庫」揀最接近的骨架（見 4.2）
④ 起草 Spec（AI 提案狀態）
⑤ 自動驗證（見第 5 節）
⑥ 預覽：用假資料畫出 Edit/View/Agent 三頁給人看
⑦ 人確認／修改 → 狀態變「已確認」→ 啟用
⑧ 啟用後記錄：誰、何時、為甚麼；90 日無使用則開孤兒 Needs
```

### 4.2 模式庫（Pattern Library）

| 模式 | 用在 | 骨架 |
|---|---|---|
| 決策卡 | 要做選擇的主題（定位、語氣、色彩） | 選項庫＋單選／多選＋理由＋狀態 |
| 資料卡 | 一個實體（地點、產品、人物） | 欄位表＋關聯素材 |
| 清單 | 一組同類項目（禁用詞、FAQ） | list 欄位＋排序 |
| 流程 | 有步驟的 SOP | 步驟＋負責角色＋所需 Needs |
| 規範 | 渠道或格式規則 | 規則表＋範例＋禁區 |
| 手冊 | 長文字知識 | Markdown＋章節（見 05） |

AI 只能從這六個模式拼出新框架；要新模式須走 L2。

## 5. 驗證關卡（機器做，不靠人眼）

| 檢查 | 做甚麼 |
|---|---|
| Schema 驗證 | Spec 符合 JSON Schema，欄位型別在白名單 |
| 命名衝突 | id、欄位 key 不與現有重複 |
| 增生偵測 | 與現有框架欄位重疊 >70% 則拒絕，建議擴充 |
| 資料安全 | 含個人資料欄位（姓名、電話、病歷）須標註 `sensitive` 與保留政策 |
| 渲染測試 | 用假資料渲染三頁，無錯誤 |
| Agent 頁預算 | Agent 頁輸出須在 token 預算內（預設 ≤1,500 token） |
| 遷移安全 | 修改既有 Spec 時，必須附 migration（見 6） |

## 6. 修改與版本

- Spec 每次變更產生新 `version`；舊資料保留原 version，由 migration 升級。
- 只允許「加欄位」「改標籤」「加選項」自動通過；**刪欄位或改型別**須人確認並附資料處理方式。
- 與開發憲章一致：**不重生，只遷移**。

## 7. 資料表

```sql
create table framework (
  id text primary key,
  owner_app text not null,
  status text not null default 'draft',    -- draft | active | deprecated
  current_version int not null default 1,
  created_by text, created_at timestamptz default now(),
  last_used_at timestamptz
);

create table framework_version (
  framework_id text references framework(id),
  version int,
  spec jsonb not null,
  change_note text,
  approved_by uuid, approved_at timestamptz,
  primary key (framework_id, version)
);

create table document (
  id uuid primary key,
  framework_id text not null,
  framework_version int not null,
  data jsonb not null,
  decision_state text not null default '未決定',
  updated_by text, updated_at timestamptz default now()
);

create table document_revision (
  document_id uuid, rev int, data jsonb, changed_by text, changed_at timestamptz,
  primary key (document_id, rev)
);
```

## 8. AI 的寫入邊界（最重要）

| 允許 | 不允許 |
|---|---|
| 新增／修改 Spec（提案狀態） | 自行把框架設為「啟用」 |
| 在 Storage 放自訂外觀（L1，須人確認） | 修改 source code、核心 schema、權限、備份 |
| 填寫文件內容並標為「AI 提案」 | 把任何決策標為「已確認」 |
| 提議晉級並開 PR | 合併 PR |

## 9. 與 Edit／View／Agent 的關係

| 頁 | 由 Spec 自動產生的內容 |
|---|---|
| Edit | 欄位表單、選項說明、完成度、檢查結果、貼回 AI 提案 |
| View | 已確認決策的摘要、與未決定項目的差距 |
| Agent | 只含已確認＋AI 提案（標明狀態）＋可選項；體積受預算限制 |

## 10. 分期

1. P3-a：通用 Renderer＋手寫 3 個 Spec（驗證引擎）。
2. P3-b：AI 只可「提議」Spec，人手啟用。
3. P3-c：加入增生偵測與孤兒偵測。
4. P3-d：L1 自訂外觀。L2 晉級流程最後才做。

## 11. 風險

| 風險 | 對策 |
|---|---|
| 框架越長越多、沒人用 | 增生偵測＋90 日孤兒 Needs |
| AI 把草稿當定案 | 決策狀態＋Agent 頁標明 |
| 通用 Renderer 做得太花 | 只支援白名單型別，其餘走 L2 |
