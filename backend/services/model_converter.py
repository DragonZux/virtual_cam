"""Queue of FP16 TensorRT builds for local .pt / .torchscript models; a finished engine becomes the running model.

One build at a time in a child process (`services.tensorrt_export`); frames keep running meanwhile, only
slower because the GPU is shared. Jobs live in memory (Settings polls them through GET /api/models).
"""
from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass, field
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
from typing import Any, Callable
from uuid import uuid4

from core.logging import logger

BACKEND_DIR = Path(__file__).resolve().parents[1]
CONVERTIBLE = (".pt", ".torchscript")
BUILD_TIMEOUT_SECONDS = 45 * 60
# Engine chọn ngay sau khi build: chờ người khác đang nạp mô hình xong
ACTIVATE_WAIT_SECONDS = 120
KEEP_JOBS = 20


@dataclass
class ConversionJob:
    id: str
    source: str
    name: str
    kind: str
    status: str = "queued"  # queued | running | done | error
    error: str | None = None
    engine: str | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None


class ModelConverter:
    def __init__(self, detector: Any, build: Callable[[Path, Path, int], None] | None = None):
        self.detector = detector
        # Test thay hàm build để không cần GPU / TensorRT
        self.build = build or self._build
        self.jobs: dict[str, ConversionJob] = {}
        self._pending: deque[str] = deque()
        self._lock = threading.Lock()
        self._wake = threading.Condition(self._lock)
        self._worker: threading.Thread | None = None
        self._process: subprocess.Popen | None = None
        self._closed = False

    def snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return [asdict(job) for job in reversed(self.jobs.values())]

    def submit(self, model_id: str, strict: bool = True) -> ConversionJob:
        """strict=False (upload kèm chuyển đổi): lỗi thành một việc báo lỗi thay vì làm hỏng lượt tải lên."""
        kind, path = self.detector.model_store.resolve(model_id)
        reason = (None if path.suffix.lower() in CONVERTIBLE else "Chỉ chuyển được mô hình .pt hoặc .torchscript.")
        reason = reason or self.detector.engine_unavailable()
        with self._lock:
            if reason is None:
                for job in self.jobs.values():
                    if job.source == model_id and job.status in ("queued", "running"):
                        return job
            elif strict:
                raise ValueError(reason)
            job = ConversionJob(id=uuid4().hex[:12], source=model_id, name=path.name, kind=kind)
            self.jobs[job.id] = job
            if reason is None:
                self._pending.append(job.id)
                if self._worker is None or not self._worker.is_alive():
                    self._worker = threading.Thread(target=self._loop, name="tensorrt-convert", daemon=True)
                    self._worker.start()
                self._wake.notify()
            else:
                job.status, job.error, job.finished_at = "error", reason, time.time()
            finished = [key for key, item in self.jobs.items() if item.status in ("done", "error")]
            for key in finished[:max(0, len(self.jobs) - KEEP_JOBS)]:
                del self.jobs[key]
            return job

    def _loop(self) -> None:
        while True:
            with self._lock:
                while not self._pending and not self._closed:
                    self._wake.wait()
                if self._closed:
                    return
                job = self.jobs.get(self._pending.popleft())
                if job is None:
                    continue
                job.status = "running"
            try:
                job.engine = self._convert(job)
                job.status = "done"
                logger.info("TensorRT engine ready and selected: %s", job.engine)
            except Exception as exc:
                job.status, job.error = "error", str(exc) or type(exc).__name__
                logger.warning("TensorRT conversion of %s failed: %s", job.source, job.error)
            job.finished_at = time.time()

    def _convert(self, job: ConversionJob) -> str:
        from services.detector import DetectorBusy

        store, cfg = self.detector.model_store, self.detector.cfg
        kind, source = store.resolve(job.source)
        output = store.engine_path(kind, source)
        self.build(source, output, cfg.IMAGE_SIZE if kind == "segmentation" else cfg.LASER_IMAGE_SIZE)
        engine_id = store.identifier(output)
        try:
            self.detector.activate_model(engine_id, wait=ACTIVATE_WAIT_SECONDS)
        except DetectorBusy as exc:
            raise RuntimeError("Đã tạo engine nhưng đang nạp mô hình khác; hãy chọn engine trong danh sách.") from exc
        except Exception as exc:
            # Engine không nạp được trên chính máy vừa build thì giữ lại chỉ gây nhầm
            output.unlink(missing_ok=True)
            raise RuntimeError(f"Engine vừa tạo không chạy được: {exc}") from exc
        return engine_id

    def _build(self, source: Path, output: Path, imgsz: int) -> None:
        command = [sys.executable, "-m", "services.tensorrt_export",
                   "--source", str(source), "--output", str(output), "--imgsz", str(imgsz)]
        logger.info("Building FP16 TensorRT engine %s (imgsz %d)", output.name, imgsz)
        process = subprocess.Popen(
            command, cwd=BACKEND_DIR, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            encoding="utf-8", errors="replace", env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"},
        )
        self._process = process
        timer = threading.Timer(BUILD_TIMEOUT_SECONDS, process.kill)
        timer.start()
        tail: deque[str] = deque(maxlen=20)
        result: dict[str, Any] = {}
        try:
            assert process.stdout is not None
            for line in process.stdout:
                line = line.rstrip()
                if line.startswith("RESULT "):
                    result = json.loads(line[len("RESULT "):])
                elif line.strip():
                    tail.append(line)
                    logger.info("[tensorrt] %s", line)
            process.wait()
        finally:
            timer.cancel()
            self._process = None
            # Tiến trình con chết giữa chừng (hết RAM, bị dừng) không kịp dọn thư mục build của nó
            shutil.rmtree(output.parent / f".build-{output.stem}", ignore_errors=True)
        if result.get("ok") and output.is_file():
            return
        if self._closed:
            raise RuntimeError("Máy chủ dừng khi đang chuyển đổi.")
        raise RuntimeError(result.get("error") or (tail[-1] if tail else f"Tiến trình build thoát với mã {process.returncode}."))

    def close(self) -> None:
        with self._lock:
            self._closed = True
            self._wake.notify_all()
        process = self._process
        if process is not None and process.poll() is None:
            process.kill()
