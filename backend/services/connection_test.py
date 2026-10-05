"""Nút "Test kết nối" của hai trang web: gửi {"type": "ping", "source": "..."} trên WebSocket đang dùng,
máy chủ ghi một dòng log (trang nào, máy nào) và trả "pong" kèm địa chỉ thật của backend."""
from fastapi import WebSocket

from core.config import settings
from core.logging import logger


def client_address(socket: WebSocket) -> str:
    # Qua proxy (vite dev, nginx Docker) địa chỉ trực tiếp là của proxy: lấy máy gửi thật từ X-Forwarded-For
    forwarded = socket.headers.get("x-forwarded-for", "")
    if forwarded.strip():
        return forwarded.split(",")[0].strip()
    return socket.client.host if socket.client else "?"


def pong(socket: WebSocket, source: str, path: str) -> dict:
    client = client_address(socket)
    logger.info("Test kết nối từ %s — máy %s qua %s", source, client, path)
    server = socket.scope.get("server")
    backend = f"{server[0]}:{server[1]}" if server else None
    return {"type": "pong", "source": source, "client": client, "backend": backend,
            "server": f"{settings.API_TITLE} {settings.API_VERSION}"}


def ping_source(message: object) -> str | None:
    """Tên trang gửi nếu `message` (JSON đã đọc) là bản tin ping hợp lệ."""
    if isinstance(message, dict) and message.get("type") == "ping":
        source = message.get("source")
        if isinstance(source, str) and 0 < len(source.strip()) <= 40:
            return source.strip()
    return None
