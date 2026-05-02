@echo off
setlocal
cd /d "%~dp0"
title HemaVision Backend
color 0B
echo.
echo  HemaVision Backend dang chay...
echo  URL: http://127.0.0.1:8000
echo  Docs: http://127.0.0.1:8000/docs
echo  Nhan Ctrl+C de dung.
echo.
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
