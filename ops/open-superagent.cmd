@echo off
REM ASCII only in this file: cmd.exe reads .cmd in the OEM codepage, so Chinese
REM text here gets mangled and breaks parsing. All Chinese messages live in the
REM PowerShell file it calls, which is saved as UTF-8 with BOM.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-superagent.ps1"
