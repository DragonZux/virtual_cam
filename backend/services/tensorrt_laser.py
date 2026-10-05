"""ADVR YOLOv5 laser inference from a static TensorRT plan (batch one).

Imports are lazy so CPU-only startup and tests do not need TensorRT. A detector
lock serializes calls; the CUDA stream belongs to this model across API threads.
"""
from pathlib import Path

import numpy as np

from models import LaserSpot
from services.engine_metadata import engine_header
from services.laser_model import prepare_frame, select_spot


class TensorRTLaserModel:
    def __init__(self, path: Path, device: str, confidence: float):
        import torch

        if not device.startswith("cuda") or not torch.cuda.is_available():
            raise ValueError("Mô hình TensorRT cần GPU NVIDIA CUDA; hãy chọn .pt hoặc .torchscript khi dùng CPU.")
        try:
            import tensorrt as trt
        except (ImportError, OSError) as exc:
            raise RuntimeError("Chưa nạp được TensorRT. Cài runtime tương thích engine trên máy chạy backend.") from exc

        self.torch = torch
        self.device = torch.device(device)
        self.confidence = confidence
        self.stream = self.context = self.engine = self.runtime = None
        self.buffers = {}
        self.logger = trt.Logger(trt.Logger.WARNING)
        try:
            with torch.cuda.device(self.device):
                self.runtime = trt.Runtime(self.logger)
                offset, metadata = engine_header(path)
                if metadata.get("task") not in (None, "detect"):
                    raise ValueError("Engine laser phải là model ADVR YOLOv5 detect một lớp.")
                with path.open("rb") as source:
                    source.seek(offset)
                    self.engine = self.runtime.deserialize_cuda_engine(source.read())
                if self.engine is None:
                    raise ValueError("Không nạp được engine laser. Hãy build lại cho GPU, hệ điều hành và TensorRT của máy này.")
                if not hasattr(self.engine, "num_io_tensors"):
                    raise ValueError("Bộ chạy laser .engine cần TensorRT 10 trở lên.")
                inputs, outputs = [], []
                for i in range(self.engine.num_io_tensors):
                    name = self.engine.get_tensor_name(i)
                    (inputs if self.engine.get_tensor_mode(name) == trt.TensorIOMode.INPUT else outputs).append(name)
                if len(inputs) != 1 or len(outputs) != 1:
                    raise ValueError("Engine laser ADVR cần một đầu vào ảnh và một đầu ra [1, N, 6] đã giải mã xywh.")
                self.input_name, self.output_name = inputs[0], outputs[0]
                self.input_shape = tuple(self.engine.get_tensor_shape(self.input_name))
                output_shape = tuple(self.engine.get_tensor_shape(self.output_name))
                if (len(self.input_shape) != 4 or self.input_shape[:2] != (1, 3)
                        or min(self.input_shape[2:]) < 16):
                    raise ValueError("Engine laser cần đầu vào cố định [1, 3, H, W]; chưa hỗ trợ dynamic shape.")
                if len(output_shape) != 3 or output_shape[0] != 1 or output_shape[1] <= 0 or output_shape[2] != 6:
                    raise ValueError("Đầu ra laser phải là [1, N, 6]: x, y, width, height, objectness, class score.")
                for name in inputs + outputs:
                    if self.engine.get_tensor_dtype(name) not in (trt.float32, trt.float16):
                        raise ValueError("Đầu vào/đầu ra laser engine phải là float32 hoặc float16.")
                    if self.engine.get_tensor_location(name) != trt.TensorLocation.DEVICE:
                        raise ValueError("Engine laser phải dùng tensor trên GPU.")
                    if self.engine.get_tensor_format(name) != trt.TensorFormat.LINEAR:
                        raise ValueError("Engine laser cần đầu vào/đầu ra tuyến tính (TensorFormat.LINEAR).")
                self.context = self.engine.create_execution_context()
                if self.context is None:
                    raise RuntimeError("Không đủ tài nguyên GPU để tạo bộ chạy laser TensorRT.")
                self.stream = torch.cuda.Stream(device=self.device)
                with torch.cuda.stream(self.stream):
                    for name in inputs + outputs:
                        dtype = torch.float16 if self.engine.get_tensor_dtype(name) == trt.float16 else torch.float32
                        self.buffers[name] = torch.empty(tuple(self.engine.get_tensor_shape(name)), device=self.device, dtype=dtype)
                        if not self.context.set_tensor_address(name, self.buffers[name].data_ptr()):
                            raise RuntimeError(f"Không gán được bộ nhớ cho tensor {name}.")
        except Exception:
            self.close()
            raise

    def warm_up(self) -> None:
        self.detect(np.zeros((*self.input_shape[2:], 3), dtype=np.uint8))

    def detect(self, frame: np.ndarray, hint: tuple[int, int] | None = None) -> LaserSpot | None:
        # A static full-frame plan cannot execute the TorchScript 384px crop path.
        # Letterbox to its exact shape; retain scale/padding for original coordinates.
        pixels, gain, padding = prepare_frame(frame, max(self.input_shape[2:]), target_shape=self.input_shape[2:])
        with self.torch.cuda.device(self.device), self.torch.inference_mode(), self.torch.cuda.stream(self.stream):
            self.buffers[self.input_name].copy_(self.torch.from_numpy(pixels))
            if not self.context.execute_async_v3(self.stream.cuda_stream):
                raise RuntimeError("Chạy model laser TensorRT thất bại.")
            rows = self.buffers[self.output_name][0]
            rows = rows[rows[:, 4] * rows[:, 5] >= self.confidence]
            prediction = rows.float().cpu().numpy()
        return select_spot(prediction, frame.shape[:2], gain, padding, self.confidence, hint)

    def close(self) -> None:
        # Destroy context before its buffers/engine/runtime. Activation calls this
        # under Detector.lock so no in-flight frame can access released tensors.
        if self.stream is not None:
            self.stream.synchronize()
        self.context = None
        self.buffers.clear()
        self.engine = None
        self.runtime = None
        self.stream = None
