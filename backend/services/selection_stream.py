"""In-memory selection fan-out; all methods run on the application's event loop."""
import asyncio
import time

from models import SelectionUpdate


class SelectionHub:
    def __init__(self):
        self.sessions: dict[str, dict] = {}
        self.listeners: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=32)
        # Register and snapshot without yielding so updates cannot overtake the snapshot.
        self.listeners.add(queue)
        queue.put_nowait(self.snapshot())
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self.listeners.discard(queue)

    def snapshot(self) -> dict:
        return {"type": "selection.snapshot", "sessions": list(self.sessions.values())}

    def update(self, session_id: str, update: SelectionUpdate) -> None:
        payload = update.model_dump(mode="json")
        previous = self.sessions.get(session_id)
        if previous and all(previous[key] == value for key, value in payload.items()):
            return
        event = {
            "type": "selection.changed", "session_id": session_id,
            **payload, "connected": True, "timestamp": time.time_ns() // 1_000_000,
        }
        self.sessions[session_id] = event
        self._broadcast(event)

    def disconnect(self, session_id: str) -> None:
        previous = self.sessions.pop(session_id, None)
        if previous:
            self._broadcast({
                **previous, "selected": None, "connected": False,
                "timestamp": time.time_ns() // 1_000_000,
            })

    def _broadcast(self, event: dict) -> None:
        for queue in self.listeners:
            if queue.full():
                # A slow listener catches up with a full snapshot, including removals.
                # Never block recognition or grow an unbounded backlog.
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait(self.snapshot())
            else:
                queue.put_nowait(event)
