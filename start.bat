@echo off
setlocal
set "PORT=%~1"
if not defined PORT set "PORT=4173"
set "NODE_EXE="
if exist "%~dp0.runtime\node.exe" set "NODE_EXE=%~dp0.runtime\node.exe"
if not defined NODE_EXE if exist "%~dp0..\.tools\node-v22.23.4-win-x64\node.exe" set "NODE_EXE=%~dp0..\.tools\node-v22.23.4-win-x64\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)
if not defined NODE_EXE (
  echo Node.js not found. Put node.exe into the .runtime folder next to start.bat.
  pause
  exit /b 1
)
chcp 65001 >nul
title AURA kids site server
echo Starting AURA kids site server...
"%NODE_EXE%" "%~dp0dev\server.mjs" "%PORT%" lan
echo.
echo Server stopped.
pause
