import { expect, test, type Page } from "@playwright/test";

async function selectModel(page: Page, label: string, model: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await expect(input).toBeEnabled();
  await page.locator(".ant-select-selector").filter({ has: input }).filter({ visible: true }).click();
  await page.locator(".ant-select-dropdown:visible").getByText(model, { exact: true }).click();
}

async function mockModels(page: Page) {
  let selected = "initial.pt";
  let laser = "red.torchscript";
  let revision = 0;
  let reject = false;
  const uploads: string[] = [];
  const items = [
    { id: "initial.pt", kind: "segmentation" }, { id: "custom.pt", kind: "segmentation" },
    { id: "red.torchscript", kind: "laser" }, { id: "spot.pt", kind: "laser" },
  ];
  const catalog = () => ({ max_bytes: 1024 * 1024, items: items.map((item) => ({
    ...item, name: item.id, size_bytes: 12345, available: true, active: item.id === selected || item.id === laser,
  })) });
  const status = () => ({ phase: "ready", error: null, device: "Test", model: selected, laser_model: laser,
    model_revision: revision, model_busy: false, image_size: 640, laser_error: null,
    classes: selected === "initial.pt" ? ["mouse"] : ["custom object"],
    defaults: { targets: selected === "initial.pt" ? ["mouse"] : ["custom object"], confidence: 0.8, tolerance: 30 },
  });
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: status() }));
  await page.route(/\/api\/models(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      const params = new URL(route.request().url()).searchParams;
      const name = params.get("name")!;
      uploads.push(name);
      if (name === "broken.pt") return route.fulfill({ status: 400, json: { detail: "File mô hình không hợp lệ" } });
      items.push({ id: name, kind: params.get("kind")! });
      return route.fulfill({ status: 201, json: catalog() });
    }
    return route.fulfill({ json: catalog() });
  });
  await page.route("**/api/models/activate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (reject) return route.fulfill({ status: 400, json: { detail: "Không nạp được mô hình" } });
    const id = route.request().postDataJSON().id;
    if (items.find((item) => item.id === id)?.kind === "laser") laser = id;
    else selected = id;
    revision++;
    return route.fulfill({ json: status() });
  });
  return { uploads, reject: () => { reject = true; } };
}

test("manage both model kinds, keep failed selection, and render settings on mobile", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await mockModels(page);
  await page.goto("/settings");
  await expect(page.getByText("Quản lý mô hình AI", { exact: true })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "new-seg.pt", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect(page.getByRole("cell", { name: "new-seg.pt", exact: true })).toBeVisible();
  await page.locator("label").filter({ has: page.getByRole("radio", { name: "Mô hình laser", exact: true }) }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "new-laser.pt", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect(page.getByRole("cell", { name: "new-laser.pt", exact: true })).toBeVisible();
  expect(api.uploads).toEqual(["new-seg.pt", "new-laser.pt"]);
  await selectModel(page, "Mô hình segmentation", "custom.pt");
  await expect(page.getByText("Đã chuyển mô hình. Danh sách vật thể đã cập nhật.").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("custom object", { exact: true }).filter({ visible: true })).toBeVisible();
  api.reject();
  await selectModel(page, "Mô hình laser", "spot.pt");
  await expect(page.getByText("Không nạp được mô hình", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Mô hình laser", exact: true }).locator("..").locator("..")).toContainText("red.torchscript");
  await page.locator('input[type="file"]').setInputFiles({ name: "broken.pt", mimeType: "application/octet-stream", buffer: Buffer.from("broken") });
  await expect(page.getByText("File mô hình không hợp lệ", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("models-settings.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("models-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("camera selects models; separate image workspace releases camera and sends updated options", async ({ page }, testInfo) => {
  await mockModels(page);
  const requests: URLSearchParams[] = [];
  await page.route("**/api/vision/frame?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await route.fulfill({ json: {
      pointer_mode: params.get("pointer_mode"), hand_detected: false, landmarks: [], tip: null, laser: null,
      selected: null, detections: [{ name: "custom object", confidence: 0.95, box: [10, 10, 60, 60] }],
      processing_ms: 35, resolution: { width: 640, height: 480 },
    } }).catch(() => undefined);
  });
  await page.goto("/");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await selectModel(page, "Mô hình segmentation", "custom.pt");
  await expect(page.getByText("Đã chuyển mô hình. Danh sách vật thể đã cập nhật.")).toBeVisible();
  await page.getByRole("button", { name: "Bật camera của tôi", exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(1);
  expect(requests.at(-1)?.get("model_revision")).toBe("1");
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    (window as unknown as { oldTrack: MediaStreamTrack }).oldTrack = (video.srcObject as MediaStream).getVideoTracks()[0];
  });
  await page.getByRole("menuitem", { name: "Thử nghiệm", exact: true }).click();
  await expect(page).toHaveURL(/\/test$/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { oldTrack: MediaStreamTrack }).oldTrack.readyState)).toBe("ended");
  await expect(page.getByRole("button", { name: "Bật camera của tôi", exact: true })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(1);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#eca860"; ctx.fillRect(0, 0, 640, 480);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const before = requests.length;
  await page.locator('input[type="file"]').setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect.poll(() => requests.length).toBeGreaterThan(before + 2);
  await expect(page.getByText("95%", { exact: true })).toBeVisible();
  expect(requests.at(-1)?.get("targets")).toBe("custom object");
  await page.getByRole("button", { name: "Tạm dừng", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  const resumed = requests.length;
  await expect.poll(() => requests.length).toBeGreaterThan(resumed + 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("testing-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("testing-mobile.png"), fullPage: true });
  await page.locator('a[href="/"]').last().click();
  await expect(page.getByRole("button", { name: "Bật camera của tôi", exact: true })).toBeVisible();
  await page.goto("/test");
  await expect(page.getByText("Sẵn sàng thử nghiệm", { exact: true })).toBeVisible();
});
