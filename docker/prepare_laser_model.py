"""Download the published ADVR red-laser weights and export a standalone TorchScript.

Run once from any directory: python docker/prepare_laser_model.py (the container's init_models.py runs it
when models/ has no laser model)
Runtime inference uses only PyTorch; the legacy YOLOv5 code is confined to this
export process. Source model: https://zenodo.org/records/10471835 (CC BY 4.0).
"""
from __future__ import annotations

import argparse
import functools
import hashlib
import io
import json
import os
from pathlib import Path
import sys
from types import MethodType
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WEIGHT_NAME = "yolov5l6_e200_b8_tvt302010_laser_v5.pt"
WEIGHT_MD5 = "21b8e90b7707cb91054547c6558301e3"
CODE_URL = "https://codeload.github.com/ultralytics/yolov5/zip/refs/tags/v7.0"
CODE_SHA256 = "a40568a7979c4b27195d198987e49610de86b038b044f2521f5515455571f852"


def download(url: str, target: Path) -> None:
    print(f"Downloading {target.name}...", flush=True)
    pending = target.with_name(target.name + ".download")
    with urllib.request.urlopen(url, timeout=90) as response, pending.open("wb") as out:
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
    pending.replace(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "models/laser-advr-yolov5l6.torchscript")
    parser.add_argument("--source", type=Path, help="Use an existing publisher checkpoint (checksum is still verified)")
    parser.add_argument("--force", action="store_true", help="Re-export an existing output")
    args = parser.parse_args()
    if args.output.is_file() and not args.force:
        print(f"Laser model already exists: {args.output}")
        return
    # Export requirements live in the root requirements.txt with the other dependencies.
    try:
        import torch
        import IPython  # noqa: F401
        import seaborn  # noqa: F401
        import pandas  # noqa: F401
        import pkg_resources  # noqa: F401
    except ImportError as exc:
        raise SystemExit(f"Missing export dependency: {exc}. Run: python -m pip install -r requirements.txt") from exc

    cache = ROOT / "backend/data/laser-export"
    cache.mkdir(parents=True, exist_ok=True)
    source = args.source or cache / WEIGHT_NAME
    if not source.is_file():
        if args.source:
            raise SystemExit(f"Checkpoint does not exist: {source}")
        download(f"https://zenodo.org/records/10471835/files/{WEIGHT_NAME}?download=1", source)
    if hashlib.md5(source.read_bytes()).hexdigest() != WEIGHT_MD5:
        raise SystemExit(f"Publisher checksum does not match: {source}")

    archive = cache / "yolov5-v7.0.zip"
    if not archive.is_file():
        download(CODE_URL, archive)
    raw = archive.read_bytes()
    if hashlib.sha256(raw).hexdigest() != CODE_SHA256:
        raise SystemExit("YOLOv5 v7.0 source archive checksum does not match.")
    # Re-extract verified code; no imports from arbitrary locally edited research files.
    with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
        for member in bundle.infolist():
            if not (cache / member.filename).resolve().is_relative_to(cache.resolve()):
                raise SystemExit("Invalid path in source archive")
        bundle.extractall(cache)
    sys.path.insert(0, str(cache / "yolov5-7.0"))
    os.environ["YOLOv5_AUTOINSTALL"] = "false"
    from models.experimental import attempt_load
    from models.yolo import Detect

    # v7.0 checkpoints predate PyTorch 2.6's weights_only default. Only the
    # checksum-verified publisher checkpoint is loaded in this separate process.
    torch.load = functools.partial(torch.load, weights_only=False)
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    model = attempt_load(str(source), device=torch.device("cpu")).eval()

    def portable_grid(self, nx=20, ny=20, i=0):
        # arange(device=anchors.device) would bake the CPU device into the
        # traced graph. new_ones inherits the buffer's device at runtime.
        y = self.anchors.new_ones((ny,)).cumsum(0) - 1
        x = self.anchors.new_ones((nx,)).cumsum(0) - 1
        yv, xv = torch.meshgrid(y, x, indexing="ij")
        shape = (1, self.na, ny, nx, 2)
        grid = torch.stack((xv, yv), 2).expand(shape) - 0.5
        anchors = (self.anchors[i] * self.stride[i]).view(1, self.na, 1, 1, 2).expand(shape)
        return grid, anchors

    for module in model.modules():
        if isinstance(module, Detect):
            module._make_grid = MethodType(portable_grid, module)
            module.dynamic = True
            module.export = True
            module.inplace = False
    with torch.inference_mode():
        traced = torch.jit.trace(model, torch.zeros(1, 3, 384, 640), strict=False)
        for shape in [(1, 3, 768, 1280), (1, 3, 1280, 768), (1, 3, 512, 512)]:
            pixels = torch.rand(shape)
            torch.testing.assert_close(traced(pixels)[0], model(pixels)[0], rtol=1e-4, atol=1e-4)
            print(f"Verified dynamic shape: {shape}", flush=True)
    meta = {"format": "virtual-cam-laser-v1", "architecture": "yolov5l6", "color": "red",
            "stride": 64, "names": ["Laser"], "imgsz": 1280, "license": "CC-BY-4.0",
            "source": "https://zenodo.org/records/10471835", "source_md5": WEIGHT_MD5}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pending = args.output.with_name(args.output.name + ".download")
    traced.save(str(pending), _extra_files={"config.json": json.dumps(meta)})
    if torch.cuda.is_available():
        reloaded = torch.jit.load(str(pending), map_location="cuda:0").eval()
        with torch.inference_mode():
            output = reloaded(torch.zeros(1, 3, 768, 1280, device="cuda:0"))[0]
        assert output.shape[-1] == 6 and torch.isfinite(output).all()
        print("Verified exported model on CUDA", flush=True)
    pending.replace(args.output)
    print(f"Ready: {args.output} ({args.output.stat().st_size / 1e6:.1f} MB)", flush=True)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
