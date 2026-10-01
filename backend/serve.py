"""Chạy web Virtual Cam: API + giao diện (frontend/dist) trên cùng một cổng.

    python serve.py                      # http://localhost:8030 — chỉ cho chính máy này
    python serve.py --https-port 8031    # thêm https://<IP máy>:8031 cho máy khác (chứng chỉ tự ký)
    python serve.py --open               # tự mở trình duyệt khi máy chủ sẵn sàng

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
from core.tls import ensure_certificate
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


def build_configs(args: argparse.Namespace) -> list[uvicorn.Config]:
    # Mỗi khung hình là một request → tắt access log cho khỏi ngập console
    common = dict(app=app, log_level=settings.LOG_LEVEL.lower(), access_log=False)
    configs = [uvicorn.Config(host=args.host, port=args.port, **common)]
    if args.https_port:
        cert, key = ensure_certificate(settings.CERT_DIR, settings.cert_hosts)
        # Dùng chung app (và bộ nhận diện) với server HTTP → tắt lifespan để không nạp model lần hai.
        # Luôn nghe mọi IP: cổng này dành cho máy khác trong mạng.
        configs.append(
            uvicorn.Config(host="0.0.0.0", port=args.https_port, ssl_certfile=str(cert), ssl_keyfile=str(key), lifespan="off", **common)
        )
    return configs


async def serve(configs: list[uvicorn.Config], local_url: str, open_browser: bool) -> None:
    servers = [uvicorn.Server(config) for config in configs]
    tasks = [asyncio.create_task(server.serve()) for server in servers]
    while not servers[0].started and not tasks[0].done():
        await asyncio.sleep(0.1)
    if servers[0].started:
        logger.info("Virtual Cam: open %s (Ctrl+C to stop)", local_url)
        for config in configs[1:]:
            # Trong Docker cổng này được map ra HTTPS_PORT của host (mặc định 8033)
            logger.info("HTTPS for other machines on port %d (self-signed - choose Advanced > Proceed)", config.port)
        if open_browser:
            webbrowser.open(local_url)
    await asyncio.gather(*tasks)


def main() -> None:
    parser = argparse.ArgumentParser(description="Virtual Cam web server (API + giao diện)")
    parser.add_argument("--host", default=settings.HOST, help="Địa chỉ lắng nghe (mặc định chỉ máy này)")
    parser.add_argument("--port", type=int, default=settings.PORT)
    parser.add_argument("--https-port", type=int, default=settings.HTTPS_PORT, help="Cổng HTTPS cho máy khác (0 = tắt)")
    parser.add_argument("--open", action="store_true", help="Mở trình duyệt khi máy chủ sẵn sàng")
    args = parser.parse_args()

    listeners = [(args.host, args.port)] + ([("0.0.0.0", args.https_port)] if args.https_port else [])
    if any(not 1 <= port <= 65535 for _, port in listeners):
        parser.error("Cổng phải trong khoảng 1..65535")
    if args.port == args.https_port:
        parser.error("--port và --https-port phải khác nhau")
    busy = [f"{host}:{port}" for host, port in listeners if port_in_use(host, port)]
    if busy:
        parser.error(f"Cổng đang được chương trình khác dùng: {', '.join(busy)} (đổi bằng --port / --https-port)")

    shown_host = "localhost" if args.host in LOOPBACK_HOSTS else args.host
    try:
        asyncio.run(serve(build_configs(args), f"http://{shown_host}:{args.port}", args.open))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
