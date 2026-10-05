"""Build an FP16 TensorRT engine from a .pt / ADVR .torchscript model on this machine's GPU.

Runs in a child process (`python -m services.tensorrt_export ...`, cwd backend/) started by
`services.model_converter`: a crashing TensorRT builder must not take the web server down, and the
builder's GPU memory is released when the process exits. The last line is `RESULT {json}`.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys

from services.engine_metadata import torchscript_metadata


def export_ultralytics(source: Path, work: Path, imgsz: int) -> Path:
    """Ultralytics export keeps task/names metadata in the engine header (Detector reads it)."""
    from ultralytics import YOLO

    # Ultralytics writes .onnx/.engine next to its input: build from a copy inside the hidden work folder.
    copy = work / source.name
    shutil.copy2(source, copy)
    model = YOLO(str(copy))
    # TensorRT 11 is strongly typed: quantize=16 bakes FP16 into the ONNX graph (ModelOpt AutoCast) before building.
    return Path(model.export(format="engine", imgsz=imgsz, quantize=16, device=0, batch=1, dynamic=False, verbose=False))


def export_yolo_torchscript(source: Path, work: Path, metadata: dict) -> Path:
    """Ultralytics TorchScript (task/names in extra config.txt) → static ONNX → engine carrying the same metadata."""
    import torch
    from ultralytics.utils.export.engine import onnx2engine

    model = torch.jit.load(str(source), map_location="cpu").eval()
    height, width = metadata.get("imgsz") or (640, 640)
    pixels = torch.zeros(1, metadata.get("channels", 3), height, width)
    with torch.no_grad():
        outputs = model(pixels)
    count = len(outputs) if isinstance(outputs, (list, tuple)) else 1
    onnx_file = work / f"{source.stem}.onnx"
    with torch.no_grad():
        torch.onnx.export(model, (pixels,), str(onnx_file), opset_version=17, input_names=["images"],
                          output_names=[f"output{i}" for i in range(count)], dynamo=False)
    engine = work / f"{source.stem}.engine"
    onnx2engine(str(onnx_file), engine, quantize=16, dynamic=False, shape=tuple(pixels.shape), metadata=metadata)
    return engine


def export_advr(source: Path, work: Path, imgsz: int) -> Path:
    """ADVR YOLOv5 TorchScript → static ONNX [1, 3, S, S] → raw plan with one [1, N, 6] output."""
    import torch
    from ultralytics.utils.export.engine import onnx2engine

    # The exported TorchScript returns a 1-tuple (decoded xywh, objectness, class score): export the graph as is.
    model = torch.jit.load(str(source), map_location="cpu").eval()
    onnx_file = work / f"{source.stem}.onnx"
    with torch.no_grad():
        torch.onnx.export(model, (torch.zeros(1, 3, imgsz, imgsz),), str(onnx_file), opset_version=17,
                          input_names=["images"], output_names=["output0"], dynamo=False)
    engine = work / f"{source.stem}.engine"
    # metadata=None: TensorRTLaserModel reads a raw plan (an Ultralytics header would route it to YOLO).
    onnx2engine(str(onnx_file), engine, quantize=16, dynamic=False, shape=(1, 3, imgsz, imgsz), metadata=None)
    return engine


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--imgsz", type=int, required=True)
    args = parser.parse_args()

    work = args.output.parent / f".build-{args.output.stem}"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    try:
        metadata = torchscript_metadata(args.source) if args.source.suffix.lower() == ".torchscript" else None
        if metadata:
            built = export_yolo_torchscript(args.source, work, metadata)
        elif args.source.suffix.lower() == ".torchscript":
            built = export_advr(args.source, work, args.imgsz)
        else:
            built = export_ultralytics(args.source, work, args.imgsz)
        if not built.is_file() or not built.stat().st_size:
            raise RuntimeError("TensorRT không tạo được file engine.")
        built.replace(args.output)
        print("RESULT " + json.dumps({"ok": True, "output": str(args.output)}), flush=True)
    except Exception as exc:  # noqa: BLE001 - reported to the parent, which shows it in Settings
        print("RESULT " + json.dumps({"ok": False, "error": str(exc) or type(exc).__name__}, ensure_ascii=False),
              flush=True)
        sys.exit(1)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
