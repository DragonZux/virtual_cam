import cv2
import numpy as np
import time
from ultralytics import YOLO


# =========================================================
# CONFIG
# =========================================================

CAMERA = "/dev/video2"

MODEL_PATH = "yolo26l-seg.pt"

CONF = 0.25
IMG_SIZE = 960

TARGET_NAMES = {
    "laptop",
    "mouse",
    "keyboard",
}

# Laser dot area
MIN_LASER_AREA = 2
MAX_LASER_AREA = 500

# Giữ tên object một chút để tránh chớp
HOLD_TIME = 0.4

# Nếu True thì vẽ contour của object đang được laser chọn
SHOW_SELECTED_CONTOUR = True


# =========================================================
# LOAD YOLO
# =========================================================

model = YOLO(MODEL_PATH)

TARGET_IDS = [
    class_id
    for class_id, class_name in model.names.items()
    if class_name in TARGET_NAMES
]

print("Target classes:")

for class_id in TARGET_IDS:
    print(
        class_id,
        model.names[class_id]
    )


# =========================================================
# LASER DETECTION
# =========================================================

def detect_red_laser(frame):
    """
    Detect red laser dot.

    Return:
        (x, y) or None
    """

    hsv = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2HSV
    )

    # Red nằm ở hai đầu của hue HSV

    lower_red1 = np.array(
        [0, 120, 180],
        dtype=np.uint8
    )

    upper_red1 = np.array(
        [10, 255, 255],
        dtype=np.uint8
    )

    lower_red2 = np.array(
        [170, 120, 180],
        dtype=np.uint8
    )

    upper_red2 = np.array(
        [180, 255, 255],
        dtype=np.uint8
    )

    mask1 = cv2.inRange(
        hsv,
        lower_red1,
        upper_red1
    )

    mask2 = cv2.inRange(
        hsv,
        lower_red2,
        upper_red2
    )

    laser_mask = cv2.bitwise_or(
        mask1,
        mask2
    )


    # Loại noise
    kernel = np.ones(
        (3, 3),
        np.uint8
    )

    laser_mask = cv2.morphologyEx(
        laser_mask,
        cv2.MORPH_OPEN,
        kernel
    )


    contours, _ = cv2.findContours(
        laser_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )


    candidates = []


    for contour in contours:

        area = cv2.contourArea(
            contour
        )

        if (
            area < MIN_LASER_AREA
            or area > MAX_LASER_AREA
        ):
            continue


        M = cv2.moments(
            contour
        )

        if M["m00"] == 0:
            continue


        cx = int(
            M["m10"] / M["m00"]
        )

        cy = int(
            M["m01"] / M["m00"]
        )


        # Tính độ sáng tại điểm laser
        brightness = hsv[
            cy,
            cx,
            2
        ]


        candidates.append(
            (
                brightness,
                area,
                cx,
                cy
            )
        )


    if not candidates:
        return None


    # Ưu tiên điểm sáng nhất
    candidates.sort(
        reverse=True
    )

    _, _, x, y = candidates[0]

    return x, y


# =========================================================
# POINT INSIDE SEGMENTATION MASK
# =========================================================

def find_object_at_point(
    result,
    point,
):
    """
    Kiểm tra laser point nằm trong segmentation polygon nào.

    Return:
        {
            "name": ...,
            "class_id": ...,
            "confidence": ...,
            "polygon": ...
        }

        hoặc None.
    """

    if point is None:
        return None

    if result.masks is None:
        return None

    if result.boxes is None:
        return None


    x, y = point

    candidates = []


    for i, polygon_list in enumerate(
        result.masks.xy
    ):

        if len(polygon_list) < 3:
            continue


        polygon = np.array(
            polygon_list,
            dtype=np.float32
        )


        inside = cv2.pointPolygonTest(
            polygon,
            (float(x), float(y)),
            False
        )


        if inside < 0:
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


        # Tính diện tích polygon
        area = cv2.contourArea(
            polygon
        )


        candidates.append({
            "name": class_name,
            "class_id": class_id,
            "confidence": confidence,
            "polygon": polygon,
            "area": area,
        })


    if not candidates:
        return None


    # Nếu có mask chồng lên nhau,
    # ưu tiên mask nhỏ nhất chứa laser.
    #
    # Ví dụ mouse nằm trước laptop,
    # laser có thể vô tình nằm trong cả hai polygon.
    candidates.sort(
        key=lambda obj: obj["area"]
    )

    return candidates[0]


