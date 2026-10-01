from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
# Thư mục gốc dự án: models/ và bản build frontend/dist
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Cấu hình đọc từ biến môi trường / file .env (xem .env.example)."""

    API_TITLE: str = "Virtual Cam API"
    API_VERSION: str = "1.0.0"
    LOG_LEVEL: str = "INFO"

    # serve.py: cổng HTTP (localhost mở được camera) — chạy trực tiếp mặc định chỉ cho chính máy này
    HOST: str = "127.0.0.1"
    PORT: int = 8030
    # Cổng HTTPS tự ký cho máy khác trong mạng (camera cần HTTPS khi không phải localhost); 0 = tắt
    HTTPS_PORT: int = Field(0, ge=0, le=65535)
    CERT_DIR: Path = BACKEND_DIR / "data" / "certs"
    # IP / tên máy thêm vào chứng chỉ, cách nhau dấu phẩy (không bắt buộc: chứng chỉ tự ký vẫn phải bấm "Tiếp tục")
    CERT_HOSTS: str = ""

    # Chỉ cần khi chạy frontend dev (vite) ở origin khác; bình thường vite proxy /api nên cùng origin
    CORS_ORIGINS: str = "http://localhost:5180,http://127.0.0.1:5180"

    # Model: YOLO segmentation (GPU nếu có CUDA) + MediaPipe Hand Landmarker (CPU)
    MODEL_DIR: Path = PROJECT_ROOT / "models"
    YOLO_MODEL: str = "yolo26m-seg.pt"  # cân bằng tốc độ / độ chính xác; n nhanh hơn, l chính xác hơn
    HAND_MODEL: str = "hand_landmarker.task"
    IMAGE_SIZE: int = Field(640, ge=32)
    DEVICE: str = "auto"  # auto = GPU 0 nếu có CUDA, ngược lại CPU; "cpu" để ép chạy CPU
    HAND_CONFIDENCE: float = Field(0.6, gt=0, le=1)
    # Model chuyên laser đỏ; ngưỡng độc lập với confidence của vật thể.
    LASER_MODEL: str = "laser-advr-yolov5l6.torchscript"
    LASER_IMAGE_SIZE: int = Field(1280, ge=64, le=1920, multiple_of=64)
    LASER_CONFIDENCE: float = Field(0.55, ge=0.05, le=0.95)
    # Bám gần vị trí khung trước ở cùng tỉ lệ pixel; mất dấu thì quét toàn ảnh. 0 = luôn quét toàn ảnh.
    LASER_CROP_SIZE: int = Field(384, ge=0, le=1920, multiple_of=64)

    # Mặc định nhận diện — client gửi targets / conf / tolerance kèm từng khung để đổi
    DEFAULT_TARGETS: str = "laptop,mouse,keyboard"
    DEFAULT_CONFIDENCE: float = Field(0.80, ge=0.05, le=0.95)
    DEFAULT_TOLERANCE_PX: int = Field(30, ge=0, le=100)

    # Giới hạn khung hình client gửi lên
    MAX_FRAME_BYTES: int = 2 * 1024 * 1024
    MAX_FRAME_SIDE: int = 1920
    # Một khung xử lý tại một thời điểm; request khác chờ tối đa bấy nhiêu giây rồi nhận 429
    BUSY_WAIT_SECONDS: float = 0.5
    MAX_MODEL_MB: int = Field(1024, ge=1, le=8192)

    # Bản build React (npm run build) — backend phục vụ luôn để chạy một cổng; không có thì chỉ chạy API
    FRONTEND_DIST: Path = PROJECT_ROOT / "frontend" / "dist"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def cert_hosts(self) -> list[str]:
        return [h.strip() for h in self.CERT_HOSTS.split(",") if h.strip()]

    @property
    def default_targets(self) -> list[str]:
        return [name.strip() for name in self.DEFAULT_TARGETS.split(",") if name.strip()]

    @property
    def yolo_model_path(self) -> Path:
        return self.MODEL_DIR / self.YOLO_MODEL

    @property
    def hand_model_path(self) -> Path:
        return self.MODEL_DIR / self.HAND_MODEL

    @property
    def laser_model_path(self) -> Path:
        return self.MODEL_DIR / self.LASER_MODEL


settings = Settings()
