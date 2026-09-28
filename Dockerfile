# Virtual Cam — một image: giao diện React (build sẵn) + API FastAPI + YOLO trên GPU NVIDIA.
# backend/serve.py phục vụ cả web lẫn API: HTTP :8030 (máy này) và HTTPS :8031 (điện thoại / máy khác trong LAN).

# ---- 1. Build giao diện React ----
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Backend Python + PyTorch CUDA ----
FROM python:3.11-slim

# Log ra ngay (không thì `docker logs` hiện trễ / sai thứ tự)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# OpenCV cần libgl1 + libglib; MediaPipe Tasks cần thêm libEGL / libGLESv2 (dù chạy CPU)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libegl1 libgles2 \
    && rm -rf /var/lib/apt/lists/*

# PyTorch CUDA cho GPU NVIDIA (cu128 chạy với driver ≥ 570). Lớp nặng, ít đổi đặt trước để sửa code build lại nhanh.
# Cache pip nằm ngoài image (cache mount): build hỏng giữa chừng thì lần sau không phải tải lại vài GB wheel CUDA.
ARG TORCH_INDEX=cu128
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --retries 10 --timeout 120 torch torchvision --index-url "https://download.pytorch.org/whl/${TORCH_INDEX}"

WORKDIR /app
COPY backend/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --retries 10 --timeout 60 -r requirements.txt

COPY backend/ .
COPY --from=web /web/dist /app/frontend/dist

# Model mount vào /models (xem docker-compose.yml); chứng chỉ HTTPS tự ký giữ trong volume /app/data/certs
ENV MODEL_DIR=/models \
    FRONTEND_DIST=/app/frontend/dist \
    CERT_DIR=/app/data/certs
EXPOSE 8030 8031
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8030/health', timeout=4)"
CMD ["python", "serve.py", "--host", "0.0.0.0", "--lan"]
