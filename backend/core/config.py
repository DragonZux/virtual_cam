from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
# Thư mục gốc dự án: models/ (model dùng chung với desktop/finger_select.py) và bản build frontend/dist
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Cấu hình đọc từ biến môi trường / file .env (xem .env.example)."""

    API_TITLE: str = "Virtual Cam API"
    API_VERSION: str = "1.0.0"
    LOG_LEVEL: str = "INFO"

    # serve.py: cổng web trên máy này và cổng HTTPS cho thiết bị khác trong mạng LAN (--lan)
    HOST: str = "127.0.0.1"
    PORT: int = 8030
    LAN_PORT: int = 8031
    # Chứng chỉ tự ký cho chế độ --lan (tự tạo, tự làm mới khi IP máy đổi)
    CERT_DIR: Path = BACKEND_DIR / "data" / "certs"
    # Địa chỉ cho thiết bị khác khi chạy sau proxy (Docker/nginx), cách nhau dấu phẩy; serve.py --lan tự điền
    PUBLIC_URLS: str = ""

    # Chỉ cần khi chạy frontend dev (vite) ở origin khác; bình thường vite proxy /api nên cùng origin
    CORS_ORIGINS: str = "http://localhost:5180,http://127.0.0.1:5180"

    # Model: YOLO segmentation (GPU nếu có CUDA) + MediaPipe Hand Landmarker (CPU)
    MODEL_DIR: Path = PROJECT_ROOT / "models"
    YOLO_MODEL: str = "yolo26m-seg.pt"  # cân bằng tốc độ / độ chính xác; n nhanh hơn, l (finger_select.py) chính xác hơn
    HAND_MODEL: str = "hand_landmarker.task"
    IMAGE_SIZE: int = Field(640, ge=32)
    DEVICE: str = "auto"  # auto = GPU 0 nếu có CUDA, ngược lại CPU; "cpu" để ép chạy CPU
    HAND_CONFIDENCE: float = Field(0.6, gt=0, le=1)
    # Model chuyên laser đỏ; ngưỡng độc lập với confidence của vật thể.
    LASER_MODEL: str = "laser-advr-yolov5l6.torchscript"
    LASER_IMAGE_SIZE: int = Field(1280, ge=64, le=1920, multiple_of=64)
    LASER_CONFIDENCE: float = Field(0.55, ge=0.05, le=0.95)

    # Mặc định nhận diện — mỗi trình duyệt tự chỉnh ở màn Cài đặt và gửi kèm từng khung hình
    DEFAULT_TARGETS: str = "laptop,mouse,keyboard"
    DEFAULT_CONFIDENCE: float = Field(0.80, ge=0.05, le=0.95)  # CONF của finger_select.py
    DEFAULT_TOLERANCE_PX: int = Field(30, ge=0, le=100)

    # Giới hạn khung hình trình duyệt gửi lên
    MAX_FRAME_BYTES: int = 2 * 1024 * 1024
    MAX_FRAME_SIDE: int = 1920
    # Một khung xử lý tại một thời điểm; trình duyệt khác chờ tối đa bấy nhiêu giây rồi nhận 429
    BUSY_WAIT_SECONDS: float = 0.5

    # Ảnh / video tải lên để thử nhận diện — mặc định Documentsirtual_cam của người chạy máy chủ.
    # Docker mount thư mục của máy host vào đây; UPLOAD_DIR_DISPLAY là đường dẫn phía host để hiện trên giao diện.
    UPLOAD_DIR: Path = Path.home() / "Documents" / "virtual_cam"
    UPLOAD_DIR_DISPLAY: str = ""
    MAX_UPLOAD_MB: int = Field(500, ge=1)

    # Mô hình YOLO (.pt) tải thêm ở Cài đặt — chạy cùng YOLO_MODEL, danh sách vật thể là hợp các mô hình đang bật.
    # Mặc định <UPLOAD_DIR>/models (Docker: nằm luôn trong thư mục Documents\virtual_cam của máy host).
    CUSTOM_MODEL_DIR: Path | None = None
    MAX_MODEL_MB: int = Field(500, ge=1)
    # Ai được tải / bật tắt / xoá mô hình. Nạp file .pt là chạy được mã tuỳ ý (pickle), nên mặc định chỉ
    # chính máy chạy máy chủ, qua cổng HTTP (localhost) — điện thoại / máy khác qua cổng HTTPS LAN chỉ xem.
    MODEL_ADMIN: Literal["local", "all", "off"] = "local"

    # Bản build React (npm run build) — backend phục vụ luôn để chạy một cổng; không có thì chỉ chạy API
    FRONTEND_DIST: Path = PROJECT_ROOT / "frontend" / "dist"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def public_urls(self) -> list[str]:
        return [u.strip() for u in self.PUBLIC_URLS.split(",") if u.strip()]

    @property
    def default_targets(self) -> list[str]:
        return [name.strip() for name in self.DEFAULT_TARGETS.split(",") if name.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_MB * 1024 * 1024

    @property
    def upload_dir_label(self) -> str:
        return self.UPLOAD_DIR_DISPLAY or str(self.UPLOAD_DIR)

    @property
    def custom_model_dir(self) -> Path:
        return self.CUSTOM_MODEL_DIR or self.UPLOAD_DIR / "models"

    @property
    def custom_model_dir_label(self) -> str:
        if self.CUSTOM_MODEL_DIR:
            return str(self.CUSTOM_MODEL_DIR)
        label = self.upload_dir_label.rstrip("\\/")
        return label + ("\\" if "\\" in label else "/") + "models"

    @property
    def max_model_bytes(self) -> int:
        return self.MAX_MODEL_MB * 1024 * 1024

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
