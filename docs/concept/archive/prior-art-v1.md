# Company-OS 相似專案／Prior Art 調研報告

> **已歸檔（2026-11-10）**。這份是第一輪調研，當時還假設 Company-OS 是「可賣的產品」，所以整份都在問「有沒有人做過同樣的產品」。
>
> 它現在的用途只有兩個：① 白空間判斷（哪四條取捨是別人沒有的）——已摘要進 `../01-company-os-concept.md` 第 12 節；② 2026 年 11 月那一刻的市場快照（star 數、產品名），日後會過時。
>
> 已被以下兩份取代部分內容：`../../company-os-prior-art/forge-prior-art.md`（App Forge）、`../../company-os-prior-art/charter-prior-art.md`（agent 治理與變體）。

日期：2026-11-10
方法：證偽式調研 —— 目標唔係列競品，係盡力推翻「冇人做緊我哋呢件事」呢個假設。4 組獨立搜尋（MCP／公司 OS、Needs 人工閉環、策略文件、設計資產鏈＋總覽），GitHub 數據經 API 直接核實。
範圍：按指示**排除**已自行調查過嘅主流產品（Frappe/ERPNext、Odoo、Backstage、Retool、Notion、Canva、Adobe GenStudio、MetaGPT、ChatDev、CrewAI、Remotion 等），亦**唔做比較矩陣**。

---

## 一句結論

**「冇人做緊」部分成立，但唔可以咁講。」

- 2026 年「AI 公司 OS」唔係空白：至少 7 個同名／近名產品，GitHub 上有兩個 10 萬星級 repo，全部仍然活躍（幾個今日仍有 push）。
- 但**完整組合** —— 平台殼只讀總覽 ＋ 部門 app 歸屬 ＋ 中央 MCP 路由 ＋ 策略檔驅動資產編排 ＋ Needs 閉環 ＋ 成品留喺 Create —— **未見任何單一項目命中**。
- 換句話：**零件全部有人做，白空間係一組「刻意嘅取捨」，唔係技術。** 呢個其實係好消息：底層唔使重新發明。

---

## 1｜最接近嘅對手（GitHub 硬數據，2026-11-10 核實）

