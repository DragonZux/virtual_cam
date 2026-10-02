"""Camera RTSP (MediaMTX, camera IP) đọc ở máy chủ; trình duyệt lấy từng khung mới nhất dạng JPEG.

Trình duyệt không mở được rtsp:// nên OpenCV/FFmpeg đọc luồng trong một luồng nền cho mỗi URL (như
`ffplay rtsp://...`), chỉ giữ khung mới nhất để không trễ dần. Trang vẽ JPEG vào <video> (useCamera.startStream)
nên vòng gửi khung, lớp vẽ và nhận diện không cần biết nguồn. Không ai lấy khung trong IDLE_SECONDS thì đóng luồng.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any, Callable
from urllib.parse import urlsplit
from uuid import uuid4

# Phải đặt trước khi mở VideoCapture: RTSP qua TCP (UDP hay mất gói / bị chặn khi chạy trong Docker)
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from core.logging import logger  # noqa: E402

SCHEMES = ("rtsp", "rtsps")
IDLE_SECONDS = 20.0
OPEN_TIMEOUT_MS = 8000
MAX_STREAMS = 4
MAX_SIDE = 1280
JPEG_QUALITY = 85


def check_url(url: str) -> str:
    url = url.strip()
    parts = urlsplit(url)
    if parts.scheme.lower() not in SCHEMES or not parts.hostname or any(c.isspace() or ord(c) < 32 for c in url):
        raise ValueError("Địa chỉ phải dạng rtsp://máy:cổng/đường_dẫn, ví dụ rtsp://10.0.9.41:8554/camera.")
    return url


def redact(url: str) -> str:
    """Không ghi mật khẩu camera vào log."""
    parts = urlsplit(url)
    return parts._replace(netloc=f"***@{parts.netloc.rsplit('@', 1)[1]}").geturl() if "@" in parts.netloc else url


def open_capture(url: str) -> Any:
    return cv2.VideoCapture(url, cv2.CAP_FFMPEG,
                            [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, OPEN_TIMEOUT_MS, cv2.CAP_PROP_READ_TIMEOUT_MSEC, OPEN_TIMEOUT_MS])


class RtspStream:
    def __init__(self, url: str, open_capture: Callable[[str], Any]):
        self.url = url
        self._open = open_capture
        self._cond = threading.Condition()
        self.frame: np.ndarray | None = None
        self.seq = 0
        self.error: str | None = None
        self.last_access = time.monotonic()
        self.stopped = False
        self._jpeg: tuple[int, bytes] = (0, b"")
        self._thread = threading.Thread(target=self._run, name="rtsp", daemon=True)
        self._thread.start()

    def _set_error(self, message: str) -> None:
        with self._cond:
            self.error = message
            self._cond.notify_all()

    def _idle(self) -> bool:
        return time.monotonic() - self.last_access > IDLE_SECONDS

    def _run(self) -> None:
        delay = 1.0
        logger.info("RTSP open %s", redact(self.url))
        while not self.stopped and not self._idle():
            capture = self._open(self.url)
            try:
                if not capture.isOpened():
                    self._set_error("Không kết nối được luồng RTSP. Kiểm tra địa chỉ, cổng và MediaMTX.")
                else:
                    while not self.stopped and not self._idle():
                        ok, frame = capture.read()
                        if not ok or frame is None:
                            self._set_error("Mất tín hiệu RTSP, đang kết nối lại…")
                            break
                        with self._cond:
                            self.frame, self.error = frame, None
                            self.seq += 1
                            self._cond.notify_all()
                        delay = 1.0
            finally:
                capture.release()
            # Chờ rồi kết nối lại (luồng MediaMTX có thể chưa có người phát)
            deadline = time.monotonic() + delay
            while not self.stopped and time.monotonic() < deadline:
                time.sleep(0.1)
            delay = min(delay * 2, 10.0)
        self.stopped = True
        with self._cond:
            self._cond.notify_all()
        logger.info("RTSP closed %s", redact(self.url))

    def next_jpeg(self, after: int, timeout: float) -> tuple[int, bytes]:
        """Khung mới hơn `after`; TimeoutError kèm lý do nếu chưa có."""
        self.last_access = time.monotonic()
        with self._cond:
            # Lúc mở (after = 0) lỗi kết nối báo ngay; đang chạy thì chờ luồng tự kết nối lại
            ready = lambda: self.seq > after or self.stopped or (after == 0 and self.error is not None)  # noqa: E731
            if not self._cond.wait_for(ready, timeout) or self.seq <= after:
                raise TimeoutError(self.error or "Chưa nhận được hình từ luồng RTSP.")
            seq, frame = self.seq, self.frame
        if self._jpeg[0] != seq:
            height, width = frame.shape[:2]
            scale = MAX_SIDE / max(height, width)
            if scale < 1:
                frame = cv2.resize(frame, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
            ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            if not ok:
                raise TimeoutError("Không mã hoá được khung RTSP.")
            self._jpeg = (seq, buffer.tobytes())
        return self._jpeg

    def stop(self) -> None:
        self.stopped = True


class StreamHub:
    """Mỗi URL một luồng đọc dùng chung; mỗi trình duyệt một phiên nhớ khung đã nhận."""

    def __init__(self, open_capture: Callable[[str], Any] = open_capture):
        self._open = open_capture
        self._lock = threading.Lock()
        self._streams: dict[str, RtspStream] = {}
        # phiên → (url, seq khung đã gửi, lần lấy gần nhất)
        self._sessions: dict[str, list[Any]] = {}

    def _reap(self) -> None:
        now = time.monotonic()
        for key in [k for k, (_, _, seen) in self._sessions.items() if now - seen > IDLE_SECONDS]:
            del self._sessions[key]
        used = {url for url, _, _ in self._sessions.values()}
        for url in [u for u, s in self._streams.items() if s.stopped or u not in used]:
            self._streams.pop(url).stop()

    def open(self, url: str, timeout: float = OPEN_TIMEOUT_MS / 1000 + 2) -> dict[str, Any]:
        url = check_url(url)
        with self._lock:
            self._reap()
            stream = self._streams.get(url)
            if stream is None:
                if len(self._streams) >= MAX_STREAMS:
                    raise ValueError(f"Đang mở tối đa {MAX_STREAMS} luồng RTSP; tắt bớt rồi thử lại.")
                stream = self._streams[url] = RtspStream(url, self._open)
            session = uuid4().hex
            self._sessions[session] = [url, 0, time.monotonic()]
        try:
            stream.next_jpeg(0, timeout)
        except TimeoutError:
            self.close(session)
            raise
        height, width = stream.frame.shape[:2]
        return {"id": session, "width": width, "height": height}

    def frame(self, session: str, timeout: float = 3.0) -> bytes:
        with self._lock:
            entry = self._sessions.get(session)
            stream = self._streams.get(entry[0]) if entry else None
            if entry is None or stream is None or stream.stopped:
                self._sessions.pop(session, None)
                raise KeyError(session)
            entry[2] = time.monotonic()
        seq, payload = stream.next_jpeg(entry[1], timeout)
        entry[1] = seq
        return payload

    def close(self, session: str) -> None:
        with self._lock:
            self._sessions.pop(session, None)
            self._reap()

    def shutdown(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._reap()
