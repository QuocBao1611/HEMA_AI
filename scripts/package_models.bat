@echo off
echo Packaging Models...
mkdir release\models\detectors 2>nul
mkdir release\models\classifiers 2>nul

copy models\detectors\best9.onnx release\models\detectors\
copy models\detectors\yolov8n-bccd.pt release\models\detectors\
copy models\classifiers\mobilenetv2_phase2_best.h5 release\models\classifiers\
copy models\classifiers\best_model_v2.keras release\models\classifiers\
copy models\README.md release\models\

echo Creating ZIP...
powershell Compress-Archive -Path release\models\* -DestinationPath release\HemaVision-AI-v1.0-models.zip -Force

echo Done! Models ZIP created at release\HemaVision-AI-v1.0-models.zip
pause
