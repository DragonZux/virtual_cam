import time

import cv2
import mediapipe as mp
import numpy as np
import torch
from ultralytics import YOLO

# Logitech C930e
CAMERA = "/dev/video3"

CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
CAMERA_FPS = 45

# YOLO segmentation
YOLO_MODEL = "yolo26l-seg.pt"

# MediaPipe hand model
HAND_MODEL = "hand_landmarker.task"

# Detection
CONF = 0.8
IMG_SIZE = 640

# GPU
DEVICE = 0

TARGET_NAMES = {
    "laptop",
    "mouse",
    "keyboard",
}

# Chạy YOLO mỗi frame
YOLO_EVERY_N_FRAMES = 1

# Cho phép fingertip nằm ngoài mép mask tối đa N pixel
FINGER_TOLERANCE_PX = 30

# Giữ tên object một chút để tránh nhấp nháy
HOLD_TIME = 0.5

# Debug / display
SHOW_HAND = True
SHOW_FINGERTIP = True
SHOW_SELECTED_CONTOUR = True

SHOW_FPS = True
SHOW_YOLO_TIME = True
SHOW_HAND_TIME = True
SHOW_TOTAL_TIME = True

cv2.setUseOptimized(True)


if not torch.cuda.is_available():
    raise RuntimeError(
        "CUDA is not available. This file is configured to run YOLO on GPU."
    )

print("CUDA available:", torch.cuda.is_available())
print("GPU:", torch.cuda.get_device_name(DEVICE))


# =========================================================
# YOLO
# =========================================================

print(f"Loading YOLO model: {YOLO_MODEL}")

model = YOLO(YOLO_MODEL)

TARGET_IDS = [
    class_id
    for class_id, class_name in model.names.items()
    if class_name in TARGET_NAMES
]

print("YOLO target classes:")

for class_id in TARGET_IDS:
    print(f"  {class_id}: {model.names[class_id]}")

print(f"YOLO device: cuda:{DEVICE}")
print(f"YOLO imgsz: {IMG_SIZE}")
print(f"YOLO every {YOLO_EVERY_N_FRAMES} frame(s)")


# =========================================================
# MEDIAPIPE TASKS
# =========================================================

BaseOptions = mp.tasks.BaseOptions
VisionRunningMode = mp.tasks.vision.RunningMode
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions

hand_options = HandLandmarkerOptions(
    base_options=BaseOptions(
        model_asset_path=HAND_MODEL
    ),
    running_mode=VisionRunningMode.VIDEO,
    num_hands=1,
    min_hand_detection_confidence=0.6,
    min_hand_presence_confidence=0.6,
    min_tracking_confidence=0.6,
)

hands = HandLandmarker.create_from_options(
    hand_options
)


# =========================================================
# HAND CONNECTIONS
# =========================================================

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),

    (0, 5), (5, 6), (6, 7), (7, 8),

    (5, 9), (9, 10), (10, 11), (11, 12),

    (9, 13), (13, 14), (14, 15), (15, 16),

    (13, 17), (17, 18), (18, 19), (19, 20),

    (0, 17),
]


# =========================================================
# HAND TRACKING
# =========================================================
def get_hand_landmarks(frame):
    # Resize riêng ảnh đưa vào MediaPipe
    # Frame gốc vẫn giữ 1280x720 cho YOLO và hiển thị
    hand_frame = cv2.resize(
        frame,
        (640, 360),
        interpolation=cv2.INTER_LINEAR,
    )

    rgb = cv2.cvtColor(
        hand_frame,
        cv2.COLOR_BGR2RGB
    )

    mp_image = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=rgb,
    )

    timestamp_ms = int(
        time.monotonic() * 1000
    )

    result = hands.detect_for_video(
        mp_image,
        timestamp_ms,
    )

    if not result.hand_landmarks:
        return None

    return result.hand_landmarks[0]


# =========================================================
# INDEX FINGER TIP
# =========================================================

def get_index_tip(frame, landmarks):
    if landmarks is None:
        return None

    height, width = frame.shape[:2]

    # Landmark 8 = INDEX_FINGER_TIP
    tip = landmarks[8]

    x = int(tip.x * width)
    y = int(tip.y * height)

    x = max(
        0,
        min(width - 1, x)
    )

    y = max(
        0,
        min(height - 1, y)
    )

    return x, y


# =========================================================
# DRAW HAND
# =========================================================

def draw_hand(frame, landmarks):
    if landmarks is None:
        return

    height, width = frame.shape[:2]

    points = []

    for landmark in landmarks:
        x = int(
            landmark.x * width
        )

        y = int(
            landmark.y * height
        )

        points.append(
            (x, y)
        )

    for start, end in HAND_CONNECTIONS:
        cv2.line(
            frame,
            points[start],
            points[end],
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )

    for x, y in points:
        cv2.circle(
            frame,
            (x, y),
            3,
            (0, 0, 255),
            -1,
        )


