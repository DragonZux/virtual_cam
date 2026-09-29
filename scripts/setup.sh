#!/usr/bin/env bash
# Cài Virtual Cam trên Linux (giống scripts/setup.bat): tạo .cam, cài thư viện cho web backend và
# desktop/finger_select.py (PyTorch CUDA nếu có GPU NVIDIA), tải model vào models/, build giao diện.
#   bash scripts/setup.sh          tự chọn GPU / CPU
#   bash scripts/setup.sh --cpu    ép bản PyTorch CPU (không có GPU NVIDIA hoặc driver quá cũ)
set -euo pipefail

# Script nằm trong scripts/ — làm việc ở thư mục gốc dự án
cd "$(dirname "${BASH_SOURCE[0]}")/.."

VENV_PYTHON=".cam/bin/python"
TORCH_VERSION="2.14.0"
TORCHVISION_VERSION="0.29.0"
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
    TORCH_INDEX=cu130
    echo "NVIDIA GPU found: installing PyTorch with CUDA support..."
else
    echo "Installing the CPU build of PyTorch (YOLO runs on the CPU)..."
fi
"$VENV_PYTHON" -m pip install --upgrade "torch==$TORCH_VERSION+$TORCH_INDEX" "torchvision==$TORCHVISION_VERSION+$TORCH_INDEX" \
    --index-url "https://download.pytorch.org/whl/$TORCH_INDEX"
"$VENV_PYTHON" -m pip install -r requirements.txt
if [ "$TORCH_INDEX" != cpu ]; then
    "$VENV_PYTHON" -c "import torch; assert torch.cuda.is_available(); print('GPU:', torch.cuda.get_device_name(0))" \
        || fail "PyTorch cannot use the GPU. Update the NVIDIA driver (CUDA 13 needs driver 580+) or run: bash scripts/setup.sh --cpu"
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
