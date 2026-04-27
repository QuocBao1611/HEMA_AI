@echo off
setlocal
cd /d "%~dp0"
start "HemaVision Backend" cmd /k "%~dp0start_server.bat"
start "HemaVision Frontend" cmd /k "%~dp0start_frontend.bat"
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://127.0.0.1:3000
