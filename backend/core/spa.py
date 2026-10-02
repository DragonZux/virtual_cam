"""Phục vụ bản build React (frontend/dist) cùng cổng với API — một lệnh là có web hoàn chỉnh."""
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from core.logging import logger

VIEW3D_PREFIX = "/view3d"

# Đường dẫn thuộc về backend / file tĩnh / app khác: không bao giờ trả index.html thay cho 404
_NO_FALLBACK = {"api", "assets", "docs", "redoc", "openapi.json", "health", VIEW3D_PREFIX.strip("/")}


class SpaStaticFiles(StaticFiles):
    """Đường dẫn không phải file (vd. /history) trả index.html để React Router xử lý."""

    def __init__(self, *args, fallback: bool = True, **kwargs):
        super().__init__(*args, **kwargs)
        # False: app một màn hình, không có router (view3d) — file thiếu là 404
        self.fallback = fallback

    async def get_response(self, path: str, scope: Scope) -> Response:
        parts = Path(path).parts
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if not self.fallback or exc.status_code != 404 or (parts and parts[0] in _NO_FALLBACK):
                raise
            response = await super().get_response("index.html", scope)
        # File trong assets/ có hash trong tên → cache lâu; index.html luôn hỏi lại để nhận bản build mới
        immutable = bool(parts) and parts[0] == "assets"
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable" if immutable else "no-cache"
        return response


def mount_frontend(app: FastAPI, dist: Path) -> bool:
    """Mount frontend/dist vào "/" (gọi sau cùng để không che route API)."""
    if not (dist / "index.html").is_file():
        logger.info("Frontend build not found at %s - serving API only (run `npm run build` in frontend/)", dist)
        return False
    app.mount("/", SpaStaticFiles(directory=dist, html=True), name="frontend")
    return True


def mount_view3d(app: FastAPI, dist: Path) -> bool:
    """Mount màn hình 3D (view3d/dist) vào /view3d/ — app riêng, chỉ nghe WebSocket /api/vision/ws.

    Gọi trước mount_frontend vì "/" bắt mọi đường dẫn.
    """
    if not (dist / "index.html").is_file():
        logger.info("3D view build not found at %s - /view3d disabled (run `npm run build` in view3d/)", dist)
        return False

    @app.get(VIEW3D_PREFIX, include_in_schema=False)
    def view3d_with_slash(request: Request) -> RedirectResponse:
        # Bản build dùng đường dẫn tương đối (./assets/…) nên trang phải mở ở /view3d/ (có dấu /); giữ ?ws= / ?preview=
        query = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(f"{VIEW3D_PREFIX}/{query}")

    app.mount(VIEW3D_PREFIX, SpaStaticFiles(directory=dist, html=True, fallback=False), name="view3d")
    return True
