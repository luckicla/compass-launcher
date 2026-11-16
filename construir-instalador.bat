@echo off
setlocal
cd /d "%~dp0"
title Compass Launcher - crear el .exe
echo ============================================
echo   Compass Launcher: creando el .exe
echo   (la primera vez tarda unos minutos)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado. Instalandolo con winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto :nonode
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)

where node >nul 2>nul
if errorlevel 1 goto :restart

set CSC_IDENTITY_AUTO_DISCOVERY=false

echo.
echo [1/2] Descargando lo necesario (Electron y librerias)...
call npm install
if errorlevel 1 goto :fail

echo.
echo [2/2] Creando el instalador y la version portable...
call npm run dist
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   LISTO. En la carpeta "dist" tienes:
echo    - Compass-Launcher-Instalador-5.0.0.exe (actualiza la version que tengas)
echo    - Compass-Launcher-Portable-5.0.0.exe (sin instalar)
echo ============================================
explorer "%~dp0dist"
pause
exit /b 0

:nonode
echo.
echo No se pudo instalar Node.js automaticamente.
echo Instalalo desde https://nodejs.org (version LTS) y vuelve a abrir este archivo.
pause
exit /b 1

:restart
echo.
echo Node.js se acaba de instalar. Cierra esta ventana y abre este archivo otra vez.
pause
exit /b 1

:fail
echo.
echo HA FALLADO algo. Haz una captura de los mensajes de arriba para ver que ha pasado.
pause
exit /b 1
