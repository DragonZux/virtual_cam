#!/usr/bin/env bash
# Cài Virtual Cam trên Linux (giống scripts/setup.bat): tạo .cam, cài thư viện cho web backend và
# desktop/finger_select.py (PyTorch CUDA nếu có GPU NVIDIA), tải model vào models/, build giao diện.
#   bash scripts/setup.sh          tự chọn PyTorch: CUDA 13.0 / CUDA 12.6 theo driver NVIDIA, bản cho Jetson
#                                  trên Jetson (JetPack 6.1+), còn lại CPU
#   bash scripts/setup.sh --cpu    ép bản PyTorch CPU (không có GPU NVIDIA hoặc driver quá cũ)
set -euo pipefail

# Script nằm trong scripts/ — làm việc ở thư mục gốc dự án
cd "$(dirname "${BASH_SOURCE[0]}")/.."

VENV_PYTHON=".cam/bin/python"
TORCH_VERSION="2.14.0"
TORCHVISION_VERSION="0.29.0"
# Jetson (JetPack 6.1+, CUDA 12.6, Python 3.10): wheel của download.pytorch.org không có kernel cho GPU Jetson
# (Orin = sm_87), nên dùng bản NVIDIA build cho Jetson (pypi.jetson-ai-lab.io); Ultralytics lưu đúng các file đó
# (cùng sha256) trên GitHub. torch Jetson 2.9+ cần cuDSS, JetPack 6 chưa cài sẵn.
JETSON_WHEEL_URL="https://github.com/ultralytics/assets/releases/download/v0.0.0"
JETSON_TORCH="torch-2.10.0-cp310-cp310-linux_aarch64.whl#sha256=37d7e156cfb4a646c4d7347597727db1529d184108f703324dfff1842cec094e"
JETSON_TORCHVISION="torchvision-0.25.0-cp310-cp310-linux_aarch64.whl#sha256=1b6357c5532db61e9bfe7ad69f73ba73e8214010de021da703d360d2cc16c3d7"
CUDSS_VERSION="0.7.1"
HAND_MODEL_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
# Bản phát hành Ultralytics chứa trọng số YOLO26 (giống scripts/start.ps1)
YOLO_RELEASE_URL="https://github.com/ultralytics/assets/releases/download/v8.4.0"
YOLO_MODEL="${YOLO_MODEL:-yolo26m-seg.pt}"

FORCE_CPU=0
for arg in "$@"; do
    case "$arg" in
        --cpu) FORCE_CPU=1 ;;
        *) echo "Usage: bash scripts/setup.sh [--cpu]"; exit 2 ;;
    esac
done

fail() {
    echo
    echo "[ERROR] $*"
    exit 1
}

download() {
    # Tải vào file tạm rồi đổi tên: lỗi giữa chừng không để lại model hỏng
    "$VENV_PYTHON" -c 'import os, sys, urllib.request; tmp = sys.argv[2] + ".download"; urllib.request.urlretrieve(sys.argv[1], tmp); os.replace(tmp, sys.argv[2])' "$1" "$2"
}

fetch_model() {
    if [ -f "models/$1" ]; then
        echo "[OK] models/$1 already exists. Skipping download."
    else
        echo "Downloading models/$1..."
        download "$2" "models/$1" || fail "Could not download $1."
        echo "[OK] models/$1 downloaded."
    fi
}

echo "======================================"
echo "      virtual_cam Linux setup"
echo "======================================"

echo
echo "[1/5] Preparing virtual environment..."
if [ ! -x "$VENV_PYTHON" ]; then
    if [ -e .cam ]; then
        fail ".cam exists but has no Linux Python environment (created on Windows?). Rename .cam and run this script again."
    fi
    command -v python3 >/dev/null 2>&1 || fail "python3 not found. Install Python 3 (Ubuntu/Debian: sudo apt install python3 python3-venv)."
    python3 -m venv .cam || { rm -rf .cam; fail "Could not create .cam. Ubuntu/Debian: sudo apt install python3-venv"; }
