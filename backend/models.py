"""Pydantic schemas (request/response) cho toàn bộ API."""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class DetectorPhase(str, Enum):
    starting = "starting"
    ready = "ready"
    error = "error"


class PointerMode(str, Enum):
    hand = "hand"
    laser = "laser"


class LaserSpot(BaseModel):
    point: list[int] = Field(min_length=2, max_length=2, description="Tâm chấm laser đỏ [x, y] (pixel)")
    score: float = Field(ge=0, le=1, description="Confidence của model laser đỏ, không phải xác suất hiệu chuẩn")


class DetectionDefaults(BaseModel):
    """Mặc định của máy chủ; request không gửi targets / conf / tolerance thì dùng các giá trị này."""

    targets: list[str]
    confidence: float
    tolerance: int


class StatusOut(BaseModel):
    phase: DetectorPhase
    error: str | None = Field(None, description="Lý do bộ nhận diện không khởi động được")
    device: str | None = Field(None, description="GPU / CPU đang chạy YOLO")
    model: str
    image_size: int
    laser_model: str | None = None
    laser_error: str | None = None
    model_revision: int = 0
    model_busy: bool = False
    classes: list[str] = Field(default_factory=list, description="Lớp chọn làm mục tiêu được (không có 'person')")
    defaults: DetectionDefaults


class Point(BaseModel):
    x: float
    y: float


class ModelInfo(BaseModel):
    id: str
    name: str
    kind: str
    size_bytes: int
    active: bool
    available: bool
    convertible: bool = Field(False, description="Chuyển được sang TensorRT (.pt / .torchscript)")


class ConversionInfo(BaseModel):
    """Một lượt chuyển mô hình sang TensorRT FP16; xong thì engine được chọn chạy luôn."""
    id: str
    source: str = Field(description="id mô hình gốc")
    name: str
    kind: str
    status: Literal["queued", "running", "done", "error"]
    error: str | None = None
    engine: str | None = Field(None, description="id engine đã tạo")
    created_at: float
    finished_at: float | None = None


class ModelList(BaseModel):
    items: list[ModelInfo]
    max_bytes: int
    conversions: list[ConversionInfo] = Field(default_factory=list, description="Mới nhất trước")
    convert_available: bool = False
    convert_reason: str | None = Field(None, description="Lý do chưa chuyển được sang TensorRT trên máy này")


class ModelSelection(BaseModel):
    id: str = Field(min_length=1, max_length=255)


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


class SelectionSummary(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)


class SelectionUpdate(BaseModel):
    """Confirmed frontend selection, after dwell and laser stabilization."""
    selected: SelectionSummary | None
    pointer_mode: PointerMode
    source: Literal["camera", "media"] = "camera"


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


class StreamOpen(BaseModel):
    url: str = Field(min_length=8, max_length=1000, description="rtsp://máy:cổng/đường_dẫn (MediaMTX, camera IP)")


class StreamOut(BaseModel):
    id: str = Field(description="Phiên đọc luồng; lấy khung ở GET /camera/streams/{id}/frame")
    width: int
    height: int


class TcpTargetIn(BaseModel):
    """Máy đích nhận vật thể đang chọn qua TCP (mỗi bản tin một dòng JSON)."""
    host: str = Field(min_length=1, max_length=253, pattern=r"^[A-Za-z0-9._:-]+$", description="IP hoặc tên máy, không kèm giao thức")
    port: int = Field(ge=1, le=65535)
    enabled: bool = True


class TcpTargetsIn(BaseModel):
    targets: list[TcpTargetIn] = Field(max_length=8)


class TcpTargetOut(TcpTargetIn):
    id: str
    status: Literal["off", "connecting", "connected", "error"]
    error: str | None = None
    sent: int = Field(0, description="Số bản tin đã gửi từ khi máy chủ khởi động")
    last_sent: int | None = Field(None, description="Lần gửi gần nhất, Unix milliseconds")


class SocketConfig(BaseModel):
    websocket_path: str = Field(description="WebSocket để app khác kết nối vào nhận vật thể đang chọn")
    tcp: list[TcpTargetOut]
