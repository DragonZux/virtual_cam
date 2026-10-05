import { expect, test, type Page } from "@playwright/test";

import { connectCamera, mockRtspCamera } from "./helpers";

const status = {
  phase: "ready", error: null, device: "Test GPU", model: "initial.pt", image_size: 640, model_revision: 0, model_busy: false,
  laser_model: "laser.torchscript", laser_error: null,
  classes: ["laptop", "mouse"], defaults: { targets: ["laptop"], confidence: 0.8, tolerance: 30 },
};

async function mockServer(page: Page) {
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: status }));
  await page.route("**/api/models", (route) => route.fulfill({ json: { items: [], max_bytes: 1 } }));
}

/** Thẻ trong trang Cài đặt theo tiêu đề */
const settingsCard = (page: Page, title: string) =>
  page.locator(".ant-card").filter({ has: page.locator(".ant-card-head-title", { hasText: title }) });

/** Chọn một mục trong ô chọn camera RTSP */
async function chooseCamera(page: Page, label: string) {
  const input = page.getByRole("combobox", { name: "Chọn camera RTSP", exact: true });
  await expect(input).toBeEnabled();
  await page.locator(".ant-select-selector").filter({ has: input }).click();
  await page.locator(".ant-select-dropdown:visible").getByText(label, { exact: true }).click();
}

/** Hộp thoại thêm / sửa camera RTSP */
async function fillCamera(page: Page, url: string, name?: string) {
  const dialog = page.getByRole("dialog");
  if (name !== undefined) await dialog.getByPlaceholder("Ví dụ: Camera cửa").fill(name);
  await dialog.getByRole("textbox", { name: "Địa chỉ RTSP" }).fill(url);
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
}

