# Strategy：HxDesign 的控制層

日期：2026-11-03
依據：創辦人口述，加上 `docs/product/DECISIONS.md` 的 D06／D07 原文

---

## 一、你講的三件事，我拼成一個模型

> ① HxDesign 把**一個品牌當一個 workspace**，每個品牌有自己的 brand identity 與模板。
> ② HxDesign 是**由 Strategy 驅動**的；所有 Strategy 由 **Super Admin** 管理。
> ③ AI 代理是**按 Strategy** 去選圖、選片、選模板、選已品牌化的元件、選知識，
> 再結合品牌 identity 組合成專案。

拼起來是這樣一條鏈：

```
Super Admin（管理所有 Strategy）
        ↓
Strategy（這個品牌的表達規則）
        ↓ 設計師／老闆與 AI 討論，為專案選定適用策略
        ↓
AI 代理按策略挑選：
   ├─ 圖片 / 影片（媒體素材）
   ├─ 模板（template）
   ├─ 元件（component，已品牌化）
   ├─ 知識（knowledge article）
   └─ 品牌 identity（brand DNA / tokens）
        ↓
組合成這個專案的產出
```

---

## 二、為什麼 Strategy 才是最關鍵的一層

如果沒有 Strategy，這套系統只是「一個 prompt 加一堆素材」。有 Strategy，它才是品牌系統。

| 沒有 Strategy | 有 Strategy |
|---|---|
| AI 每次自由決定語氣、配色、構圖 | AI 在策略給的範圍內決定 |
| 十個專案十種風格 | 十個專案同一個品牌 |
| 設計師每次都要重新解釋一遍 | 解釋一次，變成資產 |
| 出錯時不知道錯在哪 | 錯就錯在偏離某一條策略 |

**所以 Strategy 是「把設計師的判斷變成可重複執行的規則」。**

這也解釋了為什麼只有 Super Admin 可以管理——因為 Strategy 是跨品牌的共同語言，
如果每個品牌可以自訂一套，就沒有共同語言可言。

---

## 三、程式碼裡已經有這個結構的影子

`docs/product/DECISIONS.md` 的兩條，一字不改引在這裡：

> **D06 Workspace 單一模型**：shared（Super Admin 擁有，只一個）與 brand（設計師擁有，可多個）。
> 其他用戶在 shared 只讀。

> **D07 Super Admin 可讀取與複製所有 workspace，但不可修改他人內容；
> 跨 workspace 讀取／複製必須填原因並寫審計。**

這完全對上你講的：

| 你的話 | D06／D07 已經做了 |
|---|---|
| 一個品牌一個 workspace | `workspace` 表 + `workspace_member` |
| 所有 Strategy 由 Super Admin 管理 | **shared workspace**，只有一個，Super Admin 擁有，其他人只讀 |
| 品牌有自己的 identity 與模板 | brand workspace，設計師擁有，可多個 |

**所以 Strategy 的天然居所是 shared workspace。** 它不是新發明，是那個「只讀給別人看」的工作區裡該放的東西。

而且 D07 的規則很聰明：Super Admin 可以**讀與複製**別人的內容，但**不可修改**；
跨 workspace 讀取要**填原因並寫審計**。這正好是 Strategy 需要的權限模型——策略要有全局視野，但不能偷改品牌資產。

---

## 四、對「一個 skill」的影響

Skill 的路由要早一步問一個問題：

```markdown
| 你現在的情況 | 讀這一份 |
|---|---|
| 不知道這個品牌的策略是什麼 | references/strategy.md   ← 新增，且應該排第一 |
| 已知道策略，要開始做 | references/create.md |
| 要在策略內挑素材 | references/media.md |
```

**為什麼要排第一**：如果 agent 先挑了素材才想起策略，它會發現選錯了，要重做。
先讀策略，再選素材，一次做對。

Skill 裡也要寫清楚一條硬規則：

> **策略只能讀，不能改。** 要改策略就開 Needs 給 Super Admin（現在就是你）。

---

## 五、我要修正一個之前的錯誤

我早前寫過「GitHub code search 對 `approval` 回 0 個結果」，當成「HxDesign 沒有批准機制」的證據之一。

**那個證據是無效的。** 我剛剛用同一個方法搜 `workspace`——一個一定存在的字——**也是 0 命中**。
即這個私人 repo 沒有被 code search 索引。

**所以：**

| 結論 | 還成立嗎 |
|---|---|
| HxDesign 沒有 approvals 表 | **成立**（9 個 migration、13 張表逐張看過，沒有 approval 表） |
| HxDesign 全 repo 沒有 approval 相關程式碼 | **未證實**（搜尋工具失效） |
| D08 刻意移除批准 | **成立**（決策文件原文寫明） |

我把這點講出來，因為**用一個失效的工具去支撐結論，比沒有結論更危險。**

---

## 六、創辦人已定案：Strategy 是「做出來才知道」的

你的答覆很務實：

> 因為 HxDesign 仍在開發中，如果我們逐部分走過去、逐部分開發，就會知道在每個部分放 Strategy 是否合理。

> 可能每個部分都有自己的 Strategy，也可能只有 Create 才有。

**所以我不會現在把 Strategy 的形態寫死。** 這是對的決定，理由：

| 如果現在就定死 | 後果 |
|---|---|
| 假設「全局一套策略」 | 到了某個部分發現它需要自己的策略，要改架構 |
| 假設「只有 Create 有策略」 | 到了品牌或素材部分發現也需要，要補 |
| **留白，逐部分發現** | 每次只回答一個小問題，錯了只影響那一個部分 |

### 逐部分發現的方法：每個部分問三條問題

當我們做任何一個部分（品牌、素材、Create、知識、Needs），先問：

| 問題 | 如果答「是」 | 如果答「否」 |
|---|---|---|
| 1. 這個部分有「做得好」與「做得不好」的判斷標準嗎？ | 需要策略 | 不需要 |
| 2. 這個標準是跨品牌共同的嗎？ | 策略放在 shared workspace | 策略放在該品牌 |
| 3. 這個標準會被 AI 代理用來做選擇嗎？ | 策略要寫成可執行的形式 | 寫成文件就夠 |

**三條都答「是」，才值得做成一級實體。** 否則它只是一段文件。

### 第三件已定案：Company OS 完全不插手 Strategy

你選了「不管，Company OS 不插手」。

**這令整件事更乾淨。** Strategy 屬於 HxDesign 的領域知識，Company OS 只判斷「動作可不可以做」，
不判斷「內容對不對」。

所以：

| 之前想的 | 現在 |
|---|---|
| 改 Strategy 寫入 Company OS 審計 | **不寫**。HxDesign 自己的 `audit_log` 已經有記錄 |
| Company OS 需要知道策略版本 | **不需要**。它的動作登錄表只看動作，不看內容 |

**Company OS 的職責縮小了一件。這是好事——每縮小一件，它就少一個出錯的地方。**

---

## 七、這對「一個 skill」的影響（更新）

因為 Strategy 的形態未定，skill 的路由暫時**不假設**有 `references/strategy.md`。

取而代之，`SKILL.md` 開頭會問一個更根本的問題：

```markdown
## 開工前先答這一條

這個專案有沒有已定的策略？
  ├─ 有 → 讀 references/create.md，並按策略挑素材
  └─ 沒有 → 先與設計師討論出策略，寫成一段文字，再開始
```

**這樣不管將來 Strategy 變成什麼形態，skill 都不需要重寫。** 它只要求「策略存在且可讀」，不規定策略住在哪裡。
