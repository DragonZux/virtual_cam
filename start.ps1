<#
.SYNOPSIS
Build and start Virtual Cam with Docker on Windows, adapted to this machine: NVIDIA GPU when Docker
can reach it (otherwise CPU), the LAN IP for phones, free ports, and enough disk/RAM before building.
Safe to run again (after changing code, or to change the options).

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\start.ps1

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\start.ps1 -PublicHost 192.168.1.10 -ImageSize 480
#>
param(
    # IP phones / other computers use to reach this one (default: detected LAN IP)
    [string]$PublicHost = '',
    # Run YOLO on the CPU even if an NVIDIA GPU is found
    [switch]$Cpu,
    # Use the GPU without first checking that Docker can reach it
    [switch]$Gpu,
    # Side of the image fed to YOLO (default: 640 on GPU, 480 on CPU)
    [int]$ImageSize = 0,
    # Skip the disk / memory checks and questions
    [switch]$Force,
    # Do not open the browser at the end
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Continue'  # native tools report errors through $LASTEXITCODE
Set-Location -LiteralPath $PSScriptRoot

$EnvFile = Join-Path $PSScriptRoot '.env'
$Project = 'virtual_cam'          # compose project name (folder name)
$Image = 'virtual-cam:latest'
$ProbeImage = 'python:3.11-slim'  # base image of the build: `nvidia-smi` inside it proves Docker sees the GPU
# PyTorch CUDA builds, preferred first, with the driver CUDA version each one needs
$CudaBuilds = @(@('cu128', '12.8'), @('cu126', '12.6'), @('cu118', '11.8'))
$HandModelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
# Ultralytics release holding the YOLO26 weights (yolo26n-seg.pt, yolo26m-seg.pt, yolo26l-seg.pt, ...)
$YoloReleaseUrl = 'https://github.com/ultralytics/assets/releases/download/v8.4.0'
$DefaultYoloModel = 'yolo26m-seg.pt'  # balance of speed and accuracy (finger_select.py uses yolo26l-seg.pt)
# Free space needed on the Docker data disk: full build with PyTorch CUDA / CPU, or only code layers changed
$NeedGpuGB = 20; $NeedCpuGB = 6; $NeedUpdateGB = 3

function Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Info([string]$Message) { Write-Host "    $Message" }
function Warn([string]$Message) { Write-Host "    WARNING: $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { Write-Host "ERROR: $Message" -ForegroundColor Red; exit 1 }

function Confirm-Continue([string]$Question) {
    if ($Force) { return }
    $answer = Read-Host "    $Question [y/N]"
    if ($answer -notmatch '^(y|yes|c|co)$') { Fail 'Stopped. Run again when ready (or add -Force).' }
}

# ---------- .env ----------

function Read-EnvFile {
    if (-not (Test-Path -LiteralPath $EnvFile)) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot '.env.example') -Destination $EnvFile
        Info 'Created .env from .env.example'
    }
    $script:EnvText = [System.IO.File]::ReadAllText($EnvFile)
}

function Get-EnvValue([string]$Key) {
    $match = [regex]::Match($script:EnvText, "(?m)^$Key=(.*?)\r?$")
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
    return ''
}

function Set-EnvValue([string]$Key, [string]$Value) {
    $line = "$Key=$Value"
    $pattern = "(?m)^$Key=.*?(?=\r?$)"
    if ([regex]::IsMatch($script:EnvText, $pattern)) {
        $script:EnvText = [regex]::Replace($script:EnvText, $pattern, $line.Replace('$', '$$'))
    } else {
        $newline = if ($script:EnvText.Contains("`r`n")) { "`r`n" } else { "`n" }
        if ($script:EnvText.Length -gt 0 -and -not $script:EnvText.EndsWith("`n")) { $script:EnvText += $newline }
        $script:EnvText += $line + $newline
    }
}