# =========================================================
# CAMERA
# =========================================================

cap = cv2.VideoCapture(
    CAMERA,
    cv2.CAP_V4L2
)

if not cap.isOpened():
    raise RuntimeError(
        f"Cannot open camera: {CAMERA}"
    )


# Giảm buffer để giảm latency
cap.set(
    cv2.CAP_PROP_BUFFERSIZE,
    1
)


print()
print("Camera opened")
print("Press Q to quit")
print()


# =========================================================
# STATE
# =========================================================

last_selected_name = None
last_selected_time = 0

fps_time = time.time()
fps = 0


# =========================================================
# MAIN LOOP
# =========================================================

while True:

    ret, frame = cap.read()

    if not ret:
        print(
            "Failed to read frame"
        )
        break


    # -----------------------------------------------------
    # 1. Detect laser
    # -----------------------------------------------------

    laser_point = detect_red_laser(
        frame
    )


    # -----------------------------------------------------
    # 2. YOLO segmentation
    # -----------------------------------------------------

    result = model.predict(
        frame,
        classes=TARGET_IDS,
        conf=CONF,
        imgsz=IMG_SIZE,
        verbose=False,
    )[0]


    # -----------------------------------------------------
    # 3. Find object pointed by laser
    # -----------------------------------------------------

    selected = find_object_at_point(
        result,
        laser_point,
    )


    current_time = time.time()


    if selected is not None:

        last_selected_name = selected[
            "name"
        ]

        last_selected_time = (
            current_time
        )


    elif (
        current_time
        - last_selected_time
        > HOLD_TIME
    ):

        last_selected_name = None


    # -----------------------------------------------------
    # 4. Draw output
    # -----------------------------------------------------

    output = frame.copy()


    # Laser point
    if laser_point is not None:

        lx, ly = laser_point


        cv2.circle(
            output,
            (lx, ly),
            10,
            (0, 0, 255),
            2,
        )


        cv2.circle(
            output,
            (lx, ly),
            3,
            (255, 255, 255),
            -1,
        )


    # -----------------------------------------------------
    # Optional:
    # draw ONLY selected segmentation contour
    # -----------------------------------------------------

    if (
        selected is not None
        and SHOW_SELECTED_CONTOUR
    ):

        polygon = selected[
            "polygon"
        ].astype(
            np.int32
        )


        cv2.polylines(
            output,
            [polygon],
            True,
            (0, 255, 0),
            3,
        )


    # -----------------------------------------------------
    # Selected object text
    # -----------------------------------------------------

    if last_selected_name is not None:

        text = (
            last_selected_name.upper()
        )


        text_size, _ = cv2.getTextSize(
            text,
            cv2.FONT_HERSHEY_SIMPLEX,
            1.5,
            3,
        )


        text_width = text_size[0]


        x = int(
            (
                output.shape[1]
                - text_width
            )
            / 2
        )


        y = 70


        cv2.putText(
            output,
            text,
            (x, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.5,
            (0, 255, 0),
            3,
            cv2.LINE_AA,
        )


    # -----------------------------------------------------
    # FPS
    # -----------------------------------------------------

    now = time.time()

    delta = (
        now - fps_time
    )

    if delta > 0:

        fps = 1 / delta

    fps_time = now


    cv2.putText(
        output,
        f"FPS: {fps:.1f}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2,
    )


    # -----------------------------------------------------
    # Display
    # -----------------------------------------------------

    cv2.imshow(
        "Laser Object Selector",
        output
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


cap.release()
cv2.destroyAllWindows()