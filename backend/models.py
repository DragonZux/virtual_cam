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


class ModelList(BaseModel):
    items: list[ModelInfo]
    max_bytes: int


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
