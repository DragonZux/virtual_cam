import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

type Session = {
  session_id: string;
  selected: { name: string; confidence: number } | null;
  pointer_mode: "hand" | "laser";
  source: "camera" | "media";
  connected: boolean;
  timestamp: number;
};

/** Giả lập SelectionHub của backend: snapshot khi nối, selection.changed khi một phiên camera đổi lựa chọn */
async function mockServer(page: Page, pattern = "**/api/vision/ws") {
  const sockets: WebSocketRoute[] = [];
  const sessions = new Map<string, Session>();
  let clock = 1_790_816_400_000;
  await page.routeWebSocket(pattern, (ws) => {
    sockets.push(ws);
    ws.send(JSON.stringify({ type: "selection.snapshot", sessions: [...sessions.values()] }));
  });
  const broadcast = (event: object) => sockets.at(-1)?.send(JSON.stringify(event));
  return {
    connections: () => sockets.length,
    select(id: string, name: string | null, confidence = 0.94, extra: Partial<Session> = {}) {
      const session: Session = {
        session_id: id,
        selected: name ? { name, confidence } : null,
        pointer_mode: "hand",
        source: "camera",
        connected: true,
        timestamp: (clock += 1000),
        ...extra,
      };
      sessions.set(id, session);
      broadcast({ type: "selection.changed", ...session });
    },
    disconnect(id: string) {
      const previous = sessions.get(id);
      sessions.delete(id);
      if (previous) broadcast({ type: "selection.changed", ...previous, selected: null, connected: false, timestamp: (clock += 1000) });
    },
    close: () => sockets.at(-1)?.close({ code: 1012, reason: "Server restart" }),
  };
}

const viewer = (page: Page) => page.locator("[data-kind]");
const heading = (page: Page) => page.getByRole("heading", { level: 1 });

test("shows the 3D model of each object confirmed on the camera page", async ({ page }) => {
  const server = await mockServer(page);
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Đã kết nối");
  await expect(viewer(page)).toHaveAttribute("data-kind", "none");
  await expect(heading(page)).toHaveText("Chưa có vật thể");
  await expect(page.locator("canvas")).toBeVisible();

  server.select("cam-a", "bottle", 0.94);
  await expect(viewer(page)).toHaveAttribute("data-model", "bottle");
  await expect(viewer(page)).toHaveAttribute("data-kind", "live");
  await expect(heading(page)).toHaveText("Chai");
  await expect(page.getByText("ĐANG CHỌN", { exact: true })).toBeVisible();
  await expect(page.getByText("94%")).toBeVisible();
  await expect(page).toHaveTitle("Chai · Màn hình 3D");

  server.select("cam-a", "cup", 0.889, { pointer_mode: "laser" });
  await expect(viewer(page)).toHaveAttribute("data-model", "cup");
  await expect(heading(page)).toHaveText("Cốc");
  await expect(page.getByText("89%")).toBeVisible();
  await expect(page.getByText("Laser", { exact: true })).toBeVisible();
  const recent = page.getByRole("navigation", { name: "Gần đây" });
  await expect(recent.locator("button").first()).toHaveText("Cốc");
  await expect(recent).toContainText("Chai");

  // Camera bỏ chọn: mặc định giữ vật vừa chọn; tắt "Giữ vật thể vừa chọn" thì về trạng thái chờ
  server.select("cam-a", null);
  await expect(viewer(page)).toHaveAttribute("data-kind", "last");
  await expect(page.getByText("VỪA CHỌN", { exact: true })).toBeVisible();
  await expect(heading(page)).toHaveText("Cốc");
  await page.getByRole("button", { name: "Cài đặt" }).click();
  await page.getByRole("switch", { name: "Giữ vật thể vừa chọn" }).click();
  await expect(viewer(page)).toHaveAttribute("data-kind", "none");
  await expect(heading(page)).toHaveText("Chưa có vật thể");
});

test("follows the newest camera session and can pin one", async ({ page }) => {
  const server = await mockServer(page);
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Đã kết nối");
  server.select("aaaaaaaa-1111", "laptop");
  server.select("bbbbbbbb-2222", "mouse");
  await expect(viewer(page)).toHaveAttribute("data-model", "mouse");

  // Ô chọn của antd phủ phần chữ lên input → bấm thẳng vào input
  await page.getByRole("combobox", { name: "Phiên camera" }).click({ force: true });
  await page.locator(".ant-select-item-option", { hasText: "#aaaaaa" }).click();
  await expect(viewer(page)).toHaveAttribute("data-model", "laptop");
  server.select("bbbbbbbb-2222", "keyboard");
  await expect(page.locator(".ant-select-selection-item")).toContainText("Máy tính xách tay");
  await expect(viewer(page)).toHaveAttribute("data-model", "laptop");

  // Phiên được ghim ngắt kết nối → quay về tự động
  server.disconnect("aaaaaaaa-1111");
  await expect(viewer(page)).toHaveAttribute("data-model", "keyboard");
});

