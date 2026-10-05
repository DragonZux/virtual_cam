import { expect, type Page, type WebSocketRoute } from "@playwright/test";

/** Khung JPEG vẽ bằng canvas của chính trình duyệt test (gọi trước page.goto cũng được) */
export async function jpegFrame(page: Page, width = 640, height = 480): Promise<Buffer> {
  const base64 = await page.evaluate(async ({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#2a5aa0";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(width / 4, height / 4, width / 2, height / 2);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.6));
    return btoa(String.fromCharCode(...new Uint8Array(await blob!.arrayBuffer())));
  }, { width, height });
  return Buffer.from(base64, "base64");
}

export interface RtspMockOptions {
  /** Khoảng cách giữa hai khung máy chủ giả đẩy về (≈ 1000 / fps) */
  frameDelayMs?: number;
  width?: number;
  height?: number;
  /** Camera lưu sẵn trên trình duyệt; null = chưa có camera nào */
  saved?: { url: string; name?: string } | null;
  /** Máy chủ không mở được luồng */
  fail?: boolean;
}

/** Kết quả nhận diện mặc định (chế độ laser, không thấy gì) — ghi đè từng trường khi cần */
export const frameResult = (overrides: Record<string, unknown> = {}) => ({
  pointer_mode: "laser", hand_detected: false, landmarks: [], tip: null, laser: null, selected: null, detections: [],
  processing_ms: 30, resolution: { width: 640, height: 480 }, ...overrides,
});

export type LiveResult = {
  result: ReturnType<typeof frameResult>;
  tracking?: { held: unknown; pending: { name: string; elapsed_ms: number } | null };
};

type CameraInfo = {
  status: "off" | "connecting" | "live" | "reconnecting"; url: string | null; name: string | null;
  detect: boolean; error: string | null; width: number | null; height: number | null;
};

/**
 * Máy chủ giả giữ camera (như backend): PUT / DELETE /api/camera chọn / tắt, PUT /api/camera/detect tạm dừng;
 * WebSocket /api/camera/ws chỉ xem — đẩy trạng thái camera, khung JPEG theo nhịp camera và (nếu đặt `api.result`)
 * một kết quả sau mỗi khung. Phải gọi trước page.goto để danh sách camera có từ lúc tải trang.
 */
export async function mockRtspCamera(page: Page, options: RtspMockOptions = {}) {
  const { frameDelayMs = 40, width = 640, height = 480, fail = false } = options;
  const saved = options.saved === undefined ? { url: "rtsp://10.0.9.41:8554/camera", name: "Camera thử" } : options.saved;
  const frame = await jpegFrame(page, width, height);
  const camera: CameraInfo = { status: "off", url: null, name: null, detect: true, error: null, width: null, height: null };
  const api = {
    camera,
    /** Địa chỉ trang yêu cầu máy chủ chạy (PUT /api/camera) */
    opened: [] as string[],
    /** Số lần tắt camera (DELETE /api/camera) */
    closed: 0,
    detects: [] as boolean[],
    frames: 0,
    results: 0,
    options: [] as { targets: string[] | null; confidence: number | null; dwell_ms: number }[],
    /** Bản tin {"type":"state","video"} của trang */
    videos: [] as boolean[],
    /** Nút "Test kết nối" (ping trên socket camera) */
    pings: [] as string[],
    sockets: [] as WebSocketRoute[],
    /** Kết quả gửi sau khung thứ `index`; null = chỉ gửi hình */
    result: null as ((index: number) => LiveResult) | null,
    /** Đổi trạng thái camera máy chủ và báo mọi trang đang xem */
    setCamera: (changes: Partial<CameraInfo>) => {
      Object.assign(camera, changes);
      for (const socket of api.sockets) {
        try {
          socket.send(JSON.stringify({ type: "camera", ...camera }));
        } catch {
          // trang đã đóng socket
        }
      }
    },
  };
  if (saved) {
    await page.addInitScript((link) => {
      if (localStorage.getItem("hicascam.rtspStreams") === null) localStorage.setItem("hicascam.rtspStreams", JSON.stringify([link]));
    }, saved);
  }
  await page.route("**/api/camera", async (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      const body = route.request().postDataJSON() as { url: string; name: string | null };
      api.opened.push(body.url);
      if (fail) {
        api.setCamera({ status: "off", url: null, name: null });
        return route.fulfill({ status: 502, json: { detail: "Máy chủ không mở được cổng RTSP 10.0.9.41:8554. Kiểm tra camera đã bật RTSP đúng cổng này." } });
      }
      api.setCamera({ status: "live", url: body.url.replace(/^(rtsps?:\/\/)[^/@]*@/i, "$1"), name: body.name, error: null, width, height });
      return route.fulfill({ json: camera });
    }
    if (method === "DELETE") {
      api.closed += 1;
      api.setCamera({ status: "off", url: null, name: null, width: null, height: null, error: null });
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: camera });
  });
  await page.route("**/api/camera/detect", (route) => {
    const { detect } = route.request().postDataJSON() as { detect: boolean };
    api.detects.push(detect);
    api.setCamera({ detect });
    return route.fulfill({ json: camera });
  });
  await page.routeWebSocket("**/api/camera/ws", (socket) => {
    let video = true;
    api.sockets.push(socket);
    socket.send(JSON.stringify({ type: "camera", ...camera }));
    const timer = setInterval(() => {
      if (camera.status === "off" || !video) return;
      try {
        socket.send(frame);
        api.frames += 1;
        if (camera.detect && api.result) {
          const { result, tracking = { held: null, pending: null } } = api.result(api.frames);
          socket.send(JSON.stringify({ type: "result", result, tracking, latency_ms: 30 }));
          api.results += 1;
        }
      } catch {
        clearInterval(timer); // trang đã đóng socket
      }
    }, frameDelayMs);
    socket.onMessage((raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "options") {
        const { type: _type, ...sent } = message;
        api.options.push(sent);
      } else if (message.type === "state") {
        video = message.video;
        api.videos.push(video);
      } else if (message.type === "ping") {
        api.pings.push(message.source);
        socket.send(JSON.stringify({ type: "pong", source: message.source, client: "10.0.9.81", backend: "127.0.0.1:8030", server: "HICAS API 1.0.0" }));
      }
    });
    socket.onClose(() => {
      clearInterval(timer);
      api.sockets = api.sockets.filter((item) => item !== socket);
    });
  });
  return api;
}

/** Nút trên khung camera: mở camera RTSP đã lưu */
export async function connectCamera(page: Page) {
  await page.getByRole("button", { name: "Kết nối camera", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
}
