@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Manage-Luna.ps1" -Action Start %*
if errorlevel 1 (
  echo.
  echo Luna se nepodarila spustit. Podrobnosti jsou vyse.
  pause
  exit /b 1
)
