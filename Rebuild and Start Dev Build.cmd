@echo off
rem Rebuilds the local dev build from this folder's current code, then starts it.
rem Installs the packages first when they are missing or out of date. Takes a few minutes.
cd /d "%~dp0"

echo [1/3] Checking the installed packages...
call npm ls --depth=0 >nul 2>&1
if errorlevel 1 goto install
goto build

:install
echo Packages are missing or out of date: running npm ci (a few minutes)...
call npm ci
if errorlevel 1 goto failed
if exist "node_moduleselectroninstall.js" call node node_moduleselectroninstall.js
if errorlevel 1 goto failed

:build
echo [2/3] Building the dev app into release-dev (npm run dist:dev)...
call npm run dist:dev
if errorlevel 1 goto failed

echo [3/3] Starting Basic Incremental Dev...
start "" "%~dp0release-devwin-unpackedBasic Incremental Dev.exe"
exit /b 0

:failed
echo.
echo Something went wrong (see the messages above).
pause
exit /b 1
