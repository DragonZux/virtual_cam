import { Observable } from "rxjs";

import { RETRY_MAX_MS, RETRY_MIN_MS } from "@/common/constants";
import type { SelectionMessage, SelectionSession, StreamSignal } from "@/common/types";
import { sanitizeSession } from "@/utils/sessions";

/** Trả lời của nút "Test kết nối" */
export interface PongInfo {
  /** Địa chỉ backend thật (sau proxy vite / nginx) */
  backend: string | null;
  server: string;
  /** Máy gửi như backend thấy */
  client: string;
  ms: number;
}

const PING_TIMEOUT_MS = 5000;
/** Socket đang mở và các ping chờ trả lời (Cài đặt › Test kết nối dùng chung socket đang nghe) */
let active: WebSocket | null = null;
const pings: { resolve: (info: PongInfo) => void; at: number }[] = [];

/** Gửi ping trên WebSocket đang nghe; backend ghi log trang + máy gửi rồi trả pong */
const ping = (): Promise<PongInfo> => new Promise((resolve, reject) => {
  if (active?.readyState !== WebSocket.OPEN) {
    reject(new Error("offline"));
    return;
  }
  const entry = { resolve, at: Date.now() };
  pings.push(entry);
  active.send(JSON.stringify({ type: "ping", source: "view3d" }));
  window.setTimeout(() => {
    const index = pings.indexOf(entry);
    if (index >= 0) {
      pings.splice(index, 1);
      reject(new Error("timeout"));
    }
  }, PING_TIMEOUT_MS);
});

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
 * Nghe WebSocket chỉ-đọc `/api/vision/ws` (chỉ gửi ping khi bấm "Test kết nối"). Socket đóng thì tự kết nối lại:
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
      active = next;
      next.onopen = () => {
        retryMs = RETRY_MIN_MS;
        subscriber.next({ kind: "open", url });
      };
      next.onmessage = ({ data }) => {
        if (typeof data !== "string") return;
        try {
          const raw = JSON.parse(data);
          if (raw?.type === "pong") {
            const waiting = pings.shift();
            waiting?.resolve({ backend: raw.backend ?? null, server: String(raw.server ?? ""), client: String(raw.client ?? ""),
              ms: Date.now() - waiting.at });
            return;
          }
          const message = asMessage(raw);
          if (message) subscriber.next({ kind: "message", message });
        } catch {
          // JSON hỏng: bỏ bản tin này
        }
      };
      next.onerror = () => next.close();
      next.onclose = () => {
        if (socket !== next) return;
        socket = null;
        if (active === next) active = null;
        retry();
      };
    };

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      if (socket) {
        if (active === socket) active = null;
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
      }
    };
  });

export const SelectionStreamService = { watch, ping };
