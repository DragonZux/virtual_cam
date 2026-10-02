"""Cấu hình socket: WebSocket có sẵn cho app khác kết nối vào và các máy đích TCP máy chủ tự gửi tới."""
from fastapi import APIRouter, Depends, Request

from models import SocketConfig, TcpTargetsIn
from services.socket_forward import SocketForwarder

router = APIRouter(prefix="/sockets", tags=["Sockets"])

WEBSOCKET_PATH = "/api/vision/ws"


def get_forwarder(request: Request) -> SocketForwarder:
    return request.app.state.socket_forwarder


@router.get("", response_model=SocketConfig)
def socket_config(forwarder: SocketForwarder = Depends(get_forwarder)):
    return SocketConfig(websocket_path=WEBSOCKET_PATH, tcp=forwarder.snapshot())


@router.put("/tcp", response_model=SocketConfig)
async def save_tcp_targets(body: TcpTargetsIn, forwarder: SocketForwarder = Depends(get_forwarder)):
    """Thay toàn bộ danh sách máy đích TCP; máy đích không đổi giữ nguyên kết nối."""
    await forwarder.replace([target.model_dump() for target in body.targets])
    return socket_config(forwarder)
