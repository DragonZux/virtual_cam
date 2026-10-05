import asyncio

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from main import app
from models import SelectionUpdate
from services.detector import Detector
from services.selection_stream import SelectionHub


@pytest.fixture
def stream_client(monkeypatch):
    monkeypatch.setattr(Detector, "start", lambda self: None)
    with TestClient(app) as client:
        yield client
    assert not app.state.selection_hub.sessions
    assert not app.state.selection_hub.listeners


def selection(name="bottle", confidence=0.94, pointer_mode="hand", source="camera"):
    return {
        "selected": {"name": name, "confidence": confidence} if name else None,
        "pointer_mode": pointer_mode,
        "source": source,
    }


def test_snapshot_updates_clear_and_publisher_disconnect(stream_client):
    with stream_client.websocket_connect("/api/vision/ws") as watcher:
        assert watcher.receive_json() == {"type": "selection.snapshot", "sessions": []}
        with stream_client.websocket_connect("/api/vision/ws/publish") as publisher:
            publisher.send_json(selection())
            event = watcher.receive_json()
            assert event["type"] == "selection.changed"
            assert event["selected"] == {"name": "bottle", "confidence": 0.94}
            assert event["pointer_mode"] == "hand" and event["connected"] is True
            assert event["timestamp"] > 0
            with stream_client.websocket_connect("/api/vision/ws") as late:
                assert late.receive_json() == {"type": "selection.snapshot", "sessions": [event]}
                publisher.send_json(selection())  # unchanged: no duplicate event
                publisher.send_json(selection("cup", 0.89, "laser", "media"))
                changed = watcher.receive_json()
                assert changed == late.receive_json()
                assert changed["selected"]["name"] == "cup"
                assert changed["pointer_mode"] == "laser" and changed["source"] == "media"
                assert changed["session_id"] == event["session_id"]
                publisher.send_json(selection(None))
                assert watcher.receive_json()["selected"] is None
                assert late.receive_json()["selected"] is None
        ended = watcher.receive_json()
        assert ended["session_id"] == event["session_id"]
        assert ended["selected"] is None and ended["connected"] is False
        with stream_client.websocket_connect("/api/vision/ws") as late:
            assert late.receive_json()["sessions"] == []


def test_sessions_are_independent_and_observers_cannot_publish(stream_client):
    with stream_client.websocket_connect("/api/vision/ws") as watcher:
        watcher.receive_json()
        watcher.send_json(selection("fake"))
        with stream_client.websocket_connect("/api/vision/ws/publish") as first:
            first.send_json(selection("bottle"))
            bottle = watcher.receive_json()
            assert bottle["selected"]["name"] == "bottle"
            with stream_client.websocket_connect("/api/vision/ws/publish") as second:
                second.send_json(selection("cup"))
                cup = watcher.receive_json()
                assert cup["session_id"] != bottle["session_id"]
                with stream_client.websocket_connect("/api/vision/ws") as late:
                    assert len(late.receive_json()["sessions"]) == 2
            assert watcher.receive_json()["session_id"] == cup["session_id"]
            with stream_client.websocket_connect("/api/vision/ws") as late:
                assert late.receive_json()["sessions"] == [bottle]
        assert watcher.receive_json()["session_id"] == bottle["session_id"]


@pytest.mark.parametrize("payload", [
    "not json", '{"selected": null}',
    '{"selected":{"name":"bottle","confidence":1.1},"pointer_mode":"hand"}',
    '{"selected":{"name":"bottle","confidence":NaN},"pointer_mode":"hand"}',
    '{"selected":null,"pointer_mode":"invalid"}',
])
def test_invalid_messages_close_and_clear_selection(stream_client, payload):
    with stream_client.websocket_connect("/api/vision/ws") as watcher:
        watcher.receive_json()
        with stream_client.websocket_connect("/api/vision/ws/publish") as publisher:
            publisher.send_json(selection())
            watcher.receive_json()
            publisher.send_text(payload)
            with pytest.raises(WebSocketDisconnect) as exc:
                publisher.receive_json()
            assert exc.value.code == 1008
            assert watcher.receive_json()["connected"] is False


@pytest.mark.parametrize("binary,code", [(False, 1009), (True, 1003)])
def test_reject_oversized_or_binary_messages(stream_client, binary, code):
    with stream_client.websocket_connect("/api/vision/ws/publish") as publisher:
        if binary:
            publisher.send_bytes(b"binary")
        else:
            publisher.send_text("x" * 4097)
        with pytest.raises(WebSocketDisconnect) as exc:
            publisher.receive_json()
        assert exc.value.code == code


def test_slow_listener_gets_bounded_snapshot_including_removals():
    async def scenario():
        hub = SelectionHub()
        hub.update("removed", SelectionUpdate(**selection()))
        queue = hub.subscribe()
        for i in range(31):
            hub.update("active", SelectionUpdate(**selection(f"object {i}")))
        assert queue.full()
        hub.disconnect("removed")
        assert queue.qsize() == 1
        snapshot = queue.get_nowait()
        assert snapshot["type"] == "selection.snapshot"
        assert [entry["session_id"] for entry in snapshot["sessions"]] == ["active"]
        assert snapshot["sessions"][0]["selected"]["name"] == "object 30"
        hub.unsubscribe(queue)

    asyncio.run(scenario())


@pytest.mark.parametrize("origin,expected", [
    ("http://localhost:8030", "ws://localhost:8030"),
    ("https://camera.example:8033", "wss://camera.example:8033"),
])
def test_frontend_csp_allows_its_websocket_origin(stream_client, origin, expected):
    response = stream_client.get(origin + "/")
    assert f"connect-src 'self' {expected};" in response.headers["content-security-policy"]


def test_connection_test_ping_is_logged_with_sender_and_answered(stream_client, caplog):
    with caplog.at_level("INFO", logger="hicas"):
        with stream_client.websocket_connect("/api/vision/ws", headers={"x-forwarded-for": "10.0.9.81, 10.0.0.1"}) as watcher:
            assert watcher.receive_json()["type"] == "selection.snapshot"
            watcher.send_json({"type": "ping", "source": "view3d"})
            answer = watcher.receive_json()
    assert answer["type"] == "pong" and answer["source"] == "view3d" and answer["client"] == "10.0.9.81"
    assert answer["server"].startswith("HICAS API")
    assert any("Test kết nối từ view3d" in r.getMessage() and "10.0.9.81" in r.getMessage() for r in caplog.records)
