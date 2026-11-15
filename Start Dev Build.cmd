@echo off
rem Starts the local dev build (Basic Incremental Dev: dev cheats, 5x speed, its own save).
rem Build it first with "Rebuild and Start Dev Build.cmd" (or: npm run dist:dev).
cd /d "%~dp0"
set "EXE=%~dp0release-dev\win-unpacked\Basic Incremental Dev.exe"
if not exist "%EXE%" (
  echo The dev build has not been built yet.
  echo Double-click "Rebuild and Start Dev Build.cmd" first.
  pause
  exit /b 1
)
echo Starting Basic Incremental Dev...
start "" "%EXE%"
