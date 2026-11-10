# 調研：平台自己生成缺少的 app（App Forge）

2026-11-10 ｜ 證偽式 prior art 調研 ｜ 四組獨立搜尋
配套文件：`company-os/09-app-forge.md`

---

## 命題

> Company-OS 不必預先支援所有生意。當 Boss 需要一個原始碼沒有的模組，系統要能幫他生出來——概念 → 框架適配 → 實作 → 註冊，就像我們現在做的一樣。

## 結論（先講）

**命題分三層，只有第三層是空位。**

| 層 | 命題 | 現況 | 判斷 |
|---|---|---|---|
| 1 | app 就是 metadata，定義完即時生效 | Salesforce（2008 起）、Frappe DocType、Odoo Studio、Airtable、Notion | 舊聞，無 novelty |
| 2 | 一句話生成一個 app | ServiceNow Build Agent、Power Apps Plan Designer、Zoho CoCreator、Retool Assist、Mendix 11 | 2025 起已商品化，賽道擁擠 |
| 3 | 生成物要符合平台**業務語意契約**才准註冊 | **找不到任何一家** | 空位 |

所有既存「上架／註冊」閘門都只驗技術、安全、協議：AppExchange／AgentExchange Security Review（2GP、namespace、CRUD/FLS、DAST）、Odoo manifest、Frappe app、MCP Apps SDK（tools JSON Schema + `ui://` resource）。**沒有一個驗業務本體（ontology）。**

我們在 v0.3 定的 Registry 四 shape（`projects`／`needs`／`approvals`／`schedule`）正好就是那個契約。

---

## 一、metadata-driven 與低代碼平台

| 名稱 | URL | 生成邊界 | multi-app host／registry |
|---|---|---|---|
| Salesforce Platform + Agentforce | salesforce.com/agentforce/agent-builder/ | metadata 即 app；Setup powered by Agentforce **仍 pilot**，只覆蓋 record-triggered／schedule-triggered flow，object+flow 逐件砌，不是「一句出一個 app」 | 有 Registry（2GP、namespace），但只過安全審查 |
| Odoo Studio（含 Odoo 19 AI） | odoo.com/app/studio | 可在運行中 DB 建 model／view／menu／automation，業務邏輯比 no-code 深（server action 可寫 Python） | Studio app 活在該 DB，**不是**可獨立安裝模組；export 成模組易碎 |
| Frappe Studio | github.com/frappe/studio | app 本身是 DocType（`StudioApp`／`StudioPage`），`publish` 即有 route，可 export 成真 app；官方出 agent skill 教 AI 寫 | 無契約層；README 自認 "very early, not for production" |
| Zoho Creator（CoCreator） | zoho.com/creator/ | 文字／SRS 生成完整 app（表單、automation、權限、dashboard），同一 tenant 內 | 無 host 契約概念 |
| Power Apps + Dataverse（Plan Designer） | learn.microsoft.com（Plan Designer 模組） | CRUD 強、業務邏輯弱；Generative Pages 只限 model-driven／US region／每頁 6 張表 | 所有 app 共用同一 Dataverse，無 per-app 隔離 |
| Retool Assist／ToolJet／Budibase／Appsmith | retool.com、docs.budibase.com | 生成 query + component + JS 邏輯；Retool 可直上 production | Retool：有 host、**無 registry**（Spaces 是分組）；Budibase：有 apps index + 跨 app 單一登入，但 datasource 刻意共用 |
| Airtable Omni／Notion 3.x／Coda | airtable.com、notion.com | 資料庫＋介面＋automation 齊，但缺狀態機、審批、可測試的邏輯層、可註冊單元 | 無 |

**小結：** 第 1、2 層全部做到，但「多 app 平台殼」與「生成器」是兩個分離市場；唯一縫合的是 ServiceNow，而它要 IT 立項。

---

## 二、2025–2026 生成式 app builder

| 名稱 | 生成能力 | registry |
|---|---|---|
| **ServiceNow Build Agent**（Zurich Store 1，2025-09） | 全棧：table／business rule／UI／ACL／dashboard／ATF 測試，instance-aware（先語意搜尋避免重複建表） | **有**：每次生成是 scoped application，進 `sys_app` 登記，app launcher 總覽。限制：需 Now Assist for Creator SKU（decks 顯示 US$7,500／module）、admin 裝 plugin、每 prompt 扣 25 assists |
| Power Apps（Ignite 2025 新體驗） | Dataverse 表＋canvas／model-driven app＋flow（只建議）＋agent | 有環境＋solution，但係「一個 solution 裝多 app」 |
| SAP Build Code + Joule | CAP 全棧（domain model、service、UI annotations、unit test），代碼級 | Build Work Zone 是中央 launchpad，但每個 app 獨立 deploy、獨立資料 |
| Mendix 11（Start with Maia） | domain model＋頁面＋microflow 骨架 | 弱；Global Inbox（2025-10）是唯一跨 app 任務彙集 |
| Base44（Wix 2025-06 收購，約 US$80M）／Lovable／v0／Bolt／Replit | 獨立 app 工廠，一 project 一部署 | **全部無 registry** |

