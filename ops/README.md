# ops：開機自動啟動與自我修復

解決一個很具體的問題：**Company OS 與 Super Agent 都是普通程序，重啟之後不會自己回來。**

---

## 為什麼不用 Docker

你問過要不要搬到 Docker。技術上可以做，但**解決不了這件事**：

| 方案 | 重啟後會自己回來嗎 |
|---|---|
| Docker 容器（`restart: unless-stopped`） | 要 **Docker Desktop 先啟動**，才輪到容器 |
| 這個看守程式（原生程序） | 登入後直接跑，沒有中間層 |

Docker 的價值是可移植、可備份，代價是多一層要維護、多一個會失敗的地方。以現在的規模，原生程序是失敗點更少的選擇。日後要搬到其他機器，再包 Docker 也不遲，程式碼不用改。

---

## 檔案

| 檔案 | 作用 |
|---|---|
| `ensure.ps1` | **單次執行、可重複呼叫**。檢查 3083 與 3082，沒有就拉起來；順便檢查看守程式還在不在。 |
| `watchdog.ps1` | 無窮迴圈，每 60 秒呼叫一次 `ensure.ps1`。 |
| `run-hidden.vbs` | 用隱藏視窗執行 `watchdog.ps1`，避免每次登入閃出黑色視窗。 |
| `open-superagent.cmd` | 桌面捷徑的入口（純 ASCII）。 |
| `open-superagent.ps1` | **自動讀取目前的 token** 再開 Super Agent 面板。 |
| `supervisor.log` | 執行記錄，只保留最近 500 行。**在 `.gitignore` 內，不入 repo。** |

---

## 桌面兩個捷徑（這部機已建立，不入 repo）

| 桌面圖示 | 指向 | 為什麼 |
|---|---|---|
| **Company OS** | `http://127.0.0.1:3083/` | 不需要 token，直接開 |
| **Super Agent** | `ops\open-superagent.cmd` | 面板必須帶 `?token=…`，而 **token 每次重啟都會變**。這支腳本每次即時讀取最新 token，所以永遠開得對。 |

### 為什麼要有 `open-superagent`

Super Agent 的面板有登入保護，網址必須帶 token。把舊網址存入書籤，服務一重啟就會見到：

```
dsh web authentication required; reopen the URL printed by dsh web.
```

這支腳本每次都去 WSL 最新一份日誌裡抽 `?token=…`，所以不需要記住任何 token，也不會開到壞網址。抽不到時會用紅字說明可能服務未啟動，而不是靜靜地開一個空白頁。

### 為什麼 `.cmd` 內沒有一行中文

`cmd.exe` 用系統 OEM 碼頁讀 `.cmd`，UTF-8 中文會被弄壞並**弄斷整份腳本的解析**（跟 `.ps1` 的 BOM 問題同類）。所以 `.cmd` 只做一件事：呼叫 `open-superagent.ps1`，所有中文訊息都在那邊。

---

## 三個關鍵設計決定（都是踩過坑之後改的）

### 1. 用 WMI 啟動服務，不用 `Start-Process`

DSH 用 Windows Job 物件管理子程序。**任何由 DSH 啟動的程序，DSH 一重啟就會被一起殺掉**——這正是第一次失敗的原因。

`ensure.ps1` 改用 `Invoke-CimMethod -ClassName Win32_Process -MethodName Create`，新程序的父程序是 `WmiPrvSE.exe`（系統服務），完全脫離 DSH。實測：

```
node pid=7964  父=WmiPrvSE.exe
```

### 2. 看守程式由「啟動」資料夾拉起，不用工作排程器

試過兩次工作排程器：`schtasks` 與 `Register-ScheduledTask` 都建立成功，但**執行結果一直是 `0x800710E0`**。用最簡單的 `cmd /c echo test > file` 也失敗，證明**這部機的工作排程器無法執行任何工作**。

所以改用 Windows「啟動」資料夾的捷徑，由 `explorer.exe` 拉起，父程序不是 DSH。

### 3. `.ps1` 必須存成 UTF-8 with BOM

**這是最大的坑。** Windows PowerShell 5.1 讀 `.ps1` 時，如果檔案沒有 UTF-8 BOM，會當成 ANSI 解讀，中文註解與字串全部變亂碼，連字串的引號都會被弄斷，結果是：

```
The string is missing the terminator: '.
```

腳本連第一行都執行不到，而且**表面上沒有任何錯誤**——工作看起來「有跑」，但甚麼都沒發生。

所以 `ensure.ps1` 與 `watchdog.ps1` 都必須保留 BOM。用編輯器修改之後，記得確認 BOM 還在：

```powershell
$bytes = [System.IO.File]::ReadAllBytes('C:\company-os\ops\ensure.ps1')[0..2]
($bytes[0] -eq 0xEF) -and ($bytes[1] -eq 0xBB) -and ($bytes[2] -eq 0xBF)
```

---

## 怎麼確認它在運作

```powershell
# 兩個端口都應該有 LISTEN
Get-NetTCPConnection -LocalPort 3083,3082 -State Listen

# 看日誌
Get-Content C:\company-os\ops\supervisor.log -Encoding UTF8 -Tail 20

# 看守程式應該在跑
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*watchdog.ps1*' }
```

實測記錄：

```
13:00:03  已啟動 Company OS 網頁伺服器（3083）
13:00:27  看守程式啟動
13:01:30  已啟動 Company OS 網頁伺服器（3083）   ← 手動殺掉後 63 秒自動補回
```

---

## 怎麼手動重啟

不需要。看守程式每 60 秒會補回。

如果想**暫停**自動修復，結束 `watchdog.ps1` 那個 PowerShell 程序，然後不要再執行 `run-hidden.vbs`。

---

## 已知限制

| 限制 | 說明 |
|---|---|
| 只在**登入後**啟動 | 未登入 Windows 前不會跑。要做到開機即跑，需要註冊成 Windows 服務（要管理員權限）。 |
| 60 秒偵測間隔 | 服務倒了最多 60 秒後才被發現。 |
| WSL 必須可用 | WSL 起不來的話，Super Agent 那一項會失敗，日誌會記錄。 |
| 多個看守程式可能同時存在 | 這是刻意的：每個都只呼叫幂等的 `ensure.ps1`，重複執行無害，反而提高存活率。 |
