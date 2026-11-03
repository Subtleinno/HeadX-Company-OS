<#
  Company OS 看守程式（無窮迴圈，每 60 秒呼叫 ensure.ps1 一次）

  為什麼需要有這個迴圈：
  Windows 工作排程器在這部機上無法成功執行我們的工作（Last Result 一直是 0x800710E0），
  所以不能只靠排程器。這個看守程式由「啟動」資料夾在登入時拉起，
  父程序是 explorer.exe，**不在 DSH 的 Windows Job 物件內**，
  因此 DSH 重啟不會殺它，它會繼續每分鐘補回兩個服務。

  它自己不會啟動服務（避免把服務變成它的子程序），
  而是把工作交給 ensure.ps1，由 ensure.ps1 用 WMI 建立完全脫離的程序。
#>

$ErrorActionPreference = 'Continue'

$OpsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Ensure = Join-Path $OpsDir 'ensure.ps1'
$LogFile = Join-Path $OpsDir 'supervisor.log'

function Write-Log {
  param([string]$Message)
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  $all = @(Get-Content -LiteralPath $LogFile -Encoding UTF8 -ErrorAction SilentlyContinue)
  if ($all.Count -gt 500) {
    $all | Select-Object -Last 500 | Set-Content -LiteralPath $LogFile -Encoding UTF8
  }
}

Write-Log '看守程式啟動'

while ($true) {
  try {
    & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Ensure 2>$null | Out-Null
  } catch {
    Write-Log ('呼叫 ensure.ps1 出錯：' + $_.Exception.Message)
  }
  Start-Sleep -Seconds 60
}
