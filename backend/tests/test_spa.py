import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from core.spa import mount_frontend, mount_view3d


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


@pytest.fixture
def view3d_client(tmp_path):
    """Giao diện chính ở "/" và màn hình 3D (app riêng) ở "/view3d/" trên cùng một server."""
    builds = {"frontend": "id=root", "view3d": "id=view3d"}
    for name, marker in builds.items():
        (tmp_path / name / "assets").mkdir(parents=True)
        (tmp_path / name / "index.html").write_text(f"<!doctype html><div {marker}></div>", encoding="utf-8")
        (tmp_path / name / "assets" / "app-1a2b.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "view3d" / "models").mkdir()
    (tmp_path / "view3d" / "models" / "manifest.json").write_text('{"models": {}}', encoding="utf-8")
    app = FastAPI()
    assert mount_view3d(app, tmp_path / "view3d")
    assert mount_frontend(app, tmp_path / "frontend")
    return TestClient(app)


def test_view3d_is_served_as_a_separate_app(view3d_client):
    page = view3d_client.get("/view3d/")
    assert page.status_code == 200
    assert "id=view3d" in page.text
    assert page.headers["cache-control"] == "no-cache"
    assert "immutable" in view3d_client.get("/view3d/assets/app-1a2b.js").headers["cache-control"]
    assert view3d_client.get("/view3d/models/manifest.json").json() == {"models": {}}
    # Giao diện camera vẫn ở "/" như cũ
    for path in ("/", "/history"):
        assert "id=root" in view3d_client.get(path).text


def test_view3d_redirects_to_trailing_slash_and_keeps_query(view3d_client):
    response = view3d_client.get("/view3d?preview=cup", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/view3d/?preview=cup"


def test_view3d_missing_files_are_404_not_index(view3d_client):
    assert view3d_client.get("/view3d/models/cup.glb").status_code == 404
    assert view3d_client.get("/view3d/assets/missing.js").status_code == 404


def test_view3d_path_never_shows_the_camera_app_without_build(tmp_path):
    (tmp_path / "index.html").write_text("<div id=root></div>", encoding="utf-8")
    app = FastAPI()
    assert mount_view3d(app, tmp_path / "missing") is False
    assert mount_frontend(app, tmp_path)
    client = TestClient(app)
    assert client.get("/view3d").status_code == 404
    assert client.get("/view3d/").status_code == 404