**距離「平台自己生成新部門 app」的五步差距：**
1. 生成契約沒有 tenant／department 維度——「部門」要人事後用 scope、domain、resource 砌返。
2. Registry 是治理副產品，不是生成輸出（只有 ServiceNow 真的有）。
3. 資料隔離方向相反——Power Apps／Retool／Budibase 都係刻意共用。
4. 「自助」被 SKU、plugin、審批打斷：生成幾分鐘，「入平台」仍要 IT 立項。
5. 無平台級閉環：全部係「builder 裡的助手」，冇一個係「平台發現缺口 → 生成 → 註冊 → 配權 → 入總覽」。

---

## 三、spec → code 可重生成，成立嗎？

**「code as derived artifact」局部可行、全局未證。**

已成熟（有生產證據）：
- **葉子產物**：API client、DTO、proto stub、migration、IaC —— 每次 build 重生成，禁手改，靠 lockfile + generator 版本 pin。
- **workspace 級遷移**：Nx `migrate` 的 codemod —— 冪等、逐 migration 一 commit、可 revert、遇客製檔案主動停手報告。
- **合規閘**：ArchUnit／fitness function／contract diff 作 merge gate，取代人工審批。

未成立：
- 找不到任何 production 案例是「spec 改一次 → 整個 app 重生 → 直接上線、人手零改 code」。
- **Backstage Software Templates**：一旦 instantiate 就停止追蹤 template（官方＋多個獨立來源一致）。
- **OpenAPI Generator**：regeneration 預設 overwrite；業界逃生門是 `.openapi-generator-ignore`、region markers、三方合併——即**用「不做純重生」解決 drift**。
- **Tessl**（唯一公開主張 spec-as-source）：只做到 1 spec ↔ 1 file、beta 階段就轉向賣 Registry／skills。
- **Böckeler 實測**（martinfowler.com，2025-10-15）：agent 把「對現有 class 的描述」當新 spec 重新生成，造成重複程式碼；小 bug 被展開成 4 個 user story + 16 條驗收條件。她亦警告 spec-as-source 會同時繼承 MDD 的僵化與 LLM 的不確定性。
- **GitHub Spec Kit**（~143k stars，2026-08 v1.0）自我定位 "process toolkit, not execution framework"；constitution 只是 prompt 片段、無 validator（此為社群／評測描述，非官方原文，見 `charter-prior-art.md` 修正）。
- **Darwin Gödel Machine**（arXiv 2505.22954）：SWE-bench 20%→50%，但安全性來自「只改自己 codebase、只針對 coding benchmark」，並自認有 reward hacking。

**落地形態（採用）：** spec-anchored ＋ 明確生成邊界（generated zone／owned zone）＋ 可執行契約作 merge gate ＋ agent 增量維護。**唔係 full rebuild。**

---

## 四、風險：最有數據的五條

| # | 風險 | 數據 | 來源可信度 |
|---|---|---|---|
| 1 | 生成碼傾向複製而非重構 | GitClear 2025：211M 行變更；重構 24.7%→9.3%、複製貼上 8.3%→12.3%、5 行以上重複區塊 8 倍增長、短期 churn 3.1%→5.7%。2026 報告（623M 變更）：重構 −70%、區塊重複 +81% | 中高（供應商自家報告，方向與 CMU 對 807 個 Cursor repo 的研究一致） |
| 2 | 孤兒 app | Gartner Predicts 2026：citizen:pro = 4:1；80% 低碼用戶在 IT 監管外；第一手觀察「6 個月試 15–20 個 app，約 50% 棄置」 | 中（預測值不可當測量；50% 是第一手從業觀察） |
| 3 | Slopsquatting | USENIX Security 2025（16 模型、576k 樣本）：19.7% 推薦的套件不存在；205,474 個虛構名；43% 重跑十次都出現 | 高（同儕審查、可重現） |
| 4 | 工具鏈注入 | MCPTox（2025-08，AAAI 2026）：20 agent／45 server／353 工具，o1-mini 攻擊成功率 72.8%；拒絕率最高者 <3%；**模型越強越易中**。實例：postmark-mcp 加 BCC、WhatsApp MCP tool description 投毒、GitHub MCP 間接注入 | 高 |
| 5 | 「自動上線」的真實分佈 | SapFix（ICSE 2019）：約 25% 補丁落地，論文原話「no repair is landed into production without human oversight」。AWS Zelkova：SMT 證明 IAM/S3 policy，每日數百萬次、99% ≤160ms。LaunchDarkly：5%→10%→25% 後 105 秒自動回滾，actor 為 null | 高 |

**「自動驗證→自動上線」只存在於兩類地方：** (a) 目標可形式化到可以證明（policy、canary 指標）；(b) 已有可觀測的生產基線可比較。**沒有任何案例是「無人手批准 + 生成新業務邏輯 + 直接上線」。**

