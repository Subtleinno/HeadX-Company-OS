# 規劃與施工的分工

誰做決定、誰寫入、誰施工。技術細節不在這裡，見 `docs/architecture/CODE-MAP.md`。

## 三層

| 層 | 住哪裡 | 放什麼 |
|---|---|---|
| 狀態 | GitHub Project | 哪張在做、先後排序 |
| 決策與次序 | 總綱 issue、`docs/product/MASTER-PLAN.md`、`docs/product/DECISIONS.md` | 為什麼、範圍、已定案 |
| 施工 | issue（`.github/ISSUE_TEMPLATE/task.md`） | 一張可獨立驗收的工作 |

Project 是看板，不是帳本。規劃只存在 Project 的草稿，下次讀 repo 讀不到 —— 任何要留下的規劃，最終要落成總綱或 issue。

## 兩個角色

**PM**（Perplexity Space）讀 repo，負責規劃、切 issue、寫驗收指令。它不施工。

**Worker**（WorkBuddy）讀 `AGENTS.md`、`docs/INDEX.md` 與被指派的 issue，負責施工與開 PR。它不規劃。

兩邊都不靠記憶：每次開工重新讀。PM 一旦記住某個專案的實情，換一個專案就會被它套錯。

## 寫 issue 的四條

1. **先總綱，後單張。** 一次只展開一張。總綱未定之前不建施工 issue。
2. **依賴要機器可讀。** 獨立一行 `Depends-on: #64, #87`；沒有依賴寫 `Depends-on: none`。`AGENTS.md` 開工規則 1 靠它判斷能否開工，散文讀不出來。
3. **驗收指令要管文件。** 要麼寫「`docs/product/DECISIONS.md` 已更新」，要麼寫「此 issue 無決策改動」。二選一，不准兩樣都空。
4. **決策在同一個 PR 落地。** code 記錄「做了什麼」，不記錄「為什麼不選另一個做法」。決策只留在 issue 留言等於沒有 —— 下次規劃會重新討論一次，而且可能得出相反結論。

## 範疇與並行

每張 issue 帶一個 `cat:<範疇>`。範疇的值域由模組邊界決定，不由主題名決定 —— 判斷方法是問「這張 issue 會改哪個資料夾」。答不出，代表未切好。

| 範疇 | 對應的目錄 |
|---|---|
| `cat:boss`、`cat:design`、`cat:hr`、`cat:ops_finance`、`cat:sales`、`cat:support`、`cat:web` | 對應的 `apps/<app>` |
| `cat:platform` | `apps/platform`、`apps/app-host` |
| `cat:packages` | `packages/*` |
| `cat:infra` | `db/migrations`、compose、`.env.example`、CI |

- 一個範疇同一時間只准一張在做。
- `cat:packages` 與 `cat:infra` 全場獨佔，一次只可以有一張：任何 app 的改動都可能要碰它們。
- 最利的撞車點是 migration 編號。`db/migrations/<schema>/NNNN_*.sql` 只往前加、不改已套用的檔案，兩張 issue 同時取同一個編號就撞，而且 CI 未必抓得到。
- 依賴優先於範疇：`Depends-on` 未清，不因「不同範疇」而開工。範疇只解決撞車，不解決次序。
- 並行上限 = 互不相干的範疇數，不是 session 數。

## 開工聲明

多個 worker 並行之後，聲明機制由「未定」變成前提：開工前為 issue 加上 `status:building`，完成、停下或放棄時移除。同一範疇已有 `status:building` 的 issue，第二個 worker 不得開工。

這是目前唯一的並行保護。沒有它，兩個 session 會各自開 `task/<號>-` 分支改同一批檔案，而兩邊都以為自己在做正事。

