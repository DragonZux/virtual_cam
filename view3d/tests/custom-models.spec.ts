import { expect, test, type Page } from "@playwright/test";

/** GLB nhỏ nhất hợp lệ: một tam giác (glTF 2.0, không nén) */
const triangleGlb = (): Buffer => {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 0.2, 0, 0, 0, 0.3, 0].forEach((v, i) => positions.writeFloatLE(v, i * 4));
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0.2, 0.3, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }],
  });
  const jsonChunk = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const header = Buffer.alloc(12);
  const chunk = (type: number, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk(0x4e4f534a, jsonChunk), chunk(0x004e4942, positions)]);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
};

const serve = async (page: Page, manifest: object, glb: Buffer) => {
  await page.routeWebSocket("**/api/vision/ws", (ws) => ws.send(JSON.stringify({ type: "selection.snapshot", sessions: [] })));
  await page.route("**/models/manifest.json", (route) => route.fulfill({ json: manifest }));
  await page.route("**/models/*.glb", (route) => route.fulfill({ body: glb, contentType: "model/gltf-binary" }));
};

test("a GLB listed in models/manifest.json replaces the built-in model", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await serve(page, { models: { Cup: "my-cup.glb" } }, triangleGlb());
  const glb = page.waitForRequest("**/models/my-cup.glb");
  await page.goto("/?preview=cup");
  await glb;
  await expect(page.locator("[data-kind]")).toHaveAttribute("data-model", "custom");
  await expect(page.getByText("Mô hình GLB riêng")).toBeVisible();
  await page.getByRole("button", { name: "Cài đặt" }).click();
  await expect(page.getByText("Mô hình GLB riêng đang dùng: 1")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a broken GLB falls back to the built-in model without breaking the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await serve(page, { models: { cup: "broken.glb" } }, Buffer.from("not a glb"));
  const glb = page.waitForRequest("**/models/broken.glb");
  await page.goto("/?preview=cup");
  await glb;
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cốc");
  await expect(page.getByText("File GLB riêng bị lỗi — đang dùng mô hình dựng sẵn")).toBeVisible();
  expect(errors).toEqual([]);
});
