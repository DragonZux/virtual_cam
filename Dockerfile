# Virtual Cam — một image: giao diện React (build sẵn) + API FastAPI + YOLO trên GPU NVIDIA (PC x86_64).
# Chạy ở thư mục gốc: docker compose up -d --build   (xem docker-compose.yml)
# backend/serve.py phục vụ cả web lẫn API trên cổng HTTP :8030; compose chỉ mở cổng này cho chính máy host.

# ---- 1. Build giao diện React ----
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Backend Python + PyTorch CUDA ----
FROM python:3.11-slim
# FROM ultralytics/ultralytics:8.4.166-jetson-jetpack6
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
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --retries 10 --timeout 60 -r requirements.txt

COPY backend/ .
COPY docker/init_models.py /app/init_models.py
COPY docker/prepare_laser_model.py /app/scripts/prepare_laser_model.py
COPY --from=web /web/dist /app/frontend/dist

# Thư mục models/ mount vào /models (xem docker-compose.yml)
ENV MODEL_DIR=/models \
    FRONTEND_DIST=/app/frontend/dist
EXPOSE 8030
# start-period dài: lần chạy đầu tải model và xuất model laser (vài phút)
HEALTHCHECK --interval=30s --timeout=5s --start-period=900s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8030/health', timeout=4)"
# init_models.py tải / xuất model còn thiếu vào /models rồi chạy serve.py với các tham số dưới đây
ENTRYPOINT ["python", "/app/init_models.py"]
CMD ["--host", "0.0.0.0"]
