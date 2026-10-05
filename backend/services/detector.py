"""Bộ nhận diện dùng chung cho mọi client: YOLO segmentation (GPU nếu có) + MediaPipe Hand Landmarker (CPU)
+ model laser đỏ (YOLOv5l6 ADVR).

- Model nạp ở luồng nền để API lên ngay; /api/vision/status báo "starting" tới khi sẵn sàng.
- MediaPipe chạy chế độ IMAGE nên không mang trạng thái bám tay từ client này sang client khác.
- Mỗi lúc chỉ xử lý một khung (`lock`); request khác chờ tối đa BUSY_WAIT_SECONDS rồi nhận 429.
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
from models import (
    Detection, DetectionDefaults, DetectorPhase, FrameResult, FrameSize, LaserSpot, Point, PointerMode, SelectedObject,
)
from services.laser_model import LaserModel, YoloLaserModel, LaserUnavailable
from services.engine_metadata import engine_header, torchscript_metadata
from services.tensorrt_laser import TensorRTLaserModel
from services.model_converter import CONVERTIBLE, ModelConverter
from services.model_store import ModelStore
from services.pointing import index_tip, object_at_point, object_at_laser

# Chỉ vào "person" luôn trúng chính bàn tay người đang chỉ, nên lớp này không bao giờ là mục tiêu
EXCLUDED_CLASSES = {"person"}


class DetectorBusy(Exception):
    """Đang xử lý khung của client khác lâu hơn BUSY_WAIT_SECONDS."""


class ModelChanged(Exception):
    """The frame was captured with settings for a previous model."""


@dataclass(frozen=True)
class FrameOptions:
    """Tuỳ chọn client gửi kèm khung, đã kiểm tra hợp lệ."""

    targets: tuple[str, ...]
    confidence: float
    tolerance: int
    pointer_mode: PointerMode = PointerMode.hand
    # Vị trí chấm laser ổn định gần nhất client đang bám (pixel của khung trước) — ưu tiên ứng viên gần đó
    laser_hint: tuple[int, int] | None = None
    model_revision: int = 0


@dataclass
class ModelOutput:
    """Kết quả thô của các model cho một khung (tách riêng để test không cần GPU / file model)."""

    landmarks: list[Any] | None  # 21 điểm MediaPipe (x, y chuẩn hoá) hoặc None khi không thấy tay
    detections: list[Detection]
    polygons: list[np.ndarray]  # viền mask từng detection (pixel), cùng thứ tự với detections
    laser: LaserSpot | None = None


def class_key(name: str) -> str:
    """Khoá so khớp tên lớp: không phân biệt hoa / thường, gộp khoảng trắng."""
    return " ".join(name.split()).casefold()


def excluded(name: str) -> bool:
    return class_key(name) in EXCLUDED_CLASSES


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
        self.model_store = ModelStore(cfg)
        self._active = {"segmentation": self.model_store.identifier(cfg.yolo_model_path),
                        "laser": self.model_store.identifier(cfg.laser_model_path)}
        self.model_revision = 0
        self.model_busy = False
        self._management_lock = threading.Lock()
        self.lock = threading.Lock()
        self.ready = threading.Event()
        self.error: str | None = None
        self.device_name: str | None = None
        self._model: Any = None
        self._names: dict[int, str] = {}
        self.classes: list[str] = []
        # class_key → tên lớp của model
        self._canonical: dict[str, str] = {}
        self.default_targets: list[str] = []
        self._hands: Any = None
        self._laser: LaserModel | YoloLaserModel | TensorRTLaserModel | None = None
        self.laser_error: str | None = None
        self._mp: Any = None
        self._gpu = False
        self._loader: threading.Thread | None = None
        # Bàn tay chạy CPU song song với YOLO trên GPU: giảm ~35% độ trễ mỗi khung so với chạy lần lượt
        self._hand_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="hand")
        # Chuyển .pt / .torchscript sang TensorRT FP16 ở tiến trình con, xong thì tự chọn engine
        self.converter = ModelConverter(self)

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
            # Import nặng (torch, ultralytics) để trong luồng nền cho server lên ngay
            import torch

            saved = self.model_store.saved()

            self._gpu = self.cfg.DEVICE.lower() != "cpu" and torch.cuda.is_available()
            if self.cfg.DEVICE.lower() not in ("auto", "cpu") and not self._gpu:
                logger.warning("DEVICE=%s but CUDA is unavailable - running YOLO on CPU", self.cfg.DEVICE)
            self.device_name = torch.cuda.get_device_name(0) if self._gpu else "CPU"

            # Tên model chuẩn (yolo26n-seg.pt…) chưa có file thì ultralytics tự tải về MODEL_DIR
            self._model = self._load_selected("segmentation", saved, self._load_segmentation)
            self._set_classes({int(k): str(v) for k, v in dict(self._model.names).items()})
            self._load_laser(saved)
            # Chạy thử các cỡ khung hay gặp (webcam 4:3 / 16:9, điện thoại dọc): mỗi cỡ mới lần đầu mất vài giây
            # để GPU chọn kernel — làm sẵn ở đây thì khung đầu tiên không bị chậm
            for height, width in ((480, 640), (360, 640), (640, 480), (640, 360)):
                self._predict(np.zeros((height, width, 3), dtype=np.uint8), self.classes, self.cfg.DEFAULT_CONFIDENCE)
            self.ready.set()
            logger.info("Detector ready: %s / %s / imgsz %d", self.device_name, self._active["segmentation"], self.cfg.IMAGE_SIZE)
        except Exception as exc:
            self.error = str(exc) or type(exc).__name__
            logger.exception("Detector initialization failed")

    def _load_selected(self, kind: str, saved: dict[str, str], load: Any) -> Any:
        """Mô hình đã chọn (active.json) nạp lỗi thì chạy mô hình mặc định trong cấu hình, giữ nguyên active.json.

        Hay gặp khi Windows và Docker dùng chung models/: engine TensorRT build trên hệ điều hành / GPU này
        không nạp được ở bên kia; trước đây cả bộ nhận diện báo lỗi.
        """
        default = self._active[kind]
        selected = saved.get(kind, default)
        if selected != default:
            try:
                model = load(self.cfg.MODEL_DIR / selected)
                self._active[kind] = selected
                return model
            except Exception as exc:
                logger.warning("Selected %s model %s failed to load (%s); using default %s", kind, selected, exc, default)
        return load(self.cfg.MODEL_DIR / default)

    def _load_laser(self, saved: dict[str, str] | None = None) -> None:
        try:
            laser = self._load_selected("laser", saved or {}, lambda path: self._prepare_model("laser", path))
            self._laser = laser
            self.laser_error = None
            logger.info("Red laser model ready: %s", self._active["laser"])
        except Exception as exc:
            self._laser = None
            self.laser_error = str(exc) or type(exc).__name__
            logger.exception("Red laser model unavailable")

    def _set_classes(self, names: dict[int, str]) -> None:
        """Bảng lớp của model YOLO (test gọi trực tiếp, không nạp model thật)."""
        self._names = dict(names)
        canonical: dict[str, str] = {}
        for name in self._names.values():
            if not excluded(name):
                canonical.setdefault(class_key(name), name)
        self._canonical = canonical
        self.classes = list(canonical.values())
        defaults = [canonical[key] for key in map(class_key, self.cfg.default_targets) if key in canonical]
        # Mô hình tuỳ chỉnh không có lớp mặc định nào (DEFAULT_TARGETS): nhận diện mọi lớp của mô hình
        self.default_targets = list(dict.fromkeys(defaults)) or list(self.classes)

    def status(self) -> dict[str, Any]:
        ready = self.ready.is_set()
        return {
            "phase": self.phase,
            "error": self.error,
            "device": self.device_name,
            "model": self._active["segmentation"],
            "laser_model": self._active["laser"] if self._laser is not None else None,
            "laser_error": self.laser_error,
            "model_revision": self.model_revision,
            "model_busy": self.model_busy,
            "image_size": self.cfg.IMAGE_SIZE,
            "classes": list(self.classes) if ready else [],
            "defaults": DetectionDefaults(
                targets=self.default_targets or self.cfg.default_targets,
                confidence=self.cfg.DEFAULT_CONFIDENCE,
                tolerance=self.cfg.DEFAULT_TOLERANCE_PX,
            ),
        }

    # ===== Nhận diện =====

    def options(self, targets: str | None, confidence: float | None, tolerance: int | None,
                pointer_mode: PointerMode = PointerMode.hand,
                laser_hint: tuple[int, int] | None = None, model_revision: int | None = None) -> FrameOptions:
        """Kiểm tra tuỳ chọn client gửi kèm khung hình; bỏ trống = mặc định máy chủ."""
        revision = self.model_revision if model_revision is None else model_revision
        names = list(dict.fromkeys(n.strip() for n in targets.split(",") if n.strip())) if targets else self.default_targets
        if not names:
            raise ValueError("Cần chọn ít nhất một vật thể.")
        # Tên so không phân biệt hoa / thường; lớp model không có thì bỏ qua, chỉ báo lỗi khi không còn lớp nào
        canonical = self._canonical
        wanted = {canonical[key] for key in map(class_key, names) if key in canonical}
        if not wanted:
            raise ValueError("Vật thể không hợp lệ: " + ", ".join(names))
        return FrameOptions(
            targets=tuple(name for name in canonical.values() if name in wanted),
            confidence=self.cfg.DEFAULT_CONFIDENCE if confidence is None else confidence,
            tolerance=self.cfg.DEFAULT_TOLERANCE_PX if tolerance is None else tolerance,
            pointer_mode=pointer_mode,
            laser_hint=laser_hint if pointer_mode == PointerMode.laser else None,
            model_revision=revision,
        )

    def analyze(self, payload: bytes, options: FrameOptions) -> FrameResult:
        """Một khung JPEG → bàn tay / chấm laser và vật thể được chỉ (toạ độ pixel của chính khung đó)."""
        frame = decode_jpeg(payload, self.cfg.MAX_FRAME_SIDE)
        if not self.lock.acquire(timeout=self.cfg.BUSY_WAIT_SECONDS):
            raise DetectorBusy
        try:
            if options.model_revision != self.model_revision:
                raise ModelChanged
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

    def _predict(self, frame: np.ndarray, targets: tuple[str, ...] | list[str], confidence: float):
        """YOLO trên một khung, chỉ các lớp đang chọn; None nếu không có lớp nào."""
        wanted = {class_key(name) for name in targets}
        class_ids = [class_id for class_id, name in self._names.items() if class_key(name) in wanted and not excluded(name)]
        if not class_ids:
            return None
        return self._model.predict(
            frame,
            classes=class_ids,
            conf=confidence,
            imgsz=self.cfg.IMAGE_SIZE,
            device=0 if self._gpu else "cpu",
            quantize=16 if self._gpu else 32,
            verbose=False,
        )[0]

    def _run_models(self, frame: np.ndarray, options: FrameOptions) -> ModelOutput:
        # Laser đỏ dùng cùng GPU với YOLO vật thể: chạy lần lượt dưới Detector.lock.
        # Bàn tay chạy CPU song song với YOLO.
        laser = None
        hand_job = None
        if options.pointer_mode == PointerMode.laser:
            if self._laser is None:
                raise LaserUnavailable(self.laser_error or "Model laser đỏ chưa sẵn sàng.")
            laser = self._laser.detect(frame, options.laser_hint)
        else:
            self._ensure_hands()
            hand_job = self._hand_pool.submit(self._detect_hand, frame)
        try:
            result = self._predict(frame, options.targets, options.confidence)
        finally:
            # Không để luồng CPU chạy tiếp sau khi đã nhả khoá
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
        """Đổi kết quả YOLO thành detections; chỉ lấy viền mask của vật ở gần điểm chỉ (ngón trỏ hoặc laser)."""
        # One small GPU -> CPU transfer for boxes. Dense masks stay on the GPU unless needed.
        boxes = result.boxes.cpu() if result is not None and result.boxes is not None else None
        if boxes is None:
            return ModelOutput(landmarks=landmarks, detections=[], polygons=[])
        detections = [
            Detection(name=result.names[int(cls)], confidence=round(float(score), 3), box=[round(v, 1) for v in box])
            for cls, score, box in zip(boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxy.tolist())
        ]
        polygons = [np.empty((0, 2), dtype=np.float32) for _ in detections]
        height, width = result.orig_shape
        tip = point if point is not None else index_tip(landmarks, width, height)
        if tip is not None and detections and result.masks is not None:
            x, y = tip
            # Masks are cropped to their boxes. Keep a 2px rasterization margin near the edge.
            margin = tolerance + 2
            near = [
                k for k, d in enumerate(detections)
                if d.box[0] - margin <= x <= d.box[2] + margin and d.box[1] - margin <= y <= d.box[3] + margin
            ]
            if near:
                # masks.xy already transfers compact uint8 masks to CPU for contour extraction.
                for k, polygon in zip(near, result.masks[near].xy):
                    polygons[k] = np.asarray(polygon, dtype=np.float32)
        return ModelOutput(landmarks=landmarks, detections=detections, polygons=polygons)

    def _ensure_hands(self) -> None:
        """MediaPipe chỉ nạp khi có khung chế độ chỉ tay (giao diện web chỉ dùng laser): tiết kiệm RAM lúc chạy."""
        if self._hands is not None:
            return
        import mediapipe as mp

        hand_path = self.cfg.hand_model_path
        if not hand_path.is_file():
            raise LaserUnavailable(f"Thiếu model bàn tay {hand_path.name} trong {hand_path.parent}.")
        options = mp.tasks.vision.HandLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(hand_path)),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_hands=1,
            min_hand_detection_confidence=self.cfg.HAND_CONFIDENCE,
            min_hand_presence_confidence=self.cfg.HAND_CONFIDENCE,
        )
        self._hands = mp.tasks.vision.HandLandmarker.create_from_options(options)
        self._mp = mp

    def _detect_hand(self, frame: np.ndarray) -> list[Any] | None:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self._hands.detect(self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb))
        return result.hand_landmarks[0] if result.hand_landmarks else None

    def model_infos(self) -> list[dict[str, Any]]:
        return [{"id": model_id, "name": path.name, "kind": kind,
                 "size_bytes": path.stat().st_size if path.is_file() else 0,
                 "available": path.is_file(), "active": self._active[kind] == model_id,
                 "convertible": path.is_file() and path.suffix.lower() in CONVERTIBLE}
                for model_id, (kind, path) in self.model_store.catalog().items()]

    def engine_unavailable(self) -> str | None:
        """Lý do máy này chưa build / chạy được TensorRT; None = được."""
        if not self.ready.is_set():
            return "Bộ nhận diện đang khởi động."
        try:
            self._require_engine_gpu()
        except Exception as exc:
            return str(exc)
        return None

    def _require_engine_gpu(self) -> None:
        if not self._gpu:
            raise ValueError("Mô hình TensorRT cần GPU NVIDIA CUDA; chọn .pt hoặc .torchscript khi dùng CPU.")
        try:
            import tensorrt  # noqa: F401
        except (ImportError, OSError) as exc:
            raise RuntimeError("Chưa nạp được TensorRT. Cài runtime tương thích engine trên máy chạy backend.") from exc

    def _load_segmentation(self, path):
        from ultralytics import YOLO

        if path.suffix.lower() == ".engine":
            self._require_engine_gpu()
            _, metadata = engine_header(path)
            if metadata.get("task") != "segment" or not metadata.get("names"):
                raise ValueError("Engine vật thể phải được xuất bằng Ultralytics YOLO segmentation, có metadata task và names.")
            # Uploaded names need not contain '-seg'; do not guess the task from a filename.
            model = YOLO(str(path), task="segment")
        elif path.suffix.lower() == ".torchscript":
            if torchscript_metadata(path).get("task") != "segment":
                raise ValueError("TorchScript vật thể phải được xuất bằng Ultralytics YOLO segmentation (có metadata task).")
            model = YOLO(str(path), task="segment")
        else:
            model = YOLO(str(path))
        if model.task != "segment" or not any(not excluded(str(n)) for n in model.names.values()):
            raise ValueError("Cần mô hình YOLO segmentation có ít nhất một lớp vật thể (ngoài person).")
        return model

    @staticmethod
    def _close_laser(model) -> None:
        if callable(getattr(model, "close", None)):
            try:
                model.close()
            except Exception:
                logger.exception("Could not release the previous laser runtime")

    def _prepare_model(self, kind, path):
        """Load and run a candidate before committing a selection."""
        if kind == "laser":
            device = "cuda:0" if self._gpu else "cpu"
            if path.suffix.lower() == ".engine":
                self._require_engine_gpu()
                _, metadata = engine_header(path)
                if metadata:
                    if metadata.get("task") != "detect" or len(metadata.get("names") or {}) != 1:
                        raise ValueError("Engine laser Ultralytics phải là YOLO detect một lớp chấm laser.")
                    model = YoloLaserModel(path, device, self.cfg.LASER_IMAGE_SIZE, self.cfg.LASER_CONFIDENCE)
                else:
                    model = TensorRTLaserModel(path, device, self.cfg.LASER_CONFIDENCE)
            elif path.suffix.lower() == ".pt":
                model = YoloLaserModel(path, device, self.cfg.LASER_IMAGE_SIZE, self.cfg.LASER_CONFIDENCE)
            else:
                model = LaserModel(path, device, self.cfg.LASER_IMAGE_SIZE,
                                   self.cfg.LASER_CONFIDENCE, self.cfg.LASER_CROP_SIZE)
            try:
                model.warm_up()
            except Exception:
                self._close_laser(model)
                raise
        else:
            model = self._load_segmentation(path)
            model.predict(np.zeros((480, 640, 3), dtype=np.uint8), imgsz=self.cfg.IMAGE_SIZE,
                          device=0 if self._gpu else "cpu", verbose=False)
        return model

    def validate_model(self, kind, path) -> None:
        if not self._management_lock.acquire(blocking=False):
            raise DetectorBusy
        self.model_busy = True
        try:
            with self.lock:
                candidate = self._prepare_model(kind, path)
                if kind == "laser":
                    self._close_laser(candidate)
        finally:
            self.model_busy = False
            self._management_lock.release()

    def activate_model(self, model_id: str, wait: float = 0) -> dict[str, Any]:
        """wait > 0: chờ lượt nạp mô hình khác xong (engine vừa build) thay vì báo bận ngay."""
        acquired = self._management_lock.acquire(timeout=wait) if wait > 0 else self._management_lock.acquire(blocking=False)
        if not acquired:
            raise DetectorBusy
        self.model_busy = True
        try:
            kind, path = self.model_store.resolve(model_id)
            with self.lock:
                if self._active[kind] == model_id and (kind != "laser" or self._laser is not None):
                    return {**self.status(), "model_busy": False}
                candidate = self._prepare_model(kind, path)
                active = {**self._active, kind: model_id}
                # Persist first: failure must leave the running model and classes intact.
                try:
                    self.model_store.save(active)
                except Exception:
                    if kind == "laser":
                        self._close_laser(candidate)
                    raise
                if kind == "segmentation":
                    self._model = candidate
                    self._set_classes({int(k): str(v) for k, v in dict(candidate.names).items()})
                else:
                    self._close_laser(self._laser)
                    self._laser = candidate
                    self.laser_error = None
                self._active = active
                self.model_revision += 1
            return {**self.status(), "model_busy": False}
        finally:
            self.model_busy = False
            self._management_lock.release()

    def close(self) -> None:
        self.converter.close()
        if self._loader:
            self._loader.join(timeout=15)
        with self.lock:
            if self._hands is not None:
                self._hands.close()
                self._hands = None
            self._close_laser(self._laser)
            self._laser = None
        self._hand_pool.shutdown(wait=False, cancel_futures=True)
