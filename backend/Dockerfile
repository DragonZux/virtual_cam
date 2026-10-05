# HICAS backend — API FastAPI + YOLO / laser / TensorRT trên GPU NVIDIA (PC x86_64). Không mở cổng ra ngoài:
# container frontend (nginx) chuyển /api sang đây trong mạng Docker.
# Build từ thư mục gốc (cần requirements.txt và docker/): docker-compose.yml đặt context ".", dockerfile backend/Dockerfile.
# Jetson Orin dùng backend/Dockerfile.jetson + docker-compose.jetson.yml (CUDA sm_87).
FROM python:3.11-slim
# Log ra ngay (không thì docker logs hiện trễ / sai thứ tự)
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

# models/ mount vào /models; chỉ HTTP 8030 trong mạng Docker (HTTPS do container frontend lo)
ENV MODEL_DIR=/models \
    HTTPS_PORT=0
EXPOSE 8030
# start-period dài: lần chạy đầu tải model và xuất model laser (vài phút)
HEALTHCHECK --interval=30s --timeout=5s --start-period=900s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8030/health', timeout=4)"
# init_models.py tải / xuất model còn thiếu vào /models rồi chạy serve.py với các tham số dưới đây
ENTRYPOINT ["python", "/app/init_models.py"]
CMD ["--host", "0.0.0.0"]
