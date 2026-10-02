import { expect, type Page } from "@playwright/test";

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
  /** Thời gian máy chủ giả chờ trước khi trả mỗi khung (≈ 1000 / fps) */
  frameDelayMs?: number;
  width?: number;
  height?: number;
  /** Camera lưu sẵn trên trình duyệt; null = chưa có camera nào */
  saved?: { url: string; name?: string } | null;
  /** Máy chủ không mở được luồng */
  fail?: boolean;
}

/**
 * Camera RTSP giả cho test: máy chủ "đọc" luồng và trả khung JPEG, trình duyệt có sẵn một camera trong danh sách.
 * Phải gọi trước page.goto để danh sách camera có từ lúc tải trang.
 */
export async function mockRtspCamera(page: Page, options: RtspMockOptions = {}) {
  const { frameDelayMs = 40, width = 640, height = 480, fail = false } = options;
  const saved = options.saved === undefined ? { url: "rtsp://10.0.9.41:8554/camera", name: "Camera thử" } : options.saved;
  const frame = await jpegFrame(page, width, height);
  const api = { opened: [] as string[], frames: 0, closed: 0 };
  if (saved) {
    await page.addInitScript((link) => {
      if (localStorage.getItem("hicascam.rtspStreams") === null) localStorage.setItem("hicascam.rtspStreams", JSON.stringify([link]));
    }, saved);
  }
  await page.route("**/api/camera/streams", (route) => {
    api.opened.push(route.request().postDataJSON().url);
    return fail
      ? route.fulfill({ status: 502, json: { detail: "Không kết nối được luồng RTSP. Kiểm tra địa chỉ, cổng và MediaMTX." } })
      : route.fulfill({ status: 201, json: { id: "s1", width, height } });
  });
  await page.route("**/api/camera/streams/s1/frame", async (route) => {
    api.frames += 1;
    await new Promise((resolve) => setTimeout(resolve, frameDelayMs));
    await route.fulfill({ body: frame, contentType: "image/jpeg" }).catch(() => undefined);
  });
  await page.route("**/api/camera/streams/s1", (route) => {
    api.closed += 1;
    return route.fulfill({ status: 204 });
  });
  return api;
}

/** Nút trên khung camera: mở camera RTSP đã lưu */
export async function connectCamera(page: Page) {
  await page.getByRole("button", { name: "Kết nối camera", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
}
