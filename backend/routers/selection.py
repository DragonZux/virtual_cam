"""WebSocket publisher for external clients and a read-only stream (view3d, other apps)."""
import json
from uuid import uuid4

import anyio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from models import SelectionUpdate
from services.connection_test import ping_source, pong
from services.selection_stream import SelectionHub

router = APIRouter(prefix="/vision", tags=["Vision"])


@router.websocket("/ws/publish")
async def publish_selection(socket: WebSocket):
    hub: SelectionHub = socket.app.state.selection_hub
    session_id = str(uuid4())
    await socket.accept()
    try:
        while True:
            packet = await socket.receive()
            if packet["type"] == "websocket.disconnect":
                return
            message = packet.get("text")
            if message is None:
                await socket.close(code=1003, reason="Expected a JSON text message")
                return
            if len(message) > 4096:
                await socket.close(code=1009, reason="Selection message too large")
                return
            try:
                update = SelectionUpdate.model_validate_json(message)
            except ValidationError:
                await socket.close(code=1008, reason="Invalid selection message")
                return
            hub.update(session_id, update)
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(session_id)


@router.websocket("/ws")
async def watch_selections(socket: WebSocket):
    hub: SelectionHub = socket.app.state.selection_hub
    await socket.accept()
    queue = hub.subscribe()

    async def send_updates():
        try:
            while True:
                await socket.send_json(await queue.get())
        except WebSocketDisconnect:
            pass
        finally:
            group.cancel_scope.cancel()

    async def watch_disconnect():
        # Read-only: incoming messages do not change the published state; only "Test kết nối" pings are answered.
        while True:
            packet = await socket.receive()
            if packet["type"] == "websocket.disconnect":
                return
            text = packet.get("text")
            if not text or len(text) > 1024:
                continue
            try:
                source = ping_source(json.loads(text))
            except ValueError:
                continue
            if source and not queue.full():
                queue.put_nowait(pong(socket, source, "/api/vision/ws"))

    try:
        async with anyio.create_task_group() as group:
            group.start_soon(send_updates)
            await watch_disconnect()
            group.cancel_scope.cancel()
    finally:
        hub.unsubscribe(queue)
