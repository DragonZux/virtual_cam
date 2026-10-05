"""Camera RTSP máy chủ giữ (tối đa một): chọn / tắt / tạm dừng qua REST, xem qua WebSocket.

Đóng trang web không làm dừng camera; chỉ DELETE /api/camera mới tắt. Lựa chọn lưu ở DATA_DIR/camera.json.

WebSocket /api/camera/ws — chỉ xem:
  Trình duyệt → máy chủ (JSON text):
    {"type": "options", "targets": [...] | null, "confidence": 0.8 | null, "dwell_ms": 300}
    {"type": "state", "video": true}                        tab ẩn → false: ngừng gửi hình / kết quả cho trang này
    {"type": "ping", "source": "frontend"}                  nút "Test kết nối": máy chủ ghi log, trả {"type": "pong"}
  Máy chủ → trình duyệt:
    binary                                                  một khung JPEG (khung mới nhất lúc gửi)
    {"type": "camera", ...CameraOut}                        ngay khi kết nối và mỗi khi camera đổi trạng thái
    {"type": "result", "result": FrameResult, "tracking": {...}, "latency_ms": 42}
"""
import anyio
from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter, ValidationError

from models import CameraIn, CameraOut, DetectIn, LiveMessageIn, LiveOptionsIn, PingIn
from services.connection_test import pong
from services.live_stream import LiveHub, Viewer

router = APIRouter(prefix="/camera", tags=["Camera"])

MAX_MESSAGE_CHARS = 16384
messages = TypeAdapter(LiveMessageIn)


def get_live_hub(request: Request) -> LiveHub:
    return request.app.state.live_hub


@router.get("", response_model=CameraOut)
def camera_state(request: Request):
    return CameraOut(**get_live_hub(request).state())


@router.put("", response_model=CameraOut, responses={400: {}, 502: {"description": "Không lấy được hình từ camera"}})
async def start_camera(body: CameraIn, request: Request):
    """Chạy camera này thay camera đang chạy; chờ khung đầu tiên. Không lấy được hình thì không giữ camera."""
    hub = get_live_hub(request)
    try:
        await hub.start(body.url, body.name.strip() if body.name and body.name.strip() else None)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(502, str(exc)) from exc
    return CameraOut(**hub.state())


@router.delete("", status_code=204)
def stop_camera(request: Request):
    get_live_hub(request).stop()
    return Response(status_code=204)


@router.put("/detect", response_model=CameraOut)
def set_detect(body: DetectIn, request: Request):
    """Tạm dừng / tiếp tục nhận diện (hình vẫn chạy; view3d thấy không còn vật đang chọn khi tạm dừng)."""
    hub = get_live_hub(request)
    hub.set_detect(body.detect)
    return CameraOut(**hub.state())


async def receive_loop(socket: WebSocket, hub: LiveHub, viewer: Viewer) -> None:
    while True:
        packet = await socket.receive()
        if packet["type"] == "websocket.disconnect":
            return
        text = packet.get("text")
        if text is None or len(text) > MAX_MESSAGE_CHARS:
            await socket.close(code=1003, reason="Expected a JSON text message")
            return
        try:
            message = messages.validate_json(text)
        except ValidationError:
            await socket.close(code=1008, reason="Invalid camera message")
            return
        if isinstance(message, LiveOptionsIn):
            hub.set_options(message)
        elif isinstance(message, PingIn):
            viewer.notify(pong(socket, message.source, "/api/camera/ws"))
        else:
            hub.set_video(viewer, message.video)


@router.websocket("/ws")
async def watch_camera(socket: WebSocket):
    hub: LiveHub = socket.app.state.live_hub
    await socket.accept()
    viewer = Viewer(socket)
    hub.add_viewer(viewer)

    async def send_updates():
        try:
            await hub.send_loop(viewer)
        except (WebSocketDisconnect, RuntimeError, OSError):
            pass  # trình duyệt đã ngắt
        finally:
            group.cancel_scope.cancel()

    try:
        async with anyio.create_task_group() as group:
            group.start_soon(send_updates)
            await receive_loop(socket, hub, viewer)
            group.cancel_scope.cancel()
    except (WebSocketDisconnect, RuntimeError, OSError):
        pass
    finally:
        hub.remove_viewer(viewer)
