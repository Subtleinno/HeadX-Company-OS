<#
  Company OS 確保程式（單次執行，幂等）

  做三件事，已經在跑就跳過：
    1. 3083 沒有監聽  -> 啟動 Company OS 網頁伺服器
    2. 3082 沒有監聽  -> 在 WSL 內啟動 Super Agent
    3. 寫一行日誌

  關鍵：用 WMI（Win32_Process.Create）而不用 Start-Process。
  因為 Start-Process 會令新程序成為「本腳本的子程序」，如果本腳本是由 DSH 啟動，
  新程序就會落在 DSH 的 Windows Job 物件裡，DSH 一重啟就一併被殺。
  用 WMI 建立的話，父程序是 WmiPrvSE.exe（系統服務），完全脫離 DSH。

  這個腳本可以安全地被重複呼叫：工作排程器每分鐘叫一次、開機叫一次、手動叫一次都可以。
#>

$ErrorActionPreference = 'Continue'

$OpsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $OpsDir
$EngineDir = Join-Path $Root 'engine'
$LogFile = Join-Path $OpsDir 'supervisor.log'
$NodeExe = 'C:\Users\Billy Chung\AppData\Local\hermes\node\node.exe'
$WslDistro = 'Ubuntu'
$SuperagentDir = '/home/riderhin/src/dsh-superagent'

function Write-Log {
  param([string]$Message)
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  $all = @(Get-Content -LiteralPath $LogFile -Encoding UTF8 -ErrorAction SilentlyContinue)
  if ($all.Count -gt 500) {
    $all | Select-Object -Last 500 | Set-Content -LiteralPath $LogFile -Encoding UTF8
  }
}

function Test-Port {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Detached {
  param([string]$CommandLine, [string]$WorkDir)
  try {
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
      CommandLine     = $CommandLine
      CurrentDirectory = $WorkDir
    }
    return [int]$result.ReturnValue -eq 0
  } catch {
    Write-Log ('WMI 啟動失敗：' + $_.Exception.Message)
    return $false
  }
}

# 1) Company OS 網頁伺服器
if (-not (Test-Port 3083)) {
  if ((Test-Path -LiteralPath $NodeExe) -and (Test-Path -LiteralPath (Join-Path $EngineDir 'src\server.ts'))) {
    $line = '"' + $NodeExe + '" --experimental-strip-types src/server.ts'
    if (Start-Detached -CommandLine $line -WorkDir $EngineDir) {
      Write-Log '已啟動 Company OS 網頁伺服器（3083）'
    }
  } else {
    Write-Log '啟動失敗：找不到 node.exe 或 engine\src\server.ts'
  }
}

# 2) Super Agent（WSL 內）
if (-not (Test-Port 3082)) {
  $line = 'wsl.exe -d ' + $WslDistro + ' -e bash -lc "cd ' + $SuperagentDir + ' && ./scripts/dsh-superagent start"'
  if (Start-Detached -CommandLine $line -WorkDir $OpsDir) {
    Write-Log '已要求 WSL 啟動 Super Agent（3082），稍後確認'
  }
}

# 3) 看守程式自我修復
# 這部機的 Windows 工作排程器無法執行任何工作（連最簡單的 echo 都失敗，
# Last Result 一直是 0x800710E0），所以不能靠排程器定期叫醒我們。
# 對策：只要有「任何一次」ensure.ps1 被執行（登入捷徑、或現存的看守程式），
# 就檢查看守程式是否還在，不在就重新拉起，形成自我延續。
$watchdogs = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*watchdog.ps1*' })
if ($watchdogs.Count -eq 0) {
  $vbs = Join-Path $OpsDir 'run-hidden.vbs'
  if (Test-Path -LiteralPath $vbs) {
    if (Start-Detached -CommandLine ('wscript.exe "' + $vbs + '"') -WorkDir $OpsDir) {
      Write-Log '看守程式不在，已重新拉起'
    }
  }
}
