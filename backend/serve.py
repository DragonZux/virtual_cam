"""Chạy web Virtual Cam: API + giao diện (frontend/dist) trên cùng một cổng, chỉ cho chính máy này.

    python serve.py            # http://localhost:8030
    python serve.py --open     # tự mở trình duyệt khi máy chủ sẵn sàng

Dev (sửa code tự nạp lại): `uvicorn main:app --reload --port 8030` + `npm run dev` trong frontend/.
"""
from __future__ import annotations

import argparse
import asyncio
import socket
import webbrowser

import uvicorn

from core.config import settings
from core.logging import logger
from main import app

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0", "::1", "::"}


def port_in_use(host: str, port: int) -> bool:
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    with socket.socket(family, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
        except OSError:
            return True
    return False


async def serve(config: uvicorn.Config, local_url: str, open_browser: bool) -> None:
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    while not server.started and not task.done():
        await asyncio.sleep(0.1)
    if server.started:
        logger.info("Virtual Cam: open %s (Ctrl+C to stop)", local_url)
        if open_browser:
            webbrowser.open(local_url)
    await task


def main() -> None:
    parser = argparse.ArgumentParser(description="Virtual Cam web server (API + giao diện)")
    parser.add_argument("--host", default=settings.HOST, help="Địa chỉ lắng nghe (mặc định chỉ máy này)")
    parser.add_argument("--port", type=int, default=settings.PORT)
    parser.add_argument("--open", action="store_true", help="Mở trình duyệt khi máy chủ sẵn sàng")
    args = parser.parse_args()

    if not 1 <= args.port <= 65535:
        parser.error("Cổng phải trong khoảng 1..65535")
    if port_in_use(args.host, args.port):
        parser.error(f"Cổng đang được chương trình khác dùng: {args.host}:{args.port} (đổi bằng --port)")

    # Mỗi khung hình là một request → tắt access log cho khỏi ngập console
    config = uvicorn.Config(app=app, host=args.host, port=args.port, log_level=settings.LOG_LEVEL.lower(), access_log=False)
    shown_host = "localhost" if args.host in LOOPBACK_HOSTS else args.host
    try:
        asyncio.run(serve(config, f"http://{shown_host}:{args.port}", args.open))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
