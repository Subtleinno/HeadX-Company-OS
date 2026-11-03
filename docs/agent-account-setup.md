# 建立專用 Agent 帳戶：`subtle-agent`

版本：v1.0 | 日期：2026-11-03
適用：Company OS 的 Super Agent（`dsh-superagent`）

---

## 為什麼要有這個帳戶

目前 Super Agent 用你本人的 GitHub 帳戶（`Subtleinno`）行事，造成三個問題：

1. **分不清誰做的**：Agent 開的 PR 與你的 PR 長得一模一樣。
2. **官方機制失靈**：Super Agent 的設計是「丟棄自己帳戶發出的訊息」。當 Agent 與你是同一個帳戶，**你發的 issue 和 @提及全部被它自己丟棄**，觸發永遠是零。
3. **權限等於你的權限**：Agent 做得到的，等於你本人做得到的。

官方文件的第一條建議就是：

> 用一個專用帳戶，永遠不要用操作者本人的帳戶。

---

## 你要做的事（共 5 步，約 15 分鐘）

以下步驟**必須由你本人完成**，我不能代做，因為涉及帳戶密碼與電郵驗證。

### 第 1 步：開新 GitHub 帳戶

1. 開無痕視窗（重要，避免與 `Subtleinno` 混在一起）
2. 去 https://github.com/signup
3. 填寫：
   - **Username**：`subtle-agent`
   - **Email**：用一個你可控制的電郵。若你只有一個電郵，可以用 Gmail 的 `+` 別名，例如 `subtleinno+agent@gmail.com`
   - **Password**：用一個獨立密碼，**不要**與 `Subtleinno` 相同
4. 完成電郵驗證
5. 完成後，登入狀態應該顯示 `subtle-agent`

> 若 `subtle-agent` 已被佔用，改用 `subtle-agent-hk` 或 `subtleinno-agent`，然後告訴我實際名稱。

### 第 2 步：把 `subtle-agent` 加為 repo 協作者

1. 用**無痕視窗的另一個分頁**，以 `Subtleinno` 登入
2. 去 https://github.com/Subtleinno/company-os/settings/access
3. 按 **Add people**
4. 輸入 `subtle-agent`，選 **Write** 權限
5. 按 **Add subtle-agent to this repository**

> **Write 就夠，不要給 Admin。** Agent 不需要改 repo 設定、不需要碰 Secrets。

### 第 3 步：用 `subtle-agent` 接受邀請

1. 切回 `subtle-agent` 的無痕視窗
2. 去 https://github.com/notifications 或檢查電郵
3. 接受 `Subtleinno` 的邀請

### 第 4 步：在 WSL 登入 `subtle-agent`

在你自己的終端機（不是這個對話）執行：

```powershell
wsl.exe
```

進入 WSL 後：

```bash
export PATH="$HOME/.local/bin:$HOME/nodejs/bin:$PATH"
gh auth login --hostname github.com --git-protocol https --web
```

它會印出一組 **一次性 8 位碼**，然後：
1. 開瀏覽器去 https://github.com/login/device
2. **用 `subtle-agent` 的身分登入**（無痕視窗）
3. 輸入那組碼，按 Authorize

完成後驗證：

```bash
gh api user --jq .login
```

應該印出 `subtle-agent`。如果印出 `Subtleinno`，代表你用錯了視窗登入，重做第 4 步。

### 第 5 步：確認推送權限

```bash
gh api repos/Subtleinno/company-os --jq .permissions.push
```

應該回 `true`。

---

## 完成後告訴我什麼

只需回覆三件事：

1. `subtle-agent` 是否成功建立（或你用了哪個名稱）
2. `gh api user --jq .login` 印出什麼
3. `gh api repos/Subtleinno/company-os --jq .permissions.push` 印出什麼

---

## 我會接著做的事

你確認後，我會：

1. 把 Super Agent 的 agent CLI 由 `gh` 指向 `gh-agent`（一個只使用 `subtle-agent` 憑證的包裝）
2. **移除**我為了單帳戶測試而加的兩個臨時開關（`DSH_SUPERAGENT_ALLOW_SELF`）
3. 重建與重啟 Super Agent
4. 用**你自己的 `Subtleinno`** 帳戶發一個測試 @提及，驗證整條鏈路

---

## 安全提醒

| 項目 | 指示 |
|---|---|
| 密碼 | 獨立密碼，不要與 `Subtleinno` 共用 |
| 兩步驟驗證 | 建議開啟，但不要把備用碼存進 repo |
| Token | 不要貼進這個對話、不要寫入任何檔案 |
| 權限 | 只給 `Write`，不要 Admin、不要 Workflows、不要 Secrets |

若你日後想撤銷 Agent 的全部權限：在 repo 的 Settings → Collaborators 移除 `subtle-agent` 即可，一步完成。
