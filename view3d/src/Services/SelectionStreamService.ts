import { Observable } from "rxjs";

import { RETRY_MAX_MS, RETRY_MIN_MS } from "@/common/constants";
import type { SelectionMessage, SelectionSession, StreamSignal } from "@/common/types";
import { sanitizeSession } from "@/utils/sessions";

/** Chỉ nhận đúng hai loại bản tin của backend; bản tin lạ / hỏng bị bỏ qua */
const asMessage = (value: unknown): SelectionMessage | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type === "selection.snapshot") {
    if (!Array.isArray(raw.sessions)) return null;
    const sessions = raw.sessions.map(sanitizeSession).filter((s): s is SelectionSession => s !== null);
    return { type: "selection.snapshot", sessions };
  }
  if (raw.type === "selection.changed") {
    const session = sanitizeSession(raw);
    return session && { type: "selection.changed", ...session };
  }
  return null;
};

/**
 * Nghe WebSocket chỉ-đọc `/api/vision/ws` (không gửi gì lên máy chủ). Socket đóng thì tự kết nối lại:
 * đợi 0,5 giây, tăng dần tối đa 10 giây; mỗi lần nối lại máy chủ gửi `selection.snapshot` trước.
 */
const watch = (url: string): Observable<StreamSignal> =>
  new Observable<StreamSignal>((subscriber) => {
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let retryMs = RETRY_MIN_MS;
    let stopped = false;

    const retry = () => {
      if (stopped) return;
      subscriber.next({ kind: "closed", url, retryInMs: retryMs });
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    };

    const connect = () => {
      if (stopped) return;
      subscriber.next({ kind: "connecting", url });
      let next: WebSocket;
      try {
        next = new WebSocket(url);
      } catch {
        // Địa chỉ sai, hoặc trang HTTPS gọi ws:// (mixed content)
        retry();
        return;
      }
      socket = next;
      next.onopen = () => {
        retryMs = RETRY_MIN_MS;
        subscriber.next({ kind: "open", url });
      };
      next.onmessage = ({ data }) => {
        if (typeof data !== "string") return;
        try {
          const message = asMessage(JSON.parse(data));
          if (message) subscriber.next({ kind: "message", message });
        } catch {
          // JSON hỏng: bỏ bản tin này
        }
      };
      next.onerror = () => next.close();
      next.onclose = () => {
        if (socket !== next) return;
        socket = null;
        retry();
      };
    };

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
      }
    };
  });

export const SelectionStreamService = { watch };
