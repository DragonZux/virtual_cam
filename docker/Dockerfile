# Virtual Cam cho NVIDIA Jetson (JetPack 6) — một image: giao diện React (build sẵn) + API FastAPI + YOLO trên GPU Jetson.
# Build context là thư mục gốc (docker-compose.yml: context ..); loại trừ file ở docker/Dockerfile.dockerignore.
# backend/serve.py phục vụ cả web lẫn API: HTTP :8030 (máy này) và HTTPS :8031 (điện thoại / máy khác trong LAN).

# ---- 1. Build giao diện React ----
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Backend Python ----
# Image này đã có sẵn PyTorch + torchvision + ultralytics build cho GPU Jetson: KHÔNG pip cài torch lại
# (torch trên PyPI cho ARM là bản CPU, sẽ đè mất GPU).
FROM ultralytics/ultralytics:8.4.166-jetson-jetpack6

# Log ra ngay (không thì `docker logs` hiện trễ / sai thứ tự)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# OpenCV cần libgl1 + libglib; MediaPipe Tasks cần thêm libEGL / libGLESv2
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libegl1 libgles2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# Bỏ dòng ultralytics (image đã có) và khoá torch / torchvision theo bản có sẵn để pip không thay bằng bản CPU.
# Cache pip nằm ngoài image (cache mount): build hỏng giữa chừng thì lần sau không phải tải lại.
RUN --mount=type=cache,target=/root/.cache/pip \
    grep -viE '^\s*ultralytics' requirements.txt > /tmp/requirements.txt \
    && pip freeze 2>/dev/null | grep -iE '^(torch|torchvision)==' > /tmp/constraints.txt \
    && cat /tmp/constraints.txt \
    && pip install --retries 10 --timeout 60 -r /tmp/requirements.txt -c /tmp/constraints.txt

COPY backend/ .
COPY docker/init_models.py /app/init_models.py
COPY scripts/prepare_laser_model.py /app/scripts/prepare_laser_model.py
COPY --from=web /web/dist /app/frontend/dist

# Thư mục models/ của máy host mount vào /models (xem docker-compose.yml); chứng chỉ HTTPS tự ký giữ trong volume /app/data/certs
ENV MODEL_DIR=/models \
    FRONTEND_DIST=/app/frontend/dist \
    CERT_DIR=/app/data/certs
EXPOSE 8030 8031
# start-period dài: lần chạy đầu tải model và xuất model laser (vài phút)
HEALTHCHECK --interval=30s --timeout=5s --start-period=900s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8030/health', timeout=4)"
# init_models.py tải / xuất model còn thiếu vào /models rồi chạy serve.py với các tham số dưới đây
ENTRYPOINT ["python", "/app/init_models.py"]
CMD ["--host", "0.0.0.0", "--lan"]
