import { Observable } from "rxjs";

import type { SelectionUpdate } from "@/common/types";
import { API_BASE_URL } from "@/environment";

/** Keep one publisher connection and replay only the latest state after reconnecting. */
const publish = (updates: Observable<SelectionUpdate>): Observable<never> => new Observable(() => {
  const url = new URL(`${API_BASE_URL.replace(/\/$/, "")}/vision/ws/publish`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  let socket: WebSocket | null = null;
  let retryTimer: number | undefined;
  let retryMs = 500;
  let stopped = false;
  let latest: string | null = null;
  let sent: string | null = null;

  const send = () => {
    if (socket?.readyState !== WebSocket.OPEN || latest === null || latest === sent) return;
    // Reconnect instead of queuing stale results indefinitely on a stalled connection.
    if (socket.bufferedAmount > 65536) {
      socket.close();
      return;
    }
    socket.send(latest);
    sent = latest;
  };

  const retry = () => {
    if (stopped) return;
    retryTimer = window.setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 10000);
  };

  const connect = () => {
    if (stopped) return;
    sent = null;
    try {
      const next = new WebSocket(url);
      socket = next;
      next.onopen = () => {
        retryMs = 500;
        send();
      };
      next.onerror = () => next.close();
      next.onclose = () => {
        if (socket === next) socket = null;
        retry();
      };
    } catch {
      retry();
    }
  };

  const subscription = updates.subscribe((update) => {
    latest = JSON.stringify(update);
    send();
  });
  connect();

  return () => {
    stopped = true;
    subscription.unsubscribe();
    window.clearTimeout(retryTimer);
    if (socket) {
      socket.onopen = socket.onclose = socket.onerror = null;
      socket.close();
    }
  };
});

export const SelectionService = { publish };
