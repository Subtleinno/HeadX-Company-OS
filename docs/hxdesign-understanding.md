# 我對 HxDesign 的理解

日期：2026-11-03
依據：`Subtleinno/Hxdesign` HEAD `eb079b6` 的 README、MASTER-PLAN、DECISIONS.md、以及實際程式碼結構

---

## 一、它不是「一個設計工具」

如果我只看功能，我會說它是「設計專案的看板」。但讀完之後，我認為它是別的東西：

> **它是一個讓設計知識可以累積、並最終變成生產的系統。**

證據是它最基本的那條線：

```
【材料】Material = Components + Media；Knowledge Raw = 事實
   ↓ 應用 Material + branding
【已加工材料】Knowledge Article   ← 仍然係材料，唔係成品
   ↓ Create
【成品】Create deliverables       ← 唯一。唔經 Create 就唔係成品
```

這條線裡有一個很硬的規則：

> **「唔經 Create 就唔係成品。」**

意思是：任何東西都可以是「材料」，但只有走過 Create 這個動作，才取得「成品」的身份。

**這不是版面設計，是知識分類學。** 它在定義「什麼算完成」。

---

## 二、它最深的決定：把判斷移到輸入端

`DECISIONS.md` 的 **D08**：

> 「批准移除，用設計師與客戶自訂的標籤取代；判斷前移到輸入端的 Keep。」

我認為這是整個專案裡最有份量的決定。它說的不是「我們不做批准」，而是：

> **不要在事後攔截，要在輸入時就把關。**

傳統做法是：做完 → 送審 → 被退回 → 重做。
它的做法是：**進來的時候就決定要不要收**（Keep）。

這個想法的好處是：**被退回的工作根本不會發生**，所以不會浪費設計師的時間。

而它帶來的代價是：**系統裡沒有一個地方記錄「誰簽收了」。** 這正是 Company OS 存在的空間——但那是以後的事，不是現在要塞回 HxDesign 的東西。

---

## 三、它對「可靠性」的態度，比我原本做的更嚴

這是它教了我最多的地方。

### 它用資料庫約束，不用程式自律

`audit_log` 的 UPDATE／DELETE／TRUNCATE 由 trigger 直接 `RAISE 42501`。
權限上只有 `GRANT INSERT, SELECT`，然後 `REVOKE TRUNCATE`。

**不是靠「我們的程式不會改歷史」，是靠「資料庫不准你改」。**

### 它選擇報錯，而不是隱藏

它的 RLS 越權時 `RAISE 42501`，不是回傳空結果。理由寫得很清楚：

> **「隱藏 row 會令跨租戶 bug 變成空結果，看起來像成功。」**

這句話我認為可以直接抄進任何系統的設計原則。

### 它用真實角色測試權限

`tests/test_rls_runtime_role.py` 用 runtime role 直連測試，不是用 superuser。因為用 superuser 測 RLS 等於沒測。

---

## 四、它對 Agent 的設計，是全套裡最成熟的一塊

它的 agent 之門只有 **6 個動詞**：

| 動詞 | 我理解的角色 |
|---|---|
| `browse` | 讓 agent 知道「這裡有什麼」 |
| `read` | 讓 agent 拿到「這份東西的上下文」 |
| `write` | 讓 agent 交出成品 |
| `find` | 讓 agent 用編號或標題找回東西 |
| `render` | 讓 agent 拿到「可以開工的任務包」 |
| `help` | 讓 agent 知道自己該怎麼做 |

**六個動詞，不是三十一個工具。** 這個選擇本身就是產品哲學：agent 需要的是**動作**，不是 API 清單。

而且它做了幾件很體貼 agent 的事：

| 設計 | 為什麼 |
|---|---|
| `write` 收 bytes 時回一條帶 key 的 curl，不用 base64 | base64 會令 payload 膨脹 33%，而且模型會寫錯 |
| `render` 回任務包 URL，不回 6MB 字串 | 塞爆上下文 |
| `delivery.post` 改寫成 api 絕對路徑 | agent 不用自己拼路徑 |
| 支援 `Range`／206 | agent 可以只取需要的片段 |
| token 綁 workspace，越界回 404 | 最小權限，而且不洩漏「存在但無權」 |

