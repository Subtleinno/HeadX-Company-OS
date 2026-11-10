# 調研：一個人＋agent 維護一套公司系統

2026-11-10 ｜ 證偽式調研 ｜ 三組獨立搜尋
配套文件：`company-os/10-build-charter.md`

---

## 命題

> 一套 self-hosted 企業系統，由單一擁有者決定一切，大部分程式由 AI agent 寫；要 agent 知道什麼可改、什麼不可改、開發時應該怎麼做；不同公司用不同 variant；軟件要無 bug。

## 結論（先講）

| 問題 | 答案 |
|---|---|
| 「叫 agent 唔好改某啲檔案」靠文件定靠機器？ | **靠機器。** 文件只買到合規性，買不到安全性 |
| 多間公司用，fork 定 core+overlay？ | **config ⊂ overlay ⊂ core，禁止 per-customer branch** |
| 「無 bug」可否承諾？ | **不可，而且不應該。** 可承諾的是爆炸半徑與復原時間 |

---

## 一、agent 可讀的 repo 治理

### AGENTS.md 已成事實標準

- https://agents.md/ — 2025-08 發布，2025-12-09 交由 Linux Foundation 的 Agentic AI Foundation 托管。**60,000+ 公開 repo**、**25+ 工具**原生支援；OpenAI 自家 monorepo 有 88 個。
- 嵌套時「最近者勝」；用戶在對話中的指令 override 一切。
- 現況：Codex 原生；Cursor 用 `.cursor/rules/*.mdc` + 讀 AGENTS.md；Gemini CLI 預設 GEMINI.md（可設定改讀）；Claude Code **2026-09-18（2.1.277）起**在沒有 CLAUDE.md 時 fallback 讀 AGENTS.md。
- **只收斂了檔名與位置，內容 schema 一直沒有**（官方明言「just standard Markdown」）。

### 但實證效應極細，而且是雙向的

ETH Zurich SRI Lab（arXiv 2602.11988，2026-02，2026-06 修訂）：

- 新 benchmark AGENTbench（12 個真實 repo、138 個 issue）＋ SWE-bench Lite 300 題，4 個 agent。
- **LLM 自動生成**的 context file：成功率 **−3%**，推理成本 **+20% 以上**。
- **人手寫**的：**+4%**，成本仍 **+19%**。
- 機制：**不是忽略，是過度遵從。** 檔案提到某工具，agent 每題就用 1.6 次（沒提則近乎 0）；repo 專用工具由近 0 升到 2.5 次／題；reasoning token 多 14–22%。
- **「codebase overview」——最常寫、最被推薦的一節——完全沒有加快找到相關檔案。**
- 反證：把 repo 內所有 doc 移除後，同一個 LLM 生成的檔案反而 **+2.7%**（證明它只是在重複既有文件）。

長度也有獨立證據：Chroma「context rot」（2025-07-14，18 個前沿模型）——**全部**隨輸入變長而退化；同一個答案，300 token 聚焦 prompt 完勝 113,000 token 全歷史。這是注意力預算問題，不是 window 夠不夠大。

### Spec Kit 的 constitution 沒有執行機制

- Böckeler（martinfowler.com，2025-10-15）一手觀察：「Even with all of these files and templates and prompts and workflows and checklists, I frequently saw the agent ultimately not follow all the instructions.」具體個案：agent 把「既有 class 的描述」當成新 spec，照樣重新生成一次，產生重複實作；另一方面又因為過度遵從某一條 constitution 而做過頭。
- spec-kit Discussion #3674（2026-07-23）指 `/speckit.implement` 連 constitution 都沒有載入，即「治理」根本沒進入生成路徑。
- **修正**：找不到 GitHub 官方使用「no enforcement mechanism」這句原話。「constitution 只是 prompt 片段、沒有 validator、沒有 runtime check」是社群與評測者的一致描述，不是官方自認。引用時要講清楚。

### 機器強制派的成形

- 把 constitution 中「可決定性檢查」的原則編譯成 fitness function：ArchUnit、dependency-cruiser、eslint-plugin-boundaries、import-linter、NetArchTest。
- **base-pinned proof gate**：用 PR base commit 的 tests／CI 定義去跑 PR 的 code，令 agent 改測試無效。
- 核心句（agentic-pipeline-guardrails）：「**prompts are not controls. A system prompt is a request; a branch-protection rule is a fact.**」

### ADR 對 agent 的效用（唯一有正面數據的一組，但 vendor 自測）

