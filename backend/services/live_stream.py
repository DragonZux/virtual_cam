"""Camera trực tiếp do máy chủ giữ: một camera RTSP tại một thời điểm, nhận diện liên tục kể cả khi không ai xem.

    RTSP ─► RtspStream (luồng đọc, chỉ giữ khung mới nhất)
              │ có khung mới
              ├─► vòng nhận diện: luôn lấy khung MỚI NHẤT, khung đến lúc GPU đang bận bị bỏ
              │     └─► SelectionTracker (bám laser, giữ để xác nhận) ─► SelectionHub (/api/vision/ws, view3d)
              └─► mỗi trang đang xem (/api/camera/ws): khung mới nhất khi socket rảnh (mạng chậm thì bỏ khung)

Chọn / tắt / tạm dừng camera qua REST (routers/camera.py); lựa chọn lưu ở DATA_DIR/camera.json nên máy chủ khởi
động lại vẫn chạy tiếp camera đó. Trang web chỉ xem: đóng tab không làm dừng nhận diện. Hình gửi theo nhịp camera,
không chờ nhận diện; lớp vẽ dùng kết quả gần nhất (trễ hơn hình đúng bằng thời gian nhận diện). Tuỳ chọn nhận diện
(vật thể, ngưỡng, thời gian giữ) dùng chung, là của lần gửi gần nhất. Mọi hàm chạy trên event loop trừ chỗ ghi rõ.
"""
from __future__ import annotations

import asyncio
from collections import deque
from contextlib import suppress
from dataclasses import asdict, dataclass
import json
from pathlib import Path
import time
from typing import Any, Callable
from uuid import uuid4

from fastapi import WebSocket

from core.logging import logger
from models import LiveOptionsIn, PointerMode, SelectionSummary, SelectionUpdate
from services.detector import Detector, DetectorBusy, ModelChanged
from services.laser_model import LaserUnavailable
from services.live_tracking import SelectionTracker
from services import rtsp_stream
from services.rtsp_stream import OPEN_TIMEOUT_MS, RtspStream, check_url, display_url, redact
from services.selection_stream import SelectionHub

OPEN_TIMEOUT_SECONDS = OPEN_TIMEOUT_MS / 1000 + 2
# Lỗi nhận diện lặp lại (thiếu model laser…): chờ rồi mới thử khung tiếp
ERROR_RETRY_SECONDS = 1.0


@dataclass
class LiveOptions:
    targets: list[str] | None = None
    confidence: float | None = None
    dwell_ms: int = 300


class Viewer:
    """Một trang đang xem. Chỉ `LiveHub.send_loop` gửi lên socket nên các bản tin không chen nhau."""

    def __init__(self, socket: WebSocket):
        self.socket = socket
        # Tab ẩn → False: không gửi hình / kết quả
        self.video = True
        self.stream: LiveStream | None = None
        self.sent_seq = 0
        self.notices: deque[dict[str, Any]] = deque(maxlen=8)
        # Chỉ giữ kết quả mới nhất chưa gửi
        self.result: dict[str, Any] | None = None
        self.wake = asyncio.Event()

    def notify(self, message: dict[str, Any]) -> None:
        self.notices.append(message)
        self.wake.set()

    def offer_result(self, message: dict[str, Any]) -> None:
        self.result = message
        self.wake.set()