function Save-EnvFile {
    # UTF-8 without BOM: Docker Compose would read a BOM as part of the first line.
    [System.IO.File]::WriteAllText($EnvFile, $script:EnvText, (New-Object System.Text.UTF8Encoding $false))
}

# ---------- Machine ----------

function Get-LanIp {
    # The adapter that has the default gateway (Wi-Fi / Ethernet), not Hyper-V / WSL virtual switches
    $config = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
        Select-Object -First 1
    if ($config) { return ($config.IPv4Address | Select-Object -First 1).IPAddress }
    return ''
}

function Get-DriverCuda {
    if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) { return $null }
    $smi = (& nvidia-smi 2>$null) -join "`n"
    if ($LASTEXITCODE -ne 0) { return $null }
    # Older drivers print "CUDA Version: 12.4", newer ones "CUDA UMD Version: 13.4".
    if ($smi -match 'CUDA (?:UMD )?Version:\s*(\d+)\.(\d+)') { return [version]"$($Matches[1]).$($Matches[2])" }
    return $null
}

function Get-TorchIndex([version]$DriverCuda, [string]$Current) {
    # Keep the build already in .env when the driver supports it: changing it rebuilds the ~10 GB PyTorch layer.
    foreach ($build in $CudaBuilds) {
        if ($build[0] -eq $Current -and $DriverCuda -ge [version]$build[1]) { return $Current }
    }
    foreach ($build in $CudaBuilds) {
        if ($DriverCuda -ge [version]$build[1]) { return $build[0] }
    }
    return $null
}

function Test-DockerGpu {
    $out = (& docker run --rm --gpus all $ProbeImage nvidia-smi -L 2>$null) -join "`n"
    return ($LASTEXITCODE -eq 0 -and $out -match 'GPU \d')
}

function Get-DockerDataDir {
    # Docker Desktop keeps images in a VHDX; Settings > Resources > Advanced can move it (here: CustomWslDistroDir)
    $settingsFile = Join-Path $env:APPDATA 'Docker\settings-store.json'
    if (Test-Path -LiteralPath $settingsFile) {
        try {
            $settings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
            if ($settings.CustomWslDistroDir) { return $settings.CustomWslDistroDir }
        } catch { }
    }
    return (Join-Path $env:LOCALAPPDATA 'Docker\wsl')
}

function Get-FreeGB([string]$Path) {
    $drive = (Split-Path -Qualifier $Path).TrimEnd(':')
    $info = Get-PSDrive -Name $drive -ErrorAction SilentlyContinue
    if (-not $info) { return $null }
    return [math]::Round($info.Free / 1GB, 1)
}

function Get-AvailableRamMB {
    try { return [int](Get-Counter '\Memory\Available MBytes' -ErrorAction Stop).CounterSamples.CookedValue } catch { return $null }
}

function Get-ImageTorchIndex {
    # PyTorch build of the existing image, read from its build history ("RUN |1 TORCH_INDEX=cu128 ...")
    $history = (& docker history --no-trunc --format '{{.CreatedBy}}' $Image 2>$null) -join "`n"
    if ($LASTEXITCODE -ne 0) { return $null }
    if ($history -match 'TORCH_INDEX=(\S+)') { return $Matches[1] }
    return ''
}

# ---------- Ports ----------

function Get-ExcludedPortRanges {
    # Ports Windows reserves for Hyper-V / WSL: binding them fails even when nothing listens
    $ranges = @()
    foreach ($line in (& netsh interface ipv4 show excludedportrange protocol=tcp 2>$null)) {
        if ($line -match '^\s*(\d+)\s+(\d+)') { $ranges += , @([int]$Matches[1], [int]$Matches[2]) }
    }
    return $ranges
}

function Get-OwnPorts {
    $ports = @{}
    $ids = @(& docker ps -aq --filter "label=com.docker.compose.project=$Project" 2>$null)
    foreach ($id in $ids) {
        $bound = & docker inspect --format '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostPort}} {{end}}{{end}}' $id 2>$null
        foreach ($port in ("$bound" -split '\s+' | Where-Object { $_ })) { $ports[[int]$port] = $true }
    }
    return $ports
}

