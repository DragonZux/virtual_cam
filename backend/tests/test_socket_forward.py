import asyncio
import json

import pytest

from main import app
from models import SelectionUpdate
from routers.sockets import get_forwarder
from services import socket_forward
from services.selection_stream import SelectionHub
from services.socket_forward import SocketForwarder


async def tcp_server():
    """Máy đích TCP giả: gom từng dòng JSON nhận được."""
    received: asyncio.Queue = asyncio.Queue()
    clients = []

    async def handle(reader, writer):
        clients.append(writer)
        while line := await reader.readline():
            await received.put(json.loads(line))

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    return server, server.sockets[0].getsockname()[1], received, clients


def test_tcp_target_gets_snapshot_then_changes_and_config_persists(tmp_path):
    async def scenario():
        server, port, received, _ = await tcp_server()
        hub = SelectionHub()
        forwarder = SocketForwarder(hub, tmp_path / "sockets.json")
        await forwarder.replace([{"host": "127.0.0.1", "port": port, "enabled": True}])
        first = await asyncio.wait_for(received.get(), 3)
        assert first == {"type": "selection.snapshot", "sessions": []}
        hub.update("s1", SelectionUpdate(selected={"name": "cup", "confidence": 0.9}, pointer_mode="laser"))
        second = await asyncio.wait_for(received.get(), 3)
        assert second["type"] == "selection.changed" and second["selected"] == {"name": "cup", "confidence": 0.9}
        [target] = forwarder.snapshot()
        assert target["status"] == "connected" and target["sent"] == 2 and target["id"] == f"127.0.0.1:{port}"
        await forwarder.stop()
        server.close()
        await server.wait_closed()
        # Lưu trên máy chủ: khởi động lại vẫn còn máy đích
        assert SocketForwarder(hub, tmp_path / "sockets.json").targets == [{"host": "127.0.0.1", "port": port, "enabled": True}]

    asyncio.run(scenario())


def test_unreachable_target_reports_error_and_reconnects_with_snapshot(tmp_path, monkeypatch):
    monkeypatch.setattr(socket_forward, "RETRY_SECONDS", 0.05)

    async def scenario():
        hub = SelectionHub()
        hub.update("s1", SelectionUpdate(selected={"name": "cup", "confidence": 0.9}, pointer_mode="laser"))
        probe = await asyncio.start_server(lambda r, w: None, "127.0.0.1", 0)
        port = probe.sockets[0].getsockname()[1]
        probe.close()
        await probe.wait_closed()
        forwarder = SocketForwarder(hub, tmp_path / "sockets.json")
        await forwarder.replace([{"host": "127.0.0.1", "port": port, "enabled": True}])
        for _ in range(100):
            if forwarder.snapshot()[0]["status"] == "error":
                break
            await asyncio.sleep(0.02)
        assert forwarder.snapshot()[0]["status"] == "error" and "Không kết nối được" in forwarder.snapshot()[0]["error"]
        # Máy đích mở sau: tự kết nối và nhận ngay trạng thái hiện tại
        received: asyncio.Queue = asyncio.Queue()

        async def handle(reader, writer):
            while line := await reader.readline():
                await received.put(json.loads(line))

        server = await asyncio.start_server(handle, "127.0.0.1", port)
        snapshot = await asyncio.wait_for(received.get(), 3)
        assert snapshot["type"] == "selection.snapshot" and snapshot["sessions"][0]["selected"]["name"] == "cup"
        # Tắt máy đích trong Cài đặt: ngừng gửi, trạng thái "off"
        await forwarder.replace([{"host": "127.0.0.1", "port": port, "enabled": False}])
        assert forwarder.snapshot()[0]["status"] == "off" and not forwarder.tasks
        await forwarder.stop()
        server.close()
        await server.wait_closed()

    asyncio.run(scenario())


class FakeForwarder:
    def __init__(self):
        self.saved = []

    def snapshot(self):
        return [{"id": f"{t['host']}:{t['port']}", **t, "status": "connecting", "error": None, "sent": 0, "last_sent": None}
                for t in self.saved]

    async def replace(self, targets):
        self.saved = targets


@pytest.fixture
def socket_client(client):
    fake = FakeForwarder()
    app.dependency_overrides[get_forwarder] = lambda: fake
    yield client, fake


def test_socket_api_validates_and_reports_websocket(socket_client):
    client, fake = socket_client
    data = client.get("/api/sockets").json()
    assert data == {"websocket_path": "/api/vision/ws", "tcp": []}
    ok = client.put("/api/sockets/tcp", json={"targets": [{"host": "192.168.1.20", "port": 5000}]})
    assert ok.status_code == 200 and ok.json()["tcp"][0]["id"] == "192.168.1.20:5000"
    assert fake.saved == [{"host": "192.168.1.20", "port": 5000, "enabled": True}]
    for bad in ({"host": "tcp://x", "port": 5000}, {"host": "pc", "port": 0}, {"host": "pc", "port": 70000}, {"host": "", "port": 1}):
        assert client.put("/api/sockets/tcp", json={"targets": [bad]}).status_code == 422
    too_many = [{"host": "pc", "port": 1000 + i} for i in range(9)]
    assert client.put("/api/sockets/tcp", json={"targets": too_many}).status_code == 422
