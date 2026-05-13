@echo off
echo ==========================================
echo   HemaVision - Hugging Face Deploy Script
echo ==========================================

REM 1. Clone the repository
echo.
echo [1/4] Dang clone Hugging Face repo...
git clone https://huggingface.co/spaces/QuocBao16/hema-backend hf-space
if not exist hf-space (
    echo [Loi] Khong the clone repo. Ban kiem tra lai mang hoac git nhe.
    pause
    exit /b
)

cd hf-space

REM 2. Copy files
echo.
echo [2/4] Dang copy files tu project vao...
xcopy /E /I /Y ..\backend backend\
xcopy /E /I /Y ..\config config\
xcopy /E /I /Y ..\models models\
mkdir data
copy /Y ..\data\hemavision.sqlite3 data\
copy /Y ..\requirements.txt .
copy /Y ..\backend\Dockerfile .

REM 3. Setup Git LFS
echo.
echo [3/4] Dang cau hinh Git LFS cho cac file Model nang...
git lfs install
git lfs track "*.onnx"
git lfs track "*.h5"
git lfs track "*.keras"
git lfs track "*.pt"
git lfs track "*.sqlite3"

REM 4. Commit and Push
echo.
echo [4/4] DANG PUSH LEN HUGGING FACE...
echo ========================================================
echo CHU Y QUAN TRONG:
echo Git se yeu cau ban nhap Username va Password cua Hugging Face.
echo - Username: QuocBao16
echo - Password: Ban phai dung Access Token (loai WRITE).
echo.
echo Cach lay Access Token:
echo 1. Vao link: https://huggingface.co/settings/tokens
echo 2. Bam "Create new token"
echo 3. Phan Type chon "Write", roi copy ma token dai dai do lam Password.
echo ========================================================
echo.
git add .
git commit -m "Deploy HemaVision Backend"
git push

echo.
echo Deploy hoan tat! Ban co the tat cua so nay.
pause
