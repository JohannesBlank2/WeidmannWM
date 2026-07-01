@echo off
setlocal
title Weidmann WM - Server
cd /d "%~dp0"

echo ============================================
echo    Weidmann WM - Spieleshow Server
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [FEHLER] Node.js ist nicht installiert oder nicht im PATH.
  echo Bitte Node.js von https://nodejs.org installieren.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [setup] node_modules fehlt - installiere Abhängigkeiten ...
  call npm install
  if errorlevel 1 (
    echo [FEHLER] npm install fehlgeschlagen.
    pause
    exit /b 1
  )
)

echo [start] Server startet ...
echo.

REM Browser für Display und Admin nach kurzer Verzögerung öffnen (optional).
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:3000/display/ & start http://localhost:3000/admin/"

node server\index.js

echo.
echo [server] beendet.
pause
endlocal