# =========================================================
# FIND OBJECT AT FINGERTIP
# =========================================================

def find_object_at_point(result, point):
    if point is None:
        return None

    if result is None:
        return None

    if result.masks is None:
        return None

    if result.boxes is None:
        return None

    px, py = point

    candidates = []

    for i, polygon in enumerate(
        result.masks.xy
    ):
        if len(polygon) < 3:
            continue

        polygon = np.asarray(
            polygon,
            dtype=np.float32
        )

        # Signed distance:
        # > 0  : inside
        # = 0  : edge
        # < 0  : outside
        distance = cv2.pointPolygonTest(
            polygon,
            (
                float(px),
                float(py)
            ),
            True,
        )

        if distance < -FINGER_TOLERANCE_PX:
            continue

        class_id = int(
            result.boxes.cls[i]
        )

        confidence = float(
            result.boxes.conf[i]
        )

        class_name = model.names[
            class_id
        ]

        area = cv2.contourArea(
            polygon
        )

        candidates.append({
            "name": class_name,
            "class_id": class_id,
            "confidence": confidence,
            "polygon": polygon,
            "area": area,
            "distance": distance,
        })

    if not candidates:
        return None

    candidates.sort(
        key=lambda obj: (
            -obj["distance"],
            obj["area"],
        )
    )

    return candidates[0]


# =========================================================
# OPEN CAMERA
# =========================================================

print(f"Opening Logitech C930e: {CAMERA}")

cap = cv2.VideoCapture(
    CAMERA,
    cv2.CAP_V4L2,
)

if not cap.isOpened():
    raise RuntimeError(
        f"Cannot open Logitech camera: {CAMERA}"
    )

# MJPG giúp 720p/30fps ổn định hơn trên C930e
cap.set(
    cv2.CAP_PROP_FOURCC,
    cv2.VideoWriter_fourcc(*"MJPG"),
)

cap.set(
    cv2.CAP_PROP_FRAME_WIDTH,
    CAMERA_WIDTH,
)

cap.set(
    cv2.CAP_PROP_FRAME_HEIGHT,
    CAMERA_HEIGHT,
)

cap.set(
    cv2.CAP_PROP_FPS,
    CAMERA_FPS,
)

cap.set(
    cv2.CAP_PROP_BUFFERSIZE,
    1
)

ret, test_frame = cap.read()

if not ret:
    cap.release()
    hands.close()

    raise RuntimeError(
        "Logitech camera opened but cannot read video frame"
    )

print("Logitech C930e connected")
print("Frame shape:", test_frame.shape)
print(
    "Camera FPS reported:",
    cap.get(cv2.CAP_PROP_FPS)
)

print()
print("Point index finger at an object")
print("Press Q or ESC to quit")
print()


# =========================================================
# STATE
# =========================================================

last_selected_name = None
last_selected_time = 0.0

frame_index = 0
cached_result = None

# Timings
last_yolo_ms = 0.0
last_hand_ms = 0.0
last_total_ms = 0.0

# Smoothed timings
smooth_yolo_ms = 0.0
smooth_hand_ms = 0.0
smooth_total_ms = 0.0

TIME_ALPHA = 0.15

# FPS
previous_frame_time = time.perf_counter()
fps = 0.0
FPS_ALPHA = 0.10


# =========================================================
# HELPERS
# =========================================================

def smooth_value(old_value, new_value, alpha):
    if old_value <= 0:
        return new_value

    return (
        alpha * new_value
        + (1.0 - alpha) * old_value
    )


# =========================================================
# MAIN LOOP
# =========================================================

