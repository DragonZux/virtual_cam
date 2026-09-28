import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const status = {
  phase: "ready", error: null, device: "Test GPU", model: "test", image_size: 640,
  classes: ["laptop", "mouse", "keyboard"],
  defaults: { targets: ["laptop"], confidence: 0.8, tolerance: 30 }, share_urls: [],
};

async function prepare(page: Page, delayMs = 50, processingMs: number | ((index: number) => number) = 30) {
  let requests = 0;
  let pending = 0;
  let maximum = 0;
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: status }));
  await page.route("**/api/vision/frame?*", async (route) => {
    requests += 1;
    pending += 1;
    maximum = Math.max(maximum, pending);
    const index = requests;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    pending -= 1;
    await route.fulfill({ json: {
      hand_detected: true,
      landmarks: Array.from({ length: 21 }, () => ({ x: 0.4 + (index % 3) * 0.01, y: 0.5 })),
      tip: [256, 180], selected: null, detections: [],
      processing_ms: typeof processingMs === "function" ? processingMs(index) : processingMs,
      resolution: { width: 640, height: 360 },
    } }).catch(() => undefined); // Requests are expected to abort on pause.
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Bật camera|Start camera/ }).click();
  return { requests: () => requests, maximum: () => maximum };
}

test("new frames continue with bounded requests; pause/resume cancels the old run", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const stats = await prepare(page, 180, 120);
  await expect.poll(stats.requests).toBeGreaterThan(5);
  expect(stats.maximum()).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: /Tạm dừng|Pause/, exact: true }).click();
  const pausedAt = stats.requests();
  await page.waitForTimeout(400);
  expect(stats.requests()).toBe(pausedAt);
  await page.getByRole("button", { name: /Tiếp tục|Resume/, exact: true }).click();
  await expect.poll(stats.requests).toBeGreaterThan(pausedAt + 3);
  expect(errors).toEqual([]);
});

test("a delayed JPEG from a previous run is discarded after pause/resume", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (type === "image/jpeg") {
        document.documentElement.dataset.encoding = "true";
        original.call(this, (blob) => setTimeout(() => callback(blob), 600), type, quality);
      } else original.call(this, callback, type, quality);
    };
  });
  const stats = await prepare(page);
  await expect.poll(() => page.locator("html").getAttribute("data-encoding")).toBe("true");
  await page.getByRole("button", { name: /Tạm dừng|Pause/, exact: true }).click();
  await page.getByRole("button", { name: /Tiếp tục|Resume/, exact: true }).click();
  await expect.poll(stats.requests).toBeGreaterThan(2);
  // Stale encoders must not create duplicate overlapping requests or deadlock the new loop.
  expect(stats.maximum()).toBe(1);
});

test("429 responses back off, then recover", async ({ page }) => {
  const stats = await prepare(page);
  await expect.poll(stats.requests).toBeGreaterThan(2);
  const attempts: number[] = [];
  await page.route("**/api/vision/frame?*", async (route) => {
    attempts.push(Date.now());
    if (attempts.length <= 2) await route.fulfill({ status: 429, json: { detail: "Busy" } });
    else await route.fallback();
  });
  await expect.poll(() => attempts.length, { timeout: 7000 }).toBeGreaterThan(2);
  expect(attempts[1] - attempts[0]).toBeGreaterThanOrEqual(550);
  expect(attempts[2] - attempts[1]).toBeGreaterThanOrEqual(550);
  const recovered = stats.requests();
  await expect.poll(stats.requests).toBeGreaterThan(recovered + 2);
});

test("fallback works without requestVideoFrameCallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", { value: undefined });
  });
  const stats = await prepare(page);
  await expect.poll(stats.requests).toBeGreaterThan(5);
  expect(stats.maximum()).toBeLessThanOrEqual(2);
});

test("pacing does not halve FPS when processing slightly exceeds a camera interval", async ({ page }) => {
  // Chrome's default synthetic webcam supplies 20 FPS (one frame every 50 ms).
  const stats = await prepare(page, 70, 55);
  await expect.poll(stats.requests).toBeGreaterThan(3);
  const before = stats.requests();
  await page.waitForTimeout(2000);
  expect(stats.requests() - before).toBeGreaterThan(24);
  expect(stats.maximum()).toBeLessThanOrEqual(2);
});

test("a slow first CUDA result does not throttle later fast frames", async ({ page }) => {
  const stats = await prepare(page, 70, (index) => index === 1 ? 3000 : 40);
  await expect.poll(stats.requests).toBeGreaterThan(3);
  const before = stats.requests();
  await page.waitForTimeout(2000);
  expect(stats.requests() - before).toBeGreaterThan(24);
});

test("mirror changes restart capture and snapshots keep the camera resolution", async ({ page }) => {
  const stats = await prepare(page);
  await expect.poll(stats.requests).toBeGreaterThan(2);
  await page.locator('a[href="/settings"]').first().click();
  await page.getByText("Không lật", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Không lật", exact: true })).toBeChecked();
  const switchedAt = stats.requests();
  await expect.poll(stats.requests).toBeGreaterThan(switchedAt + 2);
  await page.locator('a[href="/"]').first().click();
  await expect(page.locator("canvas[role=img]")).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: /Chụp ảnh|Snapshot/, exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/virtual-cam-.*\.png/);
  expect(await download.failure()).toBeNull();
  const png = await readFile((await download.path())!);
  const resolution = await page.locator("video").evaluate((video: HTMLVideoElement) => [video.videoWidth, video.videoHeight]);
  expect(png.readUInt32BE(16)).toBe(resolution[0]);
  expect(png.readUInt32BE(20)).toBe(resolution[1]);
  expect(stats.maximum()).toBeLessThanOrEqual(2);
});