- Actual AI（2026-09-15）：10 個 OSS 專案、15 個真實 feature request，同一 codebase 各跑一次。加 ADR 後 **錯誤轉向 191 → 20 次（−90%）**、9/15 任務零錯誤轉向、token −37%、時間 −22%；讀 ADR 只佔約 5% token。
- 限制：每條件只跑一次、以 AI judge 判定、由售賣 ADR 工具的公司執行。**方向可信，幅度未確定。**
- 格式：Nygard 仍是預設；MADR 多了 considered options——對 agent 最有用的是 **`Rejected options`**（防重提已否決方案）。
- 反面警告（O'Reilly Radar）：agent 會**過度遵從已過時 ADR**，甚至加一層 abstraction 去遷就舊裁決。

### 長期維護的量化（本組最硬的數據）

SWE-CI（arXiv 2603.03823，2026-03，中山大學＋阿里巴巴）：100 個真實 Python repo、平均 **233 日**歷史、**71 次連續 commit**、18 個模型、約 **100 億 token**。

- **75% 的模型 zero-regression rate < 0.25**——四次維護三次弄壞原有功能。
- 只有 Claude Opus 4.5（0.51）與 4.6（0.76）過半。

**結論：單次修 bug 能力 ≠ 維護能力。**

### 本組結論

> **「不可以改」→ 機器（身份、權限、CI gate）；「應該怎樣做」→ 文件（AGENTS.md／ADR），而且只寫機器查不到的東西。**

五個機制（按性價比排）：

1. 獨立 bot 身份 + protected branch + required checks（單人擁有者要先開 bot，否則 approvals≥1 會鎖死自己）。
2. **base-pinned proof gate**（地基）。
3. 架構 fitness functions，先寫 3–5 條最痛的邊界。
4. AGENTS.md < 100 行，只寫「非標準工具鏈 + 禁區清單 + ADR index 指針」，每條禁區對應一個 CI gate。刪走 codebase overview。
5. ADR index + status lint（必須有 `status` 與 `Rejected options`）。

---

## 二、多變體、單人維護

### SPLE 還在，但工具鏈對一人團隊過重

Nazar（arXiv 2605.21353，2026-05）：SPLE 已標準化（UVL）並轉向 AI 輔助；但 BAPO／FEF 等框架「主要來自大型工業產品線情境」，SME 要「增量採用、有限前期投入」。多數組織的真實起點是 clone-and-own。

→ **借用詞彙，不借工具**：用 feature model 的概念做一張表（功能 × 哪間公司有 × 綁定時間），不要裝 FeatureIDE 做 formal model。

### 五個生態收斂到同一個形狀

| 生態 | config | overlay（可加不可改） | core（不可碰） |
|---|---|---|---|
| Odoo | Settings、Studio | 自寫 addon（`_inherit` + xpath） | standard modules |
| Salesforce | 每 org metadata | 每 org Apex／package | platform code |
| Frappe／ERPNext | Customize Form、Property Setter | custom app + `hooks.py` | frappe／erpnext 檔案 |
| WordPress | Customizer、theme.json | child theme、plugin | parent theme |
| Django | settings、INSTALLED_APPS | project 內 app、signal | reusable app 原始碼 |

「升級不會斷」的唯一共同條件不是「有 overlay」，而是**差異從來沒有寫入 core 的檔案**。Odoo 官方明講 custom module 不在升級 SLA 內（責任轉移到你）；直接改 standard module 就一定會斷。官方亦講明升級會覆寫非 `noupdate` 的 record——在 dev mode 直接改 view／email template 會無聲消失。

### fork 地獄是機制級證據

2004 年 "Client CVS Branch" anti-pattern 把每一步寫出來：第一個客開 branch 看似無痛 → bug fix 要逐 branch merge → 分歧越大 conflict 越多 → 同功能在不同 branch 重複開發 → 失去規模經濟。根因不是 fork，是**沒有 common trunk，branch 由另一個客的 branch 開出**。

2020s 佐證（顧問自述）：近 **40% 開發時間**用於同步客分支、security patch 由 2 小時變 2 日。nkdagility 直接把 branch-by-customer 定性為 worst case。

**注意：證據支持的是「per-customer long-lived branch 有害」，不是「fork 一定有害」。** 如果 fork 之後永遠 rebase 回 trunk、且 fork 只含客製，那是 2004 文認可的第二方案。

### config 的極限：Hadlow 的配置複雜度時鐘（2012）

