"""Gửi vật thể đang chọn tới các TCP socket cấu hình trong Cài đặt: mỗi bản tin một dòng JSON (UTF-8).

Cùng nội dung với WebSocket /api/vision/ws: (kết nối lại) gửi `selection.snapshot`, sau đó `selection.changed`.
Máy đích chưa mở / mất kết nối thì thử lại mỗi RETRY_SECONDS giây; không bao giờ làm chậm nhận diện.
Mọi hàm chạy trên event loop của ứng dụng (cùng SelectionHub).
"""
from __future__ import annotations

import asyncio
from contextlib import suppress
import json
from pathlib import Path
import time
from typing import Any

from core.logging import logger
from services.selection_stream import SelectionHub

RETRY_SECONDS = 3.0
CONNECT_TIMEOUT_SECONDS = 3.0
SEND_TIMEOUT_SECONDS = 5.0


def target_id(host: str, port: int) -> str:
    return f"{host}:{port}"


class SocketForwarder:
    def __init__(self, hub: SelectionHub, config_file: Path):
        self.hub = hub
        self.config_file = config_file
        self.targets: list[dict[str, Any]] = self._load()
        # id → trạng thái hiện tại: off | connecting | connected | error
        self.state: dict[str, dict[str, Any]] = {}
        self.tasks: dict[str, asyncio.Task] = {}

    def _load(self) -> list[dict[str, Any]]:
        try:
            raw = json.loads(self.config_file.read_text(encoding="utf-8"))
            return [{"host": str(t["host"]), "port": int(t["port"]), "enabled": bool(t.get("enabled", True))}
                    for t in raw.get("tcp", [])]
        except FileNotFoundError:
            return []
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            logger.warning("Ignoring invalid socket configuration in %s", self.config_file)
            return []

    def _save(self) -> None:
        self.config_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.config_file.with_suffix(".tmp")
        temporary.write_text(json.dumps({"tcp": self.targets}, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.config_file)

    def snapshot(self) -> list[dict[str, Any]]:
        result = []
        for target in self.targets:
            key = target_id(target["host"], target["port"])
            state = self.state.get(key) or {"status": "connecting" if target["enabled"] else "off"}
            result.append({"id": key, **target, "status": "off" if not target["enabled"] else state["status"],
                           "error": state.get("error"), "sent": state.get("sent", 0), "last_sent": state.get("last_sent")})
        return result

    async def start(self) -> None:
        for target in self.targets:
            self._ensure_task(target)

    async def stop(self) -> None:
        tasks = list(self.tasks.values())
        self.tasks.clear()
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError, Exception):
                await task

    async def replace(self, targets: list[dict[str, Any]]) -> None:
        """Lưu danh sách mới; chỉ kết nối lại các máy đích thêm / bật / tắt, máy đích giữ nguyên không bị ngắt."""
        unique: dict[str, dict[str, Any]] = {}
        for target in targets:
            unique[target_id(target["host"], target["port"])] = {
                "host": target["host"], "port": int(target["port"]), "enabled": bool(target.get("enabled", True))}
        self.targets = list(unique.values())
        self._save()
        wanted = {key for key, target in unique.items() if target["enabled"]}
        for key in [key for key in self.tasks if key not in wanted]:
            task = self.tasks.pop(key)
            task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await task
        for key in list(self.state):
            if key not in unique:
                del self.state[key]
        for target in self.targets:
            self._ensure_task(target)

    def _ensure_task(self, target: dict[str, Any]) -> None:
        key = target_id(target["host"], target["port"])
        if not target["enabled"]:
            self.state[key] = {**self.state.get(key, {}), "status": "off", "error": None}
            return
        if key not in self.tasks or self.tasks[key].done():
            self.tasks[key] = asyncio.create_task(self._run(target["host"], target["port"]), name=f"tcp-{key}")

    async def _run(self, host: str, port: int) -> None:
        key = target_id(host, port)
        state = self.state.setdefault(key, {"sent": 0, "last_sent": None})
        queue = self.hub.subscribe()
        try:
            while True:
                state.update(status="connecting", error=None)
                try:
                    reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), CONNECT_TIMEOUT_SECONDS)
                except (OSError, asyncio.TimeoutError) as exc:
                    state.update(status="error", error=f"Không kết nối được: {exc or type(exc).__name__}")
                    await asyncio.sleep(RETRY_SECONDS)
                    continue
                state.update(status="connected", error=None)
                logger.info("TCP socket output connected: %s", key)
                try:
                    await self._forward(reader, writer, queue, state)
                except (OSError, ConnectionError, asyncio.TimeoutError) as exc:
                    state.update(status="error", error=f"Mất kết nối: {exc or type(exc).__name__}")
                    logger.warning("TCP socket output %s disconnected: %s", key, exc)
                finally:
                    writer.close()
                    with suppress(Exception):
                        await writer.wait_closed()
                await asyncio.sleep(RETRY_SECONDS)
        finally:
            self.hub.unsubscribe(queue)

    async def _forward(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                       queue: asyncio.Queue, state: dict[str, Any]) -> None:
        # Bản tin xếp hàng lúc mất kết nối đã nằm trong snapshot: bỏ đi, gửi trạng thái đầy đủ trước
        while not queue.empty():
            queue.get_nowait()
        await self._send(writer, self.hub.snapshot(), state)
        # Máy đích đóng kết nối thì read() trả về b"" (dữ liệu nó gửi tới được bỏ qua)
        closed = asyncio.create_task(reader.read(4096))
        try:
            while True:
                event = asyncio.create_task(queue.get())
                done, _ = await asyncio.wait({event, closed}, return_when=asyncio.FIRST_COMPLETED)
                if event in done:
                    await self._send(writer, event.result(), state)
                else:
                    event.cancel()
                if closed in done:
                    if not closed.result():
                        raise ConnectionError("máy đích đã đóng kết nối")
                    closed = asyncio.create_task(reader.read(4096))
        finally:
            closed.cancel()

    @staticmethod
    async def _send(writer: asyncio.StreamWriter, message: dict[str, Any], state: dict[str, Any]) -> None:
        writer.write((json.dumps(message, ensure_ascii=False) + "\n").encode("utf-8"))
        await asyncio.wait_for(writer.drain(), SEND_TIMEOUT_SECONDS)
        state["sent"] = state.get("sent", 0) + 1
        state["last_sent"] = time.time_ns() // 1_000_000