---

## 五、五道機器防護（按 ROI 排）

1. **依賴白名單 + 內部 registry proxy**（禁 postinstall、拒 N 天內新套件）——單點殺死 19.7% 幻覺率與大部分供應鏈攻擊。
2. **能力宣告 + 執行層 default-deny**（Cedar／OPA 式 policy）——唯一擋得住 injection 的層，因為它不看模型給的理由。
3. **Sandbox + 短效憑證 + egress 白名單**——保證錯了不會橫向擴散，順手消滅孤兒憑證。
4. **Canary + guardrail + 自動回滾**——唯一抓得到「語法對、測試綠、業務上錯」。
5. **不變量上的 property-based test**（冪等、金額守恆、權限不可提升、狀態機不可達）——OOPSLA 2025：每個 PBT 找到的 mutation 是 unit test 約 50 倍，76% 在前 20 個輸入內。

**擋不住但看起來很有用（明確不用）：**
- **同一個模型生成的單元測試當閘**：2026 審計顯示 SWE-bench Verified 有 28.5% 任務的測試套件弱到錯誤補丁能通過；另一審計顯示 agent「解決」的案例 63% 是找到既有修復而非推導（封 git 歷史與網絡後 87.1%→73.0%）。
- **只做 schema validation**：契約測試抓 41/53（77%），漏抓的 11/12 全是值域／範圍變更。
- **追求 mutation adequacy**：Google 實測初期 85% mutant 被工程師判為 unproductive，花六年、20,000 人才把 productive 由 15% 升到 89%。

---

## 六、來源清單

- Salesforce Agentforce Builder — https://www.salesforce.com/agentforce/agent-builder/
- Salesforce Setup powered by Agentforce（pilot）— https://admin.salesforce.com/blog/2025/introducing-setup-powered-by-agentforce
- Salesforce metadata / platform basics — https://trailhead.salesforce.com/content/learn/modules/platform-development-basics/develop-without-code-01
- Odoo Studio — https://www.odoo.com/app/studio
- Frappe Studio — https://github.com/frappe/studio ／ https://docs.frappe.io/studio/editor-interface
- Frappe Builder — https://github.com/frappe/builder
- Zoho Creator（Idea-to-App Generation，2025-04-30）— https://www.zoho.com/creator/
- Power Apps Plan Designer — https://learn.microsoft.com/en-us/training/modules/describe-business-value-microsoft-power-platform/9-describe-value-plan-designer
- Retool — https://retool.com/ ／ https://docs.retool.com/org-users/concepts/governance
- Budibase Workspaces — https://docs.budibase.com/docs/introduction-to-workspaces
- Airtable — https://support.airtable.com/docs/airtable-app-quick-start-overview
- Notion 3.0 — https://www.notion.com/blog/introducing-notion-3-0
- ServiceNow Build Agent — https://www.servicenow.com/products/vibe-coding.html
- SAP Build Code + Joule — https://www.sap.com/products/technology-platform/build-code-generation-of-fullstack-applications.html
- Mendix 11 — https://www.mendix.com/releases/mendix-11/
- Backstage — https://backstage.io/
- Nx migrate — https://nx.dev/using-nx/updating-nx
- OpenAPI Generator — https://openapi-generator.tech/
- GitHub Spec Kit — https://github.com/github/spec-kit
- Kiro — https://kiro.dev/
- Böckeler, *SDD: 3 tools*（2025-10-15）— https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- Tessl — https://tessl.io/
- ArchUnit — https://www.archunit.net/
- Darwin Gödel Machine — https://arxiv.org/html/2505.22954
- GitClear 2025 — https://www.gitclear.com/ai_assistant_code_quality_2025_research
- Spracklen et al., USENIX Security 2025（slopsquatting）
- MCPTox（2025-08，AAAI 2026）
- Google mutation testing at scale — https://arxiv.org/html/2102.11378v2
- Ravi & Coblenz, OOPSLA 2025（PBT in Python）— https://cseweb.ucsd.edu/~mcoblenz/assets/pdf/OOPSLA_2025_PBT.pdf
- SapFix（ICSE 2019）
- AWS Zelkova — https://d1.awsstatic.com/Security/pdfs/One_Click_Formal_Methods.pdf
- LaunchDarkly guarded releases — https://launchdarkly-com.netlify.app/docs/tutorials/agent-pipeline-quality-control

## 七、仍未核實

- 「Power Apps Copilot 一句話出一個完整 app」多為二手文章誇大；官方只到「plan → tables → pages」，flow 只建議不生成。
- Odoo「AI Create App & Model」示範來自第三方 add-on（odoo-studio.com／ERPBlox），非官方功能。
- Gartner「2028 年 prompt-to-app 令缺陷增 2,500%」為預測，傳播鏈經多手轉述，只作方向訊號。
- Cursor 2026 審計與 SWE-bench 弱測試比例（28.5%）為單一來源，未見獨立複現。