12 點 hard-code → 2 點 config file → 4–5 點 schema／DB → 6 點 rules engine + GUI → 9 點 DSL → 回到 12 點，只是「用一個更差的語言 hard-code」。

原文：「At a certain level of complexity, hard-coding a solution may be the least evil option.」

→ **config 只放值與選擇，不放規則。** 危險訊號：`if A and B`、config 依賴 config、要「先查一張單」才能決定。

### overlay 的官方自認上限

WordPress Theme Handbook 自己寫：「making extensive customizations from within a child theme can eventually become a management headache. For these more extensive projects, it is often better to fork the original theme.」

→ overlay 有臨界點，過了就是一個沒有 fork 自由的 fork。

### 只有一個客，可否完全不做兼容

可以，但要分清「greenfield privilege」的邊界。真正的界線不是「有幾個客」，而是**「有幾多不可重來的狀態」**：production data、已部署而你不在場的實例、已簽約／第三方整合。三者皆無 → 可以直接 rename／drop。任何一項存在 → brownfield，要 expand–contract（Fowler ParallelChange）。

實務折衷：schema 改動永遠行輕量版 expand–contract（加新欄位 → backfill → 切讀取 → 下一版 drop）。成本是一個 script 加一個版本的延遲，買到 rollback 能力。

### 本組結論

**config ⊂ overlay ⊂ core 是三層，不是三選一。** 成本量級差異：fork 是 O(N) 次 merge 且非線性惡化；overlay 是 O(1) core + O(k) overlay；config 是 O(1) code + O(N) data、升級零 merge。

---

## 三、「無 bug」的工程現實

### 業界正常水平本身就帶 bug

| 指標 | 數字 | 來源 |
|---|---|---|
| 微軟應用程式產品缺陷密度 | 約 0.5／KLOC | McConnell 2004 |
| Coverity 2019 | 約 1.0／KLOC，明言「無論產品或語言，缺陷永遠存在」 | Coverity |
| DORA 2024 CFR | Elite 5%、High 20%、Medium 10%、Low 40% | DORA 2024（39,000 份回覆） |
| DORA 2025 CFR | 0–2% 只有 **8.5%** 團隊；4–8% 佔 19.6%；**8–16% 佔 26%（眾數）**；>32% 合共 18.4% | DORA 2025（近 5,000 人，90% 用 AI） |
| 一天內能復原 | 只有 **56.6%**；15.3% 超過一週 | DORA 2025 |

### coverage 是弱指標（同行評審）

Inozemtseva & Holmes, ICSE 2014（ACM Distinguished Paper）：31,000 個 test suite、5 個大型 Java 系統（最大 724k LOC）。**控制 test case 數量後，coverage 與故障偵測能力只有低至中度相關**；statement／decision／MC/DC 更強的標準也不提供額外洞察。結論原文：coverage「不應作為質量目標」。

→ **不存在「夠了」的 coverage 數字。** 找不到 80% 拐點的可靠實證（多數出自 vendor blog）。

### mutation testing 不是免費銀彈

Google（IEEE TSE 2021）：20 億行、每日 5 億次測試。初期 **85% 的 mutant 被工程師判為 unproductive**；花 6 年、**20,000+ 開發者**回饋，productive 比例由 **15% → 89%**。規模代價：776,740 個 changelist 產生 1,690 萬 mutant，每個 changelist 中位數由 820 降到 7；只有約 3% 收到開發者明確回饋。

**限定**：15%→89% 是「有回饋的 mutant 中被判為有用」的比例，不是「89% 的 bug 被找到」。論文證的是可維護性，不是有效性。

### 形式化：設計級抵，代碼級不抵

- AWS（CACM 2015）：TLA+ 用在 10 個大型系統、7 個團隊；工程師 2–3 週可產出有用結果。
- **DynamoDB 個案（最值錢）**：約 939 行規約，model checker 找到一個**會導致資料遺失**的 bug，最短錯誤軌跡 **35 個高層步驟**——而它通過了設計審查、code review、故障注入測試、長時間壓力測試。
- s2n：<10,000 LOC，證明接入 CI 每次 commit 重跑，一年只需 3 次手動更新證明。
- seL4：內核 8,700 行 C、證明 200,000 行 Isabelle，內核開發 2.2 人年、**證明約 20 人年**。

→ 值得做的只有 3–5 個 spec，針對「並發 + 重試 + 部分失敗」。**不要證明 CRUD、報表、權限 middleware。**

### 真正救命的是可逆性，不是少改