class LiveStream:
    """Một camera đang chạy: luồng đọc RTSP + vòng nhận diện."""

    def __init__(self, hub: LiveHub, url: str):
        self.hub = hub
        self.url = url
        self.loop = asyncio.get_running_loop()
        self.tracker = SelectionTracker()
        # Phiên của camera này trong SelectionHub (view3d thấy như một nguồn chọn)
        self.session_id = f"camera-{uuid4().hex[:12]}"
        self._frame = asyncio.Event()
        self.reader_error: str | None = None
        self.infer_error: str | None = None
        self._had_frame = False
        self.reader = RtspStream(url, hub.open_capture, self._changed_threadsafe)
        self._task = asyncio.create_task(self._infer_loop(), name="live-infer")

    @property
    def error(self) -> str | None:
        return self.reader_error or self.infer_error

    def wake(self) -> None:
        self._frame.set()

    # ===== luồng đọc RTSP → event loop =====

    def _changed_threadsafe(self) -> None:
        """Gọi từ luồng đọc RTSP mỗi khung mới / lỗi kết nối."""
        try:
            self.loop.call_soon_threadsafe(self._changed)
        except RuntimeError:
            pass  # event loop đã đóng (máy chủ đang tắt)

    def _changed(self) -> None:
        if self.hub.stream is not self:
            return
        self._frame.set()
        had_frame = self.reader.seq > 0
        if self.reader.error != self.reader_error or had_frame != self._had_frame:
            self.reader_error, self._had_frame = self.reader.error, had_frame
            self.hub.broadcast_state()
        for viewer in self.hub.viewers:
            viewer.wake.set()

    def _set_infer_error(self, message: str | None) -> None:
        if message != self.infer_error:
            self.infer_error = message
            self.hub.broadcast_state()

    # ===== nhận diện =====

    def detect_changed(self) -> None:
        if self.hub.detect:
            self._frame.set()
        else:
            # Tạm dừng: bỏ trạng thái bám, báo view3d không còn vật đang chọn
            self.tracker.reset()
            self._set_infer_error(None)
            self._publish_selection()

    async def _infer_loop(self) -> None:
        hub = self.hub
        detector: Detector = hub.detector
        done = 0
        revision = detector.model_revision
        while True:
            await self._frame.wait()
            self._frame.clear()
            if not hub.detect or not detector.ready.is_set():
                continue
            seq, frame, read_at = self.reader.latest()
            if frame is None or seq == done:
                continue
            if detector.model_revision != revision:
                revision = detector.model_revision
                self.tracker.reset()
            height, width = frame.shape[:2]
            options = hub.options
            try:
                frame_options = detector.options(
                    ",".join(options.targets) if options.targets else None, options.confidence, None,
                    PointerMode.laser, self.tracker.hint(width, height),
                )
                result = await asyncio.to_thread(detector.analyze_image, frame, frame_options)
            except (DetectorBusy, ModelChanged):
                # Đang nạp mô hình: thử lại ngay với khung mới nhất
                self._frame.set()
                continue
            except (ValueError, LaserUnavailable) as exc:
                self._set_infer_error(str(exc))
                await asyncio.sleep(ERROR_RETRY_SECONDS)
                continue
            except Exception:
                logger.exception("Live frame analysis failed")
                self._set_infer_error("Không xử lý được khung hình.")
                await asyncio.sleep(ERROR_RETRY_SECONDS)
                continue
            done = seq
            # Tạm dừng / đổi mô hình trong lúc GPU chạy: bỏ kết quả này
            if not hub.detect or detector.model_revision != revision:
                continue
            self._set_infer_error(None)
            now = time.monotonic()
            shown = self.tracker.step(result, now * 1000, options.dwell_ms)
            tracking = self.tracker.tracking
            message = {
                "type": "result",
                "result": shown.model_dump(mode="json"),
                "tracking": {
                    "held": tracking.held.model_dump(mode="json") if tracking.held else None,
                    "pending": {"name": tracking.pending, "elapsed_ms": round(now * 1000 - tracking.pending_since)}
                    if tracking.pending else None,
                },
                # Từ lúc đọc được khung tới lúc có kết quả
                "latency_ms": round((now - read_at) * 1000),
            }
            for viewer in hub.viewers:
                if viewer.video:
                    viewer.offer_result(message)
            self._publish_selection()

    def _publish_selection(self) -> None:
        held = self.tracker.tracking.held
        selected = SelectionSummary(name=held.name, confidence=round(held.confidence, 2)) if held else None
        if selected is None and self.session_id not in self.hub.selections.sessions:
            return  # chưa từng chọn gì: view3d không cần thấy phiên rỗng
        # SelectionHub tự bỏ bản tin trùng trạng thái trước
        self.hub.selections.update(self.session_id, SelectionUpdate(
            selected=selected, pointer_mode=PointerMode.laser, source="camera"))

    def close(self) -> None:
        self._task.cancel()
        self.reader.stop()
        self.hub.selections.disconnect(self.session_id)


