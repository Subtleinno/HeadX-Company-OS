# Company OS 與 HxDesign 的界線

版本：v1.0 | 日期：2026-11-03
對應決策：ADR-018
資料來源：對 `Subtleinno/Hxdesign` 的完整源碼分析（113 個文字檔：kernel 六件套、2 個 plugin、`contracts/`、9 份 docs、全部測試）

---

## 一句話

> **HxDesign 擁有「創作真相」；Company OS 擁有「商業真相」。兩者只經 `contracts/` 對話，不互相直讀資料庫。**

界線不是畫在「誰有批准功能」，而是畫在「誰擁有哪一種真相」。

---

## 二、HxDesign 現在的實際狀態（不是文件寫的，是程式碼證明）

### 真的做好而且做得紮實

| 能力 | 證據 |
|---|---|
| 內容定址儲存 + 幂等收據 | `backend/kernel/revision.py`，CAS + receipt |
| 只可追加的事件日誌，DB 層防竄改 | `backend/kernel/events.py`；`kernel_schema.sql` 的 trigger 對 UPDATE／DELETE／TRUNCATE 一律 `RAISE 42501`，權限只有 `INSERT, SELECT` |
| 工作區級強制 RLS | `identity.py` + `memberships`；用真實 runtime role 測試，不是 superuser |
| 背景工作帶 fencing token | `backend/kernel/` 的 job ledger |
| 設計決策：越權要報錯，不要隱藏 | `RAISE 42501`，「隱藏 row 會令跨租戶 bug 變成空結果，看起來像成功」 |

### 仍在紙上（這正是 Company OS 的立足點）

| 缺口 | 證據 |
|---|---|
| **沒有 approvals 表** | 全 repo 只有 9 張 `CREATE TABLE`，沒有一張是 approval。規格 §13.2 的 `draft → in_review → changes_requested/approved → locked` 狀態機**零實作** |
| **沒有對外審計介面** | events 只有 kernel 內部使用，沒有任何 route 或 MCP 工具可以讀 |
| **沒有認證** | 沒有 users／sessions／api_keys／device_grants 表；API 只有 `/versions`、`/healthz`、`/status` |
| **MCP 只有 4 個工具** | `bin_list`、`brand_read`、`brand_propose`、`find_tool`。`backend/versions.py` 是 generated，`count: 3` 是機器事實。規格 §15 寫 31 個，`mcp_server.py` 自認「M8 才收斂」 |
| **沒有跨 app 政策閘道** | 全 repo 搜 `risk tier`、`amount cap`、`spend limit` 皆零命中 |
| **`contracts/` 只有 2 個檔** | `manifest-v1.schema.json` 與 `determinism-policy.json`。架構圖聲稱的 canvas schema、asset refs、revision-CAS、**approval 契約全部未寫** |

**最重要的結論**：HxDesign 的規格與程式碼有巨大落差，而那個落差正好就是 Company OS 要做的事。**兩者不是替代關係，是填不同洞。**

---

## 三、界線（八條，可直接落地）

1. **HxDesign 擁有創作真相**：workspace、Material、Knowledge（raw / article）、Brand Standard、Create deliverable 與 revision、render job、CreativeNeed。Company OS **只引用，不複製**。
2. **Company OS 擁有商業真相**：Customer、Case、BusinessJob、OperationalNeed、Employee／角色／授權／session、Agreement、**BusinessApproval**、對外執行與收據。
3. **批准必須分成兩個不同型別，不可共用一個 status enum**：
   - `CreativeApproval`（HxDesign）：主體是某個 revision 加依賴／渲染指紋。答「這份設計稿批了沒有」。
   - `BusinessApproval`（Company OS）：主體是對象／渠道／收件人／內容雜湊／成品 revision／**到期時間**／**金額上限**。答「這件事應不應該對外做」。
   兩者都叫 approved／rejected，但**不是同一件事**，欄位與逾時規則都不同。
4. **政策閘道只准存在 Company OS 一處**：風險分級 L0–L4、金額上限、幂等鍵、熔斷。HxDesign 不答「應不應該做」，只答「這個 revision 批了沒有」。
5. **Revision／CAS／幂等的語義由 `contracts/` 定義一次**，共用 schema 與錯誤碼（409 衝突／403 越權／422 不合法）。不要各自實作第二套。
6. **事件不可以互相直讀資料庫**。對外只經 envelope 化的 outbox，Company OS 做 inbox 去重。（現時 HxDesign 的 event 沒有 `event_type`／`correlation_id`／`causation_id`，未達可作 event bus 的標準。）
7. **身份不統一**。Company OS 用自己的 identity；**明文禁止**用 HxDesign 的 service token 當作員工 session。
8. **兩邊都不准 Agent 自批或偽造批准**，每一筆批准都要記真實的人類 actor。HxDesign 已經做對：`mcp/actions.py` 刻意不把「批准」做成 MCP 工具，並有測試把關。Company OS 必須照同一原則。

---

## 四、開工前必須先補的一件事

`MASTER-PLAN` §0 的架構圖寫「兩邊只經 `contracts/` 對話」，但 **approval 契約根本未寫**。也就是說那條鐵律目前只成立一半。

所以下一個真正該寫的跨系統產物，是 **`contracts/approval-v1.schema.json`**，內容至少包括：

- `kind: "creative" | "business"`（兩個型別分流）
- `subject`：creative 用 `revision_id` + `dependency_fingerprint`；business 用 `target` + `channel` + `content_hash` + `amount_cents`
- `expires_at`（business 必填；creative 選填）
- `decided_by`（必須是真實人類 principal）、`decided_at`、`decision`、`reason_code`
- `policy_version`（決定當時所用的政策版本，用於日後追查）

**這件事沒有做，兩邊的批准紀錄永遠對不上帳。**

---

## 五、對 Company OS 路線圖的影響

| 原本 | 修正後 |
|---|---|
| A：叫 Agent 做一個「真實任務」 | **A'：先寫 `contracts/approval-v1.schema.json`，再叫 Agent 在 Company OS 實作它** |
| B：把閘道接到真實寫入來源 | 不變。第一個真實來源是 Super Agent 合併 PR |
| C：Dashboard 全景 | 不變。Dashboard 要顯示兩個系統的狀態，但只顯示，不互相寫入 |

最終形態：

```
┌──────────────────────────────────────────────┐
│  Company OS（商業真相 + 政策閘道）             │
│  BusinessApproval · OperationalNeed · 分級     │
│  金額上限 · 幂等 · 熔斷 · 對外執行              │
└───────────────────┬──────────────────────────┘
                    │  contracts/（唯一合法通道）
                    │  approval-v1 · manifest-v1 · ...
┌───────────────────▼──────────────────────────┐
│  HxDesign（創作真相）                          │
│  workspace · Material · Knowledge · Create    │
│  CreativeApproval · render job · CAS/receipt  │
└──────────────────────────────────────────────┘
```
