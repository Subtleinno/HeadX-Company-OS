# 歷史文件（已淘汰）

**不要照這裡的內容做。** 這裡每一份都已被根目錄的文件取代。

保留的原因只有一個：查證「當時為什麼這樣想」。如果有人引用這裡的說法，請改用現行文件。

---

## 為什麼歸檔

| 檔案 | 歸檔原因 | 現在看哪一份 |
|---|---|---|
| `company-os-architecture.md` | 檔案自己寫「等創辦人拍板（未施工）」，已被問題→成果→解法的流程取代 | `PROJECT_BRIEF.md`、`SOLUTION_SPACE.md` |
| `company-starter-whole-plan.md` | 「系統先行」的計劃。創辦人指出次序錯誤：應由問題出發 | `PROBLEM.md`、`SOLUTION_SPACE.md` |
| `p0-bootstrap-v2-for-dsh.md` | P0 已完成，任務書失效 | 已完成，無需替代 |
| `tech-selection-gateway-dashboard.md` | 寫「待創辦人拍板」，但閘道與 Dashboard 已直接用零依賴實作落地 | `engine/` 程式碼本身 |
| `hxdesign-understanding.md` | 只讀原始碼的理解，已被實際部署運行後的發現取代 | `docs/reference/hxdesign-hands-on-findings.md` |
| `hxdesign-strategy.md` | 內容已被實跑發現（策略是一份 41KB 可驗證目錄）吸收 | `docs/reference/hxdesign-hands-on-findings.md` |

---

## 歸檔的規則（給將來的人）

一份文件要被歸檔，必須在檔頭寫三樣：

1. 它原本回答什麼問題
2. 為什麼它不再是答案
3. 現在應該看哪一份

**沒有寫這三樣，就不要歸檔** —— 否則你只是把混亂搬到另一個資料夾。

---

## 關於 git 歷史

歸檔不等於刪除。想看更早的版本（例如 2026-11-03 之前的 ADR 草稿），用：

```
git log --follow -- <檔案路徑>
git show <commit>:<檔案路徑>
```
