"""Bộ nhận diện dùng chung cho mọi trình duyệt: YOLO segmentation (GPU nếu có) + MediaPipe Hand Landmarker (CPU).

- Model nạp ở luồng nền để web mở ngay; giao diện hiện "Đang khởi động" tới khi sẵn sàng.
- MediaPipe chạy chế độ IMAGE nên không mang trạng thái bám tay từ người dùng này sang người khác.
- Mỗi lúc chỉ xử lý một khung (`lock`); trình duyệt khác chờ tối đa BUSY_WAIT_SECONDS rồi nhận 429.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass
from io import BytesIO
import threading
import time
from typing import Any

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from core.config import Settings
from core.logging import logger
from models import Detection, DetectionDefaults, DetectorPhase, FrameResult, FrameSize, Point, SelectedObject, PointerMode, LaserColor, LaserSpot
from services.laser import detect_laser
from services.pointing import index_tip, object_at_point, object_at_laser

# Chỉ vào "person" luôn trúng chính bàn tay người đang chỉ, nên lớp này không bao giờ là mục tiêu
EXCLUDED_CLASSES = {"person"}


class DetectorBusy(Exception):
    """Đang xử lý khung của trình duyệt khác lâu hơn BUSY_WAIT_SECONDS."""


@dataclass(frozen=True)
class FrameOptions:
    """Cài đặt riêng của trình duyệt, đã kiểm tra hợp lệ."""

    class_ids: list[int]
    confidence: float
    tolerance: int
    pointer_mode: PointerMode = PointerMode.hand
    laser_color: LaserColor = LaserColor.red
    laser_brightness: int = 200


@dataclass
class ModelOutput:
    """Kết quả thô của hai model cho một khung (tách riêng để test không cần GPU / file model)."""

    landmarks: list[Any] | None  # 21 điểm MediaPipe (x, y chuẩn hoá) hoặc None khi không thấy tay
    detections: list[Detection]
    polygons: list[np.ndarray]  # viền mask từng detection (pixel), cùng thứ tự với detections
    laser: LaserSpot | None = None


def decode_jpeg(payload: bytes, max_side: int) -> np.ndarray:
    """Đọc header bằng Pillow (chặn dữ liệu không phải JPEG / kích thước bất thường) rồi mới giải mã bằng OpenCV."""
    try:
        with Image.open(BytesIO(payload)) as image:
            if image.format != "JPEG":
                raise ValueError("Chỉ nhận ảnh JPEG.")
            width, height = image.size
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Dữ liệu ảnh không hợp lệ.") from exc
    if min(width, height) < 16 or max(width, height) > max_side:
        raise ValueError(f"Ảnh JPEG phải có kích thước từ 16 đến {max_side} pixel.")
    frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Không đọc được hình ảnh.")
    return frame


class Detector:
    def __init__(self, cfg: Settings):
        self.cfg = cfg
        self.lock = threading.Lock()
        self.ready = threading.Event()
        self.error: str | None = None
        self.device_name: str | None = None
        self.classes: dict[str, int] = {}
        self.default_targets: list[str] = []
        self._model: Any = None
        self._hands: Any = None
        self._mp: Any = None
        self._gpu = False
        self._loader: threading.Thread | None = None
        # Bàn tay chạy CPU song song với YOLO trên GPU: giảm ~35% độ trễ mỗi khung so với chạy lần lượt
        self._hand_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="hand")

    @property
    def phase(self) -> DetectorPhase:
        if self.error:
            return DetectorPhase.error
        return DetectorPhase.ready if self.ready.is_set() else DetectorPhase.starting

    def start(self) -> None:
        self._loader = threading.Thread(target=self._load, name="model-loader", daemon=True)
        self._loader.start()

    def _load(self) -> None:
        try:
            # Import nặng (torch, ultralytics, mediapipe) để trong luồng nền cho server lên ngay
            import mediapipe as mp
            import torch
            from ultralytics import YOLO

            hand_path = self.cfg.hand_model_path
            if not hand_path.is_file():
                raise RuntimeError(f"Thiếu model bàn tay {hand_path.name}. Hãy chạy setup.bat rồi mở lại web.")
            self._gpu = self.cfg.DEVICE.lower() != "cpu" and torch.cuda.is_available()
            if self.cfg.DEVICE.lower() not in ("auto", "cpu") and not self._gpu:
                logger.warning("DEVICE=%s but CUDA is unavailable - running YOLO on CPU", self.cfg.DEVICE)
            self.device_name = torch.cuda.get_device_name(0) if self._gpu else "CPU"

            # Tên model chuẩn (yolo26n-seg.pt…) chưa có file thì ultralytics tự tải về MODEL_DIR
            model = YOLO(str(self.cfg.yolo_model_path))
            self._set_classes(model.names)
            options = mp.tasks.vision.HandLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(hand_path)),
                running_mode=mp.tasks.vision.RunningMode.IMAGE,
                num_hands=1,
                min_hand_detection_confidence=self.cfg.HAND_CONFIDENCE,
                min_hand_presence_confidence=self.cfg.HAND_CONFIDENCE,
            )
            self._hands = mp.tasks.vision.HandLandmarker.create_from_options(options)
            self._mp = mp
            self._model = model
            # Chạy thử các cỡ khung hay gặp (webcam 4:3 / 16:9, điện thoại dọc): mỗi cỡ mới lần đầu mất vài giây
            # để GPU chọn kernel — làm sẵn ở đây thì khung đầu tiên của người dùng không bị đứng hình
            warmup = FrameOptions(list(self.classes.values()), self.cfg.DEFAULT_CONFIDENCE, 0)
            for height, width in ((480, 640), (360, 640), (640, 480), (640, 360)):
                self._run_models(np.zeros((height, width, 3), dtype=np.uint8), warmup)
            self.ready.set()
            logger.info("Detector ready: %s / %s / imgsz %d", self.device_name, self.cfg.YOLO_MODEL, self.cfg.IMAGE_SIZE)
        except Exception as exc:
            self.error = str(exc) or type(exc).__name__
            logger.exception("Detector initialization failed")

    def _set_classes(self, names: dict[int, str]) -> None:
        self.classes = {name: class_id for class_id, name in names.items() if name not in EXCLUDED_CLASSES}
        self.default_targets = [name for name in self.cfg.default_targets if name in self.classes]
        if not self.default_targets:
            raise RuntimeError("Model không có lớp nào trong DEFAULT_TARGETS: " + ", ".join(self.cfg.default_targets))

    def status(self) -> dict[str, Any]:
        ready = self.ready.is_set()
        return {
            "phase": self.phase,
            "error": self.error,
            "device": self.device_name,
            "model": self.cfg.YOLO_MODEL,
            "image_size": self.cfg.IMAGE_SIZE,
            "classes": list(self.classes) if ready else [],
            "defaults": DetectionDefaults(
                targets=self.default_targets or self.cfg.default_targets,
                confidence=self.cfg.DEFAULT_CONFIDENCE,
                tolerance=self.cfg.DEFAULT_TOLERANCE_PX,
            ),
        }

    def options(self, targets: str | None, confidence: float | None, tolerance: int | None,
                pointer_mode: PointerMode = PointerMode.hand, laser_color: LaserColor = LaserColor.red,
                laser_brightness: int = 200) -> FrameOptions:
        """Kiểm tra cài đặt trình duyệt gửi kèm khung hình; bỏ trống = mặc định máy chủ."""
        names = list(dict.fromkeys(n.strip() for n in targets.split(",") if n.strip())) if targets else self.default_targets
        if not names:
            raise ValueError("Cần chọn ít nhất một vật thể.")
        unknown = [name for name in names if name not in self.classes]
        if unknown:
            raise ValueError("Vật thể không hợp lệ: " + ", ".join(unknown))
        return FrameOptions(
            class_ids=sorted(self.classes[name] for name in names),
            confidence=self.cfg.DEFAULT_CONFIDENCE if confidence is None else confidence,
            tolerance=self.cfg.DEFAULT_TOLERANCE_PX if tolerance is None else tolerance,
            pointer_mode=pointer_mode,
            laser_color=laser_color,
            laser_brightness=laser_brightness,
        )

    def analyze(self, payload: bytes, options: FrameOptions) -> FrameResult:
        """Một khung JPEG → bàn tay, đầu ngón trỏ và vật thể được chỉ (toạ độ pixel của chính khung đó)."""
        frame = decode_jpeg(payload, self.cfg.MAX_FRAME_SIDE)
        if not self.lock.acquire(timeout=self.cfg.BUSY_WAIT_SECONDS):
            raise DetectorBusy
        try:
            tick = time.perf_counter()
            output = self._run_models(frame, options)
        finally:
            self.lock.release()

        height, width = frame.shape[:2]
        landmarks = output.landmarks if options.pointer_mode == PointerMode.hand else None
        tip = index_tip(landmarks, width, height)
        laser = output.laser if options.pointer_mode == PointerMode.laser else None
        if options.pointer_mode == PointerMode.laser:
            index = object_at_laser(output.polygons, tuple(laser.point) if laser else None, 4 * max(width, height) / 640)
        else:
            index = object_at_point(output.polygons, tip, options.tolerance)
        selected = None
        if index is not None:
            hit = output.detections[index]
            polygon = np.round(output.polygons[index], 1).tolist()
            selected = SelectedObject(index=index, name=hit.name, confidence=hit.confidence, polygon=polygon)
        return FrameResult(
            pointer_mode=options.pointer_mode,
            laser=laser,
            hand_detected=landmarks is not None,
            landmarks=[Point(x=round(p.x, 4), y=round(p.y, 4)) for p in landmarks or []],
            tip=list(tip) if tip else None,
            selected=selected,
            detections=output.detections,
            processing_ms=round((time.perf_counter() - tick) * 1000),
            resolution=FrameSize(width=width, height=height),
        )

    def _run_models(self, frame: np.ndarray, options: FrameOptions) -> ModelOutput:
        hand_job = self._hand_pool.submit(self._detect_hand, frame) if options.pointer_mode == PointerMode.hand else None
        laser = detect_laser(frame, options.laser_color, options.laser_brightness) if options.pointer_mode == PointerMode.laser else None
        try:
            result = self._model.predict(
                frame,
                classes=options.class_ids,
                conf=options.confidence,
                imgsz=self.cfg.IMAGE_SIZE,
                device=0 if self._gpu else "cpu",
                quantize=16 if self._gpu else 32,
                verbose=False,
            )[0]
        finally:
            # Không để luồng bàn tay chạy tiếp sau khi đã nhả khoá
            if hand_job is not None:
                wait([hand_job])
        landmarks = hand_job.result() if hand_job is not None else None

        tolerance = 4 * max(frame.shape[:2]) / 640 if options.pointer_mode == PointerMode.laser else options.tolerance
        output = self._extract_output(result, landmarks, tolerance, tuple(laser.point) if laser else None)
        output.laser = laser
        return output

    @staticmethod
    def _extract_output(result: Any, landmarks: list[Any] | None, tolerance: float,
                        point: tuple[int, int] | None = None) -> ModelOutput:
        # One small GPU -> CPU transfer for boxes. Dense masks stay on the GPU unless needed.
        detections: list[Detection] = []
        boxes = result.boxes.cpu() if result.boxes is not None else None
        raw_boxes = boxes.xyxy.tolist() if boxes is not None else []
        if boxes is not None:
            for cls, score, box in zip(boxes.cls.tolist(), boxes.conf.tolist(), raw_boxes):
                detections.append(
                    Detection(name=result.names[int(cls)], confidence=round(score, 3), box=[round(v, 1) for v in box])
                )
        polygons = [np.empty((0, 2), dtype=np.float32) for _ in detections]
        height, width = result.orig_shape
        tip = point if point is not None else index_tip(landmarks, width, height)
        if tip is not None and result.masks is not None:
            x, y = tip
            # Masks are cropped to their boxes. Keep a 2px rasterization margin near the edge.
            margin = tolerance + 2
            candidates = [
                i for i, (x1, y1, x2, y2) in enumerate(raw_boxes)
                if x1 - margin <= x <= x2 + margin and y1 - margin <= y <= y2 + margin
            ]
            if candidates:
                # masks.xy already transfers compact uint8 masks to CPU for contour extraction.
                for i, polygon in zip(candidates, result.masks[candidates].xy):
                    polygons[i] = np.asarray(polygon, dtype=np.float32)
        return ModelOutput(landmarks=landmarks, detections=detections, polygons=polygons)

    def _detect_hand(self, frame: np.ndarray) -> list[Any] | None:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self._hands.detect(self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb))
        return result.hand_landmarks[0] if result.hand_landmarks else None

    def close(self) -> None:
        if self._loader:
            self._loader.join(timeout=15)
        with self.lock:
            if self._hands is not None:
                self._hands.close()
                self._hands = None
        self._hand_pool.shutdown(wait=False, cancel_futures=True)
