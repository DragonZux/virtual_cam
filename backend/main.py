from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.logging import logger
from core.spa import mount_frontend
from routers import media, vision
from services.detector import Detector

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
    # Nạp model ở luồng nền: web mở được ngay, giao diện hiện "Đang khởi động" tới khi sẵn sàng
    detector.start()
    logger.info("=" * 60)
    yield
    logger.info("Shutting down")
    detector.close()


app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="Nhận diện vật thể bằng ngón trỏ hoặc laser: trình duyệt gửi khung camera, máy chủ trả vị trí chỉ và vật thể được chọn.",
    lifespan=lifespan,
)
# Địa chỉ HTTPS cho thiết bị khác trong mạng LAN — PUBLIC_URLS (Docker) hoặc serve.py --lan điền
app.state.share_urls = settings.public_urls

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
        response.headers.setdefault("Content-Security-Policy", SPA_CSP)
    return response


API_PREFIX = "/api"
app.include_router(vision.router, prefix=API_PREFIX)
app.include_router(media.router, prefix=API_PREFIX)


@app.get("/api", tags=["Health"])
def api_info():
    return {"name": settings.API_TITLE, "version": settings.API_VERSION, "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


# Giao diện React đã build — mount sau cùng để không che các route ở trên
mount_frontend(app, settings.FRONTEND_DIST)
