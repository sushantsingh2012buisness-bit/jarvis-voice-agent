@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-stack.ps1" voice
start "" "http://127.0.0.1:4320/faces/board/"
