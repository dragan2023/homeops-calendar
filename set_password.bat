@echo off
setlocal
:: Reset a local account password (no need to know the old one).
:: Usage: double-click, then type username + new password.
set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

echo ============================================================
echo   HomeOps - reset a local account password
echo   (the verification scripts created "admin"; set your own here)
echo ============================================================
echo.
set /p USERNAME=username [admin]: 
if "%USERNAME%"=="" set "USERNAME=admin"
set /p NEWPASS=new password (6+ chars): 
if "%NEWPASS%"=="" (
  echo [ERROR] password cannot be empty
  pause
  exit /b 1
)
node "%PROJECT_ROOT%scripts\set-admin-password.mjs" "%USERNAME%" "%NEWPASS%"
echo.
pause
endlocal
