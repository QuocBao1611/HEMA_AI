@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

:: ============================================================
::  HemaVision AI — One-Click Launcher
::  Double-click file nay la toan bo du an tu khoi dong.
:: ============================================================

title HemaVision AI — Launcher
color 0A

echo.
echo  ============================================================
echo    HemaVision AI ^| One-Click Launcher
echo  ============================================================
echo.

:: ── 1. Kiểm tra .venv ────────────────────────────────────────
echo  [1/5] Kiem tra Python virtual environment...
if not exist ".venv\Scripts\python.exe" (
    echo  [!] Chua co .venv -- dang tao...
    python -m venv .venv
    if errorlevel 1 (
        echo  [ERR] Khong the tao .venv. Dam bao Python da duoc cai dat.
        pause
        exit /b 1
    )
    echo  [OK] .venv da duoc tao.
) else (
    echo  [OK] .venv san sang.
)

:: ── 2. Cài Python dependencies nếu chưa có ───────────────────
echo  [2/5] Kiem tra Python dependencies...
.venv\Scripts\python.exe -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
    echo  [!] Thieu dependencies -- dang cai dat tu requirements.txt...
    .venv\Scripts\python.exe -m pip install -r requirements.txt
    if errorlevel 1 (
        echo  [ERR] Cai dat Python dependencies that bai.
        pause
        exit /b 1
    )
)
echo  [OK] Python dependencies san sang.

:: ── 3. Cài Node dependencies nếu chưa có ────────────────────
echo  [3/5] Kiem tra Node dependencies...
if not exist "frontend-next\node_modules\next\package.json" (
    echo  [!] node_modules chua co -- dang chay npm install...
    cd frontend-next
    npm.cmd install
    if errorlevel 1 (
        echo  [ERR] npm install that bai. Kiem tra lai Node.js.
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Node dependencies da cai xong.
) else (
    echo  [OK] Node dependencies san sang.
)

:: ── 4. Chạy Alembic migrations ───────────────────────────────
echo  [4/5] Chay database migrations...
.venv\Scripts\alembic.exe upgrade head >nul 2>&1
if errorlevel 1 (
    echo  [WARN] Alembic gap loi - app van chay voi DATABASE_AUTO_CREATE.
) else (
    echo  [OK] Database migrations hoan tat.
)

:: ── 5. Giải phóng port 8000 và 3000 nếu đang bị chiếm ──────
echo  [5/5] Giai phong cac port...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000 " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo  [OK] Ports san sang.

:: ── 6. Khởi động Backend ─────────────────────────────────────
echo.
echo  Dang khoi dong Backend  (http://127.0.0.1:8000) ...
start "HemaVision Backend" cmd /k "%~dp0start_server.bat"

:: Đợi backend sẵn sàng (tối đa 20 giây)
echo  Dang cho backend khoi dong (toi da 20 giay)...
set WAITED=0
:WAIT_BACKEND
timeout /t 1 /nobreak >nul
set /a WAITED+=1
.venv\Scripts\python.exe -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=1)" >nul 2>&1
if not errorlevel 1 (
    echo  [OK] Backend san sang sau %WAITED% giay.
    goto BACKEND_READY
)
if %WAITED% lss 20 goto WAIT_BACKEND
echo  [WARN] Backend chua phan hoi sau 20s -- van mo frontend...

:BACKEND_READY
:: ── 7. Khởi động Frontend ────────────────────────────────────
echo  Dang khoi dong Frontend (http://localhost:3000) ...
start "HemaVision Frontend" cmd /k "%~dp0start_frontend.bat"

:: ── 8. Mở trình duyệt sau 5 giây ────────────────────────────
echo  Mo trinh duyet sau 5 giay...
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000"

:: ── Thông tin tóm tắt ────────────────────────────────────────
echo.
echo  ============================================================
echo    Tat ca dich vu da khoi dong thanh cong!
echo  ============================================================
echo.
echo    Backend  API : http://127.0.0.1:8000
echo    API Docs     : http://127.0.0.1:8000/docs
echo    Frontend     : http://localhost:3000
echo.
echo    Tai khoan mac dinh:  admin / admin123
echo.
echo    De DUNG app: dong 2 cua so
echo      - "HemaVision Backend"
echo      - "HemaVision Frontend"
echo  ============================================================
echo.
echo  Cua so nay co the dong an toan.
pause
