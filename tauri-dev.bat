@echo off
setlocal
title Shift Schedule Local - Tauri Dev

rem Always run from this script's own folder, so double-clicking works
rem no matter what the current directory happens to be.
cd /d "%~dp0"

rem Node must be on PATH. Check first so the window does not just flash and vanish.
where node >nul 2>nul
if errorlevel 1 goto :no_node

rem Tauri CLI is a local devDependency, so no global install is needed.
if not exist "node_modules\.bin\tauri.cmd" goto :no_cli

echo.
echo   Shift Schedule  .  Local  .  Tauri Shell
echo   ---------------------------------------------
echo   This starts two things:
echo     - a vite dev server on 127.0.0.1:6182
echo     - the native shell window, after compiling Rust
echo.
echo   First run compiles Rust: 1 to 3 minutes.
echo   Later runs: about 10 to 40 seconds.
echo.
echo   Port 6182 is strict. If a previous tauri dev did not exit,
echo   this will fail instead of picking another port.
echo   Close the old shell window first.
echo.
echo   Do NOT also start dev.bat on 6180, unless you want to
echo   compare browser and shell side by side.
echo.
echo   Close the shell window or press Ctrl+C to stop this.
echo.

call "node_modules\.bin\tauri.cmd" dev --config desktop\src-tauri\tauri.conf.json %*
set "CODE=%ERRORLEVEL%"

echo.
if "%CODE%"=="0" (
  echo   Tauri dev stopped.
) else (
  echo   Tauri dev stopped with exit code %CODE%.
  echo   Check the messages above for details.
)
echo.
echo   Press any key to close this window.
pause >nul
exit /b %CODE%

:no_node
echo.
echo   [ERROR] Node.js was not found on PATH.
echo.
echo   Install Node.js, or open a new terminal after adding it to PATH,
echo   then double-click this file again.
echo.
echo   Press any key to close this window.
pause >nul
exit /b 1

:no_cli
echo.
echo   [ERROR] Tauri CLI not found at node_modules\.bin\tauri.cmd
echo.
echo   Install dependencies first, from this folder:
echo       pnpm install
echo   then double-click this file again.
echo.
echo   Press any key to close this window.
pause >nul
exit /b 1
