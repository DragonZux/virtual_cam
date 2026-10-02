from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.logging import logger
from core.spa import mount_frontend, mount_view3d
from routers import camera, vision, models, selection, sockets
from services.detector import Detector
from services.rtsp_stream import StreamHub
from services.socket_forward import SocketForwarder
from services.selection_stream import SelectionHub

# CSP cho trang React (không áp cho /api, /docs): antd chèn <style> lúc chạy nên style cần 'unsafe-inline'
SPA_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; "
    "media-src 'self' blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("Starting %s v%s", settings.API_TITLE, settings.API_VERSION)
    detector = Detector(settings)
    app.state.detector = detector
    app.state.selection_hub = SelectionHub()
    # Gửi vật thể đang chọn tới các TCP socket cấu hình trong Cài đặt
    app.state.socket_forwarder = SocketForwarder(app.state.selection_hub, settings.DATA_DIR / "sockets.json")
    await app.state.socket_forwarder.start()
    app.state.stream_hub = StreamHub()
    # Nạp model ở luồng nền: web mở được ngay, giao diện hiện "Đang khởi động" tới khi sẵn sàng
    detector.start()
    logger.info("=" * 60)
    yield
    logger.info("Shutting down")
    app.state.stream_hub.shutdown()
    await app.state.socket_forwarder.stop()
    detector.close()


app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="Nhận diện vật thể bằng ngón trỏ hoặc laser đỏ: trình duyệt gửi khung camera, máy chủ trả vị trí chỉ và vật thể được chọn.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    # Trang chỉ dùng camera của chính nó, không dùng micro
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=()")
    if not request.url.path.startswith(("/api", "/docs", "/redoc", "/openapi.json")):
        # Some browsers do not include WebSockets in connect-src 'self'.
        ws_scheme = "wss" if request.url.scheme == "https" else "ws"
        ws_origin = f"{ws_scheme}://{request.url.netloc}"
        response.headers.setdefault("Content-Security-Policy", SPA_CSP.replace(
            "connect-src 'self'", f"connect-src 'self' {ws_origin}",
        ))
    return response


API_PREFIX = "/api"
app.include_router(vision.router, prefix=API_PREFIX)
app.include_router(models.router, prefix=API_PREFIX)
app.include_router(selection.router, prefix=API_PREFIX)
app.include_router(camera.router, prefix=API_PREFIX)
app.include_router(sockets.router, prefix=API_PREFIX)


@app.get("/api", tags=["Health"])
def api_info():
    return {"name": settings.API_TITLE, "version": settings.API_VERSION, "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


# Màn hình 3D (app riêng, view3d/dist) ở /view3d/ — trước giao diện chính vì "/" bắt mọi đường dẫn
mount_view3d(app, settings.VIEW3D_DIST)
# Giao diện React đã build — mount sau cùng để không che các route ở trên
mount_frontend(app, settings.FRONTEND_DIST)
