@echo off
setlocal
cd /d "%~dp0"
title Compass Launcher - probar sin instalar
where node >nul 2>nul
if errorlevel 1 (
  echo Primero abre construir-instalador.bat para instalar Node.js.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 ( pause & exit /b 1 )
call npm start
