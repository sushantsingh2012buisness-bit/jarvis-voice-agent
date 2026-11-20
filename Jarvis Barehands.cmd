@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-stack.ps1" hands
start "" "http://127.0.0.1:8794/stage.html"
