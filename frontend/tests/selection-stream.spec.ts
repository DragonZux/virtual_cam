import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

import { connectCamera, mockRtspCamera } from "./helpers";

type Update = { selected: { name: string; confidence: number } | null; pointer_mode: string; source: string };

async function setup(page: Page) {
  await mockRtspCamera(page);
  const messages: Update[] = [];
  const sockets: WebSocketRoute[] = [];
  let name: string | null = "bottle";
  let confidence = 0.943;
  let frames = 0;
  await page.routeWebSocket("**/api/vision/ws/publish", (socket) => {
    sockets.push(socket);
    socket.onMessage((message) => messages.push(JSON.parse(message.toString())));
  });
  await page.route("**/api/vision/status", (route) => route.fulfill({ json: {
    phase: "ready", error: null, device: "Test", model: "test.pt", image_size: 640,
    model_revision: 0, laser_model: "laser.torchscript", laser_error: null, classes: ["bottle", "cup"],
    defaults: { targets: ["bottle", "cup"], confidence: 0.8, tolerance: 30 },
  } }));
  await page.route(/\/api\/models(?:\?|$)/, (route) => route.fulfill({ json: { items: [], max_bytes: 1024 } }));
  await page.route("**/api/vision/frame?*", async (route) => {
    frames++;
    const selected = name ? { index: 0, name, confidence, polygon: [[10, 10], [200, 10], [200, 200], [10, 200]] } : null;
    await route.fulfill({ json: {
      pointer_mode: "laser", hand_detected: false, landmarks: [], tip: null, laser: { point: [50, 50], score: 0.9 },
      selected, detections: [], processing_ms: 35, resolution: { width: 640, height: 480 },
    } }).catch(() => undefined);
  });
  return { messages, sockets, frames: () => frames, select: (value: string | null, score = confidence) => { name = value; confidence = score; } };
}

test("publishes confirmed display state, clears on lost selection and camera stop, reconnects with latest state", async ({ page }) => {
  const api = await setup(page);
  await page.goto("/");
  await expect.poll(() => api.messages.length).toBeGreaterThan(0);
  expect(api.messages.at(-1)?.selected).toBeNull();
  await connectCamera(page);
  await expect.poll(() => api.messages.at(-1)?.selected?.name).toBe("bottle");
  expect(api.messages.at(-1)).toEqual({ selected: { name: "bottle", confidence: 0.94 }, pointer_mode: "laser", source: "camera" });
  const before = api.messages.length;
  const frames = api.frames();
  await expect.poll(api.frames).toBeGreaterThan(frames + 5);
  expect(api.messages).toHaveLength(before); // moving frames do not repeat an unchanged display
  api.select("cup", 0.889);
  await expect.poll(() => api.messages.at(-1)?.selected?.name).toBe("cup");
  expect(api.messages.at(-1)?.selected?.confidence).toBe(0.89);
  api.select(null);
  await expect.poll(() => api.messages.at(-1)?.selected).toBeNull();
  api.select("bottle");
  await expect.poll(() => api.messages.at(-1)?.selected?.name).toBe("bottle");
  const connections = api.sockets.length;
  const count = api.messages.length;
  api.sockets.at(-1)!.close({ code: 1012, reason: "Test restart" });
  await expect.poll(() => api.sockets.length).toBeGreaterThan(connections);
  await expect.poll(() => api.messages.length).toBeGreaterThan(count);
  expect(api.messages.at(-1)?.selected?.name).toBe("bottle");
  await page.getByRole("button", { name: "Tắt camera", exact: true }).click();
  await expect.poll(() => api.messages.at(-1)?.selected).toBeNull();
});