| 專案 | 數據 | 對得上 | 差喺邊 |
|---|---|---|---|
| [kortix-ai/CompanyOS](https://github.com/kortix-ai/CompanyOS) | 20,616 stars／3,467 forks／2024-10 建立／今日仍 push／TypeScript／topics: `company-os`, `self-hosted`, `company-as-code` | 開源「company as code」、一個 Docker Compose、MCP＋OpenAPI＋GraphQL、agent 自建 internal tools 有 release/rollback、git 保存 agents/skills/rules | 無 MinIO；app 由 **agent 自建**，唔係 boss 註冊嘅部門 app；無品牌／設計鏈、無 Needs |
| [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | 112,693 stars／MIT／2026-03 建立／今日仍 push | 全公司 org chart、projects、goals、issues、heartbeat scheduling、routines、cost/audit dashboard、multi-company isolation、Docker | **主動 manage projects**（assign issue 畀 CEO、governance override／pause／terminate）＋內建 approval gates —— 同「Boss Portal 只讀」「無閘」兩條都相反 |
| [nexu-io/open-design](https://github.com/nexu-io/open-design) | 106,885 stars／Apache-2.0／2026-04 建立／今日仍 push | brief → plugin → direction → `DESIGN.md` → artifact → handoff；150 套品牌合約、100+ skills、261 plugins、**HyperFrames 係 first-class citizen**；匯出 HTML／PDF／PPTX／ZIP／MP4 | local-first **SQLite ＋本地檔**，無 Postgres/MinIO；無部門 app、無公司總覽、無 Needs |
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | 81,821 stars／Apache-2.0／2026-03 建立／今日仍 push | 你選嘅渲染引擎本身，MCP 生態成熟 | 只出影片類容器，見第 5 節 |
| [OtoDock/oto-dock](https://github.com/OtoDock/oto-dock) | 198 stars／2026-07 建立／今日仍 push／topics: `mcp`, `self-hosted`, `multi-agent` | **Departments** ＋ MCP tools per agent ＋ Postgres ＋ CEO agent 每朝讀 department digests | app 由 agent 自建；CEO 係一個 agent，唔係只讀 Portal；無設計鏈 |
| [manor-os/manor-ai](https://github.com/manor-os/manor-ai) | 2026-10 仍活躍 | `docker compose` ＋ Postgres16/pgvector ＋ Redis ＋ **MinIO** ＋ MCP server catalog ＋ rules ＋ HITL | 單一 workspace 邊界、內建 approval gates、無設計鏈 |
| [HelpCode-ai/anythingmcp](https://github.com/HelpCode-ai/anythingmcp) | 771 stars／AGPL-3.0／2026-11-09 | self-hosted MCP gateway，730 connectors／12,000+ tools／18 個 ERP，生產環境接 15+ 內部系統；AI skills 由 admin 批准 | 純 gateway，無 project／部門 app／Portal 資料模型 |

**商業 SaaS（唔喺你排除名單內）**
- [aiagent.app](https://aiagent.app) — **最致命命中**：多品牌各自 Company Brain（含 Brand identity）、Connect→Brief→Work→Review、**「Needs you」工單狀態**、In review + Latest result、跨品牌 Home／Activity／Calendar／Gantt 總覽。但佢 blog 明講「An agent proposes, you approve. **Nothing runs until you approve it.**」，同你「唔加閘」相反；亦無半成品 project、無上載後自動 tag。
- [the-company-os.com](https://the-company-os.com) — 直接寫「**Company OS speaks MCP**」、10 個部門 agent、Company Brain、Approvals inbox、Company Health 總覽。純 SaaS，部門係 agent 唔係 app。
- [boss.sh](https://boss.sh) — brand memory → briefs → visuals → assets indexed → 只讀營運總覽。無 MCP／self-hosted／Needs。

---

## 2｜Needs 人工閉環

- **「Needs you」呢個名 2026 已被至少三個產品同時用緊**：aiagent.app（changelog 2026-10-29）、[SEOmatic](https://seomatic.ai/help/agents-board-explained)（2026-10-20）、[AgentsRoom](https://agentsroom.dev/docs/agent-status-tracking)（2026-11-06）。**命名唔獨特，建議改名或加前綴。**
- [GreyCollar](https://greycollar.ai/) 最接近「缺料→人補→入庫重用」：`SUPERVISING.RAISED` → supervisor 答 → `Knowledge is stored for future reference` → 下一位客人直接答到。差：重用嘅係**文字答案**，標註係人手。
- **Kwali（快手 AIGC）** 兩句幾乎係你嘅原文：「不滿意可以重新生成直到滿意為止」、「私有素材拖進去後系統自動貼上多維標籤，下次搜索秒級定位」（[量子位實測](https://www.qbitai.com/2025/09/330355.html)）。差：無 Needs 工單、無半成品 project，上載係用戶主動整理而非工單觸發。
- [PixelPunk](https://github.com/CooperJiang/PixelPunk)、studio-asset-library：AI 自動分類打標＋向量檢索。差：獨立 DAM，無工單觸發、無回填同一 project。
- **完整閉環「缺料 → 半成品 project → 人工上載 → AI 自動 tag＋描述 → 即時回填同一 project 並入庫重用」未搵到任何公開實作。** 零件逐粒都有，串埋冇人做 —— 呢個係最實在嘅白空間。

---

## 3｜策略文件與 Preference doc

**「Boss 手動加、多份散落、agent 按任務揀啱份」已經係 2025–2026 標準，唔係新穎：**
- [AGENTS.md](https://agents.md/)（2025-08，OpenAI 主 repo 自己 88 份；2025-12 捐 Linux Foundation AAIF）— 就近檔案優先。
- [Anthropic Agent Skills](https://github.com/anthropics/skills)（`SKILL.md`，用 description 判斷「If Claude thinks the skill is relevant…」；README 明寫可做到「creating documents with **your company's brand guidelines**」）。
- `CLAUDE.md` 多層＋managed policy、[Kiro Steering](https://kiro.dev/docs/steering/) `auto` mode、[Cursor Rules](https://cursor.com/docs/rules)「Apply Intelligently」。
- 學術：[Flow-of-Action（WWW'25）](https://arxiv.org/abs/2502.08224) 有「tool for finding relevant SOPs for incidents」。

**但未見「策略檔內容係品牌／業務策略，並全程支配 assets／knowledge／materials／templates 嘅選擇」**。呢個語義位移（工程指令 → 公司品牌策略）係白空間。

**Boss-only 隱藏 Preference doc 未搵到，而且主流係明確反向：**
- [阿里雲 2026-05-19 辦公 Agent 記憶設計](https://developer.aliyun.com/article/1735386)：「**即使管理員也無法查看某個用戶的個人偏好**」、「用戶可以隨時問 Agent『你記住了我哪些偏好？』…可以逐條刪除或修改」。
- [mem0](https://github.com/mem0ai/mem0)、[EchoMe](https://github.com/afterDDL/echome)、MIT Sloan（2025-12）同向：user-owned、透明、employee-owned profile。
- 唯一「當事人睇唔到嘅記憶檔」係 2026-07 arXiv 嘅 stealth memory injection **攻擊研究**，唔係產品功能。
- 即係：「學偏好」有大量 prior art（顯式／隱式／場景化），但「Boss 可讀可寫、Staff 不可讀不可寫」呢個 ACL 組合無人做。**我唔係要你改，只係要你知有個反向共識同潛在員工信任／合規風險。**

---

## 4｜設計資產鏈（prior art 最密集）

- [feimacode/open-design-agent-kit](https://github.com/feimacode/open-design-agent-kit) — 1,084 stars／MIT／MCP topics，198 design systems ＋ PDF/PNG/PowerPoint export，「喺你用緊嘅 coding agent 入面整 poster／social post／slides」。
- [pwnera/artbucket](https://github.com/pwnera/artbucket) — 開源 self-hosted DAM：`docker compose → Postgres + MinIO`、brand-as-code YAML、design tokens、Releases pin／rollback、Review/approvals、`/api/v1/mcp`。但 ROADMAP 明寫 **Non-goals: Project management / CMS / Video editing**，且內建 approvals。
- [Reloops-App/Reloops](https://github.com/Reloops-App/Reloops) — 自託管創意資產工作區，agent 可 create workspaces/projects、upload assets、patch status；version compare。但 REST key 唔係 MCP、有 review→approved 閘、MinIO 只係 roadmap。
- [DataTalksClub/carousel-automation](https://github.com/DataTalksClub/carousel-automation)（HTML/CSS → **PNG sequence ＋ PDF**，Figma MCP）、[ludusrusso/mkcr](https://github.com/ludusrusso/mkcr)（「**designed for AI agents**」HTML→PDF/PNG）、[carbogninalberto/fast-html-to-pdf-api](https://github.com/carbogninalberto/fast-html-to-pdf-api)（raw HTML → PNG/PDF/MP4 API）。
- [miabi-io/miabi](https://github.com/miabi-io/miabi) — workspaces ＋ workspace switcher ＋ built-in registry ＋ Postgres ＋ MinIO 備份，但係 PaaS 唔係部門 app 目錄。

**結論：「HTML brief → 多格式設計資產」條鏈唔新**，你列嗰五類成品亦有人分別做出嚟。

---

## 5｜HyperFrames roadmap 查證（重要，直接影響 P0 範圍）

**搵唔到官方 roadmap 檔**：`heygen-com/hyperframes/ROADMAP.md` 404、`hyperframes.heygen.com/roadmap` 404。官方輸出格式表（[/prompting/rendering-and-output](https://hyperframes.heygen.com/prompting/rendering-and-output)）只有 **MP4／MOV／WebM／GIF／PNG sequence／HLS**，**冇 PDF**。

| 你列嘅項 | 判定 |
|---|---|
| asset library | ✅ 已發布但**語義唔同**：2026-07 內建 media library（10,000+ 音樂、75,000+ 圖、logos）；Studio docs 明講「It is **not a file manager**」 |
| brand assets | ❌ HyperFrames OSS 無此模組；只有 `/figma` skill 匯入 brand tokens、`frame.md`。HeyGen **SaaS** 另有 Brand Kit，但唔係 HyperFrames |
| version management | ❌ 無成品資產版本堆疊／pin release／rollback／side-by-side；只有 repo release 同 CLI project history |
| approvals | ⚠️ 有，但係 **render 前 storyboard 分鏡確認**（2026-07），唔係成品 approval workflow；而且同你「無閘」相反 |
| 輸出檔案儲存與回傳 | ✅ 有，但綁 **HeyGen cloud／AWS S3** ＋ presigned URL；**無 self-hosted MinIO 回傳** |
| social-media output | ❌ 無官方功能頁／平台尺寸預設；只有 social overlay blocks 同 9:16 範本 |
| PDF 輸出 | ❌ 官方無；PDF 喺 HyperFrames 只係**輸入**（PDF-to-video）。`/slideshow` 明寫「Output is a navigable deck, **not a rendered MP4**」 |
| still-image 輸出 | ⚠️ PNG sequence／GIF 有；**一鍵單張 still 無**，官方例子要用 `ffmpeg -frames:v 1` 抽幀 |
| AI video editing | ⚠️ Timeline／Studio canvas 有；Video Agent 整合有；`/reverse-any-video` 要 **HyperFrames Pro ＋ HeyGen 登入** |
| HyperFrames Studio | ✅ 桌面版已發布（macOS/Win/Linux）、README 寫「Available, evolving」；**web 版＋Claude/ChatGPT connector 先係真正 roadmap（Coming soon／In beta）** |

**對構思嘅影響**：你張「五類最終產出」表，得**靜態視覺（PNG sequence）**同**動態影片**係 HyperFrames-native；PDF／簡報／Icon 素材包／品牌資產要一層 **derived**（外掛 renderer 或自己封裝）。呢個係範圍問題，唔係加閘 —— 支持拆兩層，否則 P0 會爆。

---

## 6｜白空間到底喺邊（4 條，全部係「刻意取捨」）

1. **Boss Portal 只讀、唔 manage projects** —— 搵到嘅平台全部 actively manage／assign／override。呢個「刻意唔做」最清晰。
2. **成品留喺部門 app 嘅 Create、唔回流中央** —— Artbucket／Reloops 恰好係中央 DAM，方向相反。
3. **agent 經 MCP 由中央路由到「啱嘅部門 app」開 project** —— 搵到嘅 MCP 全部係單一 app 內。
4. **Needs 完整閉環** —— 零件齊，串埋無人做。

另外兩個反主流取捨亦係護城河：**無 approval 閘**（業界由 OWASP LLM06／EU AI Act Art.14 一路推加閘）、**Boss-only 隱藏 Preference doc**（有合規爭議）。

---

## 7｜我對構思嘅判斷

**好嘅地方**：Needs 作為一等物件（業界多數假設 agent 要嘛做完、要嘛靜靜降級）；策略檔令「老闆只做策略」技術上成立；成品唔回流呢個邊界乾淨；HyperFrames 選得好（HTML 係 agent 最識寫，deterministic 令重用有基礎）。

**我收回**之前兩條建議（策略治理 audit、completeness validator）—— 你明確要 simple／無閘，我頭先係用緊傳統企業軟件思維。只留一條零成本可選：每個 project 靜靜記低用咗邊份策略，唔顯示、唔阻塞。

**真正要面對嘅唔係「有冇人做」，係範圍**：2026 已有 10 萬星嘅 open-design 同 paperclip、8 萬星嘅 HyperFrames。你要做嘅唔係再砌一次引擎，而係**定義一組取捨 ＋ 一個好薄嘅平台殼**，底層全部有得用。

**三個我會盯住**：
- 五類成品要分 native／derived，否則 P0 爆。
- 「Needs」改名 —— 2026 已有三個產品用緊同一個名。
- Preference doc 嘅隱藏 ACL：最少喺內部文件寫清楚點解咁設計，唔係改設計。

---

## 8｜待確認（我唔會自己作）

1. Preference doc 點學：Boss 手動寫／agent 由「再做一次」歸納成草稿／兩者並存？
2. 策略檔係咪已有實際樣本？一份大概幾長、咩格式？（直接影響 agent 點揀）
3. 「Needs」要唔要改名？
4. HyperFrames 兩個部署選項：install-time 揀定，定 runtime 可切？
5. 第一版淨係 Marketing Design，定同期要第二個部門 app 去驗證 app registry contract？
6. derived 成品（PDF／簡報／Icon 包）第一版做唔做？

---

## 9｜項目流轉提醒

確認完可以將「Needs 引擎」「Create」「策略文件庫」「Render Provider」「Preference doc ACL」開成事項，指派技術負責人，並邀設計同測試同事做關注人；本報告上傳項目資料庫，讓評審有統一上下文。排期、資源同上線範圍先搵對應負責人確認。

---

## 主要來源

**GitHub（API 直接核實）**
kortix-ai/CompanyOS ・ paperclipai/paperclip ・ nexu-io/open-design ・ heygen-com/hyperframes ・ OtoDock/oto-dock ・ manor-os/manor-ai ・ HelpCode-ai/anythingmcp ・ feimacode/open-design-agent-kit ・ pwnera/artbucket ・ Reloops-App/Reloops ・ DataTalksClub/carousel-automation ・ ludusrusso/mkcr ・ carbogninalberto/fast-html-to-pdf-api ・ miabi-io/miabi ・ anthropics/skills ・ mem0ai/mem0 ・ CooperJiang/PixelPunk

**官方文件／一手頁**
https://hyperframes.heygen.com/prompting/rendering-and-output ・ https://www.heygen.com/blog/heygen-april-2026-release ・ https://www.heygen.com/blog/heygen-july-2026-release ・ https://aiagent.app/changelog ・ https://aiagent.app/blog/human-in-the-loop-ai-agents ・ https://docs.aiagent.app/core-concepts/board-and-tickets ・ https://the-company-os.com ・ https://boss.sh ・ https://seomatic.ai/help/agents-board-explained ・ https://agentsroom.dev/docs/agent-status-tracking ・ https://greycollar.ai ・ https://agents.md ・ https://kiro.dev/docs/steering ・ https://cursor.com/docs/rules ・ https://code.claude.com/docs/en/memory ・ https://developer.aliyun.com/article/1735386 ・ https://www.onyx.app ・ https://arxiv.org/abs/2502.08224

**二手／未獨立核實**
https://www.qbitai.com/2025/09/330355.html（Kwali）・ https://www.jxxy.net/ai/articles/studio-asset-library-ai-tagging-multimodal-asset-library ・ https://github.com/afterDDL/echome ・ Open Design 另一 org 名 `airacle/open-design`（README 內連結混用，引用時要指明）

> 註：本輪按指示跳過 outline.yaml／fields.yaml／比較矩陣，直接交付證偽式報告。所有 star 數、建立日、授權均來自 GitHub API；標「未確定」嘅日期／用戶數冇當作已證實結論。
