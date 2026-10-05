from models import FrameResult, FrameSize, LaserSpot, SelectedObject
from services.live_tracking import HOLD_MS, LaserTrack, SelectionTracker, Tracking, advance_laser, advance_tracking

LONG_SIDE = 1280  # khung laser: cạnh dài 1280 → "cùng chấm" trong 80 px


def run(points, start=LaserTrack()):
    track = start
    steps = []
    for raw in points:
        track, accepted = advance_laser(track, raw, LONG_SIDE)
        steps.append((track, accepted))
    return steps


def test_the_first_dot_is_shown_immediately():
    [(track, accepted)] = run([(600, 300)])
    assert accepted and track.point == (600, 300)


def test_a_one_frame_jump_to_a_look_alike_is_ignored_and_the_dot_stays_put():
    steps = run([(600, 300), (602, 301), (100, 700), (603, 302)])
    jump, accepted = steps[2]
    assert not accepted and jump.point == steps[1][0].point
    assert steps[3][1] and steps[3][0].point[0] > 600


def test_a_real_move_to_a_new_place_is_followed_after_it_repeats():
    steps = run([(600, 300), (600, 300), (100, 700), (104, 702)])
    assert not steps[2][1]
    assert steps[3][1] and steps[3][0].point == (104, 702)


def test_short_dropouts_keep_the_dot_long_ones_clear_it():
    steps = run([(600, 300), (600, 300), None, None, None, None])
    assert [track.point for track, _ in steps[2:5]] == [(600, 300)] * 3
    assert not any(accepted for _, accepted in steps[2:])
    assert steps[5][0].point is None


def test_small_hand_shake_is_smoothed_and_a_real_move_is_followed_without_lag():
    [_, (shaken, _)] = run([(600, 300), (605, 300)])
    assert 600 < shaken.point[0] < 605
    [_, (moved, accepted)] = run([(600, 300), (640, 320)])
    assert accepted and moved.point == (640, 320)


def selected(name="cup"):
    return SelectedObject(index=0, name=name, confidence=0.9, polygon=[[0, 0], [10, 0], [10, 10]])


def test_dwell_confirms_and_hold_keeps_the_name_briefly():
    state = advance_tracking(Tracking(), selected(), 0, 300)
    assert state.held is None and state.pending == "cup"
    state = advance_tracking(state, selected(), 299, 300)
    assert state.held is None
    state = advance_tracking(state, selected(), 300, 300)
    assert state.held.name == "cup" and state.pending is None
    # Chấm rời đi: tên còn giữ HOLD_MS rồi mới bỏ
    assert advance_tracking(state, None, 300 + HOLD_MS, 300).held.name == "cup"
    assert advance_tracking(state, None, 301 + HOLD_MS, 300).held is None
    # Sang vật khác phải đếm lại từ đầu
    other = advance_tracking(state, selected("mouse"), 400, 300)
    assert other.held.name == "cup" and other.pending == "mouse" and other.pending_since == 400


def frame(point, name="cup"):
    return FrameResult(
        pointer_mode="laser", laser=LaserSpot(point=list(point), score=0.9) if point else None,
        hand_detected=False, landmarks=[], selected=selected(name) if point else None, detections=[],
        processing_ms=20, resolution=FrameSize(width=1280, height=720),
    )


def test_tracker_keeps_the_shown_object_through_a_noisy_frame_and_hints_the_spot():
    tracker = SelectionTracker()
    assert tracker.hint(1280, 720) is None
    first = tracker.step(frame((600, 300)), 0, 0)
    assert first.selected.name == "cup" and tracker.tracking.held.name == "cup"
    assert tracker.hint(1280, 720) == (600, 300)
    assert tracker.hint(640, 360) is None  # khung khác cỡ: vị trí cũ vô nghĩa
    # Một khung chấm nhảy sang đốm sáng khác trên vật khác: vẫn hiện chấm + vật cũ, không bắt đầu đếm vật mới
    noisy = tracker.step(frame((100, 700), "mouse"), 10, 300)
    assert noisy.laser.point == [600, 300] and noisy.selected.name == "cup"
    assert tracker.tracking.pending is None
    # Mất chấm lâu: bỏ chấm và vật
    for at in range(20, 80, 10):
        lost = tracker.step(frame(None), at, 0)
    assert lost.laser is None and lost.selected is None
    tracker.reset()
    assert tracker.shown is None and tracker.tracking == Tracking()