test("reconnects after the socket closes and restores the state from the new snapshot", async ({ page }) => {
  const server = await mockServer(page);
  await page.goto("/");
  server.select("cam-a", "bottle");
  await expect(viewer(page)).toHaveAttribute("data-kind", "live");

  server.close();
  await expect(page.getByRole("status")).toContainText("Mất kết nối");
  // Trong lúc mất kết nối vẫn giữ vật vừa chọn
  await expect(viewer(page)).toHaveAttribute("data-kind", "last");
  await expect.poll(server.connections).toBe(2);
  await expect(page.getByRole("status")).toHaveText("Đã kết nối");
  await expect(viewer(page)).toHaveAttribute("data-kind", "live");
  await expect(viewer(page)).toHaveAttribute("data-model", "bottle");
});

test("other datasets' class names reuse COCO models; unknown classes get a labelled box", async ({ page }) => {
  const server = await mockServer(page);
  await page.goto("/");
  server.select("cam-a", "sofa");
  await expect(viewer(page)).toHaveAttribute("data-model", "couch");
  await expect(heading(page)).toHaveText("Ghế sofa");

  server.select("cam-a", "magic lamp", 0.71);
  await expect(viewer(page)).toHaveAttribute("data-model", "generic");
  await expect(heading(page)).toHaveText("magic lamp");
  await expect(page.getByText("Chưa có mô hình cho lớp này")).toBeVisible();
});

test("?preview= opens a model without a camera; recent chips preview until the next selection", async ({ page }) => {
  const server = await mockServer(page);
  await page.goto("/?preview=laptop");
  await expect(viewer(page)).toHaveAttribute("data-kind", "preview");
  await expect(viewer(page)).toHaveAttribute("data-model", "laptop");
  await expect(heading(page)).toHaveText("Máy tính xách tay");

  // Xem thử mở bằng địa chỉ trang giữ tới khi bấm quay lại trực tiếp
  server.select("cam-a", "cup");
  await expect(page.getByRole("navigation", { name: "Gần đây" })).toContainText("Cốc");
  await expect(viewer(page)).toHaveAttribute("data-model", "laptop");
  await page.getByRole("button", { name: "Quay lại trực tiếp" }).click();
  await expect(viewer(page)).toHaveAttribute("data-kind", "live");
  await expect(viewer(page)).toHaveAttribute("data-model", "cup");

  server.select("cam-a", "bottle");
  await expect(viewer(page)).toHaveAttribute("data-model", "bottle");
  await page.getByRole("navigation", { name: "Gần đây" }).getByRole("button", { name: "Cốc" }).click();
  await expect(viewer(page)).toHaveAttribute("data-kind", "preview");
  await expect(viewer(page)).toHaveAttribute("data-model", "cup");
  server.select("cam-a", "mouse");
  await expect(viewer(page)).toHaveAttribute("data-kind", "live");
  await expect(viewer(page)).toHaveAttribute("data-model", "mouse");
});

test("?ws= connects to another server address; invalid addresses are reported", async ({ page }) => {
  const server = await mockServer(page, "**/custom/ws");
  await page.goto(`/?ws=${encodeURIComponent("ws://127.0.0.1:5185/custom/ws")}`);
  await expect(page.getByRole("status")).toHaveText("Đã kết nối");
  server.select("cam-a", "dog");
  await expect(viewer(page)).toHaveAttribute("data-model", "dog");
  await page.getByRole("button", { name: "Cài đặt" }).click();
  await expect(page.getByText("Đang dùng: ws://127.0.0.1:5185/custom/ws")).toBeVisible();

  await page.goto(`/?ws=${encodeURIComponent("ftp://example.com")}`);
  await expect(page.getByRole("status")).toHaveText("Địa chỉ WebSocket không hợp lệ");
});

test("switches to English", async ({ page }) => {
  const server = await mockServer(page);
  await page.goto("/");
  server.select("cam-a", "cell phone");
  await expect(heading(page)).toHaveText("Điện thoại");
  await page.getByRole("button", { name: "Chuyển sang tiếng Anh" }).click();
  await expect(heading(page)).toHaveText("Mobile phone");
  await expect(page.getByText("SELECTED", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Connected");
});
