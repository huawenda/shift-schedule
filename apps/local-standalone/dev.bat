@echo off
setlocal
title Shift Schedule Local - Dev Server

rem Always run from this script's own folder, so double-clicking works
rem no matter what the current directory happens to be.
cd /d "%~dp0"

rem Node must be on PATH. Check first so the window does not just flash and vanish.
where node >nul 2>nul
if errorlevel 1 goto :no_node

rem Double-click (no arguments) = start and open the browser.
rem Passing arguments (e.g. --port 7000) keeps the browser closed, handy for testing.
set "OPEN="
if "%~1"=="" set "OPEN=--open"

echo.
echo   Shift Schedule  .  Local
echo   ---------------------------------------------
if defined OPEN echo   Starting dev server and opening the browser.
if not defined OPEN echo   Starting dev server.
echo   Keep this window open while you use the app.
echo   Close this window or press Ctrl+C to stop.
echo.

node "scripts\dev.mjs" %OPEN% %*
set "CODE=%ERRORLEVEL%"

echo.
if "%CODE%"=="0" (
  echo   Dev server stopped.
) else (
  echo   Dev server stopped with exit code %CODE%.
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
