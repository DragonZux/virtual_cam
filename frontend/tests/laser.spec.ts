import { expect, test, type Page } from "@playwright/test";

import { connectCamera, frameResult, mockRtspCamera } from "./helpers";

async function mockLaser(page: Page, laserError: string | null = null) {
  const camera = await mockRtspCamera(page);
  const state = { withSpot: true };
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: {
    phase: "ready", error: null, device: "Test", model: "test", image_size: 640,
    laser_model: laserError ? null : "laser-advr-yolov5l6.torchscript", laser_error: laserError,
    classes: ["mouse"], defaults: { targets: ["mouse"], confidence: 0.8, tolerance: 30 },
  } }));
  camera.result = () => {
    const selected = state.withSpot ? { index: 0, name: "mouse", confidence: 0.91, polygon: [[300, 220], [340, 220], [340, 260], [300, 260]] } : null;
    return {
      result: frameResult({
        laser: state.withSpot ? { point: [320, 240], score: 0.9 } : null, selected,
        detections: [{ name: "mouse", confidence: 0.91, box: [300, 220, 340, 260] }], processing_ms: 40,
      }),
      // Máy chủ đã xác nhận (giữ để xác nhận chạy ở máy chủ)
      tracking: { held: selected, pending: null },
    };
  };
  return { camera, state };
}

test("laser is the only pointer: frames, selection, status cards and settings without hand options", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { camera, state } = await mockLaser(page);
  await page.goto("/");
  // Chỉ còn Tổng quan và Cài đặt; không còn chọn chỉ tay / lịch sử
  await expect(page.getByRole("menuitem")).toHaveText(["Tổng quan", "Cài đặt"]);
  await expect(page.getByText("Chỉ tay", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Lựa chọn gần đây")).toHaveCount(0);
  await connectCamera(page);
  await expect.poll(() => camera.results).toBeGreaterThan(3);
  // Không còn tuỳ chọn chỉ tay (tolerance) gửi cho máy chủ
  expect(Object.keys(camera.options.at(-1) ?? {}).sort()).toEqual(["confidence", "dwell_ms", "targets"]);
  // Hàng trên: Vật thể đang chọn (thay Tốc độ xử lý) · Điểm laser · Vật thể trong khung; không còn cột bên phải
  await expect(page.getByText("Vật thể đang chọn", { exact: true })).toBeVisible();
  await expect(page.getByText("Chuột máy tính", { exact: true })).toBeVisible();
  await expect(page.getByText("Độ tin cậy 91%", { exact: true })).toBeVisible();
  await expect(page.getByText("Đã thấy điểm sáng", { exact: true })).toBeVisible();
  await expect(page.getByText("Vật thể trong khung", { exact: true })).toBeVisible();
  for (const removed of ["Tốc độ xử lý", "Vật thể đang nhận diện", "Mô hình segmentation"]) {
    await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
  }
  // Khung camera chiếm toàn chiều ngang (màn hình thấp: theo giới hạn 80% chiều cao), không còn cột bên phải
  const stage = await page.locator("video").evaluate((video) => video.parentElement!.getBoundingClientRect().width);
  const content = await page.locator("main").evaluate((main) => main.getBoundingClientRect().width);
  expect(stage / content).toBeGreaterThan(0.8);
  await page.screenshot({ path: testInfo.outputPath("laser-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("laser-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  state.withSpot = false;
  await expect(page.getByText("Chưa thấy laser", { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa có lựa chọn", { exact: true })).toBeVisible();
  await expect(page.getByText("Độ tin cậy 91%", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("menuitem", { name: "Cài đặt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Khôi phục mặc định", exact: true })).toBeVisible();
  for (const removed of ["Âm thanh", "Khung xương bàn tay", "Vùng chấp nhận quanh đầu ngón trỏ", "Cách chỉ vật thể"]) {
    await expect(page.getByText(removed)).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath("settings-desktop.png"), fullPage: true });
  // Camera vẫn chạy nền khi ở Cài đặt; khôi phục mặc định không làm dừng luồng
  const beforeReset = camera.results;
  await page.getByRole("button", { name: "Khôi phục mặc định", exact: true }).click();
  await page.getByRole("button", { name: "Đồng ý", exact: true }).click();
  await expect.poll(() => camera.results).toBeGreaterThan(beforeReset + 2);
  expect(camera.opened).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("a missing laser model is explained on the camera", async ({ page }) => {
  await mockLaser(page, "Thiếu model laser");
  await page.goto("/");
  await connectCamera(page);
  await expect(page.getByText("Chưa dùng được laser", { exact: true })).toBeVisible();
  await expect(page.getByText("Mô hình laser đỏ chưa sẵn sàng. Kiểm tra hoặc tải mô hình laser trong Cài đặt.").first()).toBeVisible();
});
