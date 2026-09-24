@echo off
setlocal

:: ============================================================
::  HomeOps Calendar - one-click launcher
::  RULE (global): a startup script MUST clean this software's
::  own stale processes first - a leftover listener makes you
::  test old code and wonder why nothing changed.
::    1) port 8787 : backend  (node apps/api/src/server.ts)
::    2) port 8081 : Metro    (expo start)
:: ============================================================

title HomeOps Calendar (backend + Metro)

set "PROJECT_ROOT=%~dp0"
set "MOBILE_DIR=%PROJECT_ROOT%mobile"

echo.
echo ============================================================
echo   HomeOps Calendar Launcher
echo   Backend: port 8787  (0.0.0.0)     Metro: port 8081
echo ============================================================
echo.

echo [1/4] Cleaning stale BACKEND on port 8787 (targeted: only our server.ts)...
node "%PROJECT_ROOT%scripts\free-port.mjs" 8787 apps/api/src/server.ts

echo [2/4] Starting backend in its own window...
start "HomeOps backend" /d "%PROJECT_ROOT%" cmd /k node apps/api/src/server.ts
timeout /t 3 /nobreak >nul

if not exist "%MOBILE_DIR%\node_modules" (
    echo [INFO] node_modules not found, installing dependencies...
    cd /d "%MOBILE_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Run manually: cd mobile ^&^& npm install
        pause
        exit /b 1
    )
)

echo [3/4] Cleaning stale METRO on port 8081 (node only)...
node "%PROJECT_ROOT%scripts\free-port.mjs" 8081 --any-node

echo [4/4] Starting Expo (LAN mode). Extra args pass through, e.g. --port 8082
cd /d "%MOBILE_DIR%"
call npm start -- %*

endlocal
