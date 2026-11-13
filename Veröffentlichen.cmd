@echo off
rem Doppelklick: aktuellen Stand pruefen und auf GitHub Pages (Handy) veroeffentlichen.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
node scripts\veroeffentlichen.mjs
echo.
pause
