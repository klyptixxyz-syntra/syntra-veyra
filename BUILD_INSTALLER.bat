@echo off
setlocal
cd /d "%~dp0"
title Syntra Veyra - Build Installer
where node >nul 2>&1 || (
  echo Node.js is required to build the installer.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 pause & exit /b 1
call npm run check
if errorlevel 1 pause & exit /b 1
call npm run dist
echo.
echo Finished. Look inside the dist folder for Veyra-Setup-*.exe
pause