class LiveHub:
    """Camera máy chủ đang chạy (tối đa một) và các trang đang xem."""

    def __init__(self, detector: Detector, selections: SelectionHub, state_file: Path | None = None,
                 open_capture: Callable[[str], Any] | None = None):
        self.detector = detector
        self.selections = selections
        self.state_file = state_file
        self.open_capture = open_capture or rtsp_stream.open_capture
        self.stream: LiveStream | None = None
        self.name: str | None = None
        self.detect = True
        self.options = LiveOptions()
        self.viewers: set[Viewer] = set()
        self._last_state: dict[str, Any] | None = None

    # ===== lưu / khôi phục =====

    def _save(self) -> None:
        if self.state_file is None:
            return
        data = {"url": self.stream.url if self.stream else None, "name": self.name, "detect": self.detect,
                "options": asdict(self.options)}
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.state_file.with_suffix(".tmp")
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            temporary.replace(self.state_file)
        except OSError:
            logger.exception("Could not save camera state to %s", self.state_file)

    def restore(self) -> None:
        """Khởi động máy chủ: chạy tiếp camera đã chọn (không chờ hình; luồng đọc tự kết nối lại)."""
        if self.state_file is None or not self.state_file.is_file():
            return
        try:
            data = json.loads(self.state_file.read_text(encoding="utf-8"))
            self.detect = bool(data.get("detect", True))
            options = data.get("options") or {}
            self.options = LiveOptions(options.get("targets") or None, options.get("confidence"),
                                       int(options.get("dwell_ms", 300)))
            if data.get("url"):
                self._open(check_url(str(data["url"])), data.get("name"))
                logger.info("Camera restored: %s", redact(self.stream.url))
        except (OSError, ValueError, TypeError, AttributeError):
            logger.warning("Ignoring invalid camera state in %s", self.state_file)

    # ===== điều khiển =====

    def _open(self, url: str, name: str | None) -> LiveStream:
        if self.stream is not None:
            self.stream.close()
        self.stream = LiveStream(self, url)
        self.name = name
        self._save()
        self.broadcast_state()
        return self.stream

    async def start(self, url: str, name: str | None = None) -> None:
        """Chạy camera này (thay camera đang chạy); chờ khung đầu tiên.
        ValueError: địa chỉ sai. TimeoutError: không có hình — camera bị tắt, không giữ lại địa chỉ hỏng."""
        url = check_url(url)
        stream = self.stream
        if stream is not None and stream.url == url and stream.reader.seq > 0:
            self.name = name
            self._save()
            self.broadcast_state()
            return
        stream = self._open(url, name)
        try:
            await asyncio.to_thread(stream.reader.wait_first, OPEN_TIMEOUT_SECONDS)
        except BaseException:
            if self.stream is stream:
                self.stop()
            raise

    def stop(self) -> None:
        if self.stream is not None:
            self.stream.close()
        self.stream = None
        self.name = None
        self._save()
        self.broadcast_state()

    def set_detect(self, detect: bool) -> None:
        self.detect = detect
        self._save()
        if self.stream is not None:
            self.stream.detect_changed()
        self.broadcast_state()

    def set_options(self, message: LiveOptionsIn) -> None:
        options = LiveOptions(message.targets or None, message.confidence, message.dwell_ms)
        if options == self.options:
            return
        self.options = options
        self._save()
        if self.stream is not None:
            self.stream.wake()

    # ===== trạng thái → các trang đang xem =====

    def state(self) -> dict[str, Any]:
        stream = self.stream
        width = height = None
        if stream is None:
            status, error = "off", None
        else:
            _, frame, _ = stream.reader.latest()
            if frame is not None:
                height, width = frame.shape[:2]
            status = "connecting" if frame is None else "reconnecting" if stream.reader_error else "live"
            error = stream.error
        return {"status": status, "url": display_url(stream.url) if stream else None, "name": self.name,
                "detect": self.detect, "error": error, "width": width, "height": height}

    def broadcast_state(self) -> None:
        state = self.state()
        if state == self._last_state:
            return
        self._last_state = state
        for viewer in self.viewers:
            viewer.notify({"type": "camera", **state})

    def add_viewer(self, viewer: Viewer) -> None:
        self.viewers.add(viewer)
        viewer.notify({"type": "camera", **self.state()})

    def remove_viewer(self, viewer: Viewer) -> None:
        self.viewers.discard(viewer)

    def set_video(self, viewer: Viewer, video: bool) -> None:
        viewer.video = video
        if not video:
            viewer.result = None
        viewer.wake.set()

    async def send_loop(self, viewer: Viewer) -> None:
        socket = viewer.socket
        while True:
            await viewer.wake.wait()
            viewer.wake.clear()
            while viewer.notices:
                await socket.send_json(viewer.notices.popleft())
            if viewer.result is not None:
                message, viewer.result = viewer.result, None
                await socket.send_json(message)
            stream = self.stream
            if stream is not viewer.stream:
                viewer.stream, viewer.sent_seq = stream, 0
            # Gửi xong khung trước mới lấy khung mới nhất: mạng chậm thì bỏ khung giữa, hình không trễ dần
            if stream is not None and viewer.video and stream.reader.seq > viewer.sent_seq:
                seq, payload = await asyncio.to_thread(stream.reader.jpeg)
                if seq > viewer.sent_seq and stream is self.stream:
                    viewer.sent_seq = seq
                    await socket.send_bytes(payload)

    async def shutdown(self) -> None:
        """Tắt máy chủ: dừng camera nhưng giữ lựa chọn trong file để lần sau chạy tiếp."""
        stream, self.stream = self.stream, None
        if stream is not None:
            stream.close()
            with suppress(asyncio.CancelledError, Exception):
                await stream._task
