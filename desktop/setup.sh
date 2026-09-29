#!/usr/bin/env bash

set -e

# Script nằm trong desktop/ — luôn chạy tại thư mục gốc dự án (.cam và models/ ở đó)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

VENV_DIR=".cam"

MODEL_FILE="models/hand_landmarker.task"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

echo "======================================"
echo "      virtual_cam setup"
echo "======================================"

# --------------------------------------------------
# 1. Kiểm tra Python
# --------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
    echo "[ERROR] python3 not found."
    echo "Please install Python 3 first."
    exit 1
fi

echo "[OK] Python:"
python3 --version


# --------------------------------------------------
# 2. Tạo virtual environment
# --------------------------------------------------
if [ ! -d "$VENV_DIR" ]; then
    echo
    echo "[1/4] Creating virtual environment: $VENV_DIR"
    python3 -m venv "$VENV_DIR"
else
    echo
    echo "[1/4] Virtual environment already exists. Skipping."
fi


# --------------------------------------------------
# 3. Activate virtual environment
# --------------------------------------------------
echo
echo "[2/4] Activating virtual environment..."

source "$VENV_DIR/bin/activate"

echo "[OK] Python path:"
which python


# --------------------------------------------------
# 4. Cài Python dependencies
# --------------------------------------------------
echo
echo "[3/4] Installing Python dependencies..."

python -m pip install --upgrade pip setuptools wheel

if [ ! -f "requirements.txt" ]; then
    echo "[ERROR] requirements.txt not found."
    exit 1
fi

python -m pip install -r requirements.txt


# --------------------------------------------------
# 5. Download MediaPipe Hand Landmarker model
# --------------------------------------------------
echo
echo "[4/4] Checking MediaPipe Hand Landmarker model..."

mkdir -p models
if [ -f "$MODEL_FILE" ]; then
    echo "[OK] $MODEL_FILE already exists. Skipping download."
else
    echo "Downloading $MODEL_FILE..."

    if command -v wget >/dev/null 2>&1; then
        wget -O "$MODEL_FILE" "$MODEL_URL"

    elif command -v curl >/dev/null 2>&1; then
        curl -L "$MODEL_URL" -o "$MODEL_FILE"

    else
        echo "[ERROR] wget or curl is required to download the model."
        exit 1
    fi

    echo "[OK] Model downloaded."
fi


# --------------------------------------------------
# Done
# --------------------------------------------------
echo
echo "======================================"
echo "         Setup completed!"
echo "======================================"
echo
echo "Activate environment with:"
echo
echo "    source .cam/bin/activate"
echo
echo "Then run:"
echo
echo "    python desktop/finger_select.py"
echo