- Google SRE：「roughly **70% of outages** are due to changes in a live system.」（Google 自身經驗，非跨公司研究）
- DORA：「找不到證據支持更正式的外部審批流程與更低 change fail rate 相關」；重型審批令批次變大、頻率變低，**反而提高風險**。
- LaunchDarkly 2024（250 客戶 + 250 非客戶）：客戶 **46% 更可能在 1 日內復原**（86% vs 59%）、部署頻率高 84%。（vendor，低-中可信度）

### 企業系統真正的災難排序

- Uptime Institute 2024：**configuration／change management failure 佔重大網絡事故 50%、佔重大 IT／軟件類事故 62%**；人為錯誤貢獻 66–80% 停機；**80%** 受訪者認為最近一次嚴重事故可用更好的管理／流程／設定避免。
- Veeam 2024（1,200 名 IT 主管）：最近一次大型復原演練中**只有 58% 伺服器在 SLA 內恢復**；只有 **13%** 有編排好的還原流程；平均演練間隔 **7.3 個月**（2022 年為 4.4 個月）。

**排序：設定／變更 > 備份還原不到 > migration 失敗 > 硬件／第三方 > 純邏輯 bug。**

→ 與工程師的注意力分配**倒轉**：邏輯 bug 是最少見的類別，卻是最花力氣防的。

### 單人團隊的驗證預算

- ASE 2017（468 個熱門 Java 專案）：**24% 的 test suite ≥1 分鐘、8% ≥5 分鐘**；>1 分鐘那批平均 **9 分鐘**；只有 19.1% 用平行化。
- Gloria Mark：被打斷後平均需 **23 分鐘**回復深度專注；被中斷的任務耗時 2 倍、錯誤 2 倍。Nielsen：**10 秒**是注意力上限。

→ **suite > 10 分鐘 = 你會開始不跑它。** 誠實講：找不到任何同行評審的「一個工程師可維護 N 個服務」數字，這個問題在文獻上是空白。可用的只有間接預算：on-call 打擾次數比服務數量更真實；suite P95 < 10 分鐘是唯一有認知科學根據的硬約束。

### AI 寫大部分程式：效率是信念，穩定度下降是數據

- METR RCT（16 名資深 OSS 開發者、246 個真實 issue）：用 AI **慢 19%**（CI +2% 至 +39%）；開發者事前預測快 24%，**實驗後仍以為自己快 20%**；<44% 的 AI 建議被接受、75% 逐行審查、56% 需大幅修改。**2026-02 METR 自行指出後續研究有選擇偏差，對同一批人估計變為快 18%、新人 −4%——引用 19% 時必須同時引用這個修正。**
- DORA 2024：AI 採用率每升 25%，**交付穩定度下降 7.2%**、吞吐下降 1.5%。

→ 單人 + AI 寫大部分，正是最差的組合：**寫得快、審得慢，而審查產能是上限。**

### 本組結論

① **「無 bug」不可承諾，也不應承諾。** 可承諾的三句：15 分鐘內回滾；RPO ≤ 1h／RTO ≤ 4h 且每季實測；單一 app 故障不影響其他 app 讀取。

② 五條真正降低事故的措施（按嚴重程度 × 成本排）：

| # | 措施 | 救到什麼 | 成本 |
|---|---|---|---|
| 1 | 備份 + 每季實戰還原演練（PITR、異地副本、計時、備份失敗要告警） | 不可逆的資料全失 | < 1 人日／季 |
| 2 | 最小權限 + 破壞性操作防呆（prod 不容許 app 帳號 DDL／DROP） | 權限誤設、誤刪、誤跑 script | 1–2 人日 |
| 3 | expand–contract 可逆 migration | migration 半途失敗、部署期間舊 instance crash | 每次多 2–3 個 deploy |
| 4 | kill switch + canary + 一鍵回滾 + 變更後自動健康檢查 | 全局停機、壞版本擴散 | 低-中 |
| 5 | 只對 3–5 個高危不變式做 TLA+ | 35 步才觸發的資料遺失設計 bug | 每個 spec 2–3 週 |

③ **看起來很穩健但實際上不救命：**

1. 追求 coverage 百分比（尤其硬性 80/90%）——量的是「有沒有執行」，不是「有沒有驗證」；AI 生成測試可幾分鐘衝高而 assertion 是空的。
2. 寫大量 unit test／倒置的測試金字塔——捉不到設定、migration、權限、整合，而那正是真正殺你的 80%。
3. 加審批／CAB／多重簽核——DORA 明言找不到證據支持；單人團隊加審批等於自己批自己。
4. 全系統形式化證明／追求 100% mutation score——成本以年計，而事故大部分不是這類 bug。
5. 「零 bug」SLA——METR：開發者自覺快 20%，實際慢 19%。（作者已修正幅度，但「感知與現實脫節」成立。）

