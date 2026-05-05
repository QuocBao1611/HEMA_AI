@echo off
echo Building frontend...
cd frontend-next
call npm.cmd run build
cd ..

echo Creating release directory...
mkdir release\HemaVision-AI-v1.0

echo Copying files...
robocopy . release\HemaVision-AI-v1.0 /E /XD .git .venv node_modules .next __pycache__ .ruff_cache .mypy_cache .pytest_cache release models docs/archive
mkdir release\HemaVision-AI-v1.0\models\detectors
mkdir release\HemaVision-AI-v1.0\models\classifiers
copy models\README.md release\HemaVision-AI-v1.0\models\

echo Creating ZIP...
powershell Compress-Archive -Path release\HemaVision-AI-v1.0 -DestinationPath release\HemaVision-AI-v1.0-source.zip -Force

echo Done! Source ZIP created at release\HemaVision-AI-v1.0-source.zip
pause