fi

echo
echo "[2/5] Checking environment Python..."
"$VENV_PYTHON" --version

echo
echo "[3/5] Installing Python dependencies (web backend + desktop app)..."
"$VENV_PYTHON" -m pip install --upgrade pip setuptools wheel
# PyTorch cài trước để requirements.txt không kéo thêm bản mặc định (vài GB thư viện CUDA)
TORCH_INDEX=cpu
if [ "$FORCE_CPU" = 0 ] && command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
    # Bản CUDA của PyTorch phải khớp driver: nvidia-smi in "CUDA Version: 12.6" = CUDA cao nhất driver chạy được.
    # torch 2.14.0 chỉ có cu130 (driver 580+) và cu126 (driver 560+), không có cu128.
    cuda_re='CUDA (UMD )?Version: +([0-9]+)\.([0-9]+)'
    driver_cuda=0
    if [[ "$(nvidia-smi 2>/dev/null)" =~ $cuda_re ]]; then
        driver_cuda=$(( 10#${BASH_REMATCH[2]} * 100 + 10#${BASH_REMATCH[3]} ))
    fi
    if [ -f /etc/nv_tegra_release ]; then
        if [ "$driver_cuda" -ge 1206 ]; then
            TORCH_INDEX=jetson
        else
            echo "[WARN] PyTorch for the Jetson GPU needs JetPack 6.1+ (CUDA 12.6): using the CPU build. Update JetPack to use the GPU."
        fi
    elif [ "$driver_cuda" -ge 1300 ]; then
        TORCH_INDEX=cu130
    elif [ "$driver_cuda" -ge 1206 ]; then
        TORCH_INDEX=cu126
    else
        echo "[WARN] NVIDIA driver too old for PyTorch (needs CUDA 12.6+, i.e. driver 560+): using the CPU build. Update the driver to use the GPU."
    fi
fi
if [ "$TORCH_INDEX" = jetson ]; then
    echo "NVIDIA Jetson found: installing PyTorch built for Jetson (GPU)..."
    "$VENV_PYTHON" -c 'import sys; sys.exit(sys.version_info[:2] != (3, 10))' \
        || fail "PyTorch for Jetson needs Python 3.10 (JetPack 6). Recreate .cam with python3.10, or run: bash scripts/setup.sh --cpu"
    # Thư viện hệ thống torch Jetson cần mà JetPack không cài sẵn: báo đủ lệnh cài trước khi đụng vào .cam
    ld_cache=$(ldconfig -p 2>/dev/null || /sbin/ldconfig -p 2>/dev/null || true)
    missing_libs=()
    [[ $ld_cache == *$'\t'"libopenblas.so.0 ("* ]] || missing_libs+=(openblas)
    [[ $ld_cache == *$'\t'"libcudss.so.0 ("* ]] || missing_libs+=(cudss)
    if [ ${#missing_libs[@]} -gt 0 ]; then
        echo
        echo "[ERROR] PyTorch for Jetson needs system libraries that are missing (${missing_libs[*]}). Install them, then run this script again:"
        if [[ " ${missing_libs[*]} " == *" openblas "* ]]; then
            echo "    sudo apt-get install -y libopenblas-dev"
        fi
        if [[ " ${missing_libs[*]} " == *" cudss "* ]]; then
            cudss_repo="cudss-local-tegra-repo-ubuntu2204-$CUDSS_VERSION"
            echo "    wget https://developer.download.nvidia.com/compute/cudss/$CUDSS_VERSION/local_installers/${cudss_repo}_$CUDSS_VERSION-1_arm64.deb"
            echo "    sudo dpkg -i ${cudss_repo}_$CUDSS_VERSION-1_arm64.deb"
            echo "    sudo cp /var/$cudss_repo/cudss-*-keyring.gpg /usr/share/keyrings/"
            echo "    sudo apt-get update && sudo apt-get install -y cudss"
        fi
        exit 1
    fi
    # Thư viện CUDA dạng pip (bản cho máy chủ ARM, không chạy trên GPU Jetson) còn từ bản torch cài trước:
    # torch nạp các gói nvidia-* trong .cam trước thư viện của JetPack, nên phải gỡ
    stale=$("$VENV_PYTHON" -m pip list --format=freeze 2>/dev/null | sed 's/==.*//' \
        | grep -Ei '^(nvidia[-_]|cuda[-_]toolkit$)' | grep -Eiv '^nvidia[-_]ml[-_]py$' || true)
    if [ -n "$stale" ]; then
        echo "Removing pip CUDA libraries that do not run on Jetson..."
        # shellcheck disable=SC2086  # mỗi dòng là một tên gói
        "$VENV_PYTHON" -m pip uninstall -y $stale
    fi
    "$VENV_PYTHON" -m pip install "$JETSON_WHEEL_URL/$JETSON_TORCH" "$JETSON_WHEEL_URL/$JETSON_TORCHVISION"
else
    if [ "$TORCH_INDEX" = cpu ]; then
        echo "Installing the CPU build of PyTorch (YOLO runs on the CPU)..."
    else
        echo "NVIDIA GPU found: installing PyTorch with CUDA support ($TORCH_INDEX)..."
    fi
    "$VENV_PYTHON" -m pip install --upgrade "torch==$TORCH_VERSION+$TORCH_INDEX" "torchvision==$TORCHVISION_VERSION+$TORCH_INDEX" \
        --index-url "https://download.pytorch.org/whl/$TORCH_INDEX"
fi
"$VENV_PYTHON" -m pip install -r requirements.txt
if [ "$TORCH_INDEX" != cpu ]; then
    if [ "$TORCH_INDEX" = jetson ]; then
        gpu_hint="Check that JetPack is fully installed (sudo apt install nvidia-jetpack)"
    else
        gpu_hint="Update the NVIDIA driver (580+ for CUDA 13)"
    fi
    # Chạy thử một kernel: is_available() = True chưa đủ nếu bản PyTorch không có kernel cho GPU này
    # (vd. Jetson Orin với wheel cu126 của download.pytorch.org)
    "$VENV_PYTHON" -c "import torch; assert torch.cuda.is_available(); print('GPU:', torch.cuda.get_device_name(0)); torch.ones(1, device='cuda').sum().item()" \
        || fail "PyTorch cannot use the GPU. $gpu_hint or run: bash scripts/setup.sh --cpu"
fi
# OpenCV / MediaPipe cần thư viện đồ hoạ của hệ thống (máy chủ tối giản thường thiếu)
"$VENV_PYTHON" -c "import cv2, mediapipe" \
    || fail "OpenCV/MediaPipe cannot load. Ubuntu/Debian: sudo apt install libgl1 libglib2.0-0 libegl1 libgles2"

echo
echo "[4/5] Checking models..."
mkdir -p models
fetch_model hand_landmarker.task "$HAND_MODEL_URL"
fetch_model "$YOLO_MODEL" "$YOLO_RELEASE_URL/$YOLO_MODEL"
echo "Preparing the trained red laser model..."
"$VENV_PYTHON" scripts/prepare_laser_model.py || fail "Could not prepare the red laser model."

echo
echo "[5/5] Building the web interface..."
if command -v npm >/dev/null 2>&1; then
    (cd frontend && npm ci --no-audit --no-fund && npm run build) || fail "Building the web interface failed."
else
    echo "[WARN] Node.js/npm not found - skipped. Install Node.js 20+ and run this script again for the web app."
fi

echo
echo "Setup completed!"
echo "Run the web app with:"
echo "    bash scripts/run_web.sh            (http://localhost:8030)"
echo "    bash scripts/run_web.sh --lan      (also https://<LAN IP>:8031 for phones)"
echo
echo "Desktop window version (camera /dev/video3 - edit CAMERA at the top of desktop/finger_select.py):"
echo "    .cam/bin/python desktop/finger_select.py"
