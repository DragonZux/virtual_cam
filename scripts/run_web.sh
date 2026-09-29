#!/usr/bin/env bash
# Virtual Cam web trên Linux (giống scripts/run_web.bat): API + giao diện trên http://localhost:8030
#   bash scripts/run_web.sh          chỉ máy này
#   bash scripts/run_web.sh --lan    thêm https://<IP LAN>:8031 cho điện thoại / máy khác (chứng chỉ tự ký)
set -euo pipefail

# Script nằm trong scripts/ — làm việc ở thư mục gốc dự án
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="$ROOT/.cam/bin/python"

if [ ! -x "$VENV_PYTHON" ]; then
    echo "[ERROR] Python environment not found. Run: bash scripts/setup.sh"
    exit 1
fi

if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
    echo "Building the web interface (first run)..."
    if ! command -v npm >/dev/null 2>&1; then
        echo "[ERROR] Node.js/npm not found. Install Node.js 20+ then run: bash scripts/setup.sh"
        exit 1
    fi
    cd "$ROOT/frontend"
    [ -d node_modules ] || npm ci --no-audit --no-fund
    npm run build
fi

# Chỉ mở trình duyệt khi có màn hình: máy chủ không giao diện có thể mở trình duyệt dạng text chiếm terminal
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    set -- --open "$@"
fi

cd "$ROOT/backend"
exec "$VENV_PYTHON" -X utf8 serve.py "$@"
