from datetime import datetime

import anyio
import pytest

from core.config import settings
from services import media

MEDIA_URL = "/api/media"


@pytest.fixture
def upload_dir(tmp_path, monkeypatch):
    folder = tmp_path / "virtual_cam"
    monkeypatch.setattr(settings, "UPLOAD_DIR", folder)
    return folder


def upload(client, name, body=b"fake-bytes"):
    return client.post(MEDIA_URL, params={"name": name}, content=body, headers={"Content-Type": "application/octet-stream"})


def test_upload_saves_into_folder_and_lists_it(client, upload_dir):
    res = upload(client, "Bàn làm việc.mp4", b"video-data")
    assert res.status_code == 201
    item = res.json()
    assert item["kind"] == "video" and item["size"] == 10
    assert item["name"].endswith("_Bàn_làm_việc.mp4")
    assert (upload_dir / item["name"]).read_bytes() == b"video-data"

    listing = client.get(MEDIA_URL).json()
    assert listing["folder"] == str(upload_dir)
    assert listing["max_bytes"] == settings.max_upload_bytes
    assert [i["name"] for i in listing["items"]] == [item["name"]]


def test_uploaded_file_is_served_back_with_range(client, upload_dir):
    name = upload(client, "desk.png", b"0123456789").json()["name"]
    res = client.get(f"{MEDIA_URL}/{name}")
    assert res.status_code == 200 and res.content == b"0123456789"
    assert res.headers["content-type"] == "image/png"
    partial = client.get(f"{MEDIA_URL}/{name}", headers={"Range": "bytes=2-4"})
    assert partial.status_code == 206 and partial.content == b"234"


def test_same_name_twice_does_not_overwrite(upload_dir):
    now = datetime(2026, 9, 28, 10, 0, 0)
    first = media.new_path(upload_dir, "cup.jpg", now)
    upload_dir.mkdir()
    first.write_bytes(b"x")
    second = media.new_path(upload_dir, "cup.jpg", now)
    assert first.name == "20260928-100000_cup.jpg"
    assert second.name == "20260928-100000_cup-1.jpg"


def test_rejects_non_media_and_empty_files(client, upload_dir):
    assert upload(client, "run.bat").status_code == 415
    assert upload(client, "notes.txt").status_code == 415
    assert upload(client, "empty.jpg", b"").status_code == 400
    assert client.get(MEDIA_URL).json()["items"] == []


def test_rejects_files_over_limit(client, upload_dir, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 1)
    assert upload(client, "big.mp4", b"x" * (1024 * 1024 + 1)).status_code == 413
    # Không để lại file dở
    assert not upload_dir.exists() or list(upload_dir.iterdir()) == []


def test_stream_over_limit_leaves_no_partial_file(upload_dir):
    async def chunks():
        yield b"x" * 6
        yield b"x" * 6

    target = media.new_path(upload_dir, "clip.webm")
    with pytest.raises(media.MediaTooLarge):
        anyio.run(media.save_stream, chunks(), target, 10)
    assert list(upload_dir.iterdir()) == []


def test_path_tricks_are_stripped_or_refused(client, upload_dir):
    name = upload(client, "..\\..\\evil.jpg").json()["name"]
    assert (upload_dir / name).exists() and "evil" in name
    upload_dir.joinpath("..", "secret.jpg").resolve().write_bytes(b"secret")
    assert client.get(f"{MEDIA_URL}/..%2Fsecret.jpg").status_code == 404
    assert client.get(f"{MEDIA_URL}/missing.jpg").status_code == 404
    assert client.get(f"{MEDIA_URL}/{name[:-4]}.txt").status_code == 404


def test_list_ignores_other_files_and_missing_folder(client, upload_dir):
    assert client.get(MEDIA_URL).json()["items"] == []
    upload_dir.mkdir()
    (upload_dir / "readme.txt").write_text("x")
    (upload_dir / "clip.mp4.part").write_bytes(b"x")
    (upload_dir / "photo.JPG").write_bytes(b"x")
    assert [i["name"] for i in client.get(MEDIA_URL).json()["items"]] == ["photo.JPG"]