test("camera is RTSP only: add from the camera, switch between saved cameras, stop and reconnect", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Không còn webcam: trang không được xin quyền camera của trình duyệt
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    if (!devices) return;
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = (constraints) => {
      const counter = window as unknown as { gum?: number };
      counter.gum = (counter.gum ?? 0) + 1;
      return original(constraints);
    };
  });
  await mockServer(page);
  const camera = await mockRtspCamera(page, { saved: null });
  await page.goto("/");
  await expect(page.getByText("Chưa có camera RTSP", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kết nối camera", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Thêm camera RTSP", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Địa chỉ RTSP" }).fill("ffplay rtsp://admin:secret@10.0.9.41:8554/camera");
  await expect(page.getByText("Sẽ kết nối: rtsp://admin:secret@10.0.9.41:8554/camera")).toBeVisible();
  await fillCamera(page, "ffplay rtsp://admin:secret@10.0.9.41:8554/camera", "Cửa");
  await expect(page.getByText("RTSP · Cửa", { exact: true })).toBeVisible();
  expect(camera.opened).toEqual(["rtsp://admin:secret@10.0.9.41:8554/camera"]);
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640);
  await expect.poll(() => camera.frames).toBeGreaterThan(5);
  await expect.poll(() => camera.options.length).toBeGreaterThan(0);
  await expect(page.locator("video")).not.toHaveClass(/mirrored/);

  // Thêm camera thứ hai ngay trong ô chọn; camera không đặt tên hiện địa chỉ
  await chooseCamera(page, "+ Thêm camera RTSP…");
  await fillCamera(page, "rtsp://10.0.9.42:8554/cam2");
  await expect(page.getByText("RTSP · rtsp://10.0.9.42:8554/cam2", { exact: true })).toBeVisible();
  // Đổi camera: máy chủ chạy camera mới thay camera cũ (một camera một lúc), không cần tắt trước
  expect(camera.opened).toHaveLength(2);
  expect(camera.closed).toBe(0);
  await chooseCamera(page, "Cửa");
  await expect.poll(() => camera.opened.length).toBe(3);
  expect(camera.opened[2]).toBe("rtsp://admin:secret@10.0.9.41:8554/camera");
  await expect(page.getByText("RTSP · Cửa", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Tắt camera" }).click();
  await expect.poll(() => camera.closed).toBe(1);
  await expect(page.getByText("Camera đã ngắt", { exact: true })).toBeVisible();
  await connectCamera(page);
  expect(camera.opened.at(-1)).toBe("rtsp://admin:secret@10.0.9.41:8554/camera");

  // Danh sách lưu trên trình duyệt
  await page.reload();
  await page.locator(".ant-select-selector").filter({ has: page.getByRole("combobox", { name: "Chọn camera RTSP" }) }).click();
  await expect(page.locator(".ant-select-dropdown:visible")).toContainText("Cửa");
  await expect(page.locator(".ant-select-dropdown:visible")).toContainText("rtsp://10.0.9.42:8554/cam2");
  expect(await page.evaluate(() => (window as unknown as { gum?: number }).gum ?? 0)).toBe(0);
  expect(errors).toEqual([]);
});

test("RTSP camera: a stream the server cannot open shows the reason", async ({ page }) => {
  await mockServer(page);
  await mockRtspCamera(page, { fail: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Kết nối camera", exact: true }).click();
  await expect(page.getByText(/Máy chủ không mở được cổng RTSP 10\.0\.9\.41:8554/).first()).toBeVisible();
  await expect(page.getByText("Không kết nối được camera", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kết nối lại", exact: true })).toBeVisible();
});

test("Settings › RTSP cameras: add, edit, delete and connect a camera", async ({ page }) => {
  await mockServer(page);
  const camera = await mockRtspCamera(page, { saved: null });
  await page.goto("/settings");
  const card = settingsCard(page, "Camera RTSP");
  await expect(card.getByText(/Chưa có camera RTSP/)).toBeVisible();
  await card.getByRole("button", { name: "Thêm camera RTSP" }).click();
  await fillCamera(page, "rtsp://10.0.9.41:8554/camera", "Kho");
  await card.getByRole("button", { name: "Thêm camera RTSP" }).click();
  await fillCamera(page, "rtsp://10.0.9.43:8554/xuong", "Xưởng");
  await expect(card.locator(".ant-table-row")).toHaveCount(2);
  // Sửa tên camera thứ nhất
  await card.locator(".ant-table-row").nth(0).getByRole("button", { name: "Sửa" }).click();
  await fillCamera(page, "rtsp://10.0.9.41:8554/camera", "Kho hàng");
  await expect(card.locator(".ant-table-row").nth(0)).toContainText("Kho hàng");
  // Xoá camera thứ hai
  await card.locator(".ant-table-row").nth(1).getByRole("button", { name: "Xoá" }).click();
  await page.getByRole("button", { name: "Đồng ý", exact: true }).click();
  await expect(card.locator(".ant-table-row")).toHaveCount(1);
  // Kết nối: sang Tổng quan và mở đúng luồng
  await card.locator(".ant-table-row").nth(0).getByRole("button", { name: "Kết nối" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("RTSP · Kho hàng", { exact: true })).toBeVisible();
  expect(camera.opened).toEqual(["rtsp://10.0.9.41:8554/camera"]);
  await page.getByRole("menuitem", { name: "Cài đặt", exact: true }).click();
  await expect(card.locator(".ant-table-row").nth(0).getByText("Đang nhận diện", { exact: true })).toBeVisible();
  await expect(card.getByRole("status")).toContainText("Kho hàng");
});

test("Settings › socket: only a Test connection button, answered by the backend over the camera socket", async ({ page }) => {
  await mockServer(page);
  const camera = await mockRtspCamera(page);
  await page.goto("/settings");
  const card = settingsCard(page, "Kết nối socket");
  await expect(card.getByText(/ws:\/\//)).toHaveCount(0);
  await card.getByRole("button", { name: "Test kết nối" }).click();
  await expect(card.getByRole("status")).toHaveText("Kết nối thành công.");
  expect(camera.pings).toEqual(["frontend"]);
});

test("TensorRT: Update on a row uploads that model type and converts it automatically", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const uploads: URL[] = [];
  let jobs: Record<string, unknown>[] = [];
  const items = [{ id: "initial.pt", name: "initial.pt", kind: "segmentation", active: true, convertible: true },
    { id: "red.torchscript", name: "red.torchscript", kind: "laser", active: true, convertible: true }];
  const catalog = () => ({ max_bytes: 1024 * 1024, convert_available: true, convert_reason: null, conversions: jobs,
    items: items.map((item) => ({ ...item, size_bytes: 1000, available: true })) });
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: status }));
  await page.route(/\/api\/models(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      const url = new URL(route.request().url());
      uploads.push(url);
      if (url.searchParams.get("convert") === "true") {
        jobs = [{ id: "j1", source: "custom/" + url.searchParams.get("kind") + "/fast.pt", name: "fast.pt",
          kind: url.searchParams.get("kind"), status: "running", error: null, engine: null, created_at: 1, finished_at: null }];
      }
      return route.fulfill({ status: 201, json: catalog() });
    }
    return route.fulfill({ json: catalog() });
  });
  await page.goto("/settings");
  const card = settingsCard(page, "Quản lý mô hình AI");
  const rows = card.locator(".ant-table-tbody tr.ant-table-row");
  await expect(rows).toHaveCount(2);
  await expect(card.getByRole("columnheader", { name: "Cập nhật" })).toBeVisible();
  await expect(card.getByRole("columnheader", { name: "TensorRT" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chuyển TensorRT" })).toHaveCount(0);
  // Không còn chữ hướng dẫn / nút tải chung / chữ đáy trang
  for (const removed of [/Mỗi loại chạy một mô hình/, /Mô hình mới được lưu trong models\/custom/, /Tải lên là dùng ngay/, /Phiên của bạn/]) {
    await expect(page.getByText(removed)).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "Tải mô hình mới" })).toHaveCount(0);

  // Cập nhật dòng segmentation bằng .pt: gửi đúng loại, xin chuyển TensorRT
  await rows.nth(0).locator('input[type="file"]').setInputFiles({ name: "fast.pt", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0].searchParams.get("kind")).toBe("segmentation");
  expect(uploads[0].searchParams.get("convert")).toBe("true");
  await expect(page.getByText(/fast\.pt: đang build TensorRT FP16/)).toBeVisible();
  await expect(page.getByText("Đã cập nhật và đang dùng mô hình mới.").filter({ visible: true })).toBeVisible();

  // Cập nhật dòng laser bằng .engine: đúng loại, không cần chuyển
  await rows.nth(1).locator('input[type="file"]').setInputFiles({ name: "ready.engine", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect.poll(() => uploads.length).toBe(2);
  expect(uploads[1].searchParams.get("kind")).toBe("laser");
  expect(uploads[1].searchParams.get("convert")).toBe("false");

  jobs = [{ ...jobs[0], status: "done", engine: "custom/segmentation/fast-fp16.engine" },
    { id: "j2", source: "custom/laser/spot.pt", name: "spot.pt", kind: "laser", status: "running", error: null, engine: null,
      created_at: 2, finished_at: null }];
  await card.getByRole("button", { name: "Làm mới" }).click();
  await expect(page.getByText("Đã chuyển fast.pt sang TensorRT và đang dùng engine mới.")).toBeVisible();
  jobs = jobs.map((job) => job.id === "j2" ? { ...job, status: "error", error: "LLVM ERROR: out of memory" } : job);
  await card.getByRole("button", { name: "Làm mới" }).click();
  await expect(page.getByText("Chuyển spot.pt sang TensorRT thất bại: LLVM ERROR: out of memory").first()).toBeVisible();
  expect(errors).toEqual([]);
});
