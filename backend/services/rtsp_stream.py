"""Camera RTSP (MediaMTX, camera IP) đọc ở máy chủ.

Trình duyệt không mở được rtsp:// nên OpenCV/FFmpeg đọc luồng trong một luồng nền cho mỗi URL (như
`ffplay rtsp://...`) và chỉ giữ khung mới nhất: khung cũ bị ghi đè nên hình không bao giờ trễ dần.
Mỗi khung mới (hoặc lỗi kết nối) gọi `on_change` từ luồng đọc; services/live_stream.py dùng để nhận diện khung
mới nhất và gửi hình về trình duyệt. Luồng chạy (tự kết nối lại khi mất tín hiệu) tới khi gọi `stop()`.
"""
from __future__ import annotations

import os
import socket
import threading
import time
from typing import Any, Callable
from urllib.parse import urlsplit

# Phải đặt trước khi mở VideoCapture: RTSP qua TCP (UDP hay mất gói / bị chặn khi chạy trong Docker)
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
# Ẩn log giải mã của FFmpeg ("Missing reference picture", "decode_slice_header error"…): bình thường khi vào luồng
# H.264 giữa chừng, tự hết khi gặp keyframe. Mất kết nối / mất tín hiệu vẫn có log riêng của ứng dụng.
# Đặt OPENCV_FFMPEG_LOGLEVEL=24 (warning) khi cần xem lại để gỡ lỗi camera.
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "8")

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from core.logging import logger  # noqa: E402

SCHEMES = ("rtsp", "rtsps")
OPEN_TIMEOUT_MS = 8000
PORT_CHECK_SECONDS = 3.0
# Cạnh dài khung giữ lại: dùng chung cho nhận diện (laser cần 1280 để thấy chấm nhỏ) và hình gửi về trình duyệt
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


def display_url(url: str) -> str:
    """Địa chỉ gửi cho trình duyệt: bỏ hẳn tài khoản / mật khẩu (trang khác trong mạng cũng thấy camera đang chạy)."""
    parts = urlsplit(url)
    return parts._replace(netloc=parts.netloc.rsplit("@", 1)[-1]).geturl()


def open_capture(url: str) -> Any:
    """Thử cổng TCP trước: cổng đóng / bị chặn thì báo rõ sau vài giây thay vì FFmpeg chờ hết OPEN_TIMEOUT_MS."""
    parts = urlsplit(url)
    host, port = parts.hostname, parts.port or (322 if parts.scheme.lower() == "rtsps" else 554)
    try:
        socket.create_connection((host, port), timeout=PORT_CHECK_SECONDS).close()
    except OSError as exc:
        raise ConnectionError(
            f"Máy chủ không mở được cổng RTSP {host}:{port}. Kiểm tra camera đã bật RTSP đúng cổng này "
            "và mạng / tường lửa giữa máy chủ và camera cho phép cổng đó."
        ) from exc
    return cv2.VideoCapture(url, cv2.CAP_FFMPEG,
                            [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, OPEN_TIMEOUT_MS, cv2.CAP_PROP_READ_TIMEOUT_MSEC, OPEN_TIMEOUT_MS])


def fit(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    scale = MAX_SIDE / max(height, width)
    if scale >= 1:
        return frame
    return cv2.resize(frame, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)


class RtspStream:
    def __init__(self, url: str, open_capture: Callable[[str], Any] = open_capture,
                 on_change: Callable[[], None] = lambda: None):
        self.url = url
        self._open = open_capture
        self._on_change = on_change
        self._cond = threading.Condition()
        self.frame: np.ndarray | None = None
        self.seq = 0
        # time.monotonic() lúc đọc được khung hiện tại
        self.frame_at = 0.0
        self.error: str | None = None
        self.stopped = False
        self._jpeg: tuple[int, bytes] = (0, b"")
        self._jpeg_lock = threading.Lock()
        self._thread = threading.Thread(target=self._run, name="rtsp", daemon=True)
        self._thread.start()

    def _set_error(self, message: str) -> None:
        with self._cond:
            changed = self.error != message
            self.error = message
            self._cond.notify_all()
        if changed:
            self._on_change()

    def _publish(self, frame: np.ndarray) -> None:
        with self._cond:
            self.frame, self.error = frame, None
            self.seq += 1
            self.frame_at = time.monotonic()
            self._cond.notify_all()
        self._on_change()

    def _run(self) -> None:
        delay = 1.0
        logger.info("RTSP open %s", redact(self.url))
        while not self.stopped:
            try:
                capture = self._open(self.url)
            except ConnectionError as exc:
                self._set_error(str(exc))
            else:
                try:
                    if not capture.isOpened():
                        self._set_error("Không kết nối được luồng RTSP. Kiểm tra đường dẫn luồng (ví dụ "
                                        "/Streaming/Channels/101), tài khoản / mật khẩu và nguồn phát MediaMTX.")
                    else:
                        while not self.stopped:
                            ok, frame = capture.read()
                            if not ok or frame is None:
                                self._set_error("Mất tín hiệu RTSP, đang kết nối lại…")
                                break
                            self._publish(fit(frame))
                            delay = 1.0
                finally:
                    capture.release()
            # Chờ rồi kết nối lại (luồng MediaMTX có thể chưa có người phát)
            deadline = time.monotonic() + delay
            while not self.stopped and time.monotonic() < deadline:
                time.sleep(0.1)
            delay = min(delay * 2, 10.0)
        with self._cond:
            self._cond.notify_all()
        logger.info("RTSP closed %s", redact(self.url))

    def latest(self) -> tuple[int, np.ndarray | None, float]:
        """(seq, khung mới nhất, lúc đọc) — khung không bị sửa sau khi đọc nên dùng ngoài khoá được."""
        with self._cond:
            return self.seq, self.frame, self.frame_at

    def wait_first(self, timeout: float) -> None:
        """Chờ khung đầu tiên (chạy ở thread pool); lỗi kết nối lúc mở báo ngay, không chờ hết giờ."""
        with self._cond:
            self._cond.wait_for(lambda: self.seq > 0 or self.error is not None or self.stopped, timeout)
            if self.seq == 0:
                raise TimeoutError(self.error or "Chưa nhận được hình từ luồng RTSP.")

    def jpeg(self) -> tuple[int, bytes]:
        """Khung mới nhất dạng JPEG; mỗi khung chỉ nén một lần dù nhiều người xem (chạy ở thread pool)."""
        seq, frame, _ = self.latest()
        with self._jpeg_lock:
            if self._jpeg[0] != seq and frame is not None:
                ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                if not ok:
                    raise ValueError("Không mã hoá được khung RTSP.")
                self._jpeg = (seq, buffer.tobytes())
            return self._jpeg

    def stop(self) -> None:
        self.stopped = True
        with self._cond:
            self._cond.notify_all()
