import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from core.config import settings  # noqa: E402
from main import app  # noqa: E402
from routers.vision import get_detector  # noqa: E402
from services.detector import Detector  # noqa: E402
from tests.helpers import FAKE_NAMES, FakeModels  # noqa: E402


@pytest.fixture
def fake_models() -> FakeModels:
    return FakeModels()


@pytest.fixture
def detector(fake_models):
    d = Detector(settings)
    d._set_classes(FAKE_NAMES)
    d._run_models = fake_models
    d.ready.set()
    yield d
    d.close()


@pytest.fixture
def client(detector):
    # Không dùng `with TestClient(...)` → lifespan không chạy, không nạp model thật
    app.dependency_overrides[get_detector] = lambda: detector
    yield TestClient(app)
    app.dependency_overrides.clear()
