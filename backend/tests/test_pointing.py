from services.pointing import index_tip, object_at_point
from tests.helpers import hand_pointing_at, rectangle


def test_index_tip_converts_and_clamps():
    assert index_tip(None, 640, 480) is None
    assert index_tip(hand_pointing_at(0.25, 0.5), 640, 480) == (160, 240)
    outside = hand_pointing_at(1.2, -0.1)
    assert index_tip(outside, 640, 480) == (639, 0)


def test_object_at_point_needs_a_point():
    assert object_at_point([rectangle(0, 0, 10, 10)], None, 30) is None


def test_object_at_point_inside_picks_deepest():
    # Giống finger_select.py: đầu ngón tay nằm sâu trong mask nào hơn thì chọn mask đó
    laptop, mouse = rectangle(0, 0, 400, 300), rectangle(180, 130, 220, 170)
    assert object_at_point([laptop, mouse], (200, 150), 0) == 0
    assert object_at_point([laptop, mouse], (50, 50), 0) == 0
    left, right = rectangle(0, 0, 100, 100), rectangle(90, 0, 300, 100)
    # (97, 50): cách mép phải của left 3px, cách mép trái của right 7px → nằm sâu trong right hơn
    assert object_at_point([left, right], (97, 50), 0) == 1


def test_object_at_point_same_depth_picks_smaller():
    big, small = rectangle(0, 0, 200, 20), rectangle(90, 0, 110, 20)
    assert object_at_point([big, small], (100, 10), 0) == 1


def test_object_at_point_outside_uses_nearest_within_tolerance():
    left, right = rectangle(0, 0, 100, 100), rectangle(140, 0, 240, 100)
    # (125, 50): cách mép phải của left 25px, cách mép trái của right 15px
    assert object_at_point([left, right], (125, 50), 30) == 1
    assert object_at_point([left, right], (125, 50), 10) is None


def test_object_at_point_skips_degenerate_polygons():
    line = [[0.0, 0.0], [10.0, 10.0]]
    assert object_at_point([line, rectangle(0, 0, 20, 20)], (5, 5), 0) == 1
    assert object_at_point([], (5, 5), 30) is None
