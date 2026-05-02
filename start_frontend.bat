@echo off
setlocal
cd /d "%~dp0frontend-next"
title HemaVision Frontend (Dev)
color 0E
echo.
echo  HemaVision Frontend dang chay (dev mode)...
echo  URL: http://localhost:3000
echo  Nhan Ctrl+C de dung.
echo.
npm.cmd run dev
