import { expect, test, type Page } from "@playwright/test";

import { connectCamera, mockRtspCamera } from "./helpers";

/** Máy chủ giả: tải lên là dùng ngay mô hình mới (như backend); mô hình cũ vẫn có trong danh sách API */
async function mockModels(page: Page) {
  let selected = "initial.pt";
  let laser = "red.torchscript";
  let revision = 0;
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
      if (params.get("kind") === "laser") laser = name;
      else selected = name;
      revision++;
      return route.fulfill({ status: 201, json: catalog() });
    }
    return route.fulfill({ json: catalog() });
  });
  return { uploads };
}

/** Bảng Quản lý mô hình AI: chỉ các dòng mô hình đang dùng */
const modelRows = (page: Page) => page.locator(".ant-card")
  .filter({ has: page.locator(".ant-card-head-title", { hasText: "Quản lý mô hình AI" }) })
  .locator(".ant-table-tbody tr.ant-table-row");

test("settings shows only the running model of each type; an upload replaces it", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await mockModels(page);
  await page.goto("/settings");
  await expect(page.getByText("Quản lý mô hình AI", { exact: true })).toBeVisible();
  await expect(modelRows(page)).toHaveCount(2);
  await expect(modelRows(page).nth(0)).toContainText("Mô hình segmentation");
  await expect(modelRows(page).nth(0)).toContainText("initial.pt");
  await expect(modelRows(page).nth(1)).toContainText("red.torchscript");
  // Mô hình cũ / không dùng không hiện, không còn ô chọn hay nút "Sử dụng"
  for (const hidden of ["custom.pt", "spot.pt"]) await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Mô hình segmentation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sử dụng" })).toHaveCount(0);

  // Mỗi dòng có nút Cập nhật riêng nhận .pt / .torchscript / .engine
  await expect(page.getByRole("button", { name: "Cập nhật" })).toHaveCount(2);
  await expect(modelRows(page).nth(0).locator('input[type="file"]')).toHaveAttribute("accept", ".pt,.torchscript,.engine");
  await modelRows(page).nth(0).locator('input[type="file"]').setInputFiles({ name: "new-seg.torchscript", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect(page.getByText("Đã cập nhật và đang dùng mô hình mới.").filter({ visible: true })).toBeVisible();
  await expect(modelRows(page)).toHaveCount(2);
  await expect(modelRows(page).nth(0)).toContainText("new-seg.torchscript");
  await expect(page.getByText("initial.pt", { exact: true })).toHaveCount(0);
  // Danh sách vật thể đổi theo mô hình mới
  await expect(page.getByText("custom object", { exact: true }).filter({ visible: true }).first()).toBeVisible();

  await modelRows(page).nth(1).locator('input[type="file"]').setInputFiles({ name: "new-laser.engine", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect(modelRows(page).nth(1)).toContainText("new-laser.engine");
  await expect(modelRows(page).nth(1)).toContainText("TensorRT");
  await expect(page.getByText("red.torchscript", { exact: true })).toHaveCount(0);
  expect(api.uploads).toEqual(["new-seg.torchscript", "new-laser.engine"]);

  // Tải lên lỗi: báo lỗi, mô hình đang dùng giữ nguyên
  await modelRows(page).nth(1).locator('input[type="file"]').setInputFiles({ name: "broken.pt", mimeType: "application/octet-stream", buffer: Buffer.from("broken") });
  await expect(page.getByText("File mô hình không hợp lệ", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(modelRows(page).nth(1)).toContainText("new-laser.engine");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("models-settings.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("models-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("the overview has no model block; the camera uses the new model's classes", async ({ page }) => {
  await mockModels(page);
  const camera = await mockRtspCamera(page);
  await page.goto("/");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kết nối camera", exact: true })).toBeVisible();
  // Trang Tổng quan không còn khối tên mô hình / link đổi mô hình
  for (const hidden of ["initial.pt", "red.torchscript", "Mô hình segmentation", "Mô hình laser"]) {
    await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  // Đổi mô hình ở Cài đặt (camera vẫn giữ trang Tổng quan mount)
  await page.getByRole("menuitem", { name: "Cài đặt", exact: true }).click();
  await modelRows(page).nth(0).locator('input[type="file"]').setInputFiles({ name: "custom-2.pt", mimeType: "application/octet-stream", buffer: Buffer.from("model") });
  await expect(page.getByText("Đã cập nhật và đang dùng mô hình mới.").filter({ visible: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Tổng quan", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await connectCamera(page);
  await expect.poll(() => camera.options.at(-1)?.targets).toEqual(["custom object"]);
  await page.goto("/test");
  await expect(page).toHaveURL(/\/$/);
});