function Get-UsedPorts {
    # Listening now + bound by other containers (even stopped ones: they come back on restart)
    $used = @{}
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $used[[int]$_.LocalPort] = $true }
    $own = @(& docker ps -aq --filter "label=com.docker.compose.project=$Project" 2>$null)
    foreach ($id in @(& docker ps -aq 2>$null)) {
        if ($own -contains $id) { continue }
        $bound = & docker inspect --format '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostPort}} {{end}}{{end}}' $id 2>$null
        foreach ($port in ("$bound" -split '\s+' | Where-Object { $_ })) { $used[[int]$port] = $true }
    }
    foreach ($port in (Get-OwnPorts).Keys) { $used.Remove($port) }
    return $used
}

function Test-PortFree([int]$Port, $Used, $Excluded) {
    if ($Used.ContainsKey($Port)) { return $false }
    foreach ($range in $Excluded) { if ($Port -ge $range[0] -and $Port -le $range[1]) { return $false } }
    return $true
}

function Select-Ports([int]$Web, [int]$Lan) {
    $used = Get-UsedPorts
    $excluded = Get-ExcludedPortRanges
    if ((Test-PortFree $Web $used $excluded) -and (Test-PortFree $Lan $used $excluded) -and $Web -ne $Lan) {
        return @($Web, $Lan)
    }
    for ($port = 8032; $port -lt 8999; $port += 2) {
        if ((Test-PortFree $port $used $excluded) -and (Test-PortFree ($port + 1) $used $excluded)) {
            return @($port, ($port + 1))
        }
    }
    Fail 'No free pair of ports found between 8032 and 8999.'
}

# ---------- Main ----------

Step 'Checking Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail 'Docker is not installed. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), start it once, then run this script again.'
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $desktop) {
        Info 'Starting Docker Desktop (this can take a minute)...'
        Start-Process -FilePath $desktop
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 3
            & docker info *> $null
            if ($LASTEXITCODE -eq 0) { break }
        }
    }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Fail 'Docker is not running. Start Docker Desktop, wait for "Engine running", then run this script again. If it shows "Lingering processes detected", choose "Stop processes".'
    }
}
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Compose v2 is missing: update Docker Desktop.' }

Step 'Checking the models'
Read-EnvFile
$yoloModel = Get-EnvValue 'YOLO_MODEL'
if (-not $yoloModel) {
    $yoloModel = $DefaultYoloModel
    Set-EnvValue 'YOLO_MODEL' $yoloModel
    Save-EnvFile
}
$Models = @(@('hand_landmarker.task', $HandModelUrl), @($yoloModel, "$YoloReleaseUrl/$yoloModel"))
foreach ($model in $Models) {
    $path = Join-Path $PSScriptRoot $model[0]
    if (Test-Path -LiteralPath $path -PathType Container) {
        Fail "$($model[0]) is a folder (Docker creates one when the file is missing): delete it and run again."
    }
    if (Test-Path -LiteralPath $path) { Info "$($model[0]) OK"; continue }
    Info "Downloading $($model[0])..."
    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $model[1] -OutFile "$path.download" -UseBasicParsing
        Move-Item -LiteralPath "$path.download" -Destination $path -Force
    } catch {
        Remove-Item -LiteralPath "$path.download" -ErrorAction SilentlyContinue
        Fail "Could not download $($model[0]): $($_.Exception.Message)"
    }
}

