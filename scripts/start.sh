#!/usr/bin/env bash
# Build + chạy Virtual Cam bằng Docker trên Linux (giống scripts/start.ps1 trên Windows), tự thích nghi theo máy:
# GPU NVIDIA nếu Docker dùng được (không thì CPU), IP LAN cho điện thoại, cổng trống, đủ ổ đĩa / RAM trước khi build.
# Chạy lại bao nhiêu lần cũng được (sau khi sửa code, hoặc để đổi tuỳ chọn).
#   bash scripts/start.sh                                  tự chọn GPU / CPU
#   bash scripts/start.sh --cpu                            ép CPU (giống scripts/start_cpu.ps1)
#   bash scripts/start.sh --host 192.168.1.10 --image-size 480
# Tuỳ chọn khác: --gpu (dùng GPU, không thử Docker trước), --force (bỏ qua kiểm tra ổ đĩa / RAM và câu hỏi),
# --no-browser (không mở trình duyệt).
set -uo pipefail  # không dùng -e: lỗi của docker / nvidia-smi được kiểm tra từng chỗ như start.ps1

# Script nằm trong scripts/; docker compose chạy ở thư mục gốc để đọc .env gốc
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
MODEL_DIR="$ROOT/models"
PROJECT=virtual_cam              # tên project compose (`name:` trong docker/docker-compose.yml)
IMAGE=virtual-cam:latest
PROBE_IMAGE=python:3.11-slim     # image gốc của bản build: chạy được `nvidia-smi` trong đó = Docker thấy GPU
# Bản PyTorch CUDA, ưu tiên từ trên xuống, kèm bản CUDA mà driver phải hỗ trợ
CUDA_BUILDS=("cu128 12.8" "cu126 12.6" "cu118 11.8")
HAND_MODEL_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
# Bản phát hành Ultralytics chứa trọng số YOLO26 (yolo26n-seg.pt, yolo26m-seg.pt, yolo26l-seg.pt, ...)
YOLO_RELEASE_URL="https://github.com/ultralytics/assets/releases/download/v8.4.0"
DEFAULT_YOLO_MODEL=yolo26m-seg.pt  # cân bằng tốc độ / độ chính xác (desktop/finger_select.py dùng yolo26l-seg.pt)
COMPOSE_GPU=docker/docker-compose.yml
COMPOSE_CPU=docker/docker-compose.yml,docker/docker-compose.cpu.yml
# Dung lượng trống cần trên ổ dữ liệu Docker: build đủ với PyTorch CUDA / CPU, hoặc chỉ đổi lớp code
NEED_GPU_GB=20; NEED_CPU_GB=6; NEED_UPDATE_GB=3

if [ -t 1 ]; then
    C_STEP=$'\e[36m' C_WARN=$'\e[33m' C_ERR=$'\e[31m' C_OK=$'\e[32m' C_END=$'\e[0m'
else
    C_STEP='' C_WARN='' C_ERR='' C_OK='' C_END=''
fi

step() { echo "${C_STEP}==> $*${C_END}"; }
info() { echo "    $*"; }
warn() { echo "${C_WARN}    WARNING: $*${C_END}"; }
fail() { echo "${C_ERR}ERROR: $*${C_END}" >&2; exit 1; }

confirm_continue() {
    [ "$FORCE" = 1 ] && return 0
    local answer=''
    read -r -p "    $1 [y/N] " answer || true
    case "${answer,,}" in
        y|yes|c|co) ;;
        *) fail 'Stopped. Run again when ready (or add --force).' ;;
    esac
}

usage() {
    echo "Usage: bash scripts/start.sh [--cpu | --gpu] [--host IP] [--image-size N] [--force] [--no-browser]"
}

parse_args() {
    PUBLIC_HOST='' CPU=0 GPU=0 IMAGE_SIZE=0 FORCE=0 NO_BROWSER=0
    while [ $# -gt 0 ]; do
        case "$1" in
            --cpu) CPU=1 ;;
            --gpu) GPU=1 ;;
            --force) FORCE=1 ;;
            --no-browser) NO_BROWSER=1 ;;
            --host|--image-size)
                [ $# -ge 2 ] || { usage; exit 2; }
                if [ "$1" = --host ]; then PUBLIC_HOST=$2; else IMAGE_SIZE=$2; fi
                shift ;;
            -h|--help) usage; exit 0 ;;
            *) usage; exit 2 ;;
        esac
        shift
    done
    [[ $IMAGE_SIZE =~ ^[0-9]+$ ]] || { echo "--image-size needs a number (e.g. 480)"; exit 2; }
}

