import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.spa import mount_frontend


@pytest.fixture
def spa_client(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><div id=root></div>", encoding="utf-8")
    (tmp_path / "assets" / "app-1a2b.js").write_text("console.log(1)", encoding="utf-8")
    app = FastAPI()

    @app.get("/api/ping")
    def ping():
        return {"pong": True}

    assert mount_frontend(app, tmp_path)
    return TestClient(app)


def test_spa_routes_fall_back_to_index(spa_client):
    for path in ("/", "/history", "/settings"):
        response = spa_client.get(path)
        assert response.status_code == 200
        assert "id=root" in response.text
        assert response.headers["cache-control"] == "no-cache"


def test_spa_serves_hashed_assets_with_long_cache(spa_client):
    response = spa_client.get("/assets/app-1a2b.js")
    assert response.status_code == 200
    assert "immutable" in response.headers["cache-control"]


def test_spa_never_masks_api_or_missing_assets(spa_client):
    assert spa_client.get("/api/ping").json() == {"pong": True}
    assert spa_client.get("/api/missing").status_code == 404
    assert spa_client.get("/assets/missing.js").status_code == 404


def test_mount_skipped_without_build(tmp_path):
    assert mount_frontend(FastAPI(), tmp_path) is False
