"""Phục vụ bản build React (frontend/dist) cùng cổng với API — một lệnh là có web hoàn chỉnh."""
from pathlib import Path

from fastapi import FastAPI
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from core.logging import logger

# Đường dẫn thuộc về backend / file tĩnh: không bao giờ trả index.html thay cho 404
_NO_FALLBACK = {"api", "assets", "docs", "redoc", "openapi.json", "health"}


class SpaStaticFiles(StaticFiles):
    """Đường dẫn không phải file (vd. /history) trả index.html để React Router xử lý."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        parts = Path(path).parts
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or (parts and parts[0] in _NO_FALLBACK):
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
