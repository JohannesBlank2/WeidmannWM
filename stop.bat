@echo off
setlocal
title Weidmann WM - Stop

echo Beende Weidmann-WM-Server (Node auf Port 3000) ...

REM Finde den Prozess, der auf Port 3000 lauscht, und beende ihn.
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  set "FOUND=1"
  echo   -> beende PID %%P
  taskkill /F /PID %%P >nul 2>nul
)

if not defined FOUND (
  echo Kein laufender Server auf Port 3000 gefunden.
)

echo Fertig.
timeout /t 2 >nul
endlocal
