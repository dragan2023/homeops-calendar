@echo off
setlocal
:: Start the HomeOps backend. RULE: always clean this software's own stale process first.
set "PROJECT_ROOT=%~dp0"
title HomeOps backend (port 8787)

cd /d "%PROJECT_ROOT%"
echo [1/2] Freeing port 8787 (only kills a stale node apps/api/src/server.ts)...
node "%PROJECT_ROOT%scripts\free-port.mjs" 8787 apps/api/src/server.ts
if errorlevel 1 (
    echo [ERROR] Port 8787 could not be freed. Check manually with: node scripts\check-phone-reachable.mjs
    pause
    exit /b 1
)

echo [2/2] Starting backend (binds 0.0.0.0, prints the LAN URL for your phone)...
echo.
node apps/api/src/server.ts
endlocal
