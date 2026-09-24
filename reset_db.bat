@echo off
setlocal
:: Wipe the local database so the app starts from "first-time setup".
:: The old file is backed up to data\backup-<timestamp>.db first.
set "PROJECT_ROOT=%~dp0"
cd /d "%PROJECT_ROOT%"

echo ============================================================
echo   HomeOps - reset local database (backup + wipe)
echo ============================================================
echo.
node "%PROJECT_ROOT%scripts\reset-db.mjs"
echo.
set /p GO=Type YES to wipe (anything else cancels): 
if /i not "%GO%"=="YES" (
  echo Cancelled - nothing was deleted.
  pause
  exit /b 0
)
node "%PROJECT_ROOT%scripts\reset-db.mjs" --yes
echo.
echo Now restart the backend (start_backend.bat) and reopen the app.
pause
endlocal
