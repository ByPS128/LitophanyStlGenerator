@echo off
setlocal
cd /d "%~dp0"
echo Pred zastavenim uloz rozpracovane projekty v obou editorech do .luna.
choice /C AN /N /M "Zastavit Lunu? [A/N] "
if errorlevel 2 exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Manage-Luna.ps1" -Action Stop
if errorlevel 1 (
  pause
  exit /b 1
)
