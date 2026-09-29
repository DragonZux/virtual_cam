<#
.SYNOPSIS
Build and start Virtual Cam with Docker on the CPU only (no NVIDIA GPU needed or used).
Same as start.ps1 -Cpu: PyTorch CPU build, docker/docker-compose.cpu.yml, YOLO image size 480.
Other options are passed through (e.g. -PublicHost 192.168.1.10, -ImageSize 320, -Force, -NoBrowser).

.EXAMPLE
.\start_cpu.ps1

.EXAMPLE
.\start_cpu.ps1 -ImageSize 320
#>
& (Join-Path $PSScriptRoot 'start.ps1') -Cpu @args
exit $LASTEXITCODE
