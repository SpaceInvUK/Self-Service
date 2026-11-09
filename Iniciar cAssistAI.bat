@echo off
setlocal EnableExtensions
chcp 65001 >nul
title cAssistAI
cd /d "%~dp0"

echo ==================================================
echo   cAssistAI
echo   Deixe esta janela aberta enquanto usar o app.
echo ==================================================

call :findnode
if defined NODEOK goto run

echo.
echo Instalando o Node.js, necessario para o cAssistAI...
echo Se o Windows pedir permissao, clique em Sim.
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >nul 2>&1
set "PATH=%ProgramFiles%\nodejs;%PATH%"
call :findnode
if defined NODEOK goto run

echo.
echo Nao consegui instalar o Node.js sozinho.
echo Vou abrir o site: baixe a versao LTS, instale e abra este arquivo de novo.
start "" https://nodejs.org/
pause
exit /b 1

:run
node scripts\local-start.mjs
echo.
echo O cAssistAI foi desligado. Se apareceu algum erro acima, tire um print e envie.
pause
exit /b 0

:findnode
set "NODEOK="
where node >nul 2>&1 || (
  if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
where node >nul 2>&1 || exit /b 0
node -e "process.exit(Number(process.versions.node.split(/[.]/)[0]) >= 24 ? 0 : 1)" && set "NODEOK=1"
exit /b 0