---

## 四、來源清單

- AGENTS.md — https://agents.md/
- ETH Zurich SRI Lab, AGENTbench — https://arxiv.org/abs/2602.11988
- Chroma, Context Rot（2025-07-14）— https://research.trychroma.com/context-rot
- Böckeler, SDD: 3 tools（2025-10-15）— https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- spec-kit Discussion #3674 — https://github.com/github/spec-kit/discussions/3674
- agentic-pipeline-guardrails — https://github.com/safecloudpro/agentic-pipeline-guardrails
- SWE-CI — https://arxiv.org/abs/2603.03823
- Actual AI, coding agents with ADRs（2026-09-15）— https://actual.ai/blog/coding-agents-with-adrs
- O'Reilly Radar, coding agents love decision records — https://oreilly.com/radar/coding-agents-love-decision-records
- Nazar, SPLE adoption & tooling（2026-05）— https://arxiv.org/abs/2605.21353
- Salesforce Multitenancy & Metadata — https://developer.salesforce.com/docs/platform/salesforce-large-data-volumes-bp/guide/ldv-deployments-concepts-multitenancy-and-metadata.html
- Odoo Upgrade docs — https://www.odoo.com/documentation/saas-16.3/administration/upgrade.html
- ERPNext customization ladder（顧問文）— https://mexilet.com/blog/how-to-customize-erpnext-with-custom-doctypes-and-server-scripts-without-breaking-upgrades
- WordPress Child Themes — https://developer.wordpress.org/themes/advanced-topics/child-themes/
- Client CVS Branch anti-pattern（2004）— https://wrschneider.github.io/2004/12/11/client-cvs-branch-anti-pattern.html
- Custom tenant code nightmare — https://www.eloquentarchitecture.com/custom-tenant-code-nightmare/
- Fowler, ParallelChange — https://martinfowler.com/bliki/ParallelChange.html
- Hadlow, Configuration Complexity Clock — https://mikehadlow.blogspot.com/2012/05/configuration-complexity-clock.html
- DORA 2024 — https://dora.dev/research/2024/dora-report/2024-dora-accelerate-state-of-devops-report-zh-cn.pdf
- DORA 2025 — https://dora.dev/research/2025/dora-report/
- DORA, streamlining change approval — https://dora.dev/capabilities/streamlining-change-approval/
- NCSC, forgivable vs unforgivable vulnerabilities — https://www.ncsc.gov.uk/report/a-method-to-assess-forgivable-vs-unforgivable-vulnerabilities
- Inozemtseva & Holmes, ICSE 2014 — https://dl.acm.org/doi/10.1145/2568225.2568271
- Petrović et al., Mutation Testing at Scale（Google）— https://arxiv.org/abs/2102.11378
- Newcombe et al., AWS Formal Methods（CACM 2015）— https://lamport.azurewebsites.net/tla/formal-methods-amazon.pdf
- AWS s2n continuous formal verification — https://d1.awsstatic.com/Security/pdfs/Continuous_Formal_Verification_Of_Amazon_s2n.pdf
- seL4 — https://sel4.systems/Research/pdfs/sel4-formal-verification-os-kernel.pdf
- Google SRE Book — https://sre.google/sre-book/introduction/
- Uptime Institute 2024（轉引）— https://itmagazine.com/2025/05/08/addressing-networking-errors-safeguarding-data-center-reliability/
- Veeam 2024 — https://www.veeam.com/blog/bc-dr-trends-2024.html
- Candido et al., ASE 2017 — https://damorim.github.io/publications/candido-etal-ase17.pdf
- METR RCT（2025-07-10）— https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- LaunchDarkly 2024 survey — https://launchdarkly.com/blog/2024-survey-impact-of-feature-management/

## 五、仍未能核實

- 「Spec Kit 官方承認 no enforcement mechanism」——找不到官方原文，只能引社群與評測描述。
- ADR 的 −90% 錯誤轉向——vendor 自測、n=1、單次執行。
- s2n 的「2–3 倍開發成本」——出自二手教材。
- 「80% coverage 拐點」——找不到同行評審來源。
- 「一個工程師可維護 N 個服務」——文獻空白，任何數字都是估算。
- 2020s 顧問自述的「40% 時間用於同步分支」——單一案例、無方法學。
