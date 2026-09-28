"""Browser camera frames, shared GPU inference, and a private per-browser UI."""

import argparse
from io import BytesIO
import logging
from pathlib import Path
import threading
import time

from flask import Flask, jsonify, render_template, request
from PIL import Image, UnidentifiedImageError
from waitress import create_server

ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("virtual_cam")


class Detector:
    """One GPU model; IMAGE mode avoids carrying hand tracking between users."""

    def __init__(self, model="yolo26n-seg.pt", image_size=640):
        self.model_path = ROOT / model
        self.image_size = image_size
        self.lock = threading.Lock()
        self.ready = threading.Event()
        self.error = None
        self.device_name = "?ang ki?m tra"
        self.hands = None
        self.thread = None

    def start(self):
        self.thread = threading.Thread(target=self._load, name="model-loader", daemon=True)
        self.thread.start()

    def _load(self):
        try:
            import finger_select as vision
            self.vision = vision
            if not vision.HAND_MODEL.is_file():
                raise RuntimeError("Thi?u model b?n tay. H?y ch?y setup.bat r?i m? l?i web.")
            self.model = vision.YOLO(str(self.model_path))
            self.gpu = vision.torch.cuda.is_available()
            self.device_name = vision.torch.cuda.get_device_name(0) if self.gpu else "CPU"
            self.targets = [i for i, name in self.model.names.items() if name in vision.TARGET_NAMES]
            if not self.targets:
                raise RuntimeError("Model kh?ng c? c?c l?p laptop, mouse ho?c keyboard.")
            options = vision.mp.tasks.vision.HandLandmarkerOptions(
                base_options=vision.mp.tasks.BaseOptions(model_asset_path=str(vision.HAND_MODEL)),
                running_mode=vision.mp.tasks.vision.RunningMode.IMAGE,
                num_hands=1, min_hand_detection_confidence=0.6,
                min_hand_presence_confidence=0.6,
            )
            self.hands = vision.mp.tasks.vision.HandLandmarker.create_from_options(options)
            self.model.predict(vision.np.zeros((480, 640, 3), dtype=vision.np.uint8),
                               **self.predict_options())
            self.ready.set()
            LOG.info("Inference ready: %s / %s", self.device_name, self.model_path.name)
        except Exception as exc:
            self.error = str(exc)
            LOG.exception("Model initialization failed")

    def predict_options(self):
        return dict(classes=self.targets, conf=self.vision.CONF, imgsz=self.image_size,
                    device=0 if self.gpu else "cpu", quantize=16 if self.gpu else 32, verbose=False)

    def status(self):
        return {
            "phase": "error" if self.error else "ready" if self.ready.is_set() else "starting",
            "message": self.error or ("B? nh?n di?n s?n s?ng" if self.ready.is_set() else "?ang kh?i ??ng b? nh?n di?n?"),
            "device": self.device_name, "model": self.model_path.name, "image_size": self.image_size,
        }

    def infer(self, payload):
        vision = self.vision
        frame = vision.cv2.imdecode(vision.np.frombuffer(payload, dtype=vision.np.uint8), vision.cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Kh?ng ??c ???c h?nh ?nh.")
        tick = time.perf_counter()
        rgb = vision.cv2.cvtColor(frame, vision.cv2.COLOR_BGR2RGB)
        image = vision.mp.Image(image_format=vision.mp.ImageFormat.SRGB, data=rgb)
        hand_result = self.hands.detect(image)
        landmarks = hand_result.hand_landmarks[0] if hand_result.hand_landmarks else None
        result = self.model.predict(frame, **self.predict_options())[0].cpu()
        tip = vision.get_index_tip(frame, landmarks)
        selected = vision.find_object_at_point(result, tip)
        detections = []
        if result.boxes is not None:
            detections = [{"name": result.names[int(cls)], "confidence": round(conf, 3)}
                          for cls, conf in zip(result.boxes.cls.tolist(), result.boxes.conf.tolist())]
        return {
            "hand_detected": landmarks is not None,
            "landmarks": [{"x": p.x, "y": p.y} for p in landmarks] if landmarks else [],
            "tip": tip,
            "selected": {"name": selected["name"], "confidence": round(selected["confidence"], 3),
                         "polygon": selected["polygon"].tolist()} if selected else None,
            "detections": detections,
            "processing_ms": round((time.perf_counter() - tick) * 1000),
            "resolution": {"width": frame.shape[1], "height": frame.shape[0]},
        }

    def close(self):
        if self.thread:
            self.thread.join(timeout=15)
        with self.lock:
            if self.hands is not None:
                self.hands.close()


def create_app(detector):
    app = Flask(__name__, template_folder=str(ROOT / "templates"), static_folder=str(ROOT / "static"))
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

    @app.after_request
    def response_headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; "
            "media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        )
        return response

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/status")
    def status():
        return jsonify(detector.status())

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify(message="?nh v??t qu? gi?i h?n 2 MB."), 413

    @app.post("/api/frame")
    def frame():
        if request.mimetype != "image/jpeg":
            return jsonify(message="Ch? nh?n ?nh JPEG."), 415
        # No CORS: frames are submitted only by this dashboard's origin.
        if not detector.ready.is_set():
            return jsonify(message=detector.status()["message"]), 503
        payload = request.get_data()
        try:
            with Image.open(BytesIO(payload)) as image:
                if image.format != "JPEG" or min(image.size) < 16 or max(image.size) > 1920:
                    return jsonify(message="?nh JPEG ph?i c? k?ch th??c t? 16 ??n 1920 pixel."), 400
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            return jsonify(message="D? li?u ?nh kh?ng h?p l?."), 400
        # Bound queueing: each browser keeps just one request in flight.
        if not detector.lock.acquire(timeout=0.5):
            return jsonify(message="M?y ch? ?ang b?n, ?ang th? l?i?"), 429, {"Retry-After": "1"}
        try:
            return jsonify(detector.infer(payload))
        except ValueError as exc:
            return jsonify(message=str(exc)), 400
        except Exception:
            LOG.exception("Frame inference failed")
            return jsonify(message="Kh?ng x? l? ???c khung h?nh. H?y th? b?t l?i camera."), 500
        finally:
            detector.lock.release()

    return app


def main():
    parser = argparse.ArgumentParser(description="Virtual Cam: each viewer uses their own browser camera")
    parser.add_argument("--host", default="127.0.0.1", help="Use 0.0.0.0 behind an HTTPS proxy for other devices")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--model", default="yolo26n-seg.pt")
    parser.add_argument("--imgsz", type=int, default=640)
    args = parser.parse_args()
    if args.imgsz < 32 or not 1 <= args.port <= 65535:
        parser.error("Use imgsz >= 32 and port 1..65535")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    detector = Detector(args.model, args.imgsz)
    server = create_server(create_app(detector), host=args.host, port=args.port, threads=8)
    detector.start()
    LOG.info("Open http://localhost:%s | Ctrl+C to stop", args.port)
    try:
        server.run()
    except KeyboardInterrupt:
        pass
    finally:
        server.close()
        detector.close()


if __name__ == "__main__":
    main()
