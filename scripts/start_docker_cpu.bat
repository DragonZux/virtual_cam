@echo off
rem Build + chay Virtual Cam bang Docker, CHI DUNG CPU (khong can / khong dung GPU NVIDIA).
rem Giong start_docker.bat -Cpu. Them tham so neu can: scripts\start_docker_cpu.bat -ImageSize 320   /   -PublicHost 192.168.1.10   /   -Force
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" -Cpu %*
set "EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %EXIT_CODE%
