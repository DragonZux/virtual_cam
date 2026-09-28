"""Pydantic schemas (request/response) cho toàn bộ API."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class DetectorPhase(str, Enum):
    starting = "starting"
    ready = "ready"
    error = "error"


class PointerMode(str, Enum):
    hand = "hand"
    laser = "laser"


class LaserColor(str, Enum):
    red = "red"
    green = "green"


class LaserSpot(BaseModel):
    point: list[int] = Field(min_length=2, max_length=2, description="Tâm điểm laser [x, y] (pixel)")
    color: LaserColor
    score: float = Field(ge=0, le=1, description="Điểm xếp hạng màu/độ sáng, không phải xác suất")


class DetectionDefaults(BaseModel):
    """Mặc định của máy chủ; trình duyệt chưa chỉnh gì ở Cài đặt thì dùng các giá trị này."""

    targets: list[str]
    confidence: float
    tolerance: int


class StatusOut(BaseModel):
    phase: DetectorPhase
    error: str | None = Field(None, description="Lý do bộ nhận diện không khởi động được")
    device: str | None = Field(None, description="GPU / CPU đang chạy YOLO")
    model: str
    image_size: int
    classes: list[str] = Field(default_factory=list, description="Lớp chọn làm mục tiêu được (không có 'person')")
    defaults: DetectionDefaults
    share_urls: list[str] = Field(default_factory=list, description="Địa chỉ HTTPS cho thiết bị khác (serve.py --lan)")


class Point(BaseModel):
    x: float
    y: float


class FrameSize(BaseModel):
    width: int
    height: int


class Detection(BaseModel):
    name: str
    confidence: float
    box: list[float] = Field(min_length=4, max_length=4, description="x1, y1, x2, y2 (pixel của khung gửi lên)")


class SelectedObject(BaseModel):
    index: int = Field(description="Vị trí vật thể trong `detections`")
    name: str
    confidence: float
    polygon: list[list[float]] = Field(description="Viền mask [[x, y], ...] (pixel)")


class FrameResult(BaseModel):
    pointer_mode: PointerMode = PointerMode.hand
    laser: LaserSpot | None = None
    hand_detected: bool
    landmarks: list[Point] = Field(description="21 điểm bàn tay MediaPipe, toạ độ chuẩn hoá 0..1")
    tip: list[int] | None = Field(None, description="Đầu ngón trỏ [x, y] (pixel)")
    selected: SelectedObject | None = None
    detections: list[Detection]
    processing_ms: int
    resolution: FrameSize


class MediaKind(str, Enum):
    image = "image"
    video = "video"


class MediaItem(BaseModel):
    """Một ảnh / video đã tải lên thư mục UPLOAD_DIR."""

    name: str = Field(description="Tên file trong thư mục lưu (dùng cho GET /media/{name})")
    kind: MediaKind
    size: int = Field(description="Dung lượng (byte)")
    modified: int = Field(description="Thời điểm lưu (epoch ms)")


class MediaList(BaseModel):
    folder: str = Field(description="Thư mục lưu trên máy chủ (đường dẫn phía host khi chạy Docker)")
    max_bytes: int = Field(description="Dung lượng tối đa mỗi file")
    items: list[MediaItem]