# ---------- Chạy bằng sudo ----------

# Người gọi sudo: thư mục nhà của họ, và file / thư mục script tạo ra thuộc về họ chứ không phải root
if [ "$(id -u)" = 0 ] && [ -n "${SUDO_USER:-}" ]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    SUDO_PREFIX='sudo '
else
    USER_HOME=$HOME
    SUDO_PREFIX=''
fi
USER_HOME=${USER_HOME:-$HOME}

own() {
    [ "$(id -u)" = 0 ] && [ -n "${SUDO_UID:-}" ] || return 0
    chown "$SUDO_UID:${SUDO_GID:-$SUDO_UID}" "$@" 2>/dev/null || true
}

make_dir() {  # mkdir -p; các thư mục vừa tạo thuộc về người gọi sudo
    local dir=$1 created=()
    while [ ! -d "$dir" ]; do created+=("$dir"); dir=$(dirname "$dir"); done
    mkdir -p "$1" || return 1
    [ ${#created[@]} -eq 0 ] || own "${created[@]}"
}

# ---------- .env ----------

read_env_file() {
    [ -f "$ENV_FILE" ] && return 0
    cp "$ROOT/.env.example" "$ENV_FILE" || fail 'Could not create .env from .env.example.'
    own "$ENV_FILE"
    info 'Created .env from .env.example'
}

get_env() {  # giá trị KEY trong .env, bỏ khoảng trắng hai đầu (và \r nếu file từng sửa trên Windows)
    local line
    line=$(grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null) || return 0
    line=${line#*=}
    line=${line%$'\r'}
    line=${line#"${line%%[![:space:]]*}"}
    printf '%s\n' "${line%"${line##*[![:space:]]}"}"
}

set_env() {  # KEY=VALUE: thay dòng đang có hoặc thêm vào cuối; ghi đè nội dung để giữ quyền / chủ của file
    local tmp
    tmp=$(mktemp) || fail 'Could not write .env'
    if KEY="$1" VALUE="$2" awk '
        index($0, ENVIRON["KEY"] "=") == 1 {
            if (!done) print ENVIRON["KEY"] "=" ENVIRON["VALUE"] ($0 ~ /\r$/ ? "\r" : "")
            done = 1
            next
        }
        { print }
        END { if (!done) print ENVIRON["KEY"] "=" ENVIRON["VALUE"] }' "$ENV_FILE" > "$tmp" && cat "$tmp" > "$ENV_FILE"; then
        rm -f "$tmp"
    else
        rm -f "$tmp"
        fail 'Could not write .env'
    fi
}

# ---------- Máy ----------

version_ge() {  # $1 >= $2, so phần MAJOR.MINOR
    local a b
    IFS=. read -r -a a <<< "$1"
    IFS=. read -r -a b <<< "$2"
    (( 10#${a[0]:-0} > 10#${b[0]:-0} || (10#${a[0]:-0} == 10#${b[0]:-0} && 10#${a[1]:-0} >= 10#${b[1]:-0}) ))
}

get_lan_ip() {
    # Card mạng có default gateway (Wi-Fi / Ethernet), không lấy bridge của Docker / máy ảo
    local addr=''
    if command -v ip >/dev/null 2>&1; then
        addr=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n1)
        [ -n "$addr" ] || addr=$(ip -4 -o addr show scope global 2>/dev/null \
            | awk '$2 !~ /^(docker|br-|veth|virbr)/ { split($4, a, "/"); print a[1]; exit }')
    fi
    [ -n "$addr" ] || addr=$(hostname -I 2>/dev/null | awk '{ print $1 }')
    printf '%s\n' "$addr"
}

get_driver_cuda() {  # bản CUDA cao nhất driver chạy được ("12.6"), rỗng nếu không có GPU NVIDIA dùng được
    command -v nvidia-smi >/dev/null 2>&1 || return 0
    local smi re='CUDA (UMD )?Version: *([0-9]+)\.([0-9]+)'
    smi=$(nvidia-smi 2>/dev/null) || return 0
    # Driver cũ in "CUDA Version: 12.4", driver mới "CUDA UMD Version: 13.4"
    if [[ $smi =~ $re ]]; then printf '%s.%s\n' "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"; fi
}

get_torch_index() {  # $1 = CUDA của driver, $2 = TORCH_INDEX đang có trong .env
    # Giữ bản đang có trong .env nếu driver chạy được: đổi bản là build lại lớp PyTorch ~10 GB
    local build index need
    for build in "${CUDA_BUILDS[@]}"; do
        read -r index need <<< "$build"
        if [ "$index" = "$2" ] && version_ge "$1" "$need"; then echo "$index"; return; fi
    done
    for build in "${CUDA_BUILDS[@]}"; do
        read -r index need <<< "$build"
        if version_ge "$1" "$need"; then echo "$index"; return; fi
    done
}

test_docker_gpu() {
    local out
    out=$(docker run --rm --gpus all "$PROBE_IMAGE" nvidia-smi -L 2>/dev/null) && [[ $out =~ GPU\ [0-9] ]]
}

compose_supports_reset() {  # docker/docker-compose.cpu.yml dùng `!reset` (Docker Compose 2.24+)
    local version
    version=$(docker compose version --short 2>/dev/null)
    version_ge "${version#v}" 2.24 2>/dev/null
}

get_free_gb() {  # dung lượng trống (GB) của ổ chứa thư mục $1, rỗng nếu không đọc được
    df -Pk "$1" 2>/dev/null | awk 'NR == 2 { printf "%.1f\n", $4 / 1048576 }'
}

get_available_ram_mb() {
    awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null
}

get_image_torch_index() {
    # Bản PyTorch của image đang có, đọc từ lịch sử build ("RUN |1 TORCH_INDEX=cu128 ..."); rỗng nếu chưa có image
    docker history --no-trunc --format '{{.CreatedBy}}' "$IMAGE" 2>/dev/null \
        | grep -o 'TORCH_INDEX=[^ ]*' | head -n1 | cut -d= -f2
}

download() {  # tải $1 vào $2 qua file tạm: lỗi giữa chừng không để lại model hỏng
    local tmp="$2.download"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --retry 3 -o "$tmp" "$1"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$tmp" "$1"
    else
        python3 -c 'import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])' "$1" "$tmp"
    fi && mv -f "$tmp" "$2" && own "$2" && return 0
    rm -f "$tmp"
    return 1
}

read_status() {  # phase, device, model, image_size, error của bộ nhận diện, ngăn cách bằng \x1f
    python3 - "http://127.0.0.1:$1/api/vision/status" 2>/dev/null <<'PY'
import json, sys, urllib.request
status = json.load(urllib.request.urlopen(sys.argv[1], timeout=5))
print("\x1f".join(str(status.get(key) or "") for key in ("phase", "device", "model", "image_size", "error")))
PY
}

# ---------- Cổng ----------

listening_ports() {  # cổng TCP đang nghe trên máy (đọc /proc: không cần ss / netstat)
    local file local_addr state
    for file in /proc/net/tcp /proc/net/tcp6; do
        [ -r "$file" ] || continue
        while read -r _ local_addr _ state _; do
            if [ "$state" = 0A ]; then echo $((16#${local_addr##*:})); fi
        done < <(tail -n +2 "$file")
    done
}

container_ports() {  # cổng host mà container $1 giữ
    docker inspect --format '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostPort}} {{end}}{{end}}' "$1" 2>/dev/null
}

collect_used_ports() {
    # Đang nghe + container khác đã giữ (kể cả đang dừng: bật lại là chiếm); bỏ cổng của chính Virtual Cam
    local port id own_ids
    USED_PORTS=()
    for port in $(listening_ports); do USED_PORTS[$port]=1; done
    own_ids=$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null)
    for id in $(docker ps -aq 2>/dev/null); do
        [[ $'\n'$own_ids$'\n' == *$'\n'$id$'\n'* ]] && continue
        for port in $(container_ports "$id"); do USED_PORTS[$port]=1; done
    done
    for id in $own_ids; do
        for port in $(container_ports "$id"); do unset "USED_PORTS[$port]"; done
    done
}

port_free() { [ -z "${USED_PORTS[$1]:-}" ]; }

select_ports() {  # $1 $2 = cổng muốn dùng; kết quả ở WEB_PORT_SEL / LAN_PORT_SEL
    declare -gA USED_PORTS
    collect_used_ports
    if port_free "$1" && port_free "$2" && [ "$1" != "$2" ]; then
        WEB_PORT_SEL=$1 LAN_PORT_SEL=$2
        return
    fi
    local port
    for ((port = 8032; port < 8999; port += 2)); do
        if port_free "$port" && port_free $((port + 1)); then
            WEB_PORT_SEL=$port LAN_PORT_SEL=$((port + 1))
            return
        fi
    done
    fail 'No free pair of ports found between 8032 and 8999.'
}

# ---------- Chính ----------

main() {
    parse_args "$@"
    cd "$ROOT" || exit 1

    step 'Checking Docker'
    command -v docker >/dev/null 2>&1 \
        || fail 'Docker is not installed. Install Docker Engine (https://docs.docker.com/engine/install/), then run this script again.'
    command -v python3 >/dev/null 2>&1 || fail 'python3 is missing (Ubuntu/Debian: sudo apt install python3).'
    if ! docker info >/dev/null 2>&1; then
        if docker info 2>&1 | grep -qi 'permission denied'; then
            fail "This user cannot use Docker. Run: sudo usermod -aG docker $(id -un)  then log out and back in (or run: sudo bash scripts/start.sh)."
        fi
        if systemctl --user cat docker-desktop >/dev/null 2>&1; then
            info 'Starting Docker Desktop (this can take a minute)...'
            systemctl --user start docker-desktop
            for ((i = 0; i < 60; i++)); do
                sleep 3
                docker info >/dev/null 2>&1 && break
            done
        fi
        docker info >/dev/null 2>&1 \
            || fail 'Docker is not running. Start it (sudo systemctl start docker), then run this script again.'
    fi
    docker compose version >/dev/null 2>&1 \
        || fail 'Docker Compose v2 is missing. Ubuntu: sudo apt install docker-compose-v2 (Docker repository: docker-compose-plugin).'

    step 'Checking the models'
    read_env_file
    local yolo_model name url path
    yolo_model=$(get_env YOLO_MODEL)
    if [ -z "$yolo_model" ]; then
        yolo_model=$DEFAULT_YOLO_MODEL
        set_env YOLO_MODEL "$yolo_model"
    fi
    make_dir "$MODEL_DIR" || fail "Could not create $MODEL_DIR"
    while read -r name url; do
        path="$MODEL_DIR/$name"
        [ -d "$path" ] && fail "$name is a folder (Docker creates one when the file is missing): delete it and run again."
        if [ -f "$path" ]; then info "$name OK"; continue; fi
        info "Downloading $name..."
        download "$url" "$path" || fail "Could not download $name."
    done <<EOF
hand_landmarker.task $HAND_MODEL_URL
$yolo_model $YOLO_RELEASE_URL/$yolo_model
EOF

    step 'Preparing .env'
    local laser_model value web_port=8032 lan_port=8033 upload_dir
    laser_model=$(get_env LASER_MODEL)
    [ -n "$laser_model" ] || laser_model=laser-advr-yolov5l6.torchscript
    if [ ! -f "$MODEL_DIR/$laser_model" ]; then
        warn 'Red laser model is missing. Run bash scripts/setup.sh (it prepares it) before using red laser. Hand pointing and green laser will still work.'
    fi
    [ -n "$PUBLIC_HOST" ] || PUBLIC_HOST=$(get_lan_ip)
    if [ -n "$PUBLIC_HOST" ]; then
        set_env LAN_IP "$PUBLIC_HOST"
        info "LAN IP: $PUBLIC_HOST"
    else
        set_env LAN_IP ''
        warn 'No LAN connection found: only this computer can use the web app.'
    fi
    value=$(get_env WEB_PORT); [[ $value =~ ^[0-9]+$ ]] && web_port=$value
    value=$(get_env LAN_HTTPS_PORT); [[ $value =~ ^[0-9]+$ ]] && lan_port=$value
    select_ports "$web_port" "$lan_port"
    if [ "$WEB_PORT_SEL" != "$web_port" ] || [ "$LAN_PORT_SEL" != "$lan_port" ]; then
        warn "Ports $web_port/$lan_port are used by another program: using $WEB_PORT_SEL/$LAN_PORT_SEL"
    fi
    set_env WEB_PORT "$WEB_PORT_SEL"
    set_env LAN_HTTPS_PORT "$LAN_PORT_SEL"
    info "Ports: $WEB_PORT_SEL (this computer), $LAN_PORT_SEL (HTTPS for phones)"
    # Ảnh / video tải lên ở trang Tổng quan lưu thẳng vào thư mục này của máy host (mount vào container),
    # cùng thư mục mặc định với bản chạy không Docker (backend/core/config.py)
    upload_dir=$(get_env UPLOAD_HOST_DIR)
    [ -n "$upload_dir" ] || upload_dir="$USER_HOME/Documents/virtual_cam"
    make_dir "$upload_dir" || fail "Could not create $upload_dir"
    set_env UPLOAD_HOST_DIR "$upload_dir"
    info "Uploads: $upload_dir"

    step 'Choosing how to run YOLO: NVIDIA GPU or CPU'
    local mode=cpu torch_index=cpu driver_cuda gpu_name index
    if [ "$CPU" = 1 ]; then
        info 'CPU requested (--cpu)'
    elif [ -f /etc/nv_tegra_release ]; then
        # Jetson: wheel PyTorch của download.pytorch.org (dùng trong image) không có kernel cho GPU Jetson (Orin = sm_87)
        warn 'NVIDIA Jetson: the PyTorch builds this Docker image uses have no Jetson GPU support, so YOLO runs on the CPU. For the GPU, run without Docker: bash scripts/setup.sh, then bash scripts/run_web.sh --lan'
    else
        driver_cuda=$(get_driver_cuda)
        if [ -z "$driver_cuda" ]; then
            info 'No NVIDIA GPU with a working driver: YOLO will run on the CPU'
        else
            gpu_name=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1)
            info "NVIDIA GPU: $gpu_name (driver supports CUDA $driver_cuda)"
            index=$(get_torch_index "$driver_cuda" "$(get_env TORCH_INDEX)")
            if [ -z "$index" ]; then
                warn "This driver is too old for PyTorch (CUDA $driver_cuda): update the NVIDIA driver to use the GPU. Using the CPU."
            elif [ "$GPU" = 1 ]; then
                mode=gpu torch_index=$index
            else
                info 'Checking that Docker can use the GPU...'
                if test_docker_gpu; then
                    mode=gpu torch_index=$index
                else
                    warn 'Docker cannot use the GPU. Install the NVIDIA Container Toolkit (https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), run: sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker, then run this script again. Using the CPU for now.'
                fi
            fi
        fi
    fi
    if [ "$IMAGE_SIZE" = 0 ]; then
        if [ "$mode" = gpu ]; then IMAGE_SIZE=640; else IMAGE_SIZE=480; fi
    fi
    if [ "$mode" = cpu ] && ! compose_supports_reset; then
        fail "Docker Compose $(docker compose version --short 2>/dev/null) is too old for the CPU setup (2.24+ needed). Update it: https://docs.docker.com/compose/install/linux/"
    fi
    info "Mode: $mode (PyTorch $torch_index, YOLO image size $IMAGE_SIZE)"

    # Giữ trong .env để các lệnh `docker compose ...` gõ tay sau này build / chạy giống vậy
    set_env COMPOSE_PATH_SEPARATOR ','
    if [ "$mode" = gpu ]; then set_env COMPOSE_FILE "$COMPOSE_GPU"; else set_env COMPOSE_FILE "$COMPOSE_CPU"; fi
    set_env TORCH_INDEX "$torch_index"
    set_env IMAGE_SIZE "$IMAGE_SIZE"

    step 'Checking disk space and memory'
    local image_torch full_build=0 need_gb data_dir free_gb='' ram_mb
    image_torch=$(get_image_torch_index)
    [ "$image_torch" = "$torch_index" ] || full_build=1
    if [ "$full_build" = 0 ]; then
        need_gb=$NEED_UPDATE_GB
    elif [ "$mode" = gpu ]; then
        need_gb=$NEED_GPU_GB
    else
        need_gb=$NEED_CPU_GB
    fi
    data_dir=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)
    [ -z "$data_dir" ] || free_gb=$(get_free_gb "$data_dir")
    if [ "$full_build" = 1 ]; then
        info "Full build needed (PyTorch $torch_index is not in the current image): the first build downloads several GB and takes 15-30 minutes"
    else
        info 'PyTorch layer already built: only the code is rebuilt (a few minutes at most)'
    fi
    if [ -n "$free_gb" ]; then
        info "Docker data: $data_dir ($free_gb GB free, about $need_gb GB needed)"
        if [ "$FORCE" = 0 ] && awk -v free="$free_gb" -v need="$need_gb" 'BEGIN { exit !(free < need) }'; then
            fail "Not enough space for Docker in $data_dir: free at least $need_gb GB (a full disk corrupts Docker's data), then run again. Add --force to build anyway."
        fi
    fi
    ram_mb=$(get_available_ram_mb)
    if [ -n "$ram_mb" ]; then
        info "Free memory: $ram_mb MB"
        if [ "$full_build" = 1 ] && [ "$ram_mb" -lt 2000 ]; then
            warn 'Less than 2 GB of RAM is free: the big PyTorch build can fail or freeze the machine. Close heavy apps (browsers, other editors) first.'
            confirm_continue 'Build anyway?'
        fi
    fi

    step "Building the image ($mode)"
    local build_status
    docker compose build
    build_status=$?
    if [ "$build_status" != 0 ] && [ "$mode" = gpu ] && [ "$GPU" = 0 ]; then
        warn 'The GPU build failed (see above). Retrying with the CPU build.'
        confirm_continue 'Build the CPU version instead?'
        compose_supports_reset \
            || fail "Docker Compose $(docker compose version --short 2>/dev/null) is too old for the CPU setup (2.24+ needed). Update it: https://docs.docker.com/compose/install/linux/"
        mode=cpu torch_index=cpu
        [ "$IMAGE_SIZE" != 640 ] || IMAGE_SIZE=480
        set_env COMPOSE_FILE "$COMPOSE_CPU"
        set_env TORCH_INDEX cpu
        set_env IMAGE_SIZE "$IMAGE_SIZE"
        docker compose build
        build_status=$?
    fi
    [ "$build_status" = 0 ] || fail 'The build failed: see the messages above.'

    step 'Starting Virtual Cam'
    # --remove-orphans: xoá container của bố cục cũ (frontend / backend tách riêng)
    docker compose up -d --remove-orphans || fail "The container did not start. See: ${SUDO_PREFIX}docker compose logs"

    step 'Waiting for the detector to load the models'
    local status='' reply phase device model size error
    for ((i = 0; i < 60; i++)); do
        sleep 3
        if reply=$(read_status "$WEB_PORT_SEL"); then
            status=$reply
            [ "${status%%$'\x1f'*}" != starting ] && break
        fi
    done
    [ -n "$status" ] || fail "The web app does not answer. See: ${SUDO_PREFIX}docker compose logs"
    IFS=$'\x1f' read -r phase device model size error <<< "$status"
    [ "$phase" != error ] || fail "The detector could not start: $error. See: ${SUDO_PREFIX}docker compose logs"
    [ "$phase" = ready ] || warn 'The detector is still loading. Open the page in a moment.'
    if [ "$mode" = gpu ] && [ "$device" = CPU ]; then
        warn "The container started but PyTorch does not see the GPU, so YOLO runs on the CPU. See: ${SUDO_PREFIX}docker compose logs"
    fi

    # Image của bố cục cũ (frontend / backend tách riêng) và lớp mồ côi của project này
    local old
    for old in virtual_cam-backend virtual_cam-frontend; do
        if docker image inspect "$old" >/dev/null 2>&1; then docker image rm "$old" >/dev/null 2>&1; fi
    done
    docker image prune -f --filter "label=com.docker.compose.project=$PROJECT" >/dev/null 2>&1

    local local_url="http://localhost:$WEB_PORT_SEL"
    echo
    echo "${C_OK}Virtual Cam is running${C_END}"
    echo "  This computer : $local_url"
    if [ -n "$PUBLIC_HOST" ]; then
        echo "  Phones / LAN  : https://$PUBLIC_HOST:$LAN_PORT_SEL   (self-signed certificate: Advanced > Proceed)"
    fi
    echo "  Detector      : $device / $model / ${size}px"
    echo "  API docs      : $local_url/docs"
    echo
    echo "  Stop: ${SUDO_PREFIX}docker compose down    Logs: ${SUDO_PREFIX}docker compose logs -f   (run in the project root folder)"
    # Chỉ mở trình duyệt khi có màn hình và không chạy bằng root (trình duyệt của root không phải của người dùng)
    if [ "$NO_BROWSER" = 0 ] && [ "$(id -u)" != 0 ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] \
        && command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$local_url" >/dev/null 2>&1 &
    fi
}

# Chạy khi gọi trực tiếp; `source` chỉ nạp các hàm (để kiểm thử)
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
