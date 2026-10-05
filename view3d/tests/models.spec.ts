import { expect, test } from "@playwright/test";

import translations from "../src/translations/resources/vi/translation.json" with { type: "json" };

/** 79 lớp COCO máy chủ có thể trả ("person" không bao giờ là mục tiêu) */
const CLASSES = Object.keys(translations.classes).filter((name) => name !== "person");

test("every COCO class shows a 3D model that renders without errors", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.routeWebSocket("**/api/vision/ws", (ws) => ws.send(JSON.stringify({ type: "selection.snapshot", sessions: [] })));

  expect(CLASSES).toHaveLength(79);
  for (const name of CLASSES) {
    await page.goto(`/?preview=${encodeURIComponent(name)}`);
    await expect(page.locator("[data-kind]"), name).toHaveAttribute("data-model", name);
    // Vài khung hình để mô hình gắn vào cảnh và vẽ xong
    await page.waitForTimeout(150);
    expect(errors, name).toEqual([]);
  }
});
