"""Bộ nhận diện dùng chung cho mọi trình duyệt: YOLO (GPU nếu có) + MediaPipe Hand Landmarker (CPU).

- Model nạp ở luồng nền để web mở ngay; giao diện hiện "Đang khởi động" tới khi sẵn sàng.
- Nhiều mô hình YOLO: YOLO_MODEL mặc định + file .pt tải thêm ở Cài đặt. Mọi mô hình đang bật cùng chạy trên
  mỗi khung; danh sách vật thể là hợp các lớp của chúng. Cùng tên lớp (không phân biệt hoa / thường, vd. "laptop"
  của COCO và "Laptop" của Open Images) là một vật thể, hiển thị theo cách viết của mô hình nạp trước.
- MediaPipe chạy chế độ IMAGE nên không mang trạng thái bám tay từ người dùng này sang người khác.
- Mỗi lúc chỉ xử lý một khung (`lock`); trình duyệt khác chờ tối đa BUSY_WAIT_SECONDS rồi nhận 429.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
import threading
import time
from typing import Any

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from core.config import Settings
from core.logging import logger
from models import (
    Detection, DetectionDefaults, DetectorPhase, FrameResult, FrameSize, LaserColor, LaserSpot, ModelInfo, ModelTask,
    Point, PointerMode, SelectedObject,
)
from services import model_store
from services.laser import detect_laser
from services.laser_model import LaserModel, LaserUnavailable
from services.pointing import index_tip, object_at_point, object_at_laser

# Chỉ vào "person" luôn trúng chính bàn tay người đang chỉ, nên lớp này không bao giờ là mục tiêu
EXCLUDED_CLASSES = {"person"}
# Hai mô hình cùng thấy một vật (cùng tên lớp, khung trùng nhiều hơn mức này) → giữ kết quả tin cậy hơn
DUPLICATE_IOU = 0.6
SUPPORTED_TASKS = {task.value for task in ModelTask}


class DetectorBusy(Exception):
    """Đang xử lý khung của trình duyệt khác lâu hơn BUSY_WAIT_SECONDS."""


@dataclass(frozen=True)
class FrameOptions:
    """Cài đặt riêng của trình duyệt, đã kiểm tra hợp lệ."""

    targets: tuple[str, ...]
    confidence: float
    tolerance: int
    pointer_mode: PointerMode = PointerMode.hand
    laser_color: LaserColor = LaserColor.red
    laser_brightness: int = 200
    # Vị trí chấm laser ổn định gần nhất trình duyệt đang bám (pixel của khung trước) — ưu tiên ứng viên gần đó
    laser_hint: tuple[int, int] | None = None


@dataclass
class LoadedModel:
    """Một mô hình YOLO; `model` là None khi đang tắt (không chiếm GPU) hoặc nạp lỗi."""

    id: str
    builtin: bool
    names: dict[int, str]
    task: str = ModelTask.segment.value
    enabled: bool = True
    model: Any = None
    error: str | None = None
    size: int = 0

    @property
    def classes(self) -> list[str]:
        return [name for name in dict.fromkeys(self.names.values()) if not excluded(name)]

    @property
    def active(self) -> bool:
        return self.enabled and self.model is not None

    def info(self) -> ModelInfo:
        return ModelInfo(id=self.id, builtin=self.builtin, enabled=self.enabled, task=self.task,
                         classes=self.classes, size=self.size, error=self.error)


@dataclass
class ModelOutput:
    """Kết quả thô của các model cho một khung (tách riêng để test không cần GPU / file model)."""

    landmarks: list[Any] | None  # 21 điểm MediaPipe (x, y chuẩn hoá) hoặc None khi không thấy tay
    detections: list[Detection]
    polygons: list[np.ndarray]  # viền mask từng detection (pixel), cùng thứ tự với detections
    laser: LaserSpot | None = None


@dataclass
class _Hit:
    name: str
    score: float
    box: list[float]
    result: int  # vị trí kết quả (mô hình) trong danh sách
    index: int  # vị trí box trong kết quả đó
    order: tuple[int, int] = field(init=False)

    def __post_init__(self):
        self.order = (self.result, self.index)


def class_key(name: str) -> str:
    """Khoá so khớp tên lớp giữa các mô hình."""
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


def _iou(a: list[float], b: list[float]) -> float:
    width = min(a[2], b[2]) - max(a[0], b[0])
    height = min(a[3], b[3]) - max(a[1], b[1])
    if width <= 0 or height <= 0:
        return 0.0
    inter = width * height
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def merge_duplicates(hits: list[_Hit]) -> list[_Hit]:
    """Bỏ vật mà mô hình khác đã thấy (cùng tên lớp, khung trùng) với độ tin cậy cao hơn; giữ thứ tự gốc."""
    kept: list[_Hit] = []
    for hit in sorted(hits, key=lambda h: -h.score):
        if any(k.name == hit.name and k.result != hit.result and _iou(k.box, hit.box) > DUPLICATE_IOU for k in kept):
            continue
        kept.append(hit)
    return sorted(kept, key=lambda h: h.order)


class Detector:
    def __init__(self, cfg: Settings):
        self.cfg = cfg
        self.lock = threading.Lock()
        # Tải lên / bật tắt / xoá mô hình lần lượt từng thao tác (nạp model có thể mất vài giây)
        self._admin_lock = threading.Lock()
        self.ready = threading.Event()
        self.error: str | None = None
        self.device_name: str | None = None
        self.models: list[LoadedModel] = []
        self.classes: list[str] = []
        # class_key → tên hiển thị (cách viết của mô hình nạp trước)
        self._canonical: dict[str, str] = {}
        self.default_targets: list[str] = []
        self._hands: Any = None
        self._laser: LaserModel | None = None
        self.laser_error: str | None = None
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

            hand_path = self.cfg.hand_model_path
            if not hand_path.is_file():
                raise RuntimeError(f"Thiếu model bàn tay {hand_path.name}. Hãy chạy scripts\\setup.bat rồi mở lại web.")
            self._gpu = self.cfg.DEVICE.lower() != "cpu" and torch.cuda.is_available()
            if self.cfg.DEVICE.lower() not in ("auto", "cpu") and not self._gpu:
                logger.warning("DEVICE=%s but CUDA is unavailable - running YOLO on CPU", self.cfg.DEVICE)
            self.device_name = torch.cuda.get_device_name(0) if self._gpu else "CPU"

            # Tên model chuẩn (yolo26n-seg.pt…) chưa có file thì ultralytics tự tải về MODEL_DIR
            model, task, names = self._open_model(self.cfg.yolo_model_path)
            builtin = LoadedModel(id=self.cfg.YOLO_MODEL, builtin=True, names=names, task=task, model=model,
                                  size=self._file_size(self.cfg.yolo_model_path))
            self.models = [builtin, *self._load_custom_models()]
            if not any(m.enabled for m in self.models):
                builtin.enabled = True
            if not builtin.enabled:
                builtin.model = None
            self._refresh_classes()
            self._save_state()
            options = mp.tasks.vision.HandLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(hand_path)),
                running_mode=mp.tasks.vision.RunningMode.IMAGE,
                num_hands=1,
                min_hand_detection_confidence=self.cfg.HAND_CONFIDENCE,
                min_hand_presence_confidence=self.cfg.HAND_CONFIDENCE,
            )
            self._hands = mp.tasks.vision.HandLandmarker.create_from_options(options)
            self._mp = mp
            self._load_laser()
            # Chạy thử các cỡ khung hay gặp (webcam 4:3 / 16:9, điện thoại dọc): mỗi cỡ mới lần đầu mất vài giây
            # để GPU chọn kernel — làm sẵn ở đây thì khung đầu tiên của người dùng không bị đứng hình
            for entry in self.models:
                if entry.active:
                    self._warm_up(entry)
            self.ready.set()
            active = ", ".join(m.id for m in self.models if m.active)
            logger.info("Detector ready: %s / %s / imgsz %d", self.device_name, active, self.cfg.IMAGE_SIZE)
        except Exception as exc:
            self.error = str(exc) or type(exc).__name__
            logger.exception("Detector initialization failed")

    def _load_laser(self) -> None:
        try:
            laser = LaserModel(self.cfg.laser_model_path, "cuda:0" if self._gpu else "cpu",
                               self.cfg.LASER_IMAGE_SIZE, self.cfg.LASER_CONFIDENCE, self.cfg.LASER_CROP_SIZE)
            laser.warm_up()
            self._laser = laser
            self.laser_error = None
            logger.info("Red laser model ready: %s / imgsz %d", self.cfg.LASER_MODEL, self.cfg.LASER_IMAGE_SIZE)
        except Exception as exc:
            self._laser = None
            self.laser_error = str(exc) or type(exc).__name__
            logger.exception("Red laser unavailable; hand and green laser remain available")

    def _open_model(self, path: Path) -> tuple[Any, str, dict[int, str]]:
        """Nạp một file YOLO; chỉ nhận mô hình phân đoạn / phát hiện vật thể (cần khung + tên lớp)."""
        from ultralytics import YOLO

        model = YOLO(str(path))
        task = str(getattr(model, "task", ""))
        if task not in SUPPORTED_TASKS:
            raise ValueError(f"Chỉ hỗ trợ mô hình YOLO phân đoạn (segment) hoặc phát hiện (detect); file này là '{task}'.")
        names = {int(k): str(v) for k, v in dict(model.names).items()}
        if not [name for name in names.values() if not excluded(name)]:
            raise ValueError("Mô hình không có lớp vật thể nào dùng được.")
        return model, task, names

    def _load_custom_models(self) -> list[LoadedModel]:
        folder = self.cfg.custom_model_dir
        state = model_store.load_state(folder)
        entries = []
        for path in model_store.model_files(folder):
            if path.name == self.cfg.YOLO_MODEL:
                continue
            meta = state["meta"].get(path.name, {})
            entry = LoadedModel(id=path.name, builtin=False, names=model_store.names_from_meta(meta),
                                task=str(meta.get("task", ModelTask.segment.value)),
                                enabled=path.name not in state["disabled"], size=self._file_size(path))
            if entry.enabled or not entry.names:
                try:
                    entry.model, entry.task, entry.names = self._open_model(path)
                except Exception as exc:
                    entry.error = str(exc) or type(exc).__name__
                    logger.warning("Could not load model %s: %s", path.name, entry.error)
                if not entry.enabled:
                    entry.model = None
            entries.append(entry)
        return entries

    @staticmethod
    def _file_size(path: Path) -> int:
        try:
            return path.stat().st_size
        except OSError:
            return 0

    def _set_classes(self, names: dict[int, str]) -> None:
        """Chỉ biết bảng lớp của mô hình mặc định (test không nạp model thật)."""
        self.models = [LoadedModel(id=self.cfg.YOLO_MODEL, builtin=True, names=dict(names))]
        self._refresh_classes()

    def _refresh_classes(self) -> None:
        canonical: dict[str, str] = {}
        for entry in self.models:
            if entry.enabled and entry.error is None:
                for name in entry.classes:
                    canonical.setdefault(class_key(name), name)
        self._canonical = canonical
        classes = list(canonical.values())
        self.classes = classes
        # So như tên lớp giữa các mô hình: "laptop" của DEFAULT_TARGETS vẫn khớp "Laptop" khi tắt mô hình mặc định
        defaults = [canonical[key] for key in map(class_key, self.cfg.default_targets) if key in canonical]
        self.default_targets = list(dict.fromkeys(defaults)) or classes[:1]

    def _model_path(self, entry: LoadedModel) -> Path:
        return self.cfg.yolo_model_path if entry.builtin else self.cfg.custom_model_dir / entry.id

    def _save_state(self) -> None:
        state = {
            "disabled": [m.id for m in self.models if not m.enabled],
            "meta": {m.id: {"task": m.task, "names": {str(k): v for k, v in m.names.items()}}
                     for m in self.models if not m.builtin and m.names},
        }
        try:
            model_store.save_state(self.cfg.custom_model_dir, state)
        except OSError:
            logger.warning("Could not save model state to %s", self.cfg.custom_model_dir, exc_info=True)

    def status(self) -> dict[str, Any]:
        ready = self.ready.is_set()
        return {
            "phase": self.phase,
            "error": self.error,
            "device": self.device_name,
            "model": self.cfg.YOLO_MODEL,
            "laser_model": self.cfg.LASER_MODEL if self._laser is not None else None,
            "laser_error": self.laser_error,
            "image_size": self.cfg.IMAGE_SIZE,
            "classes": list(self.classes) if ready else [],
            "defaults": DetectionDefaults(
                targets=self.default_targets or self.cfg.default_targets,
                confidence=self.cfg.DEFAULT_CONFIDENCE,
                tolerance=self.cfg.DEFAULT_TOLERANCE_PX,
            ),
            "models": self.model_infos() if ready else [],
        }

    def model_infos(self) -> list[ModelInfo]:
        return [entry.info() for entry in self.models]

    # ===== Quản lý mô hình (router /models) =====

    def _find(self, model_id: str) -> LoadedModel:
        for entry in self.models:
            if entry.id == model_id:
                return entry
        raise KeyError(model_id)

    def reserved_names(self) -> set[str]:
        return {entry.id for entry in self.models}

    def add_model(self, path: Path) -> ModelInfo:
        """Nạp file .pt vừa tải lên và cho chạy cùng các mô hình khác. ValueError nếu không dùng được."""
        with self._admin_lock:
            model, task, names = self._open_model(path)
            entry = LoadedModel(id=path.name, builtin=False, names=names, task=task, model=model,
                                size=self._file_size(path))
            self._warm_up(entry)
            with self.lock:
                self.models = [*self.models, entry]
                self._refresh_classes()
            self._save_state()
            logger.info("Model added: %s (%s, %d classes)", entry.id, entry.task, len(entry.classes))
            return entry.info()

    def set_enabled(self, model_id: str, enabled: bool) -> ModelInfo:
        with self._admin_lock:
            entry = self._find(model_id)
            if not enabled and not any(m.enabled for m in self.models if m is not entry):
                raise ValueError("Cần bật ít nhất một mô hình.")
            model = entry.model
            if enabled and model is None:
                try:
                    model, entry.task, entry.names = self._open_model(self._model_path(entry))
                except Exception as exc:
                    raise ValueError(f"Không nạp được {entry.id}: {exc}") from exc
                entry.error = None
                self._warm_up(LoadedModel(id=entry.id, builtin=entry.builtin, names=entry.names, model=model))
            with self.lock:
                entry.enabled = enabled
                entry.model = model if enabled else None
                self._refresh_classes()
            if not enabled:
                self._free_gpu()
            self._save_state()
            return entry.info()

    def remove_model(self, model_id: str) -> None:
        with self._admin_lock:
            entry = self._find(model_id)
            if entry.builtin:
                raise ValueError("Không xoá được mô hình mặc định của máy chủ; có thể tắt nó.")
            if entry.enabled and not any(m.enabled for m in self.models if m is not entry):
                raise ValueError("Cần bật ít nhất một mô hình khác trước khi xoá mô hình này.")
            with self.lock:
                self.models = [m for m in self.models if m is not entry]
                self._refresh_classes()
            entry.model = None
            self._free_gpu()
            self._model_path(entry).unlink(missing_ok=True)
            self._save_state()
            logger.info("Model removed: %s", entry.id)

    def _free_gpu(self) -> None:
        if self._gpu:
            import torch

            torch.cuda.empty_cache()

    # ===== Nhận diện =====

    def options(self, targets: str | None, confidence: float | None, tolerance: int | None,
                pointer_mode: PointerMode = PointerMode.hand, laser_color: LaserColor = LaserColor.red,
                laser_brightness: int = 200, laser_hint: tuple[int, int] | None = None) -> FrameOptions:
        """Kiểm tra cài đặt trình duyệt gửi kèm khung hình; bỏ trống = mặc định máy chủ."""
        names = list(dict.fromkeys(n.strip() for n in targets.split(",") if n.strip())) if targets else self.default_targets
        if not names:
            raise ValueError("Cần chọn ít nhất một vật thể.")
        # Tên so không phân biệt hoa / thường như giữa các mô hình. Lớp máy chủ không còn (mô hình vừa tắt / xoá mà
        # trình duyệt chưa kịp hỏi lại trạng thái) thì bỏ qua; chỉ báo lỗi khi không còn lớp nào nhận diện được.
        canonical = self._canonical
        wanted = {canonical[key] for key in map(class_key, names) if key in canonical}
        if not wanted:
            raise ValueError("Vật thể không hợp lệ: " + ", ".join(names))
        return FrameOptions(
            targets=tuple(name for name in canonical.values() if name in wanted),
            confidence=self.cfg.DEFAULT_CONFIDENCE if confidence is None else confidence,
            tolerance=self.cfg.DEFAULT_TOLERANCE_PX if tolerance is None else tolerance,
            pointer_mode=pointer_mode,
            laser_color=laser_color,
            laser_brightness=laser_brightness,
            laser_hint=laser_hint if pointer_mode == PointerMode.laser else None,
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

    def _predict(self, entry: LoadedModel, frame: np.ndarray, targets: tuple[str, ...] | list[str], confidence: float):
        """Một mô hình trên một khung, chỉ các lớp đang chọn mà mô hình này có; None nếu không có lớp nào."""
        wanted = {class_key(name) for name in targets}
        class_ids = [class_id for class_id, name in entry.names.items() if class_key(name) in wanted and not excluded(name)]
        if not class_ids:
            return None
        return entry.model.predict(
            frame,
            classes=class_ids,
            conf=confidence,
            imgsz=self.cfg.IMAGE_SIZE,
            device=0 if self._gpu else "cpu",
            quantize=16 if self._gpu else 32,
            verbose=False,
        )[0]

    def _warm_up(self, entry: LoadedModel) -> None:
        for height, width in ((480, 640), (360, 640), (640, 480), (640, 360)):
            self._predict(entry, np.zeros((height, width, 3), dtype=np.uint8), entry.classes, self.cfg.DEFAULT_CONFIDENCE)

    def _run_models(self, frame: np.ndarray, options: FrameOptions) -> ModelOutput:
        # Laser đỏ dùng cùng GPU với YOLO vật thể: chạy lần lượt dưới Detector.lock.
        # Bàn tay / laser xanh chạy CPU song song với YOLO như trước.
        laser = None
        side_job = None
        if options.pointer_mode == PointerMode.laser:
            if options.laser_color == LaserColor.red:
                if self._laser is None:
                    raise LaserUnavailable(self.laser_error or "Model laser đỏ chưa sẵn sàng.")
                laser = self._laser.detect(frame, options.laser_hint)
            else:
                side_job = self._hand_pool.submit(detect_laser, frame, options.laser_brightness, options.laser_hint)
        else:
            side_job = self._hand_pool.submit(self._detect_hand, frame)
        results = []
        try:
            # GPU chạy lần lượt từng mô hình
            for entry in self.models:
                if entry.active:
                    result = self._predict(entry, frame, options.targets, options.confidence)
                    if result is not None:
                        results.append(result)
        finally:
            # Không để luồng CPU chạy tiếp sau khi đã nhả khoá
            if side_job is not None:
                wait([side_job])
        if options.pointer_mode == PointerMode.laser and side_job is not None:
            laser = side_job.result()
        landmarks = side_job.result() if options.pointer_mode == PointerMode.hand else None

        tolerance = 4 * max(frame.shape[:2]) / 640 if options.pointer_mode == PointerMode.laser else options.tolerance
        output = self._extract_output(results, landmarks, tolerance, tuple(laser.point) if laser else None,
                                      frame.shape[:2], self._canonical)
        output.laser = laser
        return output

    @staticmethod
    def _extract_output(results: Any, landmarks: list[Any] | None, tolerance: float,
                        point: tuple[int, int] | None = None, shape: tuple[int, int] | None = None,
                        canonical: dict[str, str] | None = None) -> ModelOutput:
        """Gộp kết quả các mô hình; chỉ lấy viền vật ở gần điểm chỉ (mô hình detect: viền = khung).
        `canonical` đổi tên lớp của từng mô hình về tên chung (class_key → tên hiển thị)."""
        if not isinstance(results, (list, tuple)):
            results = [results]
        hits: list[_Hit] = []
        for r, result in enumerate(results):
            # One small GPU -> CPU transfer for boxes. Dense masks stay on the GPU unless needed.
            boxes = result.boxes.cpu() if result.boxes is not None else None
            if boxes is None:
                continue
            for i, (cls, score, box) in enumerate(zip(boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxy.tolist())):
                raw = result.names[int(cls)]
                name = canonical.get(class_key(raw), raw) if canonical else raw
                hits.append(_Hit(name=name, score=float(score), box=list(box), result=r, index=i))
        if len(results) > 1:
            hits = merge_duplicates(hits)
        detections = [
            Detection(name=h.name, confidence=round(h.score, 3), box=[round(v, 1) for v in h.box]) for h in hits
        ]
        polygons = [np.empty((0, 2), dtype=np.float32) for _ in detections]
        height, width = results[0].orig_shape if results else (shape or (0, 0))
        tip = point if point is not None else index_tip(landmarks, width, height)
        if tip is not None and hits:
            x, y = tip
            # Masks are cropped to their boxes. Keep a 2px rasterization margin near the edge.
            margin = tolerance + 2
            near = [
                k for k, h in enumerate(hits)
                if h.box[0] - margin <= x <= h.box[2] + margin and h.box[1] - margin <= y <= h.box[3] + margin
            ]
            for r, result in enumerate(results):
                picked = [k for k in near if hits[k].result == r]
                if not picked:
                    continue
                if result.masks is not None:
                    # masks.xy already transfers compact uint8 masks to CPU for contour extraction.
                    for k, polygon in zip(picked, result.masks[[hits[k].index for k in picked]].xy):
                        polygons[k] = np.asarray(polygon, dtype=np.float32)
                else:
                    for k in picked:
                        x1, y1, x2, y2 = hits[k].box
                        polygons[k] = np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.float32)
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
            self._laser = None
        self._hand_pool.shutdown(wait=False, cancel_futures=True)
