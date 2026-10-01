import { expect, test, type Page } from "@playwright/test";

const status = {
  phase: "ready", error: null, device: "Test", model: "initial.pt", model_revision: 0, image_size: 640,
  laser_model: "red.torchscript", laser_error: null, classes: ["mouse", "cup"],
  defaults: { targets: ["mouse"], confidence: 0.8, tolerance: 30 },
};
const result = (confidence = 0.95) => ({
  pointer_mode: "laser", hand_detected: false, landmarks: [], tip: null,
  laser: { point: [320, 240], score: 0.9 },
  selected: { index: 0, name: "mouse", confidence, polygon: [[300, 220], [340, 220], [340, 260], [300, 260]] },
  detections: [{ name: "mouse", confidence, box: [300, 220, 340, 260] }],
  processing_ms: 35, resolution: { width: 640, height: 480 },
});

async function prepare(page: Page) {
  await page.addInitScript(() => localStorage.setItem("virtualcam.preferences", JSON.stringify({ pointerMode: "laser" })));
  const current = { ...status };
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: current }));
  await page.route("**/api/models", (route) => route.fulfill({ json: { max_bytes: 1048576, items: [
    ...["initial.pt", "custom.pt"].map((id) => ({ id, name: id, kind: "segmentation", size_bytes: 1, available: true, active: id === current.model })),
    { id: "red.torchscript", name: "red.torchscript", kind: "laser", size_bytes: 1, available: true, active: true },
  ] } }));
  await page.route("**/api/models/activate", (route) => {
    current.model = route.request().postDataJSON().id;
    current.model_revision++;
    return route.fulfill({ json: current });
  });
  await page.goto("/test");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#333333"; ctx.fillRect(0, 0, 640, 480);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return () => page.locator('input[type="file"]').setInputFiles({ name: "same-name.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
}

test("one image request confirms immediately, survives tab changes, and reruns only for changed settings", async ({ page }) => {
  const requests: URLSearchParams[] = [];
  await page.route("**/api/vision/frame?*", (route) => {
    requests.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: result() });
  });
  const upload = await prepare(page);
  await upload();
  await expect(page.getByText("ĐÃ CHỌN BẰNG LASER", { exact: true })).toBeVisible();
  expect(requests.length).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(3300);
  expect(requests.length).toBe(1);
  await expect(page.getByText("ĐÃ CHỌN BẰNG LASER", { exact: true })).toBeVisible();
  await page.getByRole("slider").press("ArrowLeft");
  await page.getByRole("slider").press("ArrowLeft");
  await expect.poll(() => requests.length).toBe(2);
  expect(requests.at(-1)?.get("conf")).toBe("0.7");
  await page.getByRole("button", { name: "Chọn tất cả", exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests.at(-1)?.get("targets")).toBe("cup,mouse");
  await page.getByText("Chỉ tay", { exact: true }).click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests.at(-1)?.get("pointer_mode")).toBe("hand");
  const input = page.getByRole("combobox", { name: "Mô hình segmentation", exact: true });
  await page.locator(".ant-select-selector").filter({ has: input }).click();
  await page.locator(".ant-select-dropdown:visible").getByText("custom.pt", { exact: true }).click();
  await expect.poll(() => requests.length).toBe(5);
  expect(requests.at(-1)?.get("model_revision")).toBe("1");
  await page.waitForTimeout(3300);
  expect(requests.length).toBe(5);
});

for (const code of [429, 503]) {
  test(`image error ${code} does not retry until the user clicks Analyze again`, async ({ page }) => {
    let requests = 0;
    await page.route("**/api/vision/frame?*", (route) => {
      requests++;
      return requests === 1 ? route.fulfill({ status: code, json: { detail: "Test unavailable" } }) : route.fulfill({ json: result() });
    });
    const upload = await prepare(page);
    await upload();
    await expect(page.getByText("Test unavailable", { exact: true })).toBeVisible();
    await page.waitForTimeout(3300);
    expect(requests).toBe(1);
    await page.getByRole("button", { name: "Phân tích lại", exact: true }).click();
    await expect(page.getByText("ĐÃ CHỌN BẰNG LASER", { exact: true })).toBeVisible();
    expect(requests).toBe(2);
  });
}

test("replacing an image with the same filename cancels the old response", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/vision/frame?*", async (route) => {
    const index = ++requests;
    if (index === 1) await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.fulfill({ json: result(index === 1 ? 0.12 : 0.95) }).catch(() => undefined);
  });
  const upload = await prepare(page);
  await upload();
  await expect.poll(() => requests).toBe(1);
  await upload();
  await expect(page.getByText("ĐÃ CHỌN BẰNG LASER", { exact: true })).toBeVisible();
  await page.waitForTimeout(3300);
  expect(requests).toBe(2);
  await expect(page.getByText("12%", { exact: true })).toHaveCount(0);
  await expect(page.getByText("95%", { exact: true }).first()).toBeVisible();
});

test("video files still send frames continuously and support pause/resume", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/vision/frame?*", async (route) => {
    requests++;
    await route.fulfill({ json: result() }).catch(() => undefined);
  });
  await prepare(page);
  const video = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    const recorded = new Promise<number[]>((resolve) => {
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = async () => resolve([...new Uint8Array(await new Blob(chunks).arrayBuffer())]);
    });
    recorder.start();
    const timer = window.setInterval(() => { ctx.fillStyle = "orange"; ctx.fillRect(0, 0, 320, 240); }, 50);
    await new Promise((resolve) => setTimeout(resolve, 700));
    recorder.stop();
    clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    return recorded;
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "sample.webm", mimeType: "video/webm", buffer: Buffer.from(video) });
  await expect.poll(() => requests).toBeGreaterThan(3);
  await page.getByRole("button", { name: "Tạm dừng", exact: true }).click();
  const before = requests;
  await page.waitForTimeout(500);
  expect(requests).toBe(before);
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(before + 2);
});
