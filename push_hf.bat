@echo off
echo ==========================================
echo   Push Fix config.py len HF Spaces
echo ==========================================

cd hf-space

echo.
set /p HF_TOKEN="Dan Access Token MOI (hf_...) roi bam Enter: "

REM Copy file da sua
xcopy /Y ..\backend\app\core\config.py backend\app\core\

git remote set-url origin https://QuocBao16:%HF_TOKEN%@huggingface.co/spaces/QuocBao16/hema-backend

set HF_TOKEN=%HF_TOKEN%
set HUGGING_FACE_HUB_TOKEN=%HF_TOKEN%

git add backend/app/core/config.py
git commit -m "fix: TypeError tuple concatenation in CORS config"
git push origin main

echo.
if %ERRORLEVEL% == 0 (
    echo SUCCESS! HF se tu dong rebuild lai. Cho 2-3 phut roi kiem tra lai nhe!
) else (
    echo [Loi] Kiem tra lai token.
)
pause