Step 'Preparing .env'
if (-not $PublicHost) { $PublicHost = Get-LanIp }
if ($PublicHost) {
    Set-EnvValue 'LAN_IP' $PublicHost
    Info "LAN IP: $PublicHost"
} else {
    Set-EnvValue 'LAN_IP' ''
    Warn 'No LAN connection found: only this computer can use the web app.'
}
$webPort = 8032; $lanPort = 8033
if ((Get-EnvValue 'WEB_PORT') -match '^\d+$') { $webPort = [int](Get-EnvValue 'WEB_PORT') }
if ((Get-EnvValue 'LAN_HTTPS_PORT') -match '^\d+$') { $lanPort = [int](Get-EnvValue 'LAN_HTTPS_PORT') }
$ports = Select-Ports $webPort $lanPort
if ($ports[0] -ne $webPort -or $ports[1] -ne $lanPort) {
    Warn "Ports $webPort/$lanPort are used by another program: using $($ports[0])/$($ports[1])"
}
Set-EnvValue 'WEB_PORT' $ports[0]
Set-EnvValue 'LAN_HTTPS_PORT' $ports[1]
Info "Ports: $($ports[0]) (this computer), $($ports[1]) (HTTPS for phones)"
# Images / videos uploaded on the Overview page are saved straight into this folder of the host (mounted into the container).
$uploadDir = Get-EnvValue 'UPLOAD_HOST_DIR'
if (-not $uploadDir) { $uploadDir = Join-Path $env:USERPROFILE 'Documents\virtual_cam' }
New-Item -ItemType Directory -Force -Path $uploadDir | Out-Null
Set-EnvValue 'UPLOAD_HOST_DIR' $uploadDir
Info "Uploads: $uploadDir"

Step 'Choosing how to run YOLO: NVIDIA GPU or CPU'
$mode = 'cpu'
$torchIndex = 'cpu'
if ($Cpu) {
    Info 'CPU requested (-Cpu)'
} else {
    $driverCuda = Get-DriverCuda
    if (-not $driverCuda) {
        Info 'No NVIDIA GPU with a working driver: YOLO will run on the CPU'
    } else {
        $gpuName = & nvidia-smi '--query-gpu=name' '--format=csv,noheader' 2>$null | Select-Object -First 1
        Info "NVIDIA GPU: $gpuName (driver supports CUDA $driverCuda)"
        $index = Get-TorchIndex $driverCuda (Get-EnvValue 'TORCH_INDEX')
        if (-not $index) {
            Warn "This driver is too old for PyTorch (CUDA $driverCuda): update the NVIDIA driver to use the GPU. Using the CPU."
        } elseif ($Gpu) {
            $mode = 'gpu'; $torchIndex = $index
        } else {
            Info 'Checking that Docker can use the GPU...'
            if (Test-DockerGpu) {
                $mode = 'gpu'; $torchIndex = $index
            } else {
                Warn 'Docker cannot use the GPU. In Docker Desktop turn on "Use the WSL 2 based engine", run "wsl --update", update the NVIDIA driver, restart Docker Desktop and run this script again. Using the CPU for now.'
            }
        }
    }
}
if (-not $ImageSize) { $ImageSize = if ($mode -eq 'gpu') { 640 } else { 480 } }
Info "Mode: $mode (PyTorch $torchIndex, YOLO image size $ImageSize)"

# Kept in .env so later plain `docker compose ...` commands build and run the same way.
Set-EnvValue 'COMPOSE_PATH_SEPARATOR' ','
Set-EnvValue 'COMPOSE_FILE' $(if ($mode -eq 'gpu') { 'docker-compose.yml' } else { 'docker-compose.yml,docker-compose.cpu.yml' })
Set-EnvValue 'TORCH_INDEX' $torchIndex
Set-EnvValue 'IMAGE_SIZE' $ImageSize
Save-EnvFile

