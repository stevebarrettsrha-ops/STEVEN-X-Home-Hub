@echo off
REM ===== STEVEN X - HOME HUB - home server launcher (Windows) =====
REM Double-click this file to start the server.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet.
  echo  Install the "LTS" version from https://nodejs.org
  echo  then double-click this file again.
  echo.
  pause
  exit /b 1
)

REM First run: offer to download the full apps (REEL, ARCADE, ...) into apps\
if not exist "apps\" (
  echo.
  echo  The full apps ^(REEL, ARCADE, the scripture apps...^) aren't downloaded yet.
  set /p ANS=" Download them now? Needs internet once. [Y/n] "
  if /i not "%ANS%"=="n" node get-apps.js
)

echo.
echo  Starting the STEVEN X home server...
echo  Leave this window OPEN while anyone is using the hub.
echo  Close it (or press Ctrl+C) to stop the server.
echo.
node server.js

echo.
echo  Server stopped.
pause
