@echo off
cd /d C:\xampp\htdocs\HEMA_AI
echo ========================================
echo Starting MobileNetV2 .h5 -^> .onnx conversion
echo ========================================
echo.
python scripts/run_convert.py
echo.
echo Exit code: %ERRORLEVEL%
pause
