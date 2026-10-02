"""Camera RTSP (MediaMTX…) đọc ở máy chủ: mở luồng, lấy khung JPEG mới nhất, đóng."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from models import StreamOpen, StreamOut
from services.rtsp_stream import StreamHub

router = APIRouter(prefix="/camera", tags=["Camera"])


def get_stream_hub(request: Request) -> StreamHub:
    return request.app.state.stream_hub


@router.post("/streams", response_model=StreamOut, status_code=201)
async def open_stream(body: StreamOpen, hub: StreamHub = Depends(get_stream_hub)):
    try:
        return await run_in_threadpool(hub.open, body.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/streams/{stream_id}/frame", response_class=Response,
            responses={200: {"content": {"image/jpeg": {}}}, 404: {}, 504: {}})
async def stream_frame(stream_id: str, hub: StreamHub = Depends(get_stream_hub)):
    """Khung mới hơn khung đã gửi cho phiên này; chờ tối đa vài giây."""
    try:
        payload = await run_in_threadpool(hub.frame, stream_id)
    except KeyError as exc:
        raise HTTPException(404, "Luồng RTSP đã đóng.") from exc
    except TimeoutError as exc:
        raise HTTPException(504, str(exc)) from exc
    return Response(payload, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.delete("/streams/{stream_id}", status_code=204)
def close_stream(stream_id: str, hub: StreamHub = Depends(get_stream_hub)):
    hub.close(stream_id)
