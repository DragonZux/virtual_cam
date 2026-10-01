"""Chuẩn bị model còn thiếu trong MODEL_DIR rồi chạy web (entrypoint của container).

Máy host không cần cài gì: lần đầu container tự tải model bàn tay + YOLO và xuất model laser đỏ
(docker/prepare_laser_model.py) vào thư mục models/ của máy host; các lần sau thấy đủ file thì chạy luôn.
Model nào chuẩn bị lỗi chỉ in cảnh báo, web vẫn chạy (tính năng cần model đó báo lỗi khi dùng).
"""
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/models"))
HAND_MODEL = os.environ.get("HAND_MODEL", "hand_landmarker.task")
YOLO_MODEL = os.environ.get("YOLO_MODEL", "yolo26m-seg.pt")
LASER_MODEL = os.environ.get("LASER_MODEL", "laser-advr-yolov5l6.torchscript")
HAND_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
YOLO_URL = "https://github.com/ultralytics/assets/releases/download/v8.4.0/"


def warn(message: str) -> None:
    print(f"[init_models] WARNING: {message}", flush=True)


def fetch(url: str, target: Path) -> None:
    print(f"[init_models] Downloading {target.name}...", flush=True)
    pending = target.with_name(target.name + ".download")
    try:
        with urllib.request.urlopen(url, timeout=90) as response, pending.open("wb") as out:
            while chunk := response.read(1024 * 1024):
                out.write(chunk)
        pending.replace(target)
    except Exception as exc:  # noqa: BLE001 - mạng lỗi không được chặn web khởi động
        pending.unlink(missing_ok=True)
        warn(f"could not download {target.name}: {exc}")


def prepare() -> None:
    if not MODEL_DIR.is_dir():
        warn(f"{MODEL_DIR} does not exist: models cannot be prepared.")
        return
    for name, url in ((HAND_MODEL, HAND_URL), (YOLO_MODEL, YOLO_URL + YOLO_MODEL)):
        target = MODEL_DIR / name
        if target.is_dir():
            warn(f"{target} is a folder (Docker creates one when the file is missing): delete it on the host.")
        elif not target.is_file():
            fetch(url, target)
    laser = MODEL_DIR / LASER_MODEL
    if not laser.is_file():
        print("[init_models] Exporting the red laser model (first run only, a few minutes)...", flush=True)
        result = subprocess.run([sys.executable, "/app/scripts/prepare_laser_model.py", "--output", str(laser)])
        if result.returncode != 0:
            warn("could not prepare the red laser model: see the messages above. Red laser will not work.")


if __name__ == "__main__":
    try:
        prepare()
    except Exception as exc:  # noqa: BLE001
        warn(f"model preparation failed: {exc}")
    os.execvp(sys.executable, [sys.executable, "serve.py", *sys.argv[1:]])
