import type { CameraInfo, FrameResult, SelectedObject } from "@/common/types";
import { API_BASE_URL } from "@/environment";

/** Bám / giữ để xác nhận do máy chủ tính; `elapsed_ms` = đã giữ chấm trên vật bao lâu tới lúc có kết quả */
export interface LiveTracking {
  held: SelectedObject | null;
  pending: { name: string; elapsed_ms: number } | null;
}

/** Bản tin JSON máy chủ gửi trên /api/camera/ws (khung hình là bản tin binary JPEG) */
export type LiveMessage =
  /** Ngay khi kết nối và mỗi khi camera máy chủ đổi trạng thái */
  | ({ type: "camera" } & CameraInfo)
  | { type: "result"; result: FrameResult; tracking: LiveTracking; latency_ms: number };

export interface LiveOptions {
  /** null = mặc định máy chủ */
  targets: string[] | null;
  confidence: number | null;
  dwell_ms: number;
}

export interface LiveHandlers {
  /** Socket vừa mở (lần đầu / sau khi kết nối lại) — gửi tuỳ chọn / trạng thái hiện tại */
  onOpen: () => void;
  onFrame: (jpeg: Blob) => void;
  onMessage: (message: LiveMessage) => void;
}

/** Trả lời của nút "Test kết nối" */
export interface PongInfo {
  /** Địa chỉ backend thật (sau proxy vite / nginx) */
  backend: string | null;
  server: string;
  /** Máy gửi như backend thấy */
  client: string;
  ms: number;
}

export interface LiveConnection {
  sendOptions: (options: LiveOptions) => void;
  /** Gửi ping trên chính WebSocket này; backend ghi log trang + máy gửi rồi trả pong */
  ping: () => Promise<PongInfo>;
  /** Tab ẩn → video=false: máy chủ ngừng gửi hình / kết quả cho trang này (vẫn nhận diện) */
  sendVideo: (video: boolean) => void;
  close: () => void;
}

const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 10000;
const PING_TIMEOUT_MS = 5000;
/** Kết nối đang mở của trang (Cài đặt › Test kết nối dùng chung socket của khung camera) */
let current: LiveConnection | null = null;

const socketUrl = () => {
  const url = new URL(`${API_BASE_URL.replace(/\/$/, "")}/camera/ws`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
};

/**
 * Xem camera máy chủ đang chạy: một WebSocket cho cả hình lẫn kết quả. Chỉ xem — chọn / tắt / tạm dừng camera
 * qua REST (CameraService). Mất kết nối (máy chủ khởi động lại…) thì tự nối lại: 0,5 giây, tăng dần tối đa 10 giây.
 */
const watch = (handlers: LiveHandlers): LiveConnection => {
  let socket: WebSocket | null = null;
  let retryTimer: number | undefined;
  let retryMs = RETRY_MIN_MS;
  let stopped = false;
  const pings: { resolve: (info: PongInfo) => void; reject: (error: Error) => void; at: number }[] = [];
  const send = (message: object) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const connect = () => {
    if (stopped) return;
    let next: WebSocket;
    try {
      next = new WebSocket(socketUrl());
    } catch {
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
      return;
    }
    socket = next;
    next.binaryType = "arraybuffer";
    next.onopen = () => {
      retryMs = RETRY_MIN_MS;
      handlers.onOpen();
    };
    next.onmessage = ({ data }) => {
      if (data instanceof ArrayBuffer) {
        handlers.onFrame(new Blob([data], { type: "image/jpeg" }));
        return;
      }
      let message: LiveMessage | (Omit<PongInfo, "ms"> & { type: "pong" });
      try {
        message = JSON.parse(data);
      } catch {
        return; // JSON hỏng: bỏ bản tin này
      }
      if (message.type === "pong") {
        const waiting = pings.shift();
        waiting?.resolve({ backend: message.backend, server: message.server, client: message.client, ms: Date.now() - waiting.at });
      } else handlers.onMessage(message);
    };
    next.onerror = () => next.close();
    next.onclose = () => {
      if (socket !== next || stopped) return;
      socket = null;
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    };
  };
  connect();
  const connection: LiveConnection = {
    sendOptions: (options) => send({ type: "options", ...options }),
    ping: () => new Promise<PongInfo>((resolve, reject) => {
      if (socket?.readyState !== WebSocket.OPEN) {
        reject(new Error("offline"));
        return;
      }
      const entry = { resolve, reject, at: Date.now() };
      pings.push(entry);
      send({ type: "ping", source: "frontend" });
      window.setTimeout(() => {
        const index = pings.indexOf(entry);
        if (index >= 0) {
          pings.splice(index, 1);
          reject(new Error("timeout"));
        }
      }, PING_TIMEOUT_MS);
    }),
    sendVideo: (video) => send({ type: "state", video }),
    close: () => {
      if (current === connection) current = null;
      stopped = true;
      window.clearTimeout(retryTimer);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
      }
    },
  };
  current = connection;
  return connection;
};

/** Nút "Test kết nối": ping qua WebSocket camera đang mở của trang */
const ping = (): Promise<PongInfo> => current?.ping() ?? Promise.reject(new Error("offline"));

export const LiveService = { watch, ping };
