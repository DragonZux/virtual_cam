"""Bám chấm laser và "giữ để xác nhận" qua nhiều khung của một luồng camera (mỗi khung nhận diện độc lập).

Trước đây nằm ở frontend (utils/laserTrack.ts, utils/tracking.ts); máy chủ tự đọc RTSP và nhận diện nên bước
xác nhận cũng ở đây: vật thể đã xác nhận phát thẳng tới /api/vision/ws (view3d) và trình duyệt chỉ hiển thị.

Bám chấm laser:
- Chưa bám chấm nào: nhận ngay (mô hình đã tự bỏ khung có hai chấm giống nhau), không làm chậm lúc bật laser.
- Chấm nhảy xa chỗ đang bám phải lặp lại ở cùng chỗ CONFIRM_FRAMES khung liền mới được nhận,
  nên một khung nhiễu (đèn LED, phản chiếu) không làm chấm / vật được chọn nhảy đi.
- Chấm gần chỗ đang bám thì nhận ngay; rung nhẹ được làm mượt, di chuyển thật thì bám theo không trễ.
- Mất chấm vài khung (tay rung, nhoè) vẫn giữ vị trí cũ tối đa MAX_MISSES khung rồi mới bỏ.
Vị trí ổn định được dùng làm laser_hint cho khung sau để mô hình ưu tiên ứng viên gần đó.

Giữ để xác nhận:
- `pending`: chấm vừa chạm vật thể, đang đếm thời gian giữ (dwell).
- `held`: vật thể đã xác nhận; giữ thêm HOLD_MS sau khi chấm rời đi để tên không nhấp nháy.
"""
from __future__ import annotations

from dataclasses import dataclass
import math

from models import FrameResult, SelectedObject

# Bán kính "cùng một chấm" giữa hai khung, pixel ở khung cạnh dài 640 (khớp HINT_RADIUS của mô hình laser)
LASER_GATE = 40
CONFIRM_FRAMES = 2
MAX_MISSES = 3
# Dịch chuyển dưới mức này (pixel ở khung 640) coi là rung tay → làm mượt; lớn hơn thì theo ngay
JITTER = 4
# Trọng số vị trí mới khi làm mượt rung tay (1 = không làm mượt)
SMOOTHING = 0.5
HOLD_MS = 500

Point = tuple[float, float]


@dataclass(frozen=True)
class LaserTrack:
    # Vị trí ổn định (pixel của khung); None = chưa bám được chấm nào
    point: Point | None = None
    # Chấm ở chỗ khác đang chờ lặp lại đủ số khung
    candidate: Point | None = None
    candidate_count: int = 0
    # Số khung liền không thấy chấm ở chỗ đang bám
    misses: int = 0


def advance_laser(prev: LaserTrack, raw: Point | None, long_side: int) -> tuple[LaserTrack, bool]:
    """→ (vị trí mới, chấm của khung này có trùng chỗ đang bám không — vật mô hình chọn ở khung này tin được)."""
    gate = LASER_GATE * long_side / 640
    if raw is not None and prev.point is not None and math.dist(raw, prev.point) <= gate:
        if math.dist(raw, prev.point) <= JITTER * long_side / 640:
            point = (prev.point[0] + (raw[0] - prev.point[0]) * SMOOTHING,
                     prev.point[1] + (raw[1] - prev.point[1]) * SMOOTHING)
        else:
            point = raw
        return LaserTrack(point), True
    if raw is not None and prev.point is None:
        return LaserTrack(raw), True
    misses = prev.misses + 1
    keep = prev.point if prev.point is not None and misses <= MAX_MISSES else None
    if raw is None:
        return LaserTrack(keep, misses=misses), False
    count = prev.candidate_count + 1 if prev.candidate is not None and math.dist(raw, prev.candidate) <= gate else 1
    if count >= CONFIRM_FRAMES:
        return LaserTrack(raw), True
    return LaserTrack(keep, raw, count, misses), False


@dataclass(frozen=True)
class Tracking:
    held: SelectedObject | None = None
    held_at: float = 0
    pending: str | None = None
    pending_since: float = 0


def advance_tracking(prev: Tracking, selected: SelectedObject | None, now: float, dwell_ms: float) -> Tracking:
    if selected is not None and prev.held is not None and prev.held.name == selected.name:
        return Tracking(selected, now)
    since = prev.pending_since if selected is not None and prev.pending == selected.name else now
    if selected is not None and now - since >= dwell_ms:
        return Tracking(selected, now)
    keep = prev.held is not None and now - prev.held_at <= HOLD_MS
    return Tracking(prev.held if keep else None, prev.held_at if keep else 0,
                    selected.name if selected is not None else None, since if selected is not None else 0)


def same_size(a: FrameResult, b: FrameResult) -> bool:
    return a.resolution == b.resolution


class SelectionTracker:
    """Trạng thái bám của một luồng camera (dùng trên event loop, không cần khoá)."""

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.laser = LaserTrack()
        self.tracking = Tracking()
        # Kết quả đã ổn định đang hiển thị
        self.shown: FrameResult | None = None

    def hint(self, width: int, height: int) -> tuple[int, int] | None:
        """Gợi ý cho khung sau — chỉ có nghĩa khi khung mới cùng cỡ với khung cho ra vị trí đang bám."""
        point = self.laser.point
        shown = self.shown
        if point is None or shown is None or (shown.resolution.width, shown.resolution.height) != (width, height):
            return None
        return round(point[0]), round(point[1])

    def step(self, result: FrameResult, now: float, dwell_ms: float) -> FrameResult:
        """Chỉ tin khung có chấm ở đúng chỗ đang bám. Khung nhiễu (chấm nhảy sang đốm sáng khác, mất chấm thoáng
        qua) giữ nguyên chấm + vật đang hiển thị và không làm gián đoạn bước giữ để xác nhận."""
        raw = (float(result.laser.point[0]), float(result.laser.point[1])) if result.laser else None
        laser, accepted = advance_laser(self.laser, raw, max(result.resolution.width, result.resolution.height))
        previous = self.shown
        point = laser.point
        if accepted and point is not None and result.laser is not None:
            spot = result.laser.model_copy(update={"point": [round(point[0]), round(point[1])]})
            shown = result.model_copy(update={"laser": spot})
            self.tracking = advance_tracking(self.tracking, result.selected, now, dwell_ms)
        elif point is not None and previous is not None and previous.laser is not None and same_size(previous, result):
            shown = previous.model_copy(update={"processing_ms": result.processing_ms})
        else:
            shown = result.model_copy(update={"laser": None, "selected": None})
            self.tracking = advance_tracking(self.tracking, None, now, dwell_ms)
        self.laser = laser
        self.shown = shown
        return shown