try:
    while True:
        total_start = time.perf_counter()

        ret, frame = cap.read()

        if not ret:
            print("Failed to read frame")
            break

        frame_index += 1

        # =====================================================
        # 1. HAND TRACKING
        # =====================================================

        hand_start = time.perf_counter()

        hand_landmarks = get_hand_landmarks(
            frame
        )

        fingertip = get_index_tip(
            frame,
            hand_landmarks,
        )

        last_hand_ms = (
            time.perf_counter()
            - hand_start
        ) * 1000.0

        smooth_hand_ms = smooth_value(
            smooth_hand_ms,
            last_hand_ms,
            TIME_ALPHA,
        )

        # =====================================================
        # 2. YOLO SEGMENTATION
        # =====================================================

        should_run_yolo = (
            cached_result is None
            or frame_index % YOLO_EVERY_N_FRAMES == 0
        )

        if should_run_yolo:
            yolo_start = time.perf_counter()

            cached_result = model.predict(
                source=frame,
                classes=TARGET_IDS,
                conf=CONF,
                imgsz=IMG_SIZE,
                device=DEVICE,
                quantize="fp16",
                verbose=False,
            )[0]

            # CUDA kernels có thể async.
            # Synchronize để số YOLO ms phản ánh chính xác hơn.
            torch.cuda.synchronize(
                DEVICE
            )

            last_yolo_ms = (
                time.perf_counter()
                - yolo_start
            ) * 1000.0

            smooth_yolo_ms = smooth_value(
                smooth_yolo_ms,
                last_yolo_ms,
                TIME_ALPHA,
            )

        result = cached_result

        # =====================================================
        # 3. FIND OBJECT
        # =====================================================

        selected = find_object_at_point(
            result,
            fingertip,
        )

        now = time.monotonic()

        if selected is not None:
            last_selected_name = selected[
                "name"
            ]

            last_selected_time = now

        elif (
            now - last_selected_time
            > HOLD_TIME
        ):
            last_selected_name = None

        # =====================================================
        # 4. OUTPUT
        # =====================================================

        output = frame.copy()

        # Draw hand
        if (
            SHOW_HAND
            and hand_landmarks is not None
        ):
            draw_hand(
                output,
                hand_landmarks,
            )

        # Draw fingertip
        if (
            SHOW_FINGERTIP
            and fingertip is not None
        ):
            fx, fy = fingertip

            cv2.circle(
                output,
                (fx, fy),
                14,
                (0, 255, 255),
                3,
            )

            cv2.circle(
                output,
                (fx, fy),
                4,
                (0, 0, 255),
                -1,
            )

        # Draw selected contour only
        if (
            SHOW_SELECTED_CONTOUR
            and selected is not None
        ):
            polygon = (
                selected["polygon"]
                .astype(np.int32)
            )

            cv2.polylines(
                output,
                [polygon],
                True,
                (0, 255, 0),
                3,
                cv2.LINE_AA,
            )

        # =====================================================
        # OBJECT NAME
        # =====================================================

        if last_selected_name is not None:
            text = (
                last_selected_name.upper()
            )

            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 1.5
            thickness = 3

            text_size, baseline = (
                cv2.getTextSize(
                    text,
                    font,
                    font_scale,
                    thickness,
                )
            )

            text_width = text_size[0]
            text_height = text_size[1]

            text_x = (
                output.shape[1]
                - text_width
            ) // 2

            text_y = 70

            cv2.rectangle(
                output,
                (
                    text_x - 20,
                    text_y - text_height - 15,
                ),
                (
                    text_x + text_width + 20,
                    text_y + baseline + 15,
                ),
                (0, 0, 0),
                -1,
            )

            cv2.putText(
                output,
                text,
                (
                    text_x,
                    text_y
                ),
                font,
                font_scale,
                (0, 255, 0),
                thickness,
                cv2.LINE_AA,
            )

        # =====================================================
        # TOTAL TIME
        # =====================================================

        last_total_ms = (
            time.perf_counter()
            - total_start
        ) * 1000.0

        smooth_total_ms = smooth_value(
            smooth_total_ms,
            last_total_ms,
            TIME_ALPHA,
        )

        # =====================================================
        # FPS
        # =====================================================

        current_frame_time = time.perf_counter()

        delta = (
            current_frame_time
            - previous_frame_time
        )

        previous_frame_time = current_frame_time

        if delta > 0:
            instant_fps = 1.0 / delta

            if fps <= 0:
                fps = instant_fps
            else:
                fps = (
                    FPS_ALPHA * instant_fps
                    + (1.0 - FPS_ALPHA) * fps
                )

        # =====================================================
        # PROFILING OVERLAY
        # =====================================================

        overlay_x = 20
        overlay_y = 40
        overlay_gap = 32

        if SHOW_FPS:
            cv2.putText(
                output,
                f"FPS: {fps:.1f}",
                (overlay_x, overlay_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

            overlay_y += overlay_gap

        if SHOW_YOLO_TIME:
            cv2.putText(
                output,
                f"YOLO: {smooth_yolo_ms:.1f} ms",
                (overlay_x, overlay_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

            overlay_y += overlay_gap

        if SHOW_HAND_TIME:
            cv2.putText(
                output,
                f"Hand: {smooth_hand_ms:.1f} ms",
                (overlay_x, overlay_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

            overlay_y += overlay_gap

        if SHOW_TOTAL_TIME:
            cv2.putText(
                output,
                f"Total: {smooth_total_ms:.1f} ms",
                (overlay_x, overlay_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

            overlay_y += overlay_gap

        cv2.putText(
            output,
            f"YOLO every: {YOLO_EVERY_N_FRAMES} frame",
            (overlay_x, overlay_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

        # =====================================================
        # DISPLAY
        # =====================================================

        cv2.imshow(
            "Finger Object Selector - GPU Profiled",
            output,
        )

        key = (
            cv2.waitKey(1)
            & 0xFF
        )

        if (
            key == ord("q")
            or key == 27
        ):
            break

finally:
    # =========================================================
    # CLEANUP
    # =========================================================

    cap.release()
    hands.close()
    cv2.destroyAllWindows()
