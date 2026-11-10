# Company-OS 上位文件改動記錄（v0.2–v0.6）

2026-11-10 一天之內改了六版，逐版 changelog 蓋過正文，所以搬來這裡。  
現行決策一律以 `../01-company-os-concept.md`（v0.7）為準；這份只是歷史，用來查「某個設計是何時、因為什麼變成現在這樣」。

---

> **v0.2 改動**：新增第 6 條設計原則「可配置優於寫死」；角色由三種增至四種（加 `External` 外判）；Needs 分為 `deliverable`／`decision` 兩型；部門 app 清單加 HR。

> **v0.3 改動**：原則 2 由「一個部門一個 app」修訂為「**一個 app 一個工作台**」；app 清單改為三層圖書館（`06`）；新增 **Site／Tenant／Group** 三層組織（`07`）；部署由「一間公司一個 instance」改為「**一個 Site 一個 instance**」。

> **v0.4 改動**：壓力測試完成（`08`）；確認組織目標為**形狀 B（一公司多店）**，第一版仍是 1 Tenant : 1 Site；第一版 app 定為 **Marketing Design**；新增三條框架層面的 breaking 決定（多幣種、監管保留、不做 marketplace）。

> **v0.5 改動**：新增第 7 條設計原則「**app 由 spec 編譯**」；新增 **App Forge** 能力與第 12 個物件 `App Spec`（`09`）；多幣種與監管保留正式定案；「不做 marketplace」修訂為「**不做雙邊平台，但做渠道接駁**」（WooCommerce／Shopify）。調研：`company-os-prior-art/forge-prior-art.md`。

> **v0.6 改動**：定位由「可賣的產品」改為「**自家基建＋按客客製**」（第 1.1 節）；新增 `10-build-charter.md`（領土／配方／驗證／變體）；「無 bug」改為三句可驗證承諾；變體策略定為 **config ⊂ overlay ⊂ core**。

---

## 為什麼要留這份

因為每一次改動都不是修辭，是取捨。例如：

- v0.3 由「一個部門一個 app」改成「一個 app 一個工作台」，是因為「部門」這個詞擋不住「同一批人兩種節奏」（門市 vs 電商）。
- v0.4 的三條 breaking 決定，是八間公司壓力測試逼出來的，不是憑感覺。
- v0.6 的「不賣」，一次放掉了五樣東西，也一次收緊了三樣。

日後若有人（包括 agent）問「為什麼當初不直接做 marketplace」，答案在這裡與 `08` 第 5 節。
