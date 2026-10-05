import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import type { FrameResult } from "../src/common/types";
import { mirrorResult } from "../src/utils/overlay";
import { connectCamera, frameResult, mockRtspCamera } from "./helpers";

const status = {
  phase: "ready", error: null, device: "Test GPU", model: "test", image_size: 640, model_revision: 0,
  laser_model: "laser.torchscript", laser_error: null,
  classes: ["laptop", "mouse", "keyboard"],
  defaults: { targets: ["laptop"], confidence: 0.8, tolerance: 30 },
};

const mouse = { index: 0, name: "mouse", confidence: 0.91, polygon: [[300, 220], [340, 220], [340, 260], [300, 260]] };
const pointing = () => ({
  result: frameResult({
    laser: { point: [320, 240], score: 0.9 }, selected: mouse,
    detections: [{ name: "mouse", confidence: 0.91, box: [300, 220, 340, 260] }],
  }),
  tracking: { held: mouse, pending: null },
});

async function prepare(page: Page, frameDelayMs = 40) {
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: status }));
  await page.route(/\/api\/models(?:\?|$)/, (route) => route.fulfill({ json: { items: [], max_bytes: 1 } }));
  const camera = await mockRtspCamera(page, { frameDelayMs });
  camera.result = pointing;
  await page.goto("/");
  await connectCamera(page);
  return camera;
}

const hideTab = (page: Page, hidden: boolean) => page.evaluate((value) => {
  Object.defineProperty(document, "visibilityState", { value: value ? "hidden" : "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}, hidden);

test("frames and results come from the server; pause is a server command, a hidden tab only stops this page's video", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const uploads: string[] = [];
  page.on("request", (request) => request.url().includes("/api/vision/frame") && uploads.push(request.url()));
  const camera = await prepare(page);
  expect(camera.opened).toEqual(["rtsp://10.0.9.41:8554/camera"]);
  await expect.poll(() => camera.frames).toBeGreaterThan(5);
  // Tuỳ chọn hiện tại gửi ngay khi mở: vật thể + ngưỡng của máy chủ, thời gian giữ của trình duyệt
  await expect.poll(() => camera.options.at(-1)).toEqual({ targets: ["laptop"], confidence: 0.8, dwell_ms: 300 });
  await expect(page.getByText("Chuột máy tính", { exact: true })).toBeVisible();
  await expect(page.getByText("Độ tin cậy 91%", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Tạm dừng|Pause/, exact: true }).click();
  await expect.poll(() => camera.detects.at(-1)).toBe(false);
  await expect(page.getByText("Đã tạm dừng nhận diện", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Độ tin cậy 91%", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Tiếp tục|Resume/, exact: true }).click();
  await expect.poll(() => camera.detects.at(-1)).toBe(true);
  await expect(page.getByText("Độ tin cậy 91%", { exact: true })).toBeVisible();

  await hideTab(page, true);
  await expect.poll(() => camera.videos.at(-1)).toBe(false);
  await hideTab(page, false);
  await expect.poll(() => camera.videos.at(-1)).toBe(true);
  expect(camera.detects).toEqual([false, true]);
  // Trình duyệt không còn tự chụp / nén / gửi khung lên máy chủ
  expect(uploads).toEqual([]);
  expect(errors).toEqual([]);
});

test("the camera keeps running on the server when the page is reloaded or closed", async ({ page, context }) => {
  const camera = await prepare(page);
  await page.reload();
  // Không bấm Kết nối: trang mới thấy ngay camera máy chủ đang chạy
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640);
  await expect(page.getByText("RTSP · Camera thử", { exact: true })).toBeVisible();
  await expect(page.getByText("Độ tin cậy 91%", { exact: true })).toBeVisible();
  await page.close();
  expect(camera.closed).toBe(0);
  expect(camera.opened).toHaveLength(1);
  expect(context.pages()).toHaveLength(0);
});

test("a slow decoder draws only the newest frame instead of falling behind", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.createImageBitmap;
    const counter = window as unknown as { decoded: number };
    counter.decoded = 0;
    window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => new Promise((resolve, reject) => {
      setTimeout(() => {
        counter.decoded += 1;
        original(...args).then(resolve, reject);
      }, 200);
    })) as typeof createImageBitmap;
  });
  const camera = await prepare(page, 20);
  const frames = camera.frames;
  const decoded = await page.evaluate(() => (window as unknown as { decoded: number }).decoded);
  await page.waitForTimeout(1500);
  const sent = camera.frames - frames;
  const drawn = await page.evaluate(() => (window as unknown as { decoded: number }).decoded) - decoded;
  // ~75 khung đến, giải mã 200 ms/khung → vẽ ~7 khung mới nhất, không xếp hàng 75 khung (trễ 15 giây)
  expect(sent).toBeGreaterThan(40);
  expect(drawn).toBeGreaterThan(3);
  expect(drawn).toBeLessThan(sent / 4);
});

