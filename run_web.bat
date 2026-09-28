@echo off
rem Virtual Cam web: API + giao dien tren http://localhost:8030
rem   run_web.bat          chi may nay
rem   run_web.bat --lan    them https://<IP LAN>:8031 cho dien thoai / may khac (chung chi tu ky)
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

set "VENV_PYTHON=%~dp0.cam\Scripts\python.exe"
if not exist "%VENV_PYTHON%" (
    echo [ERROR] Python environment not found. Run setup.bat first.
    goto :failed
)

if exist "frontend\dist\index.html" goto :serve
echo Building the web interface ^(first run^)...
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js/npm not found. Install Node.js 20+ then run setup.bat.
    goto :failed
)
pushd frontend
if not exist "node_modules" call npm ci --no-audit --no-fund
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

:serve
pushd backend
"%VENV_PYTHON%" -X utf8 serve.py --open %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
popd
exit /b %EXIT_CODE%

:failed
popd
pause
exit /b 1
