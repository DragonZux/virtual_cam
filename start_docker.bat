@echo off
rem Build + chay Virtual Cam bang Docker, tu chon GPU/CPU, IP LAN, cong trong theo may nay.
rem Them tham so neu can: start_docker.bat -Cpu   /   -PublicHost 192.168.1.10   /   -Force
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %EXIT_CODE%
