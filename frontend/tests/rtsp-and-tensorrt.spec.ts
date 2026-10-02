import { expect, test, type Page } from "@playwright/test";

const status = {
  phase: "ready", error: null, device: "Test GPU", model: "initial.pt", image_size: 640, model_revision: 0, model_busy: false,
  classes: ["laptop", "mouse"], defaults: { targets: ["laptop"], confidence: 0.8, tolerance: 30 },
};

/** Khung giả của luồng RTSP: JPEG 640x360 vẽ bằng canvas của chính trình duyệt test */
async function jpegFrame(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#2a5aa0";
    ctx.fillRect(0, 0, 640, 360);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.6));
    return btoa(String.fromCharCode(...new Uint8Array(await blob!.arrayBuffer())));
  });
  return Buffer.from(base64, "base64");
}

async function mockStream(page: Page, fail = false) {
  const frame = await jpegFrame(page);
  const api = { opened: [] as string[], frames: 0, analyzed: 0, closed: 0 };
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: status }));
  await page.route("**/api/models", (route) => route.fulfill({ json: { items: [], max_bytes: 1 } }));
  await page.route("**/api/camera/streams", (route) => {
    api.opened.push(route.request().postDataJSON().url);
    return fail
      ? route.fulfill({ status: 502, json: { detail: "Không kết nối được luồng RTSP. Kiểm tra địa chỉ, cổng và MediaMTX." } })
      : route.fulfill({ status: 201, json: { id: "s1", width: 640, height: 360 } });
  });
  await page.route("**/api/camera/streams/s1/frame", async (route) => {
    api.frames += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    await route.fulfill({ body: frame, contentType: "image/jpeg" }).catch(() => undefined);
  });
  await page.route("**/api/camera/streams/s1", (route) => {
    api.closed += 1;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/vision/frame?*", (route) => {
    api.analyzed += 1;
    return route.fulfill({ json: {
      hand_detected: false, landmarks: [], tip: null, selected: null, detections: [], processing_ms: 20,
      resolution: { width: 640, height: 360 },
    } }).catch(() => undefined);
  });
  return api;
}

test("RTSP camera: paste an ffplay command, stream frames through the server and analyze them", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await mockStream(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Kết nối RTSP" }).click();
  const input = page.getByRole("textbox", { name: "Kết nối camera RTSP / MediaMTX" });
  await input.fill("ffplay rtsp://admin:secret@10.0.9.41:8554/camera");
  await expect(page.getByText("Sẽ kết nối: rtsp://admin:secret@10.0.9.41:8554/camera")).toBeVisible();
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  // Tài khoản trong địa chỉ không hiện trên khung hình
  await expect(page.getByText("RTSP · rtsp://10.0.9.41:8554/camera")).toBeVisible();
  expect(api.opened).toEqual(["rtsp://admin:secret@10.0.9.41:8554/camera"]);
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640);
  await expect.poll(() => api.frames).toBeGreaterThan(5);
  await expect.poll(() => api.analyzed).toBeGreaterThan(2);
  // Chế độ gương "tự động" không lật camera RTSP
  await expect(page.locator("video")).not.toHaveClass(/mirrored/);
  await page.getByRole("button", { name: "Tắt camera" }).click();
  await expect.poll(() => api.closed).toBe(1);
  const stopped = api.frames;
  await page.waitForTimeout(300);
  expect(api.frames).toBeLessThanOrEqual(stopped + 1);
  // Địa chỉ được nhớ cho lần sau
  await page.getByRole("button", { name: "RTSP", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Kết nối camera RTSP / MediaMTX" }))
    .toHaveValue("rtsp://admin:secret@10.0.9.41:8554/camera");
  expect(errors).toEqual([]);
});

test("RTSP camera: a stream the server cannot open shows the reason", async ({ page }) => {
  await mockStream(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Kết nối RTSP" }).click();
  const input = page.getByRole("textbox", { name: "Kết nối camera RTSP / MediaMTX" });
  await input.fill("rtsp://10.0.9.41:8554/khongco");
  await input.press("Enter");
  await expect(page.getByText("Không kết nối được luồng RTSP. Kiểm tra địa chỉ, cổng và MediaMTX.")).toBeVisible();
  await expect(page.getByText(/Không lấy được hình từ luồng RTSP/)).toBeVisible();
});

test("TensorRT: upload converts by default, existing models convert on demand, completion is announced", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const uploads: string[] = [];
  const converted: string[] = [];
  let jobs: Record<string, unknown>[] = [];
  const items = [{ id: "initial.pt", name: "initial.pt", kind: "segmentation", active: true, convertible: true },
    { id: "red.torchscript", name: "red.torchscript", kind: "laser", active: true, convertible: true }];
  const catalog = () => ({ max_bytes: 1024 * 1024, convert_available: true, convert_reason: null, conversions: jobs,
    items: items.map((item) => ({ ...item, size_bytes: 1000, available: true })) });
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: status }));
  await page.route(/\/api\/models(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      uploads.push(route.request().url());
      jobs = [{ id: "j1", source: "custom/segmentation/fast.pt", name: "fast.pt", kind: "segmentation", status: "running",
        error: null, engine: null, created_at: 1, finished_at: null }];
      return route.fulfill({ status: 201, json: catalog() });
    }
    return route.fulfill({ json: catalog() });
  });
  await page.route("**/api/models/convert", (route) => {
    converted.push(route.request().postDataJSON().id);
    jobs = [{ id: "j2", source: "red.torchscript", name: "red.torchscript", kind: "laser", status: "queued",
      error: null, engine: null, created_at: 2, finished_at: null }, ...jobs];
    return route.fulfill({ status: 202, json: catalog() });
  });
  await page.goto("/settings");
  await expect(page.getByRole("checkbox", { name: "Chuyển sang TensorRT (FP16) sau khi tải lên" })).toBeChecked();
  await page.locator('input[type="file"]').setInputFiles({ name: "fast.pt", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect.poll(() => uploads.length).toBe(1);
  expect(new URL(uploads[0]).searchParams.get("convert")).toBe("true");
  await expect(page.getByText(/fast\.pt: đang build TensorRT FP16/)).toBeVisible();
  await page.getByRole("row", { name: /red\.torchscript/ }).getByRole("button", { name: "Chuyển TensorRT" }).click();
  await expect.poll(() => converted).toEqual(["red.torchscript"]);
  await expect(page.getByText(/red\.torchscript: đang chờ chuyển sang TensorRT/)).toBeVisible();
  jobs = jobs.map((job) => job.id === "j1" ? { ...job, status: "done", engine: "custom/segmentation/fast-fp16.engine" }
    : { ...job, status: "error", error: "LLVM ERROR: out of memory" });
  await page.getByRole("button", { name: "Làm mới" }).click();
  await expect(page.getByText("Đã chuyển fast.pt sang TensorRT và đang dùng engine mới.")).toBeVisible();
  await expect(page.getByText("Chuyển red.torchscript sang TensorRT thất bại: LLVM ERROR: out of memory").first()).toBeVisible();
  // Tải .engine thì không xin chuyển đổi
  await page.locator('input[type="file"]').setInputFiles({ name: "ready.engine", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect.poll(() => uploads.length).toBe(2);
  expect(new URL(uploads[1]).searchParams.get("convert")).toBe("false");
  expect(errors).toEqual([]);
});
