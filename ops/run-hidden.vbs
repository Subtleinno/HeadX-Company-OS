' Company OS 看守程式的靜默啟動器。
'
' 由「啟動」資料夾的捷徑呼叫。用 VBScript 隱藏 PowerShell 視窗，
' 否則每次登入都會閃出一個黑色主控台視窗。
'
' 它只做一件事：用隱藏視窗執行 watchdog.ps1，然後立即結束。
' 真正的看守迴圈在 watchdog.ps1 裡。

Dim shell, scriptDir
Set shell = CreateObject("WScript.Shell")

scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)

shell.Run "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\watchdog.ps1""", 0, False