---

## 五、它的紀律，是這個專案最容易被低估的資產

從 commit 訊息與文件可以看到一套工作方式：

| 習慣 | 例子 |
|---|---|
| 一個 loop 一個 commit，gate 紅就不開下一個 loop | MASTER-PLAN 的三條鐵律之一 |
| 寫決定，不只寫結果 | `docs: write down the decisions, not just the outcome` |
| 每日記憶 | `.workbuddy/memory/2026-11-03.md` |
| 舊系統不停機，新舊並行直到 cutover | 「舊 HeadX 全程繼續行，唔停機，去到 M10 先做一次性 cutover」 |
| CI 與正式用同一個映像 | `pgvector/pgvector:pg16` |

**這些比功能更能決定一個專案會不會爛尾。**

---

## 六、它現在的實際狀態（我要老實講）

### 真的做好

| 能力 | 證據 |
|---|---|
| 認證：scrypt、HttpOnly session 30 日、登入節流、首啟鎖 | `core/auth.mjs`、`routes/auth.mjs` |
| agent 之門：`POST /mcp`、Bearer `hxm_`、6 動詞全部 live | `routes/mcp.mjs` |
| 三層 ACL，四級 `none < view < edit < manage` | `0006`、`packages/policy` |
| append-only 審計，DB trigger 強制 | `0001` |
| 成品儲存 + Range／206 | `0009`、`create.mjs` |
| `HX-###` 編號即地址 | `create_project_ref_seq` |
| Studio 變服務、HYPERFRAMES 文件 | `docker/studio`、`docs/product/HYPERFRAMES.md` |
| CI 綠、smoke 走到 Range 206 | `.github/workflows/ci.yml`、`scripts/smoke.mjs` |

### 仍然缺

| 缺口 | 我的看法 |
|---|---|
| README 仍寫「connect-only／`tool_not_implemented`」 | **危險**。未來的 agent 會信 README，然後做錯判斷。應該第一時間修 |
| `delivered` 這個狀態沒有任何 code path 寫它 | 一個永遠到不了的狀態，是資料模型裡的一句謊 |
| `mcp_token` 沒有 expiry | token 一旦洩漏就永久有效 |
| `GET /audit` 只有 super_admin、LIMIT 100、無 filter | 好看但不好用；做事件流要直讀 `audit_log` |
| 沒有批准 | **這是刻意的（D08）**，不是缺。但「誰簽收」這件事需要有地方放——那是 Company OS 的事 |

---

## 七、我認為它在整個體系裡的位置

```
Company OS        擁有「商業真相」：客戶、訂單、授權、對外執行
      ↕ MCP（唯一合法通道）
HxDesign          擁有「創作真相」：材料、知識、成品、版本
```

**兩者不是上下層，是兩種真相。** 一邊答「這件事應不應該做」，一邊答「這份稿是什麼、到哪一版」。

它不需要變成 Company OS，Company OS 也不需要變成它。

---

## 八、如果要讓 Super Agent 把它做完，我會這樣帶它

| 原則 | 原因 |
|---|---|
| **先讀 `DECISIONS.md` D01–D40，才動手** | 40 個決定已經定咗方向；不看就等於重複討論 |
| **不要發明批准流程** | D08 是刻意的。要簽收就交回 Company OS |
| **一個 loop 一個 commit，gate 紅就停** | 這是它自己的鐵律，必須遵守 |
| **每個狀態值都要有 writer** | `delivered` 的教訓 |
| **測試要用真實 runtime role** | superuser 測 RLS 等於沒測 |
| **寫決定，不只寫結果** | 這是它已經在做的，繼續 |
| **先修 README 漂移** | 否則它會騙到未來的 agent（包括自己） |

---

## 九、一句話

> **HxDesign 不是在畫設計稿，是在定義「什麼算一個設計成品」——然後用資料庫約束把這個定義鎖死。**

這是它值得花時間做完的原因。
