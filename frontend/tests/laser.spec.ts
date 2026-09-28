import { expect, test } from "@playwright/test";

test("laser mode sends settings, confirms without a hand, survives reload and switches back", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: URLSearchParams[] = [];
  let withSpot = true;
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: {
    phase: "ready", error: null, device: "Test", model: "test", image_size: 640,
    laser_model: "laser-advr-yolov5l6.torchscript", laser_error: null,
    classes: ["mouse"], defaults: { targets: ["mouse"], confidence: 0.8, tolerance: 30 }, share_urls: [],
  } }));
  await page.route("**/api/vision/frame?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    const laser = params.get("pointer_mode") === "laser";
    await new Promise((resolve) => setTimeout(resolve, 80));
    await route.fulfill({ json: {
      pointer_mode: laser ? "laser" : "hand", hand_detected: false, landmarks: [], tip: null,
      laser: laser && withSpot ? { point: [320, 240], color: params.get("laser_color"), score: 0.9 } : null,
      selected: laser && withSpot ? { index: 0, name: "mouse", confidence: 0.91, polygon: [[300, 220], [340, 220], [340, 260], [300, 260]] } : null,
      detections: [], resolution: { width: 640, height: 480 }, processing_ms: 40,
    } }).catch(() => undefined);
  });
  await page.goto("/");
  await page.getByText("Laser", { exact: true }).click();
  await expect(page.getByText("Laser đỏ: mô hình AI đã sẵn sàng", { exact: true })).toBeVisible();
  await page.getByText("Laser đỏ", { exact: true }).click();
  await page.getByText("Laser xanh lá", { exact: true }).click();
  await page.getByRole("button", { name: "Bật camera của tôi", exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(3);
  expect(requests.at(-1)?.get("laser_color")).toBe("green");
  expect(requests.at(-1)?.get("laser_brightness")).toBe("200");
  await expect(page.getByText("ĐÃ CHỌN BẰNG LASER", { exact: true })).toBeVisible();
  await expect(page.getByText("Được chọn bằng laser", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("laser-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("laser-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  withSpot = false;
  await expect(page.getByText("Chưa thấy laser", { exact: true })).toBeVisible();
  await expect(page.getByText("ĐÃ CHỌN BẰNG LASER", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Laser", exact: true })).toBeChecked();
  await expect(page.getByText("Laser xanh lá", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bật camera của tôi", exact: true }).click();
  await page.getByText("Chỉ tay", { exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get("pointer_mode")).toBe("hand");
  await expect(page.getByRole("combobox", { name: "Màu laser" })).toHaveCount(0);
  await page.locator('a[href="/settings"]').first().click();
  await expect(page.getByRole("button", { name: "Khôi phục mặc định", exact: true })).toBeVisible();
  await page.getByText("Laser", { exact: true }).filter({ visible: true }).click();
  const brightness = page.getByRole("slider").first();
  await brightness.focus();
  await brightness.press("ArrowRight");
  await expect.poll(() => requests.at(-1)?.get("laser_brightness")).toBe("205");
  await page.getByText("Laser xanh lá", { exact: true }).filter({ visible: true }).click();
  await page.getByTitle("Laser đỏ", { exact: true }).click();
  await expect(page.getByText("Ngưỡng sáng của laser", { exact: true })).toHaveCount(0);
  await expect.poll(() => requests.at(-1)?.get("laser_color")).toBe("red");
  const beforeReset = requests.length;
  await page.getByRole("button", { name: "Khôi phục mặc định", exact: true }).click();
  await page.getByRole("button", { name: "Đồng ý", exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get("pointer_mode")).toBe("hand");
  await expect.poll(() => requests.length).toBeGreaterThan(beforeReset + 2);
  // Resetting already-default pointer settings must not strand cancelled requests.
  const alreadyDefault = requests.length;
  await page.getByRole("button", { name: "Khôi phục mặc định", exact: true }).click();
  await page.getByRole("button", { name: "Đồng ý", exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(alreadyDefault + 2);
  expect(errors).toEqual([]);
});