test("server problems show on the camera; a dropped socket reconnects by itself", async ({ page }) => {
  const camera = await prepare(page);
  camera.result = null;
  camera.setCamera({ status: "reconnecting", error: "Mất tín hiệu RTSP, đang kết nối lại…" });
  await expect(page.getByText("Mất tín hiệu RTSP, đang kết nối lại…", { exact: true })).toBeVisible();
  await expect(page.getByText("Đang chờ máy chủ", { exact: true })).toBeVisible();
  camera.setCamera({ status: "live", error: null });
  await expect(page.getByText("Mất tín hiệu RTSP, đang kết nối lại…", { exact: true })).toHaveCount(0);

  const frames = camera.frames;
  await camera.sockets.at(-1)!.close({ code: 1012, reason: "Server restart" });
  await expect.poll(() => camera.sockets.length).toBe(1);
  await expect.poll(() => camera.frames).toBeGreaterThan(frames + 3);
  await expect(page.getByText("Không kết nối được camera", { exact: true })).toHaveCount(0);
  expect(camera.opened).toHaveLength(1);
});

test("Settings shows which camera the server is detecting on, including one chosen elsewhere", async ({ page }) => {
  const camera = await prepare(page);
  await page.getByRole("menuitem", { name: "Cài đặt", exact: true }).click();
  const card = page.locator(".ant-card").filter({ has: page.locator(".ant-card-head-title", { hasText: "Camera RTSP" }) });
  const running = card.getByRole("status");
  await expect(running).toContainText("Máy chủ đang nhận diện:");
  await expect(running).toContainText("Camera thử");
  await expect(card.locator(".ant-table-row").nth(0).getByText("Đang nhận diện", { exact: true })).toBeVisible();

  // Trang khác chọn camera không có trong danh sách của trình duyệt này: vẫn biết máy chủ đang chạy camera nào
  camera.setCamera({ url: "rtsp://10.0.15.14:554/Streaming/Channels/101", name: "Cam_cửa" });
  await expect(running).toContainText("Cam_cửa");
  await expect(running).toContainText("rtsp://10.0.15.14:554/Streaming/Channels/101");
  await expect(card.locator(".ant-table-row").getByText("Đang nhận diện", { exact: true })).toHaveCount(0);
  camera.setCamera({ detect: false });
  await expect(running.getByText("Đã tạm dừng", { exact: true })).toBeVisible();

  await running.getByRole("button", { name: "Tắt camera" }).click();
  await expect.poll(() => camera.closed).toBe(1);
  await expect(running).toContainText("Máy chủ chưa chạy camera nào");
});

test("mirror mode flips the results to match the flipped video; snapshots keep the camera resolution", async ({ page }) => {
  const camera = await prepare(page);
  await page.getByRole("menuitem", { name: "Cài đặt", exact: true }).click();
  await page.getByText("Lật ngang hình camera (chế độ gương)", { exact: true }).click();
  await expect(page.getByRole("switch", { name: "Lật ngang hình camera (chế độ gương)" })).toBeChecked();
  await page.locator('a[href="/"]').first().click();
  await expect(page.locator("video")).toHaveClass(/mirrored/);
  // Đổi chế độ gương không mở lại luồng
  expect(camera.opened).toHaveLength(1);
  await expect(page.locator("canvas[role=img]")).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /Chụp ảnh|Snapshot/, exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/hicascam-.*\.png/);
  const png = await readFile((await download.path())!);
  const resolution = await page.locator("video").evaluate((video: HTMLVideoElement) => [video.videoWidth, video.videoHeight]);
  expect(png.readUInt32BE(16)).toBe(resolution[0]);
  expect(png.readUInt32BE(20)).toBe(resolution[1]);
});

test("mirrorResult flips points, boxes and outlines around the frame width", () => {
  const result = frameResult({
    laser: { point: [100, 50], score: 0.9 }, tip: [10, 20],
    detections: [{ name: "mouse", confidence: 0.9, box: [100, 10, 200, 60] }],
    selected: { index: 0, name: "mouse", confidence: 0.9, polygon: [[100, 10], [200, 10], [200, 60]] },
  }) as unknown as FrameResult;
  const flipped = mirrorResult(result);
  expect(flipped.laser?.point).toEqual([540, 50]);
  expect(flipped.tip).toEqual([630, 20]);
  expect(flipped.detections[0].box).toEqual([440, 10, 540, 60]);
  expect(flipped.selected?.polygon).toEqual([[540, 10], [440, 10], [440, 60]]);
  expect(result.laser?.point).toEqual([100, 50]);
});
