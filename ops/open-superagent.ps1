<#
  開啟 Super Agent 面板，自動使用「目前的」登入 token。

  為什麼需要這支：
  Super Agent 的網頁介面有登入保護，網址必須帶 ?token=…，
  而 token **每次服務重啟都會變**。把舊網址存入書籤，重啟後就會見到
  「dsh web authentication required」。這支腳本每次即時讀取最新的 token，
  所以永遠開得對，不需要你記住任何 token。

  它做的事：
    1. 在 WSL 內找出最新一份日誌
    2. 從中抽出 http://127.0.0.1:3082/?token=…
    3. 用預設瀏覽器開啟

  如果抽不到 token，會提示可能是服務未啟動，而不是靜靜地開一個壞網址。
#>

$ErrorActionPreference = 'Stop'

function Show-Error {
  param([string]$Message)
  Write-Host ''
  Write-Host '  ' -NoNewline
  Write-Host $Message -ForegroundColor Red
  Write-Host ''
  Write-Host '  按任意鍵關閉…'
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}

# 從 WSL 的最新日誌抽出 token
$shellCommand = @'
latest=$(ls -t /home/riderhin/src/dsh-superagent/.artifacts/*.log 2>/dev/null | head -1)
[ -n "$latest" ] && grep -h -o 'http://127.0.0.1:3082/?token=[A-Za-z0-9_-]*' "$latest" 2>/dev/null | tail -1
'@ -replace "`r`n", "`n"

try {
  $raw = & wsl.exe -d Ubuntu -e bash -lc $shellCommand 2>$null
} catch {
  Show-Error '無法執行 wsl.exe，請確認 WSL 可用。'
}

$url = ($raw | Where-Object { $_ -match 'token=' } | Select-Object -Last 1)
if (-not $url) {
  Show-Error "讀不到目前的 token。`n  可能 Super Agent 未啟動，或日誌未產生。`n  請稍等 30 秒再試，或者叫我檢查。"
}

$url = $url.Trim()
Write-Host ''
Write-Host '  正在開啟 Super Agent 面板…' -ForegroundColor Green
Write-Host ('  ' + $url) -ForegroundColor DarkGray
Write-Host ''
Start-Process $url
