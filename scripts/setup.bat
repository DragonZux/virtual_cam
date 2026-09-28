@echo off
setlocal
rem Script nam trong scripts\ - lam viec o thu muc goc du an
pushd "%~dp0.."
if errorlevel 1 exit /b 1

set "VENV_PYTHON=.cam\Scripts\python.exe"
set "MODEL_FILE=models\hand_landmarker.task"
set "MODEL_URL=https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

echo ======================================
echo       virtual_cam Windows setup
echo ======================================

if not exist "requirements.txt" (
    echo [ERROR] requirements.txt not found.
    goto :failed
)

echo.
echo [1/5] Preparing virtual environment...
if exist "%VENV_PYTHON%" goto :venv_ready
if exist ".cam" (
    echo [ERROR] .cam exists but has no Windows Python environment.
    echo Rename .cam and run this script again.
    goto :failed
)

py -3 --version >nul 2>&1
if not errorlevel 1 (
    py -3 -m venv .cam
) else (
    python --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Python not found. Install Python 3 and enable Add Python to PATH.
        goto :failed
    )
    python -m venv .cam
)
if errorlevel 1 goto :failed

:venv_ready
echo.
echo [2/5] Checking environment Python...
"%VENV_PYTHON%" --version
if errorlevel 1 goto :failed

echo.
echo [3/5] Installing Python dependencies (desktop app + web backend)...
"%VENV_PYTHON%" -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :failed
"%VENV_PYTHON%" -m pip install -r requirements.txt
if errorlevel 1 goto :failed

rem Install CUDA wheels when the NVIDIA driver is available.
"%SystemRoot%\System32\nvidia-smi.exe" -L >nul 2>&1
if errorlevel 1 goto :model_check
echo Installing PyTorch with NVIDIA CUDA support...
"%VENV_PYTHON%" -X utf8 -m pip install --upgrade torch==2.14.0+cu130 torchvision==0.29.0+cu130 --index-url https://download.pytorch.org/whl/cu130
if errorlevel 1 goto :failed
"%VENV_PYTHON%" -c "import torch; assert torch.cuda.is_available(), 'CUDA unavailable: check the NVIDIA driver'; print('GPU:', torch.cuda.get_device_name(0))"
if errorlevel 1 goto :failed

:model_check
echo.
echo [4/5] Checking MediaPipe Hand Landmarker model...
if not exist "models" mkdir "models"
if exist "%MODEL_FILE%" (
    echo [OK] Model already exists. Skipping download.
) else (
    "%VENV_PYTHON%" -c "import os, urllib.request; target = os.environ['MODEL_FILE']; temp = target + '.download'; urllib.request.urlretrieve(os.environ['MODEL_URL'], temp); os.replace(temp, target)"
    if errorlevel 1 goto :failed
    echo [OK] Model downloaded.
)

echo.
echo [5/5] Building the web interface...
where npm >nul 2>&1
if errorlevel 1 (
    echo [WARN] Node.js/npm not found - skipped. Install Node.js 20+ and run setup.bat again for the web app.
    goto :done
)
pushd frontend
call npm ci --no-audit --no-fund
if errorlevel 1 (
    popd
    goto :failed
)
call npm run build
if errorlevel 1 (
    popd
    goto :failed
)
popd

:done
echo.
echo Setup completed!
echo Run the web app with:
echo     scripts\run_web.bat            ^(http://localhost:8030^)
echo     scripts\run_web.bat --lan      ^(also https://^<LAN IP^>:8031 for phones^)
echo.
echo Desktop window version ^(Linux camera /dev/video3 - edit CAMERA at the top of desktop\finger_select.py^):
echo     .cam\Scripts\python.exe desktop\finger_select.py
echo.
set "SETUP_EXIT_CODE=0"
goto :finish

:failed
echo.
echo [ERROR] Setup failed. See the error above.
set "SETUP_EXIT_CODE=1"

:finish
popd
if /i not "%~1"=="--no-pause" pause
exit /b %SETUP_EXIT_CODE%