Step 'Checking disk space and memory'
$imageTorch = Get-ImageTorchIndex
$fullBuild = ($imageTorch -ne $torchIndex)
$needGB = if (-not $fullBuild) { $NeedUpdateGB } elseif ($mode -eq 'gpu') { $NeedGpuGB } else { $NeedCpuGB }
$dataDir = Get-DockerDataDir
$freeGB = Get-FreeGB $dataDir
if ($fullBuild) {
    Info "Full build needed (PyTorch $torchIndex is not in the current image): the first build downloads several GB and takes 15-30 minutes"
} else {
    Info 'PyTorch layer already built: only the code is rebuilt (a few minutes at most)'
}
if ($null -ne $freeGB) {
    Info "Docker data: $dataDir ($freeGB GB free, about $needGB GB needed)"
    if ($freeGB -lt $needGB -and -not $Force) {
        Fail "Not enough space for Docker on drive $((Split-Path -Qualifier $dataDir)): free at least $needGB GB (a full disk corrupts Docker's data), then run again. Add -Force to build anyway."
    }
}
$ramMB = Get-AvailableRamMB
if ($null -ne $ramMB) {
    Info "Free memory: $ramMB MB"
    if ($fullBuild -and $ramMB -lt 2000) {
        Warn 'Less than 2 GB of RAM is free: Docker Desktop can crash during the big PyTorch build. Close heavy apps (browsers, other VS Code windows) first.'
        Confirm-Continue 'Build anyway?'
    }
}

Step "Building the image ($mode)"
& docker compose build
if ($LASTEXITCODE -ne 0 -and $mode -eq 'gpu' -and -not $Gpu) {
    Warn 'The GPU build failed (see above). Retrying with the CPU build.'
    Confirm-Continue 'Build the CPU version instead?'
    $mode = 'cpu'; $torchIndex = 'cpu'
    if ($ImageSize -eq 640) { $ImageSize = 480 }
    Set-EnvValue 'COMPOSE_FILE' 'docker-compose.yml,docker-compose.cpu.yml'
    Set-EnvValue 'TORCH_INDEX' 'cpu'
    Set-EnvValue 'IMAGE_SIZE' $ImageSize
    Save-EnvFile
    & docker compose build
}
if ($LASTEXITCODE -ne 0) { Fail 'The build failed: see the messages above.' }

Step 'Starting Virtual Cam'
# --remove-orphans: removes containers of older layouts of this project (separate frontend / backend)
& docker compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { Fail 'The container did not start. See: docker compose logs' }

Step 'Waiting for the detector to load the models'
$status = $null
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:$($ports[0])/api/vision/status" -TimeoutSec 5
        if ($status.phase -ne 'starting') { break }
    } catch { }
}
if (-not $status) { Fail 'The web app does not answer. See: docker compose logs' }
if ($status.phase -eq 'error') { Fail "The detector could not start: $($status.error). See: docker compose logs" }
if ($status.phase -ne 'ready') { Warn 'The detector is still loading. Open the page in a moment.' }
if ($mode -eq 'gpu' -and $status.device -eq 'CPU') {
    Warn 'The container started but PyTorch does not see the GPU, so YOLO runs on the CPU. See: docker compose logs'
}

# Images of the older layout (separate frontend / backend) and dangling layers of this project
foreach ($old in @('virtual_cam-backend', 'virtual_cam-frontend')) {
    & docker image inspect $old *> $null
    if ($LASTEXITCODE -eq 0) { & docker image rm $old *> $null }
}
& docker image prune -f --filter "label=com.docker.compose.project=$Project" *> $null

$localUrl = "http://localhost:$($ports[0])"
Write-Host ''
Write-Host 'Virtual Cam is running' -ForegroundColor Green
Write-Host "  This computer : $localUrl"
if ($PublicHost) {
    Write-Host "  Phones / LAN  : https://${PublicHost}:$($ports[1])   (self-signed certificate: Advanced > Proceed)"
}
Write-Host "  Detector      : $($status.device) / $($status.model) / $($status.image_size)px"
Write-Host "  API docs      : $localUrl/docs"
Write-Host ''
if ($PublicHost) {
    Write-Host '  If phones cannot connect, allow the port in an admin PowerShell:'
    Write-Host "  New-NetFirewallRule -DisplayName 'Virtual Cam' -Direction Inbound -Protocol TCP -LocalPort $($ports[1]) -Action Allow -Profile Private"
}
Write-Host '  Stop: docker compose down    Logs: docker compose logs -f'
if (-not $NoBrowser) { Start-Process $localUrl }
