@echo off
setlocal
chcp 65001 >nul
REM Keep this file in Windows CRLF format for cmd.exe.
cd /d "%~dp0"
if errorlevel 1 goto :failed

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js and reopen this file.
  goto :failed
)

if not exist "web\dist\index.html" (
  echo [1/2] Installing dependencies and building the frontend...
  where npm.cmd >nul 2>&1
  if errorlevel 1 goto :failed
  pushd "web"
  if errorlevel 1 goto :failed
  call npm.cmd install
  if errorlevel 1 goto :build_failed
  call npm.cmd run build
  if errorlevel 1 goto :build_failed
  popd
)

REM For an optional proxy, uncomment and adjust both lines below.
REM set "NODE_USE_ENV_PROXY=1"
REM set "HTTPS_PROXY=http://127.0.0.1:7897"

echo [2/2] Starting Chiyoda Twin. The browser will open when ready.
echo Keep this window open while using the app.
node.exe "server\server.mjs" --open
if errorlevel 1 goto :failed
exit /b 0

:build_failed
popd
:failed
echo.
echo [ERROR] Startup failed. See the message above.
pause
exit /b 1
